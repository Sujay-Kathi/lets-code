"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

const SERVER_URL = "http://localhost:8000";

const QUESTION_TYPES = [
  { value: "coding_problem", label: "Coding Problem", badge: "badge-coding", icon: "💻", desc: "Full program with input/output" },
  { value: "debugging", label: "Debugging", badge: "badge-debugging", icon: "🐛", desc: "Fix errors in given code" },
  { value: "output_prediction", label: "Output Prediction", badge: "badge-output", icon: "🔮", desc: "Predict output of code" },
  { value: "fill_in_code", label: "Fill in the Code", badge: "badge-fillin", icon: "✏️", desc: "Complete missing parts" },
  { value: "function_based", label: "Function-Based", badge: "badge-function", icon: "⚙️", desc: "Complete a function" },
];

const TEMPLATES: Record<string, { title: string; description: string; code: string }> = {
  coding_problem: { title: "Write a program", description: "Write a program to solve the following problem.", code: "# Write your solution here\n\n" },
  debugging: { title: "Fix the bug", description: "Find and fix the error(s) in the following code.", code: 'if n % 2 = 0:\n    print("Even")\n' },
  output_prediction: { title: "Predict the output", description: "What will be the output of the following code?", code: "for i in range(3):\n    print(i)\n" },
  fill_in_code: { title: "Fill in the blanks", description: "Complete the missing parts marked with ___.", code: "for i in range(___):\n    print(i)\n" },
  function_based: { title: "Complete the function", description: "Implement the function body.", code: "def is_prime(n):\n    # Complete the logic\n    pass\n" },
};

interface Question { id?: number; quiz_id?: number; question_type: string; title: string; description: string; code_template: string; expected_output: string; test_cases: string; points: number; order: number; }
interface Quiz { id: number; title: string; code: string; language: string; time_limit: number; status: string; questions: Question[]; }

