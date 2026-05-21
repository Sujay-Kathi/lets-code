from celery import Celery
import os
import subprocess
from database import SessionLocal
from models import Submission, Question, QuestionBaseline
from datetime import datetime
import socketio
from ai_evaluator import evaluate_with_ai, evaluate_against_baseline

# Celery Configuration
# We use Redis as the message broker.
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "worker",
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

def run_in_docker(code: str, language: str, test_input: str) -> dict:
    """Run code in Docker and capture both stdout and stderr separately."""
    docker_cmd = [
        "docker", "run", "--rm", "-i",
        "--network", "none",
        "--memory", "128m",
        "rce-worker",
        "--language", language
    ]
    try:
        DELIMITER = "---END_OF_CODE_DELIMITER---"
        payload = f"{code}\n{DELIMITER}\n{test_input}"
        result = subprocess.run(
            docker_cmd,
            input=payload,
            capture_output=True,
            text=True,
            timeout=30
        )
        return {
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
            "returncode": result.returncode,
            "combined": (result.stdout + result.stderr).strip(),
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Execution timed out (30s limit)",
            "returncode": -1,
            "combined": "Execution timed out (30s limit)",
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Error: {str(e)}",
            "returncode": -1,
            "combined": f"Error: {str(e)}",
        }


@celery_app.task(name="execute_code")
def execute_code_task(submission_id: int):
    db = SessionLocal()
    try:
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            return {"error": "Submission not found"}
        
        # Initialize SocketIO manager to push events
        sio = socketio.RedisManager(REDIS_URL, write_only=True)
        
        # Update status to processing
        submission.status = "processing"
        db.commit()
        sio.emit('status_update', {'submission_id': submission_id, 'status': 'processing'})

        question = db.query(Question).filter(Question.id == submission.question_id).first()
        if not question:
            submission.status = "error"
            submission.result = "Question not found"
            db.commit()
            return {"error": "Question not found"}

        # --- STEP 1: Execute the code in Docker ---
        # Use student-provided stdin_input for execution
        user_input = (submission.stdin_input or "").strip()
        
        start_time = datetime.utcnow()
        execution = run_in_docker(submission.code, submission.language, user_input)
        end_time = datetime.utcnow()

        submission.time_taken = int((end_time - start_time).total_seconds())
        submission.result = execution["combined"]

        # --- STEP 2: AI Evaluation (ONLY for final submissions) ---
        if submission.is_final:
            baseline = db.query(QuestionBaseline).filter(QuestionBaseline.question_id == question.id).first()
            if baseline:
                # 1. Run student's code on baseline's input (if baseline input exists and is different from student input)
                student_output_on_baseline_input = ""
                b_in = (baseline.input_used or "").strip()
                s_in = user_input.strip()
                
                if b_in and b_in != s_in:
                    exec_stud_on_base = run_in_docker(submission.code, submission.language, b_in)
                    student_output_on_baseline_input = exec_stud_on_base["combined"]
                else:
                    student_output_on_baseline_input = execution["combined"]

                # 2. Run teacher's code on student's input (if student input exists and is different from baseline input)
                baseline_output_on_student_input = ""
                if s_in and s_in != b_in:
                    exec_base_on_stud = run_in_docker(baseline.code, baseline.language, s_in)
                    baseline_output_on_student_input = exec_base_on_stud["combined"]
                else:
                    baseline_output_on_student_input = baseline.compiled_output

                ai_result = evaluate_against_baseline(
                    problem_description=f"{question.title}\n\n{question.description}",
                    baseline_code=baseline.code,
                    baseline_input=baseline.input_used or "",
                    baseline_output=baseline.compiled_output,
                    student_code=submission.code,
                    student_input=user_input,
                    student_output=execution["combined"],
                    language=submission.language,
                    max_points=question.points,
                    student_output_on_baseline_input=student_output_on_baseline_input,
                    baseline_output_on_student_input=baseline_output_on_student_input,
                )
            else:
                ai_result = evaluate_with_ai(
                    problem_description=f"{question.title}\n\n{question.description}",
                    student_code=submission.code,
                    user_input=user_input,
                    actual_output=execution["combined"],
                    language=submission.language,
                    max_points=question.points,
                )

            submission.is_correct = ai_result["is_correct"]
            submission.ai_verdict = ai_result["reasoning"]

            # Score: AI score minus tab-switch penalty
            penalty = submission.tab_switches * 2  # 2 points penalty per tab switch
            submission.score = max(0, ai_result["score"] - penalty)
        else:
            # Non-final "Run Code" — just execution, no scoring
            submission.is_correct = None
            submission.ai_verdict = None
            submission.score = 0

        submission.status = "completed"
        
        db.commit()
        
        # Emit final status
        emit_data = {
            'submission_id': submission_id, 
            'status': submission.status,
            'result': submission.result,
        }
        if submission.is_final:
            emit_data.update({
                'is_correct': submission.is_correct,
                'score': submission.score,
                'ai_verdict': submission.ai_verdict,
            })
        sio.emit('status_update', emit_data)
        
        return {"submission_id": submission_id, "status": submission.status}

    except subprocess.TimeoutExpired:
        submission.result = "Docker Execution timed out"
        submission.status = "error"
        db.commit()
    except Exception as e:
        if 'submission' in locals() and submission:
            submission.result = str(e)
            submission.status = "error"
            db.commit()
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task(name="compile_teacher_code")
def compile_teacher_code_task(question_id: int, code: str, language: str, test_input: str, is_final: bool, quiz_code: str):
    db = SessionLocal()
    try:
        sio = socketio.RedisManager(REDIS_URL, write_only=True)
        
        # Notify starting compile
        sio.emit('teacher_compile_update', {'question_id': question_id, 'status': 'processing'}, room=f"teacher_{quiz_code}")
        
        execution = run_in_docker(code, language, test_input)
        combined_out = execution["combined"]

        if is_final:
            baseline = db.query(QuestionBaseline).filter(QuestionBaseline.question_id == question_id).first()
            if not baseline:
                baseline = QuestionBaseline(
                    question_id=question_id,
                    code=code,
                    language=language,
                    input_used=test_input,
                    compiled_output=combined_out,
                )
                db.add(baseline)
            else:
                baseline.code = code
                baseline.language = language
                baseline.input_used = test_input
                baseline.compiled_output = combined_out
            db.commit()

        sio.emit('teacher_compile_result', {
            'question_id': question_id,
            'status': 'completed',
            'output': combined_out,
            'is_final': is_final,
        }, room=f"teacher_{quiz_code}")

        return {"question_id": question_id, "status": "completed"}
    except Exception as e:
        try:
            sio = socketio.RedisManager(REDIS_URL, write_only=True)
            sio.emit('teacher_compile_result', {
                'question_id': question_id,
                'status': 'error',
                'output': f"Error: {str(e)}",
                'is_final': is_final,
            }, room=f"teacher_{quiz_code}")
        except:
            pass
        return {"error": str(e)}
    finally:
        db.close()
