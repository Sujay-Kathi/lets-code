from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models, schemas
from database import engine, get_db
from worker import execute_code_task
import socketio
import os

# Socket.IO setup using Redis manager
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
sio_mgr = socketio.AsyncRedisManager(REDIS_URL)
sio = socketio.AsyncServer(async_mode='asgi', client_manager=sio_mgr, cors_allowed_origins='*')
sio_app = socketio.ASGIApp(sio)

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Remote Code Execution Platform")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "RCE Platform API is running"}

# Mount Socket.IO app
app.mount("/socket.io", sio_app)

@app.post("/users/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = models.User(**user.model_dump())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/submissions/", response_model=schemas.SubmissionResponse)
def create_submission(submission: schemas.SubmissionCreate, db: Session = Depends(get_db)):
    db_submission = models.Submission(
        user_id=submission.user_id,
        question_id=submission.question_id,
        code=submission.code,
        language=submission.language,
        status="queued"
    )
    db.add(db_submission)
    db.commit()
    db.refresh(db_submission)
    
    # Enqueue task in Celery
    execute_code_task.delay(db_submission.id)
    
    return db_submission

@app.get("/submissions/{submission_id}", response_model=schemas.SubmissionResponse)
def get_submission(submission_id: int, db: Session = Depends(get_db)):
    submission = db.query(models.Submission).filter(models.Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission
