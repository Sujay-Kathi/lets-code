from celery import Celery
import os
import subprocess
from .database import SessionLocal
from .models import Submission
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

        # Run Docker container with limits
        # --rm: remove container after execution
        # --network none: no internet access
        # --memory: limit memory
        # -i: interactive (to pass code via stdin)
        # We assume the docker image is built as `rce-worker`
        
        # Build command
        docker_cmd = [
            "docker", "run", "--rm", "-i",
            "--network", "none",
            "--memory", "128m",
            "rce-worker",
            "--language", submission.language
        ]
        
        # Execute
        try:
            result = subprocess.run(
                docker_cmd,
                input=submission.code,
                capture_output=True,
                text=True,
                timeout=5  # Overall docker timeout (inner timeout is 2s)
            )
            
            if result.returncode == 0:
                submission.result = result.stdout
                submission.status = "completed"
            else:
                submission.result = result.stderr or result.stdout
                submission.status = "error"
        except subprocess.TimeoutExpired:
            submission.result = "Docker Execution timed out"
            submission.status = "error"
        except Exception as e:
            submission.result = str(e)
            submission.status = "error"
            
        db.commit()
        
        # Emit final status
        sio.emit('status_update', {
            'submission_id': submission_id, 
            'status': submission.status,
            'result': submission.result
        })
        
        return {"submission_id": submission_id, "status": submission.status}
        
    finally:
        db.close()
