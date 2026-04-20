from celery import Celery
import os
import subprocess
from database import SessionLocal
from models import Submission, Question
from datetime import datetime
import socketio

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

def run_in_docker(code: str, language: str, test_input: str) -> str:
    docker_cmd = [
        "docker", "run", "--rm", "-i",
        "--network", "none",
        "--memory", "128m",
        "rce-worker",
        "--language", language
    ]
    try:
        result = subprocess.run(
            docker_cmd,
            input=f"{code}\n{test_input}", # Assuming the wrapper reads code first or we handle differently
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            return result.stderr or result.stdout
    except Exception as e:
        return f"Error: {str(e)}"


@celery_app.task(name="execute_code")
def execute_code_task(submission_id: int):
    # Setup database session
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
        
        # Split test cases and expected outputs by newline
        inputs = [i.strip() for i in (question.test_cases or "").split("\n") if i.strip()]
        expecteds = [e.strip() for e in (question.expected_output or "").split("\n") if e.strip()]
        
        # If no test cases defined, use empty input once
        if not inputs:
            inputs = [""]
            expecteds = [(question.expected_output or "").strip()]

        total_cases = len(inputs)
        passed_cases = 0
        all_results = []

        start_time = datetime.utcnow()
        for i in range(total_cases):
            test_input = inputs[i]
            expected = expecteds[i] if i < len(expecteds) else ""
            
            output = run_in_docker(submission.code, submission.language, test_input)
            all_results.append(output)
            
            if output.strip() == expected.strip():
                passed_cases += 1
        end_time = datetime.utcnow()
        
        submission.time_taken = int((end_time - start_time).total_seconds())
        submission.status = "completed"
        submission.result = "\n---\n".join(all_results)
        
        # Scoring logic: (Passed / Total) * Points - Penalty
        base_score = (passed_cases / total_cases) * question.points if total_cases > 0 else 0
        penalty = submission.tab_switches * 2 # 2 points penalty per tab switch
        submission.score = max(0, int(base_score - penalty))
        submission.is_correct = (passed_cases == total_cases)

        db.commit()
        
        # Emit final status
        sio.emit('status_update', {
            'submission_id': submission_id, 
            'status': submission.status,
            'result': submission.result
        })
        
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
