# Remote Code Execution Platform Plan (Python Stack)

## Goal
Set up a remote code execution platform for student coding quizzes with a Python-based backend (e.g., FastAPI + Celery) and a Dockerized execution engine featuring anti-cheat measures.

## Tasks
- [x] Task 1: **Initialize Full-stack Structure** - Initialize a frontend application, a FastAPI backend service, and an isolated Docker worker directory. → **Verify:** `uvicorn` starts the backend API successfully.
- [x] Task 2: **Setup Database Schema** - Configure PostgreSQL and implement User, Quiz, Question, and Submission models using an ORM (e.g., SQLAlchemy or SQLModel). → **Verify:** Alembic migrations successfully create tables in the database.
- [x] Task 3: **Build Execution Worker (Docker)** - Create a Dockerfile for the worker environment with GCC and Python 3. Implement a script that accepts code, compiles/runs it (with a 2-second timeout, memory limits, and no network access), and returns the output. → **Verify:** `docker build` succeeds and running a test Python script via Docker returns the expected output within limits.
- [x] Task 4: **Implement FastAPI & Celery Queue** - Create FastAPI endpoints for submitting code and set up a Celery queue (with Redis as broker) to hand off submissions to the Docker execution worker. → **Verify:** Submitting code via API enqueues the task, and the Celery worker picks it up and processes it.
- [x] Task 5: **Implement Real-time WebSockets** - Add WebSocket support to FastAPI to emit real-time status updates (Queued → Processing → Completed) to the client. → **Verify:** A test WebSocket connection receives real-time progress events when a submission is processed.
- [x] Task 6: **Build Frontend UI & Anti-Cheat** - Create the quiz interface with a code editor. Implement anti-cheat features: fullscreen enforcement, tab-switch detection, and attempt limits. → **Verify:** Exiting fullscreen or switching tabs triggers an anti-cheat warning/flag in the browser console.
- [x] Task 7: **E2E Integration** - Connect the frontend submissions to the FastAPI backend, trigger the Celery queue, run the Docker worker, and stream results back to the frontend UI via WebSockets. → **Verify:** A user can submit C or Python code in the browser and see the execution results appear dynamically without page reloads.

## Done When
- [x] A student can open a quiz, write code in Python or C, submit it, and see their execution output securely processed in isolation.
- [x] Tab switching and exiting fullscreen are actively monitored and logged.
- [x] Malicious code (e.g., infinite loops) is automatically killed after 2 seconds.
