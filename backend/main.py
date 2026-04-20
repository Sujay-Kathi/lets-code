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
import csv
from io import StringIO
from fastapi.responses import StreamingResponse
from sqlalchemy import func

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

@sio.on('join_quiz')
async def handle_join(sid, data):
    quiz_code = data.get('quiz_code')
    if quiz_code:
        await sio.enter_room(sid, quiz_code)

@sio.on('join_teacher')
async def handle_teacher_join(sid, data):
    quiz_code = data.get('quiz_code')
    if quiz_code:
        await sio.enter_room(sid, f"teacher_{quiz_code}")



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
    """Set quiz to ready state (allow students to join)."""
    quiz = db.query(models.Quiz).options(
        joinedload(models.Quiz.questions)
    ).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not quiz.questions:
        raise HTTPException(status_code=400, detail="Cannot start quiz without questions")

    quiz.status = "ready"
    db.commit()
    db.refresh(quiz)
    return quiz


@app.post("/quizzes/{quiz_code}/start-timer", response_model=schemas.QuizResponse)
async def start_timer(quiz_code: str, db: Session = Depends(get_db)):
    """Start the actual quiz timer and make it live."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    quiz.status = "live"
    quiz.started_at = datetime.utcnow()
    db.commit()
    db.refresh(quiz)
    
    await sio.emit('quiz_status', {'status': 'live', 'started_at': quiz.started_at.isoformat()}, room=quiz_code)
    return quiz



@app.post("/quizzes/{quiz_code}/end", response_model=schemas.QuizResponse)
async def end_quiz(quiz_code: str, db: Session = Depends(get_db)):
    """End a live quiz session."""
    quiz = db.query(models.Quiz).options(
        joinedload(models.Quiz.questions)
    ).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    quiz.status = "completed"
    db.commit()
    db.refresh(quiz)
    
    # Notify all students
    await sio.emit('quiz_status', {'status': 'completed'}, room=quiz_code)
    
    return quiz


@app.post("/quizzes/{quiz_code}/pause", response_model=schemas.QuizResponse)
async def pause_quiz(quiz_code: str, db: Session = Depends(get_db)):
    """Pause a live quiz session."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    quiz.status = "paused"
    db.commit()
    db.refresh(quiz)
    
    await sio.emit('quiz_status', {'status': 'paused'}, room=quiz_code)
    return quiz


@app.post("/quizzes/{quiz_code}/resume", response_model=schemas.QuizResponse)
async def resume_quiz(quiz_code: str, db: Session = Depends(get_db)):
    """Resume a paused quiz session."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    quiz.status = "live"
    db.commit()
    db.refresh(quiz)
    
    await sio.emit('quiz_status', {'status': 'live'}, room=quiz_code)
    return quiz


@app.post("/quizzes/{quiz_code}/freeze", response_model=schemas.QuizResponse)
async def freeze_quiz(quiz_code: str, db: Session = Depends(get_db)):
    """Freeze all students (disable typing)."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    quiz.is_frozen = True
    db.commit()
    db.refresh(quiz)
    
    await sio.emit('freeze_update', {'is_frozen': True}, room=quiz_code)
    return quiz


@app.post("/quizzes/{quiz_code}/unfreeze", response_model=schemas.QuizResponse)
async def unfreeze_quiz(quiz_code: str, db: Session = Depends(get_db)):
    """Unfreeze all students."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    quiz.is_frozen = False
    db.commit()
    db.refresh(quiz)
    
    await sio.emit('freeze_update', {'is_frozen': False}, room=quiz_code)
    return quiz


@app.post("/quizzes/{quiz_code}/toggle-leaderboard", response_model=schemas.QuizResponse)
async def toggle_leaderboard(quiz_code: str, db: Session = Depends(get_db)):
    """Toggle leaderboard visibility."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    quiz.show_leaderboard = not quiz.show_leaderboard
    db.commit()
    db.refresh(quiz)
    
    await sio.emit('leaderboard_toggle', {'visible': quiz.show_leaderboard}, room=quiz_code)
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
async def join_quiz(quiz_code: str, join_req: schemas.JoinQuizRequest, db: Session = Depends(get_db)):
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
        user = models.User(name=join_req.student_name, role="student", current_quiz_code=quiz_code)
        db.add(user)
    else:
        user.current_quiz_code = quiz_code
    
    db.commit()
    db.refresh(user)

    # Notify teacher
    await sio.emit('student_joined', {
        'user_id': user.id,
        'student_name': user.name,
    }, room=f"teacher_{quiz_code}")

    return schemas.JoinQuizResponse(quiz=quiz, user=user)


