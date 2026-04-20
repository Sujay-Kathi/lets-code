"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";

const SERVER_URL = "http://localhost:8000";

export default function JoinQuiz() {
  const params = useParams();
  const router = useRouter();
  const quizCode = (params.code as string).toUpperCase();
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async () => {
    if (!name.trim()) { setError("Please enter your name"); return; }
    setError(""); setJoining(true);
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiz_code: quizCode, student_name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem("userId", String(data.user.id));
        sessionStorage.setItem("userName", data.user.name);
        router.push(`/quiz/${quizCode}`);
      } else {
        const err = await res.json();
        setError(err.detail || "Failed to join quiz");
      }
    } catch {
      setError("Cannot connect to server");
    } finally { setJoining(false); }
  };

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-6">
      <div className="relative z-10 max-w-md w-full animate-slide-up">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] flex items-center justify-center text-2xl font-bold text-[var(--on-primary)] mx-auto mb-6 animate-pulse-glow">{"</>"}</div>
          <h1 className="text-3xl font-extrabold text-[var(--on-surface)] mb-2">Join Quiz</h1>
          <p className="text-sm text-[var(--on-surface-variant)]">You&apos;re joining session</p>
          <div className="text-3xl font-mono font-extrabold tracking-[0.3em] text-[var(--primary)] mt-3">{quizCode}</div>
        </div>

        <div className="bg-[var(--surface-container-low)] rounded-2xl p-8 space-y-6">
          <div>
            <label className="text-xs font-medium text-[var(--on-surface-variant)] mb-2 block">Your Name</label>
            <input type="text" value={name} onChange={e => { setName(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
              className="input-field w-full py-3.5 px-4 rounded-xl text-base" placeholder="Enter your name..." autoFocus />
          </div>

          {error && <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[rgba(147,0,10,0.15)] text-sm text-[var(--error)]">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {error}
          </div>}

          <button onClick={handleJoin} disabled={joining}
            className="btn-primary w-full py-3.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            {joining ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Joining...</span> : "Join Session →"}
          </button>
        </div>
      </div>
    </div>
  );
}
