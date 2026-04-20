"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

const SERVER_URL = "http://127.0.0.1:8000";

export default function LandingPage() {
  const router = useRouter();
  const [quizCode, setQuizCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [joinError, setJoinError] = useState("");

  const handleCreateQuiz = async () => {
    setIsCreating(true);
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Quiz",
          language: "python",
          time_limit: 30,
          questions: [],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/host/${data.code}`);
      }
    } catch {
      console.error("Failed to create quiz");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinQuiz = async () => {
    if (!quizCode.trim()) {
      setJoinError("Please enter a quiz code");
      return;
    }
    setJoinError("");
    router.push(`/join/${quizCode.trim().toUpperCase()}`);
  };

  return (
    <div className="min-h-screen mesh-bg flex flex-col">
      {/* Navigation */}
      <nav className="glass sticky top-0 z-50 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] flex items-center justify-center font-bold text-sm text-[var(--on-primary)]">
            {"</>"}
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--on-surface)]">
            LetsCode
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#features" className="text-sm text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors">
            Features
          </a>
          <a href="#" className="text-sm text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors">
            Docs
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface-container-high)] text-sm text-[var(--on-surface-variant)] mb-8">
            <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
            Live coding platform
          </div>

          <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
            <span className="text-[var(--on-surface)]">Lets</span>
            <span className="gradient-text">Code</span>
          </h1>

          <p className="text-lg md:text-xl text-[var(--on-surface-variant)] max-w-2xl mx-auto leading-relaxed">
            Real-time coding quizzes. Live sessions. Instant feedback.
            <br />
            <span className="text-[var(--on-surface)] font-medium">
              Host challenges. Write code. Execute live.
            </span>
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl w-full animate-slide-up">
          {/* Host Card */}
          <div className="group relative rounded-2xl bg-[var(--surface-container-low)] p-8 transition-all duration-300 hover:bg-[var(--surface-container)] cursor-pointer"
               style={{ animationDelay: "0.1s" }}>
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                 style={{ background: "radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(78,222,163,0.04), transparent 40%)" }} />
            
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-[var(--surface-container-high)] flex items-center justify-center mb-6 group-hover:bg-[var(--surface-container-highest)] transition-colors">
                <svg className="w-7 h-7 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-[var(--on-surface)] mb-3">
                Host a Quiz
              </h2>
              <p className="text-[var(--on-surface-variant)] text-sm leading-relaxed mb-8">
                Create custom coding challenges with 5 question types. Set time limits,
                choose languages, and host live quiz sessions for your students.
              </p>

              <button
                onClick={handleCreateQuiz}
                disabled={isCreating}
                className="btn-primary w-full py-3.5 px-6 rounded-xl text-sm font-semibold tracking-wide disabled:opacity-50"
              >
                {isCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Creating...
                  </span>
                ) : (
                  "Create Quiz →"
                )}
              </button>
            </div>
          </div>

          {/* Join Card */}
          <div className="group relative rounded-2xl bg-[var(--surface-container-low)] p-8 transition-all duration-300 hover:bg-[var(--surface-container)]"
               style={{ animationDelay: "0.2s" }}>
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                 style={{ background: "radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(173,198,255,0.04), transparent 40%)" }} />

            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-[var(--surface-container-high)] flex items-center justify-center mb-6 group-hover:bg-[var(--surface-container-highest)] transition-colors">
                <svg className="w-7 h-7 text-[var(--tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-[var(--on-surface)] mb-3">
                Join a Quiz
              </h2>
              <p className="text-[var(--on-surface-variant)] text-sm leading-relaxed mb-6">
                Enter a quiz code or use a link to join a live coding session.
                Write, run, and submit code in real-time.
              </p>

              <div className="flex flex-col gap-3">
                <input
                  id="quiz-code-input"
                  type="text"
                  value={quizCode}
                  onChange={(e) => { setQuizCode(e.target.value.toUpperCase()); setJoinError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinQuiz()}
                  placeholder="Enter Quiz Code"
                  maxLength={6}
                  className="input-field w-full py-3.5 px-5 rounded-xl text-sm font-mono tracking-[0.3em] text-center uppercase"
                />
                {joinError && (
                  <p className="text-xs text-[var(--error)] text-center">{joinError}</p>
                )}
                <button
                  onClick={handleJoinQuiz}
                  className="btn-ghost w-full py-3.5 px-6 rounded-xl text-sm font-semibold"
                >
                  Join Session →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Badges */}
        <div id="features" className="flex flex-wrap items-center justify-center gap-3 mt-16 animate-fade-in" style={{ animationDelay: "0.4s" }}>
          {[
            { label: "5 Question Types", icon: "📝" },
            { label: "Live Sessions", icon: "🔴" },
            { label: "Code Execution", icon: "⚡" },
            { label: "Anti-Cheat", icon: "🛡️" },
            { label: "Real-time Results", icon: "📊" },
          ].map((feature) => (
            <div
              key={feature.label}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--surface-container)] text-xs font-medium text-[var(--on-surface-variant)]"
            >
              <span>{feature.icon}</span>
              {feature.label}
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-6 text-center text-xs text-[var(--on-surface-variant)] opacity-60">
        © 2025 LetsCode. Precision in every line.
      </footer>
    </div>
  );
}
