from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# --- User ---
class UserBase(BaseModel):
    name: str
    role: str = "student"
    is_flagged: bool = False

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    class Config:
        from_attributes = True


# --- Question ---
class QuestionBase(BaseModel):
    question_type: str = "coding_problem"
    title: str = ""
    description: str = ""
    code_template: str = ""
    expected_output: Optional[str] = None
    test_cases: Optional[str] = None
    points: int = 10
    order: int = 0

class QuestionCreate(QuestionBase):
    pass

class QuestionUpdate(BaseModel):
    question_type: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    code_template: Optional[str] = None
    expected_output: Optional[str] = None
    test_cases: Optional[str] = None
    points: Optional[int] = None
    order: Optional[int] = None

class QuestionResponse(QuestionBase):
    id: int
    quiz_id: int
    class Config:
        from_attributes = True


# --- Quiz ---
class QuizBase(BaseModel):
    title: str
    language: str = "python"
    time_limit: int = 30
    max_attempts: int = 4

class QuizCreate(QuizBase):
    questions: Optional[List[QuestionCreate]] = []

class QuizResponse(QuizBase):
    id: int
    code: str
    status: str
    is_frozen: bool
    show_leaderboard: bool
    created_at: datetime
    started_at: Optional[datetime] = None
    questions: List[QuestionResponse] = []
    class Config:
        from_attributes = True

class QuizSummary(BaseModel):
    id: int
    title: str
    code: str
    status: str
    language: str
    time_limit: int
    question_count: int = 0
    is_frozen: bool = False
    show_leaderboard: bool = False
    created_at: datetime
    class Config:
        from_attributes = True


# --- Submission ---
class SubmissionBase(BaseModel):
    code: str
    language: str

class SubmissionCreate(SubmissionBase):
    user_id: int
    question_id: int
    quiz_code: Optional[str] = None

class SubmissionResponse(SubmissionBase):
    id: int
    user_id: int
    question_id: int
    quiz_code: Optional[str] = None
    status: str
    result: Optional[str] = None
    is_correct: Optional[bool] = None
    score: int = 0
    tab_switches: int = 0
    time_taken: Optional[int] = None
    created_at: datetime
    class Config:
        from_attributes = True


# --- Join Quiz ---
class JoinQuizRequest(BaseModel):
    quiz_code: str
    student_name: str

class JoinQuizResponse(BaseModel):
    quiz: QuizResponse
    user: UserResponse


# --- Analytics & Leaderboard ---
class LeaderboardEntry(BaseModel):
    user_id: int
    student_name: str
    total_score: int
    total_time: int
    total_violations: int
    completed_count: int
    is_flagged: bool

class QuizAnalytics(BaseModel):
    quiz_id: int
    total_participants: int
    average_score: float
    question_stats: List[dict] # Success rate, common errors
    violations_summary: dict

