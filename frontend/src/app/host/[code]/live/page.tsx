"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

const SERVER_URL = "http://localhost:8000";

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

  const fetchQuiz = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}`);
      if (res.ok) { const data = await res.json(); setQuiz(data); if (data.started_at) { const elapsed = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000); const total = data.time_limit * 60; setTimeLeft(Math.max(0, total - elapsed)); } }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
        <button onClick={endQuiz} disabled={ending} className="px-4 py-2 rounded-lg bg-[var(--error-container)] text-[var(--error)] text-sm font-semibold hover:brightness-110 transition-all">
          {ending ? "Ending..." : "End Quiz"}
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 gap-10">
        {/* Timer */}
        <div className="text-center">
          <p className="text-sm text-[var(--on-surface-variant)] mb-2">Time Remaining</p>
          <div className={`text-7xl font-mono font-bold tracking-tight ${timeLeft < 60 ? "text-[var(--error)]" : "gradient-text"}`}>
            {formatTime(timeLeft)}
          </div>
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
            <button onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="btn-ghost flex-1 py-3 rounded-xl text-sm flex items-center justify-center gap-2">
              Copy Link
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
      </main>
    </div>
  );
}
