"use client";

import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://localhost:8000";

export default function QuizInterface() {
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("# Write your code here\nprint('Hello World!')");
  const [output, setOutput] = useState("Awaiting execution...");
  const [status, setStatus] = useState("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warnings, setWarnings] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Connect to Socket.IO
    socketRef.current = io(SERVER_URL, {
      transports: ["websocket", "polling"],
    });

    socketRef.current.on("status_update", (data) => {
      setStatus(data.status);
      if (data.result) {
        setOutput(data.result);
      } else {
        setOutput(`Status: ${data.status}...`);
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // Anti-cheat: Tab Switch Detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isFullscreen) {
        setWarnings((prev) => prev + 1);
        alert("Warning: Tab switching is not allowed during the quiz!");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isFullscreen]);

  // Anti-cheat: Fullscreen Enforcement
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement && status === "idle") {
        setWarnings((prev) => prev + 1);
        alert("Warning: Exiting fullscreen is logged as a violation.");
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [status]);

  const enterFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
    setIsFullscreen(true);
  };

  const submitCode = async () => {
    setStatus("submitting");
    setOutput("Sending to server...");
    try {
      // Create user first if needed, but we'll mock user_id=1, question_id=1
      const res = await fetch(`${SERVER_URL}/submissions/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          language,
          user_id: 1,
          question_id: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOutput(`Error: ${JSON.stringify(data)}`);
        setStatus("error");
      }
    } catch (err) {
      setOutput(`Failed to connect to server: ${err}`);
      setStatus("error");
    }
  };

  if (!isFullscreen) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white font-sans p-4">
        <div className="max-w-md text-center p-10 bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 backdrop-blur-sm">
          <div className="w-20 h-20 bg-blue-500 rounded-full mx-auto flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(59,130,246,0.5)]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            Secure Quiz Mode
          </h1>
          <p className="text-slate-400 mb-8">
            This quiz requires fullscreen mode and actively monitors tab switches. Exiting fullscreen or changing tabs will flag your attempt.
          </p>
          <button
            onClick={enterFullscreen}
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl text-white font-bold text-lg shadow-[0_10px_20px_rgba(0,0,0,0.3)] transition-all transform hover:-translate-y-1"
          >
            Enter Fullscreen & Start
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0F111A] text-slate-200 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-[#1A1D27] border-b border-[#2D313E] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg">
              {"< />"}
            </div>
            <h1 className="text-xl font-bold tracking-tight">Code execution task</h1>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-[#2D313E] px-4 py-2 rounded-full">
            <div className={`w-2 h-2 rounded-full ${warnings > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
            <span className="text-sm font-medium text-slate-300">
              {warnings === 0 ? "Secure Session Active" : `${warnings} Violations Logged`}
            </span>
          </div>
          <button 
            onClick={() => document.exitFullscreen()}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Exit Quiz
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left pane: Question & Editor */}
        <div className="flex-1 flex flex-col border-r border-[#2D313E]">
          {/* Question area */}
          <div className="p-6 border-b border-[#2D313E] bg-[#1A1D27]">
            <h2 className="text-2xl font-semibold mb-2">Question 1: Reverse String</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Write a function that reverses a string. The input string is given as an array of characters <code>s</code>. 
              You must do this by modifying the input array in-place with <code>O(1)</code> extra memory.
            </p>
          </div>
          
          {/* Editor Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#151722] border-b border-[#2D313E]">
            <div className="flex gap-2">
              {["python", "c"].map(lang => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    language === lang 
                      ? "bg-blue-600 text-white shadow-md" 
                      : "bg-[#2D313E] text-slate-400 hover:text-white hover:bg-[#383C4A]"
                  }`}
                >
                  {lang === 'c' ? 'C' : 'Python'}
                </button>
              ))}
            </div>
            <button
              onClick={submitCode}
              disabled={status === "submitting" || status === "processing"}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white font-semibold text-sm shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all transform hover:scale-105"
            >
              {(status === "submitting" || status === "processing") ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Code
                </>
              )}
            </button>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 min-h-[400px]">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 15,
                fontFamily: "JetBrains Mono, Menlo, monospace",
                padding: { top: 20 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
              }}
            />
          </div>
        </div>

        {/* Right pane: Output Terminal */}
        <div className="w-1/3 flex flex-col bg-[#0A0C10]">
          <div className="px-4 py-3 bg-[#151722] border-b border-[#2D313E] flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">Execution Output</h3>
            <span className={`text-xs px-2 py-1 rounded ${status === 'completed' ? 'bg-green-900 text-green-300' : status === 'error' ? 'bg-red-900 text-red-300' : 'bg-slate-800 text-slate-400'}`}>
              {status.toUpperCase()}
            </span>
          </div>
          <div className="flex-1 p-4 font-mono text-sm overflow-auto">
            {status === "idle" && output === "Awaiting execution..." ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p>Output will appear here</p>
              </div>
            ) : (
              <pre className={`whitespace-pre-wrap ${status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                {output}
              </pre>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
