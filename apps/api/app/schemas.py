from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long.")

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

class TokenUser(BaseModel):
    id: str
    email: str
    name: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: TokenUser

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class FileResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    storage_path: str
    created_at: datetime

    class Config:
        from_attributes = True

class NoteCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, description="Title cannot be empty.")
    content: str = Field(..., min_length=1, description="Content cannot be empty.")

class NoteResponse(BaseModel):
    id: str
    title: str
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TodoCreate(BaseModel):
    task: str = Field(..., min_length=1, max_length=200, description="Task details cannot be empty.")
    due_date: Optional[datetime] = None

class TodoUpdate(BaseModel):
    task: Optional[str] = Field(None, min_length=1, max_length=200)
    completed: Optional[bool] = None
    due_date: Optional[datetime] = None

class TodoResponse(BaseModel):
    id: str
    task: str
    completed: bool
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class CalendarEventCreate(BaseModel):
    summary: str = Field(..., min_length=1, max_length=150, description="Summary cannot be empty.")
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    location: Optional[str] = None

class CalendarEventResponse(BaseModel):
    id: str
    summary: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    location: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
