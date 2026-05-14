# Authoritative Baseline Logic Evaluator

## Goal
Implement authoritative solution compilation for teachers setting quiz questions and logic-equivalence evaluation for students submitting code against this baseline.

## Tasks
- [x] Task 1: Add `QuestionBaseline` model to `backend/models.py` with foreign key to `Question` -> Verify: Run `python -c "import models"` cleanly.
- [x] Task 2: Update Pydantic schemas in `backend/schemas.py` to include `QuestionBaseline` creation and serialization -> Verify: `python -c "import schemas"` runs without errors.
- [x] Task 3: Implement `evaluate_against_baseline` prompt logic in `backend/ai_evaluator.py` -> Verify: `python -c "import ai_evaluator"` parses cleanly.
- [x] Task 4: Add `compile_teacher_code_task` to `backend/worker.py` and integrate baseline check into student evaluation flow -> Verify: Celery worker initializes cleanly.
- [x] Task 5: Add POST `/quizzes/{quiz_code}/questions/{question_id}/compile` endpoint in `backend/main.py` -> Verify: `fastapi dev` / syntax check passes.
- [x] Task 6: Add solution editor, input textarea, Compile, and Final Compile buttons to `frontend/src/app/host/[code]/page.tsx` -> Verify: Next.js frontend builds cleanly.
- [x] Task 7: Add Final Submit button and logic to `frontend/src/app/quiz/[code]/page.tsx` -> Verify: `npm run lint` passes without warnings.
- [x] Task 8: Run linting and validation loop on both backend and frontend -> Verify: Clean execution.

## Done When
- [x] Teachers can compile their authoritative solution and save it as a final baseline.
- [x] Students have a final submit button that triggers advanced baseline logical checking.
- [x] AI evaluation grants points correctly when logical intent matches the baseline regardless of cosmetic code variance.