export default function QuizBuilder() {
  const params = useParams();
  const router = useRouter();
  const quizCode = params.code as string;
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizTitle, setQuizTitle] = useState("Untitled Quiz");
  const [language, setLanguage] = useState("python");
  const [timeLimit, setTimeLimit] = useState(30);
  const [maxAttempts, setMaxAttempts] = useState(4);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [showTypeDD, setShowTypeDD] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeQ, setActiveQ] = useState<number | null>(null);
  const [copyOk, setCopyOk] = useState(false);

  const fetchQuiz = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}`);
      if (res.ok) {
        const data: Quiz = await res.json();
        setQuiz(data); setQuizTitle(data.title); setLanguage(data.language); setTimeLimit(data.time_limit);
        setMaxAttempts((data as any).max_attempts || 4);
        setQuestions(data.questions || []);

        if (data.questions?.length > 0) setActiveQ(0);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [quizCode]);

  useEffect(() => { fetchQuiz(); }, [fetchQuiz]);

  const addQuestion = async (type: string) => {
    setShowTypeDD(false);
    const t = TEMPLATES[type];
    const nq = { question_type: type, title: t.title, description: t.description, code_template: t.code, expected_output: "", test_cases: "", points: 10, order: questions.length };
    try {
      const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}/questions/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nq) });
      if (res.ok) { const saved = await res.json(); setQuestions(p => [...p, saved]); setActiveQ(questions.length); }
    } catch (e) { console.error(e); }
  };

  const updateQ = async (i: number, field: string, val: string | number) => {
    const u = [...questions]; (u[i] as unknown as Record<string, unknown>)[field] = val; setQuestions(u);
    const q = u[i]; if (!q.id) return;
    try { await fetch(`${SERVER_URL}/quizzes/${quizCode}/questions/${q.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: val }) }); } catch (e) { console.error(e); }
  };

  const deleteQ = async (i: number) => {
    const q = questions[i]; if (!q.id) return;
    try { await fetch(`${SERVER_URL}/quizzes/${quizCode}/questions/${q.id}`, { method: "DELETE" }); const u = questions.filter((_, x) => x !== i); setQuestions(u); if (activeQ !== null && activeQ >= u.length) setActiveQ(u.length > 0 ? u.length - 1 : null); } catch (e) { console.error(e); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try { await fetch(`${SERVER_URL}/quizzes/${quizCode}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: quizTitle, language, time_limit: timeLimit, max_attempts: maxAttempts }) }); } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };


  const publish = async () => {
    if (questions.length === 0) { alert("Add at least one question"); return; }
    setPublishing(true); await saveSettings();
    try { const res = await fetch(`${SERVER_URL}/quizzes/${quizCode}/start`, { method: "POST" }); if (res.ok) router.push(`/host/${quizCode}/live`); else { const e = await res.json(); alert(e.detail); } } catch (e) { console.error(e); }
    finally { setPublishing(false); }
  };

  const getType = (t: string) => QUESTION_TYPES.find(x => x.value === t) || QUESTION_TYPES[0];

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--surface)]"><div className="w-10 h-10 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const aq = activeQ !== null ? questions[activeQ] : null;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface)]">
      <header className="glass sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/")} className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] flex items-center justify-center font-bold text-xs text-[var(--on-primary)]">{"</>"}</div>
          <span className="text-lg font-bold text-[var(--on-surface)]">Create Quiz</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { navigator.clipboard.writeText(quizCode); setCopyOk(true); setTimeout(() => setCopyOk(false), 2000); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface-container-high)] text-sm font-mono text-[var(--primary)]">
            <span className="tracking-[0.15em]">{quizCode}</span>
            {copyOk ? <span className="text-xs">✓</span> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
          </button>
          <button onClick={saveSettings} disabled={saving} className="btn-ghost px-4 py-2 rounded-lg text-sm">{saving ? "Saving..." : "Save"}</button>
          <button onClick={publish} disabled={publishing || questions.length === 0} className="btn-primary px-5 py-2.5 rounded-lg text-sm disabled:opacity-40">{publishing ? "Publishing..." : "Go Live 🚀"}</button>
        </div>
      </header>

      <div className="px-6 py-4 bg-[var(--surface-container-lowest)] flex items-center gap-6 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <label className="text-xs font-medium text-[var(--on-surface-variant)] mb-1.5 block">Quiz Title</label>
          <input type="text" value={quizTitle} onChange={e => setQuizTitle(e.target.value)} onBlur={saveSettings} className="input-field w-full py-2.5 px-4 rounded-lg text-base font-semibold" placeholder="Enter quiz title..." />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--on-surface-variant)] mb-1.5 block">Time Limit</label>
          <select value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))} className="input-field py-2.5 px-4 rounded-lg text-sm">
            {[15,30,45,60,90].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--on-surface-variant)] mb-1.5 block">Max Attempts</label>
          <select value={maxAttempts} onChange={e => setMaxAttempts(Number(e.target.value))} className="input-field py-2.5 px-4 rounded-lg text-sm">
            {[1, 2, 3, 4, 5, 10].map(n => <option key={n} value={n}>{n} {n === 1 ? 'Attempt' : 'Attempts'}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--on-surface-variant)] mb-1.5 block">Language</label>
          <div className="flex gap-1 bg-[var(--surface-container-highest)] rounded-lg p-1">
            {["python","c","javascript"].map(l => <button key={l} onClick={() => setLanguage(l)} className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${language === l ? "bg-[var(--primary)] text-[var(--on-primary)]" : "text-[var(--on-surface-variant)]"}`}>{l === "c" ? "C" : l === "javascript" ? "JS" : "Python"}</button>)}
          </div>
        </div>

      </div>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 bg-[var(--surface-container-lowest)] overflow-y-auto flex flex-col">
          <div className="p-4"><span className="text-sm font-semibold text-[var(--on-surface)]">Questions ({questions.length})</span></div>
          <div className="flex-1 px-3 space-y-2 pb-4">
            {questions.map((q, i) => { const m = getType(q.question_type); return (
              <button key={q.id || i} onClick={() => setActiveQ(i)} className={`w-full text-left p-3 rounded-xl transition-all ${activeQ === i ? "bg-[var(--surface-container)] ring-1 ring-[var(--primary)]/20" : "bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)]"}`}>
                <div className="flex items-start gap-3"><span>{m.icon}</span><div className="flex-1 min-w-0"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.badge}`}>{m.label}</span><p className="text-xs text-[var(--on-surface-variant)] truncate mt-1">{q.title || "Untitled"}</p></div><span className="text-xs text-[var(--on-surface-variant)] font-mono">Q{i+1}</span></div>
              </button>); })}
            {questions.length === 0 && <div className="text-center py-12 px-4"><div className="text-4xl mb-3">📝</div><p className="text-sm text-[var(--on-surface-variant)]">No questions yet</p></div>}
          </div>
          <div className="p-3 relative">
            <button onClick={() => setShowTypeDD(!showTypeDD)} className="btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>Add Question
            </button>
            {showTypeDD && <div className="absolute bottom-full left-3 right-3 mb-2 bg-[var(--surface-container-high)] rounded-xl shadow-2xl overflow-hidden z-20 animate-fade-in">
              {QUESTION_TYPES.map(t => <button key={t.value} onClick={() => addQuestion(t.value)} className="w-full text-left px-4 py-3 hover:bg-[var(--surface-container-highest)] flex items-center gap-3"><span className="text-lg">{t.icon}</span><div><p className="text-sm font-medium text-[var(--on-surface)]">{t.label}</p><p className="text-xs text-[var(--on-surface-variant)]">{t.desc}</p></div></button>)}
            </div>}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          {aq ? (
            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3"><span className="text-2xl">{getType(aq.question_type).icon}</span><div><span className={`text-xs font-semibold px-3 py-1 rounded-full ${getType(aq.question_type).badge}`}>{getType(aq.question_type).label}</span><p className="text-xs text-[var(--on-surface-variant)] mt-1">Question {activeQ! + 1} · {aq.points} pts</p></div></div>
                <button onClick={() => deleteQ(activeQ!)} className="p-2 rounded-lg text-[var(--error)] hover:bg-[var(--error-container)]"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
              </div>
              <div><label className="text-xs font-medium text-[var(--on-surface-variant)] mb-2 block">Title</label><input type="text" value={aq.title} onChange={e => updateQ(activeQ!, "title", e.target.value)} className="input-field w-full py-3 px-4 rounded-xl text-lg font-semibold" /></div>
              <div><label className="text-xs font-medium text-[var(--on-surface-variant)] mb-2 block">Description</label><textarea value={aq.description} onChange={e => updateQ(activeQ!, "description", e.target.value)} rows={4} className="input-field w-full py-3 px-4 rounded-xl text-sm resize-none" /></div>
              <div><label className="text-xs font-medium text-[var(--on-surface-variant)] mb-2 block">Code Template</label><textarea value={aq.code_template} onChange={e => updateQ(activeQ!, "code_template", e.target.value)} rows={10} className="input-field w-full py-4 px-4 rounded-xl text-sm resize-none font-mono" style={{ background: "var(--surface-container-lowest)", tabSize: 4 }} spellCheck={false} /></div>
              <div><label className="text-xs font-medium text-[var(--on-surface-variant)] mb-2 block">Expected Output</label><textarea value={aq.expected_output || ""} onChange={e => updateQ(activeQ!, "expected_output", e.target.value)} rows={3} className="input-field w-full py-3 px-4 rounded-xl text-sm resize-none font-mono" style={{ background: "var(--surface-container-lowest)" }} /></div>
              <div><label className="text-xs font-medium text-[var(--on-surface-variant)] mb-2 block">Points</label><input type="number" value={aq.points} onChange={e => updateQ(activeQ!, "points", Number(e.target.value))} min={1} max={100} className="input-field w-24 py-2.5 px-4 rounded-lg text-sm font-mono text-center" /></div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center"><div className="text-6xl mb-4 animate-float">🏗️</div><h2 className="text-xl font-bold text-[var(--on-surface)] mb-2">Build Your Quiz</h2><p className="text-sm text-[var(--on-surface-variant)]">Add questions from the sidebar</p></div>
          )}
        </main>
      </div>
    </div>
  );
}
