"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Editor from "@monaco-editor/react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://127.0.0.1:8000";

const TYPE_META: Record<string, { label: string; badge: string; icon: string }> = {
  coding_problem: { label: "Coding Problem", badge: "badge-coding", icon: "💻" },
  debugging: { label: "Debugging", badge: "badge-debugging", icon: "🐛" },
  output_prediction: { label: "Output Prediction", badge: "badge-output", icon: "🔮" },
  fill_in_code: { label: "Fill in Code", badge: "badge-fillin", icon: "✏️" },
  function_based: { label: "Function-Based", badge: "badge-function", icon: "⚙️" },
};

interface Question {
  id: number; question_type: string; title: string; description: string;
  code_template: string; expected_output: string | null; points: number; order: number;
}
interface Quiz {
  id: number; title: string; code: string; language: string;
  time_limit: number; status: string; started_at: string | null; questions: Question[];
}

export default function LiveQuiz() {
  const params = useParams();
  const quizCode = params.code as string;
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [outputs, setOutputs] = useState<Record<number, string>>({});
  const [statuses, setStatuses] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [isTabPaused, setIsTabPaused] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);


  const userId = typeof window !== "undefined" ? sessionStorage.getItem("userId") : null;

  const fetchQuiz = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}`);
      if (res.ok) {
        const data: Quiz = await res.json();
        if (data.status === "completed") { setError("Quiz ended."); setLoading(false); return; }
        if (data.status === "draft") { setError("Quiz is not ready yet."); setLoading(false); return; }
        setQuiz(data);
        setIsPaused(data.status === "paused" || data.status === "ready");

        setIsFrozen(data.is_frozen);
        setShowLeaderboard(data.show_leaderboard);
        const init: Record<number, string> = {};
        data.questions.forEach(q => { init[q.id] = q.code_template || ""; });
        setCodes(init);
        if (data.started_at) {
          const elapsed = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000);
          setTimeLeft(Math.max(0, data.time_limit * 60 - elapsed));
        }
      } else { setError("Quiz not found"); }

    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  }, [quizCode]);

  useEffect(() => { fetchQuiz(); }, [fetchQuiz]);

  useEffect(() => {
    socketRef.current = io(SERVER_URL, { transports: ["websocket", "polling"] });
    socketRef.current.emit('join_quiz', { quiz_code: quizCode });
    
    socketRef.current.on("status_update", (data: { submission_id: number; status: string; result?: string }) => {
      setStatuses(p => ({ ...p, [data.submission_id]: data.status }));
      if (data.result) setOutputs(p => ({ ...p, [data.submission_id]: data.result! }));
    });

    socketRef.current.on("quiz_status", (data: { status: string }) => {
      setIsPaused(data.status === "paused");
      if (data.status === "completed") {
        alert("Quiz has ended!");
        window.location.reload();
      }
    });

    socketRef.current.on("freeze_update", (data: { is_frozen: boolean }) => {
      setIsFrozen(data.is_frozen);
    });

    socketRef.current.on("leaderboard_toggle", (data: { visible: boolean }) => {
      setShowLeaderboard(data.visible);
      if (data.visible) fetchLeaderboard();
    });

    return () => { socketRef.current?.disconnect(); };
  }, [quizCode]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}/leaderboard`);
      if (res.ok) setLeaderboard(await res.json());
    } catch (e) { console.error(e); }
  };


  useEffect(() => {
    if (timeLeft <= 0 || isPaused || isTabPaused) return;
    const t = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [timeLeft, isPaused, isTabPaused]);

  // Auto-submit when time ends or frozen
  useEffect(() => {
    if ((timeLeft === 0 && quiz?.status === 'live') || isFrozen) {
      quiz?.questions.forEach(q => submitCode(q.id));
    }
  }, [timeLeft, isFrozen]);



  const reportViolation = async () => {
    if (!userId || !quizCode) return;
    try {
      await fetch(`${SERVER_URL}/quizzes/${quizCode}/violations/${userId}`, { method: "POST" });
    } catch (e) { console.error(e); }
  };

  // Anti-cheat: tab switch
  useEffect(() => {
    const handler = () => { 
      if (document.hidden && isFullscreen && quiz?.status === 'live') { 
        setIsTabPaused(true);
        setWarnings(p => p + 1); 
        reportViolation();
      } 
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isFullscreen, quiz]);

  // Anti-cheat: window size
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth < 800 || window.innerHeight < 600) {
        if (quiz?.status === 'live') {
          setIsTabPaused(true);
          setWarnings(p => p + 1);
          reportViolation();
        }
      }
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [quiz]);




  // Anti-cheat: fullscreen
  useEffect(() => {
    const handler = () => { 
      setIsFullscreen(!!document.fullscreenElement); 
      if (!document.fullscreenElement && quiz?.status === 'live') { 
        setIsTabPaused(true);
        setWarnings(p => p + 1); 
        reportViolation();
      } 
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [quiz]);


  const enterFullscreen = () => { document.documentElement.requestFullscreen?.(); setIsFullscreen(true); };

  const pollSubmission = useCallback(async (submissionId: number, questionId: number) => {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await fetch(`${SERVER_URL}/submissions/${submissionId}`);
        if (res.ok) {
          const data = await res.json();
          setStatuses(p => ({ ...p, [questionId]: data.status }));
          if (data.result) setOutputs(p => ({ ...p, [questionId]: data.result }));
          else setOutputs(p => ({ ...p, [questionId]: `Status: ${data.status}...` }));
          if (data.status === "completed" || data.status === "error") return;
        }
      } catch { /* retry */ }
    }
    setStatuses(p => ({ ...p, [questionId]: "error" }));
    setOutputs(p => ({ ...p, [questionId]: "Execution timed out. Please try again." }));
  }, []);

  const submitCode = async (questionId: number) => {
    if (!userId || !quiz) return;
    const code = codes[questionId] || "";
    setStatuses(p => ({ ...p, [questionId]: "submitting" }));
    setOutputs(p => ({ ...p, [questionId]: "Sending to server..." }));
    try {
      const res = await fetch(`${SERVER_URL}/submissions/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: quiz.language, user_id: Number(userId), question_id: questionId, quiz_code: quizCode }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatuses(p => ({ ...p, [questionId]: data.status }));
        setOutputs(p => ({ ...p, [questionId]: `Status: ${data.status}... Executing code...` }));
        pollSubmission(data.id, questionId);
      } else { setOutputs(p => ({ ...p, [questionId]: "Error submitting" })); setStatuses(p => ({ ...p, [questionId]: "error" })); }
    } catch { setOutputs(p => ({ ...p, [questionId]: "Connection error" })); setStatuses(p => ({ ...p, [questionId]: "error" })); }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--surface)]"><div className="w-10 h-10 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-[var(--surface)]"><div className="text-center"><p className="text-xl text-[var(--error)] mb-4">{error}</p><a href="/" className="btn-ghost px-6 py-3 rounded-xl text-sm inline-block">Go Home</a></div></div>;

  // Fullscreen gate
  if (!isFullscreen && !isTabPaused) return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-6">
      <div className="relative z-10 max-w-md text-center p-10 bg-[var(--surface-container-low)] rounded-2xl animate-slide-up">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] mx-auto flex items-center justify-center mb-6 animate-pulse-glow">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </div>
        <h1 className="text-3xl font-extrabold mb-4 gradient-text">Secure Quiz Mode</h1>
        <p className="text-[var(--on-surface-variant)] text-sm mb-2">{quiz?.title}</p>
        <p className="text-[var(--on-surface-variant)] text-xs mb-8">Fullscreen mode required. Tab switches will be logged.</p>
        <button onClick={enterFullscreen} className="btn-primary w-full py-4 rounded-xl text-sm font-semibold">Enter Fullscreen & Start</button>
      </div>
    </div>
  );


  if (!quiz) return null;
  const q = quiz.questions[currentQ];
  const tm = TYPE_META[q.question_type] || TYPE_META.coding_problem;
  const qStatus = statuses[q.id] || "idle";
  const qOutput = outputs[q.id] || "";

  return (
    <div className="flex flex-col h-screen bg-[var(--surface)] text-[var(--on-surface)]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[var(--surface-container-low)]">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] flex items-center justify-center font-bold text-xs text-[var(--on-primary)]">{"</>"}</div>
          <h1 className="text-base font-bold">{quiz.title}</h1>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(4,180,162,0.15)] text-[10px] font-semibold text-[var(--secondary)]">
            <span className={`w-1.5 h-1.5 rounded-full bg-[var(--secondary)] ${isPaused ? "" : "animate-pulse"}`} />
            {isPaused ? "PAUSED" : "LIVE"}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className={`font-mono text-lg font-bold ${timeLeft < 60 ? "text-[var(--error)]" : "text-[var(--primary)]"}`}>{formatTime(timeLeft)}</div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--surface-container-high)]">
            <div className={`w-2 h-2 rounded-full ${warnings > 0 ? "bg-[var(--error)] animate-pulse" : "bg-[var(--primary)]"}`} />
            <span className="text-xs">{warnings === 0 ? "Secure" : `${warnings} violations`}</span>
          </div>
        </div>
      </header>

      {/* Question Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 bg-[var(--surface-container-lowest)] overflow-x-auto">
        {quiz.questions.map((qq, i) => (
          <button key={qq.id} onClick={() => setCurrentQ(i)}
            className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${currentQ === i ? "bg-[var(--surface-container-high)] text-[var(--primary)]" : "text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"}`}>
            Q{i + 1}: {qq.title.slice(0, 20)}{qq.title.length > 20 ? "..." : ""}
          </button>
        ))}
      </div>

      {/* Main */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Question + Editor */}
        <div className="flex-1 flex flex-col">
          <div className="p-6 bg-[var(--surface-container-low)]">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-lg">{tm.icon}</span>
              <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${tm.badge}`}>{tm.label}</span>
              <span className="text-xs text-[var(--on-surface-variant)]">{q.points} pts</span>
            </div>
            <h2 className="text-xl font-bold mb-2">{q.title}</h2>
            <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed">{q.description}</p>
          </div>

          <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface-container-lowest)]">
            <span className="text-xs text-[var(--on-surface-variant)] font-mono">{quiz.language}</span>
            <button onClick={() => submitCode(q.id)} disabled={qStatus === "submitting" || qStatus === "queued" || qStatus === "processing"}
              className="btn-primary px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-2">
              {["submitting", "queued", "processing"].includes(qStatus) ? (
                <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Running...</>
              ) : (<>▶ Run Code</>)}
            </button>
          </div>

          <div className="flex-1 min-h-[300px] relative">
            {isFrozen && <div className="absolute inset-0 z-50 bg-[var(--surface)]/20 backdrop-blur-[2px] flex items-center justify-center font-bold text-[var(--error)]">🧊 EDITOR FROZEN BY TEACHER</div>}
            <Editor height="100%" language={quiz.language === "c" ? "c" : quiz.language}
              theme="vs-dark" value={codes[q.id] || ""}
              onChange={v => !isFrozen && setCodes(p => ({ ...p, [q.id]: v || "" }))}
              options={{ readOnly: isFrozen, minimap: { enabled: false }, fontSize: 14, fontFamily: "JetBrains Mono, monospace", padding: { top: 16 }, scrollBeyondLastLine: false, smoothScrolling: true, cursorBlinking: "smooth", cursorSmoothCaretAnimation: "on" }} />
          </div>
        </div>


        {/* Right: Output */}
        <div className="w-[360px] flex flex-col bg-[var(--surface-container-lowest)]">
          <div className="px-4 py-3 bg-[var(--surface-container-low)] flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-[var(--on-surface-variant)] uppercase">Output</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${qStatus === "completed" ? "bg-[rgba(78,222,163,0.15)] text-[var(--primary)]" : qStatus === "error" ? "bg-[rgba(255,180,171,0.15)] text-[var(--error)]" : "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"}`}>
              {qStatus.toUpperCase()}
            </span>
          </div>
          <div className="flex-1 p-4 font-mono text-sm overflow-auto">
            {qOutput ? (
              <pre className={`whitespace-pre-wrap ${qStatus === "error" ? "text-[var(--error)]" : "text-[var(--primary)]"}`}>{qOutput}</pre>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[var(--on-surface-variant)] opacity-40">
                <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-xs">Output appears here</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Paused Overlay (Tab switch/Fullscreen exit) */}
      {isTabPaused && (
        <div className="fixed inset-0 z-[300] bg-[var(--surface)]/90 backdrop-blur-xl flex flex-col items-center justify-center text-center p-8">
          <div className="w-24 h-24 rounded-full bg-[var(--error)] flex items-center justify-center mb-8 animate-pulse shadow-[0_0_50px_rgba(255,82,82,0.4)]">
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-5xl font-black mb-4 text-[var(--error)]">QUIZ PAUSED</h2>
          <p className="text-[var(--on-surface-variant)] text-xl max-w-lg mb-12">Tab switching or exiting fullscreen is strictly prohibited. Your violation has been logged and the teacher has been notified.</p>
          <button onClick={() => { if (document.fullscreenElement) setIsTabPaused(false); else enterFullscreen(); }} 
            className="btn-primary px-10 py-5 rounded-2xl text-lg font-bold">
            Resume Quiz
          </button>
        </div>
      )}

      {/* Paused Overlay (Teacher action) */}
      {isPaused && quiz.status !== "ready" && !isTabPaused && (
        <div className="fixed inset-0 z-[100] bg-[var(--surface)]/80 backdrop-blur-md flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-6">⏸️</div>
          <h2 className="text-4xl font-black mb-2">QUIZ PAUSED</h2>
          <p className="text-[var(--on-surface-variant)]">The teacher has paused the session. Please wait...</p>
        </div>
      )}


      {/* Ready/Waiting Overlay */}
      {quiz.status === "ready" && (
        <div className="fixed inset-0 z-[150] bg-[var(--surface)] backdrop-blur-xl flex flex-col items-center justify-center text-center p-8">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] flex items-center justify-center mb-8 animate-bounce">
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className="text-5xl font-black mb-4 gradient-text">Waiting for Host...</h2>
          <p className="text-[var(--on-surface-variant)] text-xl max-w-md">You're in! The quiz will begin as soon as the teacher starts the timer.</p>
          <div className="mt-12 flex items-center gap-3 px-6 py-3 rounded-full bg-[var(--surface-container-high)]">
            <div className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
            <span className="text-sm font-medium">Connection Secured</span>
          </div>
        </div>
      )}


      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-[200] bg-[var(--surface)]/90 backdrop-blur-xl flex items-center justify-center p-8">
          <div className="glass max-w-2xl w-full rounded-3xl p-8 flex flex-col max-h-[80vh] animate-slide-up">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black gradient-text">🏆 LEADERBOARD</h2>
              <button onClick={() => setShowLeaderboard(false)} className="p-2 rounded-lg bg-[var(--surface-container-high)] text-sm">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {leaderboard.map((entry, i) => (
                <div key={entry.user_id} className={`flex items-center gap-4 p-4 rounded-2xl ${entry.user_id === Number(userId) ? "bg-[var(--primary)] text-[var(--on-primary)]" : "bg-[var(--surface-container-low)]"}`}>
                  <span className="w-8 font-black opacity-50">#{i + 1}</span>
                  <span className="flex-1 font-bold">{entry.student_name}</span>
                  <div className="text-right">
                    <p className="font-black">{entry.total_score} pts</p>
                    <p className="text-[10px] opacity-70">{entry.total_time}s · {entry.total_violations} ⚠️</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>

  );
}
