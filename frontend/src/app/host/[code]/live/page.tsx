"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://127.0.0.1:8000";

interface Question { id: number; question_type: string; title: string; points: number; order: number; }
interface Quiz { id: number; title: string; code: string; language: string; time_limit: number; status: string; started_at: string | null; questions: Question[]; }

export default function HostLiveDashboard() {
  const params = useParams();
  const router = useRouter();
  const quizCode = params.code as string;
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [copyOk, setCopyOk] = useState(false);
  const [ending, setEnding] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [activity, setActivity] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [startingTimer, setStartingTimer] = useState(false);
  const socketRef = useRef<Socket | null>(null);




  const fetchQuiz = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}`);
      if (res.ok) { 
        const data = await res.json(); 
        setQuiz(data); 
        if (data.started_at) { 
          const elapsed = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000); 
          const total = data.time_limit * 60; 
          setTimeLeft(Math.max(0, total - elapsed)); 
        } 
      }
      fetchStudents();
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [quizCode]);

  const fetchStudents = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}/leaderboard`);
      if (res.ok) setStudents(await res.json());
    } catch (e) { console.error(e); }
  };


  useEffect(() => {
    socketRef.current = io(SERVER_URL, { transports: ["websocket", "polling"] });
    socketRef.current.emit('join_teacher', { quiz_code: quizCode });

    socketRef.current.on("status_update", (data: any) => {
      setActivity(p => [{
        type: 'submission',
        message: `${data.student_name} submitted Q${data.question_index + 1}: ${data.question_title}`,
        data: data
      }, ...p].slice(0, 50));
      fetchStudents();
    });


    socketRef.current.on("violation_alert", (data: any) => {
      setActivity(p => [{
        type: 'violation',
        message: `Anti-cheat alert: ${data.student_name} tab switch detected! (Total: ${data.tab_switches})`,
        data: data
      }, ...p].slice(0, 50));
      fetchStudents();
    });
    
    socketRef.current.on("student_joined", (data: any) => {
      setActivity(p => [{
        type: 'info',
        message: `${data.student_name} joined the session`,
        data: data
      }, ...p].slice(0, 50));
      fetchStudents();
    });



    return () => { socketRef.current?.disconnect(); };
  }, [quizCode]);

  useEffect(() => { fetchQuiz(); }, [fetchQuiz]);


  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  const endQuiz = async () => {
    setEnding(true);
    try { await fetch(`${SERVER_URL}/quizzes/${quizCode}/end`, { method: "POST" }); router.push("/"); } catch (e) { console.error(e); }
    finally { setEnding(false); }
  };

  const togglePause = async () => {
    const endpoint = isPaused ? "resume" : "pause";
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}/${endpoint}`, { method: "POST" });
      if (res.ok) setIsPaused(!isPaused);
    } catch (e) { console.error(e); }
  };

  const toggleFreeze = async () => {
    const endpoint = isFrozen ? "unfreeze" : "freeze";
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}/${endpoint}`, { method: "POST" });
      if (res.ok) setIsFrozen(!isFrozen);
    } catch (e) { console.error(e); }
  };

  const toggleLeaderboard = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}/toggle-leaderboard`, { method: "POST" });
      if (res.ok) setShowLeaderboard(!showLeaderboard);
    } catch (e) { console.error(e); }
  };

  const startQuizTimer = async () => {
    setStartingTimer(true);
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}/start-timer`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setQuiz(data);
        setTimeLeft(data.time_limit * 60);
      }
    } catch (e) { console.error(e); }
    finally { setStartingTimer(false); }
  };

  const toggleFlag = async (userId: number, currentFlag: boolean) => {
    try {
      await fetch(`${SERVER_URL}/quizzes/${quizCode}/flag/${userId}?flagged=${!currentFlag}`, { method: "POST" });
      fetchStudents();
    } catch (e) { console.error(e); }
  };




  const formatTime = (s: number) => { const m = Math.floor(s / 60); const sec = s % 60; return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`; };
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${quizCode}` : "";

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--surface)]"><div className="w-10 h-10 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;
  if (!quiz) return <div className="min-h-screen flex items-center justify-center bg-[var(--surface)]"><p className="text-[var(--error)]">Quiz not found</p></div>;

  return (
    <div className="min-h-screen bg-[var(--surface)] flex flex-col">
      <header className="glass sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] flex items-center justify-center font-bold text-xs text-[var(--on-primary)]">{"</>"}</div>
          <span className="text-lg font-bold text-[var(--on-surface)]">{quiz.title}</span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(4,180,162,0.15)] text-xs font-semibold text-[var(--secondary)]">
            <span className="w-2 h-2 rounded-full bg-[var(--secondary)] animate-pulse" />LIVE
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!quiz.started_at && (
            <button onClick={startQuizTimer} disabled={startingTimer} className="px-6 py-2 rounded-lg bg-[var(--primary)] text-[var(--on-primary)] text-sm font-bold animate-pulse hover:animate-none">
              {startingTimer ? "Starting..." : "🚀 Start Quiz Now"}
            </button>
          )}
          <button onClick={togglePause} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${isPaused ? "bg-[var(--secondary)] text-[var(--on-secondary)]" : "bg-[var(--surface-container-high)] text-[var(--on-surface)]"}`}>
            {isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button onClick={toggleFreeze} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${isFrozen ? "bg-[var(--error)] text-white" : "bg-[var(--surface-container-high)] text-[var(--on-surface)]"}`}>
            {isFrozen ? "❄️ Unfreeze" : "🧊 Freeze"}
          </button>
          <button onClick={endQuiz} disabled={ending} className="px-4 py-2 rounded-lg bg-[var(--error-container)] text-[var(--error)] text-sm font-semibold hover:brightness-110 transition-all">
            {ending ? "Ending..." : "End Quiz"}
          </button>
        </div>
      </header>



      <main className="flex-1 flex p-8 gap-8">
        <div className="flex-1 flex flex-col items-center gap-10">
          {/* Timer */}
          <div className="text-center">
            <p className="text-sm text-[var(--on-surface-variant)] mb-2">Time Remaining</p>
            <div className={`text-7xl font-mono font-bold tracking-tight ${timeLeft < 60 ? "text-[var(--error)]" : "gradient-text"} ${isPaused ? "opacity-40" : ""}`}>
              {formatTime(timeLeft)}
            </div>
            {isPaused && <p className="text-xs font-bold text-[var(--secondary)] mt-2 uppercase tracking-widest">Quiz Paused</p>}
          </div>

          {/* Quiz Code Share */}
          <div className="glass rounded-2xl p-8 max-w-lg w-full text-center animate-slide-up">
            <p className="text-sm text-[var(--on-surface-variant)] mb-4">Students join with this code</p>
            <div className="text-5xl font-mono font-extrabold tracking-[0.3em] text-[var(--primary)] mb-6">{quizCode}</div>
            <div className="flex gap-3">
              <button onClick={() => { navigator.clipboard.writeText(quizCode); setCopyOk(true); setTimeout(() => setCopyOk(false), 2000); }}
                className="btn-ghost flex-1 py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                {copyOk ? "✓ Copied!" : "Copy Code"}
              </button>
              <button onClick={() => { navigator.clipboard.writeText(shareUrl); alert("Link copied!"); }}
                className="btn-ghost flex-1 py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                🔗 Copy Link
              </button>
              <button onClick={toggleLeaderboard} className={`btn-ghost flex-1 py-3 rounded-xl text-sm flex items-center justify-center gap-2 ${showLeaderboard ? "text-[var(--primary)] font-bold" : ""}`}>
                {showLeaderboard ? "🏆 Leaderboard Visible" : "🏆 Show Leaderboard"}
              </button>
            </div>

          </div>

          {/* Questions Summary */}
          <div className="max-w-lg w-full">
            <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-4">{quiz.questions.length} Questions</h3>
            <div className="space-y-2">
              {quiz.questions.map((q, i) => (
                <div key={q.id} className="flex items-center gap-4 p-3 rounded-xl bg-[var(--surface-container-low)]">
                  <span className="text-sm font-mono text-[var(--on-surface-variant)] w-8">Q{i + 1}</span>
                  <span className="text-sm text-[var(--on-surface)] flex-1 truncate">{q.title}</span>
                  <span className="text-xs text-[var(--on-surface-variant)]">{q.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar: Monitoring & Activity */}
        <aside className="w-96 flex flex-col gap-6">
          {/* Students Monitor */}
          <div className="flex-[2] glass rounded-3xl p-6 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-[var(--on-surface)] flex items-center gap-2">
                👥 Students Monitor <span className="px-2 py-0.5 rounded-full bg-[var(--surface-container-high)] text-[10px] font-mono">{students.length}</span>
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {students.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30">
                  <p className="text-xs">No students yet</p>
                </div>
              ) : (
                students.map((s) => (
                  <div key={s.user_id} className={`p-3 rounded-2xl flex items-center justify-between border-2 transition-all ${s.is_flagged ? "border-[var(--error)] bg-[rgba(255,82,82,0.05)]" : "border-transparent bg-[var(--surface-container-low)]"}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{s.student_name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-[10px] font-mono ${s.total_violations > 0 ? "text-[var(--error)] font-bold" : "text-[var(--on-surface-variant)]"}`}>
                          ⚠️ {s.total_violations}
                        </span>
                        <span className="text-[10px] text-[var(--on-surface-variant)]">
                          🎯 {s.total_score} pts
                        </span>
                      </div>
                    </div>
                    <button onClick={() => toggleFlag(s.user_id, s.is_flagged)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${s.is_flagged ? "bg-[var(--error)] text-white" : "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] hover:bg-[var(--error-container)] hover:text-[var(--error)]"}`}>
                      {s.is_flagged ? "Unflag" : "Flag"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Live Activity Log */}
          <div className="flex-1 glass rounded-3xl p-6 flex flex-col overflow-hidden">
            <h3 className="text-sm font-bold text-[var(--on-surface)] mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" /> Live Activity
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {activity.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                  <div className="text-2xl mb-2">📡</div>
                  <p className="text-xs">Waiting for activity...</p>
                </div>
              ) : (
                activity.map((a, i) => (
                  <div key={i} className={`p-3 rounded-xl text-[10px] ${
                    a.type === 'violation' ? 'bg-[rgba(255,82,82,0.1)] text-[var(--error)]' : 
                    a.type === 'info' ? 'bg-[rgba(173,198,255,0.1)] text-[var(--tertiary)]' :
                    'bg-[var(--surface-container-high)] text-[var(--on-surface)]'} animate-slide-left`}>
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      {a.type === 'violation' ? '⚠️ VIOLATION' : a.type === 'info' ? '👤 JOINED' : '✅ SUBMISSION'}
                    </div>
                    <p className="leading-tight">{a.message}</p>
                    <p className="mt-1 opacity-50">{new Date().toLocaleTimeString()}</p>
                  </div>
                ))

              )}
            </div>
          </div>
        </aside>
      </main>


    </div>
  );
}
