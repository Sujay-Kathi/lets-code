from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
import models, schemas
from database import engine, get_db
from worker import execute_code_task
import socketio
import os
import string
import random
from datetime import datetime
from typing import List

# Socket.IO setup using Redis manager
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
sio_mgr = socketio.AsyncRedisManager(REDIS_URL)
sio = socketio.AsyncServer(async_mode='asgi', client_manager=sio_mgr, cors_allowed_origins='*')
sio_app = socketio.ASGIApp(sio)

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="LetsCode - Live Coding Quiz Platform")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def generate_quiz_code(length=6):
    """Generate a unique quiz join code."""
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))


@app.get("/")
def read_root():
    return {"message": "LetsCode API is running", "version": "2.0"}


# Mount Socket.IO app
app.mount("/socket.io", sio_app)


# ==================== USER ROUTES ====================

@app.post("/users/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = models.User(**user.model_dump())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


# ==================== QUIZ ROUTES ====================

@app.post("/quizzes/", response_model=schemas.QuizResponse)
def create_quiz(quiz: schemas.QuizCreate, db: Session = Depends(get_db)):
    """Create a new quiz with optional questions."""
    quiz_code = generate_quiz_code()
    while db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first():
        quiz_code = generate_quiz_code()

    db_quiz = models.Quiz(
        title=quiz.title,
        code=quiz_code,
        language=quiz.language,
        time_limit=quiz.time_limit,
        status="draft",
    )
    db.add(db_quiz)
    db.commit()
    db.refresh(db_quiz)

    for i, q in enumerate(quiz.questions or []):
        db_question = models.Question(
            quiz_id=db_quiz.id,
            question_type=q.question_type,
            title=q.title,
            description=q.description,
            code_template=q.code_template,
            expected_output=q.expected_output,
            test_cases=q.test_cases,
            points=q.points,
            order=i,
        )
        db.add(db_question)

    db.commit()
    db.refresh(db_quiz)
    return db_quiz


@app.get("/quizzes/", response_model=List[schemas.QuizSummary])
def list_quizzes(status: str = Query(None), db: Session = Depends(get_db)):
    """List all quizzes, optionally filtered by status."""
    query = db.query(models.Quiz)
    if status:
        query = query.filter(models.Quiz.status == status)
    quizzes = query.order_by(models.Quiz.created_at.desc()).all()

    result = []
    for q in quizzes:
        result.append(schemas.QuizSummary(
            id=q.id,
            title=q.title,
            code=q.code,
            status=q.status,
            language=q.language,
            time_limit=q.time_limit,
            question_count=len(q.questions),
            created_at=q.created_at,
        ))
    return result


@app.get("/quizzes/{quiz_code}", response_model=schemas.QuizResponse)
def get_quiz(quiz_code: str, db: Session = Depends(get_db)):
    """Get a quiz by its join code."""
    quiz = db.query(models.Quiz).options(
        joinedload(models.Quiz.questions)
    ).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


@app.put("/quizzes/{quiz_code}", response_model=schemas.QuizResponse)
def update_quiz(quiz_code: str, quiz_update: schemas.QuizCreate, db: Session = Depends(get_db)):
    """Update quiz title, language, time_limit."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    quiz.title = quiz_update.title
    quiz.language = quiz_update.language
    quiz.time_limit = quiz_update.time_limit
    db.commit()
    db.refresh(quiz)
    return quiz


@app.post("/quizzes/{quiz_code}/start", response_model=schemas.QuizResponse)
def start_quiz(quiz_code: str, db: Session = Depends(get_db)):
    """Start a live quiz session."""
    quiz = db.query(models.Quiz).options(
        joinedload(models.Quiz.questions)
    ).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not quiz.questions:
        raise HTTPException(status_code=400, detail="Cannot start quiz without questions")

    quiz.status = "live"
    quiz.started_at = datetime.utcnow()
    db.commit()
    db.refresh(quiz)
    return quiz


@app.post("/quizzes/{quiz_code}/end", response_model=schemas.QuizResponse)
def end_quiz(quiz_code: str, db: Session = Depends(get_db)):
    """End a live quiz session."""
    quiz = db.query(models.Quiz).options(
        joinedload(models.Quiz.questions)
    ).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    quiz.status = "completed"
    db.commit()
    db.refresh(quiz)
    return quiz


# ==================== QUESTION ROUTES ====================

@app.post("/quizzes/{quiz_code}/questions/", response_model=schemas.QuestionResponse)
def add_question(quiz_code: str, question: schemas.QuestionCreate, db: Session = Depends(get_db)):
    """Add a question to a quiz."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    max_order = db.query(models.Question).filter(
        models.Question.quiz_id == quiz.id
    ).count()

    db_question = models.Question(
        quiz_id=quiz.id,
        question_type=question.question_type,
        title=question.title,
        description=question.description,
        code_template=question.code_template,
        expected_output=question.expected_output,
        test_cases=question.test_cases,
        points=question.points,
        order=max_order,
    )
    db.add(db_question)
    db.commit()
    db.refresh(db_question)
    return db_question