# ==================== SUBMISSION & ANTI-CHEAT ====================

@app.post("/submissions/", response_model=schemas.SubmissionResponse)
async def create_submission(submission: schemas.SubmissionCreate, db: Session = Depends(get_db)):
    # Check if quiz is live and not frozen
    quiz = db.query(models.Quiz).filter(models.Quiz.code == submission.quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.status != "live":
        raise HTTPException(status_code=400, detail=f"Quiz is {quiz.status}")
    if quiz.is_frozen:
        raise HTTPException(status_code=400, detail="Quiz is frozen")

    # Check max attempts
    existing_attempts = db.query(models.Submission).filter(
        models.Submission.user_id == submission.user_id,
        models.Submission.question_id == submission.question_id
    ).count()
    
    if existing_attempts >= quiz.max_attempts:
        raise HTTPException(status_code=400, detail=f"Maximum attempts ({quiz.max_attempts}) reached")

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
    
    # Trigger worker task
    execute_code_task.delay(db_submission.id)
    
    # Real-time alert to teacher
    user = db.query(models.User).filter(models.User.id == submission.user_id).first()
    question = db.query(models.Question).filter(models.Question.id == submission.question_id).first()
    
    # Find question index
    q_index = 0
    if quiz:
        for idx, q in enumerate(quiz.questions):
            if q.id == submission.question_id:
                q_index = idx
                break

    await sio.emit('status_update', {
        'submission_id': db_submission.id,
        'status': 'queued',
        'student_name': user.name if user else "Unknown",
        'question_title': question.title if question else "Unknown",
        'question_index': q_index
    }, room=f"teacher_{submission.quiz_code}")
    
    return db_submission

@app.post("/quizzes/{quiz_code}/violations/{user_id}")
async def report_quiz_violation(quiz_code: str, user_id: int, db: Session = Depends(get_db)):
    """Report a tab-switch or anti-cheat violation."""
    # Find the user's latest submission for this quiz to attach violation count, 
    # or we can track it per quiz session if we had a QuizSession model.
    # For now, we'll increment violations on all submissions for this user in this quiz
    submissions = db.query(models.Submission).filter(
        models.Submission.quiz_code == quiz_code,
        models.Submission.user_id == user_id
    ).all()
    
    for sub in submissions:
        sub.tab_switches += 1
    
    db.commit()
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    await sio.emit('violation_alert', {
        'user_id': user_id,
        'student_name': user.name if user else "Unknown",
        'tab_switches': submissions[0].tab_switches if len(submissions) > 0 else 1,
        'timestamp': datetime.utcnow().isoformat()
    }, room=f"teacher_{quiz_code}")
    
    return {"status": "reported"}

@app.post("/quizzes/{quiz_code}/flag/{user_id}")
async def flag_student(quiz_code: str, user_id: int, flagged: bool, db: Session = Depends(get_db)):
    submissions = db.query(models.Submission).filter(
        models.Submission.quiz_code == quiz_code,
        models.Submission.user_id == user_id
    ).all()
    for sub in submissions:
        sub.is_flagged = flagged
    db.commit()
    return {"status": "updated"}

@app.post("/submissions/{submission_id}/violation")
async def report_violation(submission_id: int, db: Session = Depends(get_db)):
    """Report a tab switch violation for a submission."""
    submission = db.query(models.Submission).filter(models.Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    submission.tab_switches += 1
    db.commit()
    
    # Notify teacher via SocketIO
    await sio.emit('violation_alert', {
        'submission_id': submission_id,
        'user_id': submission.user_id,
        'tab_switches': submission.tab_switches
    }, room=f"teacher_{submission.quiz_code}")
    
    return {"tab_switches": submission.tab_switches}



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


# ==================== ANALYTICS & LEADERBOARD ====================

@app.get("/quizzes/{quiz_code}/leaderboard", response_model=List[schemas.LeaderboardEntry])
def get_leaderboard(quiz_code: str, db: Session = Depends(get_db)):
    """Calculate the leaderboard for a quiz."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Select all students in this quiz and join their submissions
    results = db.query(
        models.User.id,
        models.User.name,
        func.sum(models.Submission.score).label("total_score"),
        func.sum(models.Submission.time_taken).label("total_time"),
        func.sum(models.Submission.tab_switches).label("total_violations"),
        func.count(models.Submission.id).label("completed_count"),
        models.User.is_flagged
    ).select_from(models.User) \
     .outerjoin(models.Submission, (models.User.id == models.Submission.user_id) & (models.Submission.quiz_code == quiz_code)) \
     .filter(models.User.current_quiz_code == quiz_code) \
     .group_by(models.User.id) \
     .order_by(func.sum(models.Submission.score).desc(), func.sum(models.Submission.time_taken).asc()) \
     .all()

    leaderboard = []
    for r in results:
        leaderboard.append(schemas.LeaderboardEntry(
            user_id=r.id,
            student_name=r.name,
            total_score=r.total_score or 0,
            total_time=r.total_time or 0,
            total_violations=r.total_violations or 0,
            completed_count=r.completed_count or 0,
            is_flagged=r.is_flagged
        ))
    return leaderboard


@app.get("/quizzes/{quiz_code}/analytics", response_model=schemas.QuizAnalytics)
def get_quiz_analytics(quiz_code: str, db: Session = Depends(get_db)):
    """Get detailed analytics for a quiz."""
    quiz = db.query(models.Quiz).filter(models.Quiz.code == quiz_code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    total_participants = db.query(func.count(func.distinct(models.Submission.user_id))) \
        .filter(models.Submission.quiz_code == quiz_code).scalar()
    
    avg_score = db.query(func.avg(models.Submission.score)) \
        .filter(models.Submission.quiz_code == quiz_code).scalar() or 0.0

    # Basic question stats
    questions = db.query(models.Question).filter(models.Question.quiz_id == quiz.id).all()
    q_stats = []
    for q in questions:
        success_rate = db.query(func.count(models.Submission.id)) \
            .filter(models.Submission.question_id == q.id, models.Submission.is_correct == True).scalar()
        total_q_subs = db.query(func.count(models.Submission.id)) \
            .filter(models.Submission.question_id == q.id).scalar()
        
        q_stats.append({
            "question_id": q.id,
            "title": q.title,
            "success_rate": (success_rate / total_q_subs * 100) if total_q_subs > 0 else 0
        })

    return schemas.QuizAnalytics(
        quiz_id=quiz.id,
        total_participants=total_participants,
        average_score=float(avg_score),
        question_stats=q_stats,
        violations_summary={"total_tab_switches": db.query(func.sum(models.Submission.tab_switches)) \
            .filter(models.Submission.quiz_code == quiz_code).scalar() or 0}
    )


@app.get("/quizzes/{quiz_code}/export")
def export_quiz_results(quiz_code: str, db: Session = Depends(get_db)):
    """Export quiz results as a CSV file."""
    submissions = db.query(models.Submission).filter(models.Submission.quiz_code == quiz_code).all()
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Submission ID", "User ID", "Question ID", "Status", "Score", "Correct", "Time Taken (s)", "Violations", "Created At"])
    
    for s in submissions:
        writer.writerow([s.id, s.user_id, s.question_id, s.status, s.score, s.is_correct, s.time_taken, s.tab_switches, s.created_at])
    
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=results_{quiz_code}.csv"}
    )

