from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base
import enum


class QuestionType(str, enum.Enum):
    CODING_PROBLEM = "coding_problem"
    DEBUGGING = "debugging"
    OUTPUT_PREDICTION = "output_prediction"
    FILL_IN_CODE = "fill_in_code"
    FUNCTION_BASED = "function_based"


class QuizStatus(str, enum.Enum):
    DRAFT = "draft"
    READY = "ready"
    LIVE = "live"
    PAUSED = "paused"
    COMPLETED = "completed"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    role = Column(String, default="student")
    is_flagged = Column(Boolean, default=False)
    current_quiz_code = Column(String, nullable=True, index=True)

    submissions = relationship("Submission", back_populates="user")


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    code = Column(String(8), unique=True, index=True)
    language = Column(String, default="python")
    time_limit = Column(Integer, default=30)  # minutes
    max_attempts = Column(Integer, default=4)
    status = Column(String, default=QuizStatus.DRAFT.value)
    is_frozen = Column(Boolean, default=False)
    show_leaderboard = Column(Boolean, default=False)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)

    questions = relationship("Question", back_populates="quiz", cascade="all, delete-orphan",
                             order_by="Question.order")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id", ondelete="CASCADE"))
    question_type = Column(String, default=QuestionType.CODING_PROBLEM.value)
    title = Column(String, default="")
    description = Column(Text, default="")
    code_template = Column(Text, default="")  # starter code or buggy code
    expected_output = Column(Text, nullable=True)  # for output prediction
    test_cases = Column(Text, nullable=True)  # JSON string of test cases
    points = Column(Integer, default=10)
    order = Column(Integer, default=0)

    quiz = relationship("Quiz", back_populates="questions")
    submissions = relationship("Submission", back_populates="question")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    question_id = Column(Integer, ForeignKey("questions.id"))
    quiz_code = Column(String, nullable=True, index=True)
    code = Column(Text)
    language = Column(String)
    status = Column(String, default="queued")
    result = Column(Text, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    score = Column(Integer, default=0)
    tab_switches = Column(Integer, default=0)
    time_taken = Column(Integer, nullable=True)  # in seconds
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="submissions")
    question = relationship("Question", back_populates="submissions")