@app.put("/quizzes/{quiz_code}/questions/{question_id}", response_model=schemas.QuestionResponse)
def update_question(quiz_code: str, question_id: int, question: schemas.QuestionUpdate,
                    db: Session = Depends(get_db)):
    """Update a question."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    db_question = db.query(models.Question).filter(
        models.Question.id == question_id,
        models.Question.quiz_id == quiz.id,
    ).first()
    if not db_question:
        raise HTTPException(status_code=404, detail="Question not found")

    update_data = question.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_question, key, value)

    db.commit()
    db.refresh(db_question)
    return db_question


@app.delete("/quizzes/{quiz_code}/questions/{question_id}")
def delete_question(quiz_code: str, question_id: int, db: Session = Depends(get_db)):
    """Delete a question from a quiz."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    db_question = db.query(models.Question).filter(
        models.Question.id == question_id,
        models.Question.quiz_id == quiz.id,
    ).first()
    if not db_question:
        raise HTTPException(status_code=404, detail="Question not found")

    db.delete(db_question)
    db.commit()
    return {"message": "Question deleted"}


# ==================== JOIN / LIVE SESSION ====================

@app.post("/quizzes/{quiz_code}/join", response_model=schemas.JoinQuizResponse)
def join_quiz(quiz_code: str, join_req: schemas.JoinQuizRequest, db: Session = Depends(get_db)):
    """Student joins a live quiz session."""
    quiz = db.query(models.Quiz).options(
        joinedload(models.Quiz.questions)
    ).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.status != "live":
        raise HTTPException(status_code=400, detail=f"Quiz is not live (status: {quiz.status})")

    # Create or get student user
    user = db.query(models.User).filter(
        models.User.name == join_req.student_name,
        models.User.role == "student",
    ).first()

    if not user:
        user = models.User(name=join_req.student_name, role="student")
        db.add(user)
        db.commit()
        db.refresh(user)

    return schemas.JoinQuizResponse(quiz=quiz, user=user)


# ==================== SUBMISSION ROUTES ====================

@app.post("/submissions/", response_model=schemas.SubmissionResponse)
def create_submission(submission: schemas.SubmissionCreate, db: Session = Depends(get_db)):
    db_submission = models.Submission(
        user_id=submission.user_id,
        question_id=submission.question_id,
        quiz_code=submission.quiz_code,
        code=submission.code,
        language=submission.language,
        status="queued",
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


@app.get("/quizzes/{quiz_code}/submissions/", response_model=List[schemas.SubmissionResponse])
def get_quiz_submissions(quiz_code: str, user_id: int = Query(None), db: Session = Depends(get_db)):
    """Get all submissions for a quiz, optionally filtered by user."""
    query = db.query(models.Submission).filter(models.Submission.quiz_code == quiz_code)
    if user_id:
        query = query.filter(models.Submission.user_id == user_id)
    return query.order_by(models.Submission.created_at.desc()).all()
