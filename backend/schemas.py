from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class UserBase(BaseModel):
    name: str
    role: str = "student"

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    class Config:
        from_attributes = True

class QuizBase(BaseModel):
    title: str

class QuizCreate(QuizBase):
    pass

class QuizResponse(QuizBase):
    id: int
    class Config:
        from_attributes = True

class QuestionBase(BaseModel):
    description: str

class QuestionCreate(QuestionBase):
    quiz_id: int

class QuestionResponse(QuestionBase):
    id: int
    quiz_id: int
    class Config:
        from_attributes = True

class SubmissionBase(BaseModel):
    code: str
    language: str

class SubmissionCreate(SubmissionBase):
    user_id: int
    question_id: int

class SubmissionResponse(SubmissionBase):
    id: int
    user_id: int
    question_id: int
    status: str
    result: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True
