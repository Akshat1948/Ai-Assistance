import asyncio
import json
import os
import math
import io
import uuid
import random
import base64
import time
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, UploadFile, File as FastAPIFile, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from anthropic import AsyncAnthropic, APIStatusError
import openai
import supabase
from pypdf import PdfReader
import httpx

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from .database import engine, Base, get_db, SessionLocal
from .config import settings
from .models import User, Memory, File, FileEmbedding, Note, Todo, CalendarEvent
from .schemas import (
    UserCreate, UserLogin, UserResponse, Token, TokenUser, ChatRequest, FileResponse,
    NoteCreate, NoteResponse, TodoCreate, TodoUpdate, TodoResponse,
    CalendarEventCreate, CalendarEventResponse
)
from .auth import get_password_hash, verify_password, create_access_token, get_current_user

# Enable pgvector extension in PostgreSQL on startup if not SQLite
if not engine.url.drivername.startswith("sqlite"):
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        print("Database: pgvector extension enabled/verified.")
    except Exception as e:
        print(f"Database Warning: Could not create pgvector extension: {e}")

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Personal AI Assistant API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-vercel-ai-ui-message-stream"],
)

# --- Global Database Connection Exception Handler ---
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    print(f"[Database Global Error] SQLAlchemy error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Database connection error. Please try again later."}
    )

# --- In-Memory Rate Limiter ---
rate_limit_records = {}

def rate_limiter(max_requests: int, window_seconds: int = 60):
    """Enforces an IP-based request rate limit for defensive API security."""
    async def dependency(request: Request):
        ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        
        if ip not in rate_limit_records:
            rate_limit_records[ip] = []
            
        # Filter request timestamps older than the active window
        rate_limit_records[ip] = [t for t in rate_limit_records[ip] if now - t < window_seconds]
        
        if len(rate_limit_records[ip]) >= max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please slow down and try again later."
            )
        rate_limit_records[ip].append(now)
    return dependency

# --- Tool Call Definitions ---

TAVILY_SEARCH_TOOL = {
    "name": "web_search",
    "description": "Searches the web for up-to-date information matching the query.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query to lookup on the web."
            }
        },
        "required": ["query"]
    }
}

MANAGE_NOTES_TODOS_TOOLS = [
    TAVILY_SEARCH_TOOL,
    {
        "name": "create_note",
        "description": "Create a new text note with a title and content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "The title of the note."},
                "content": {"type": "string", "description": "The body content of the note."}
            },
            "required": ["title", "content"]
        }
    },
    {
        "name": "list_notes",
        "description": "List all active notes for the current user.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "delete_note",
        "description": "Delete a note using its UUID string ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string", "description": "The UUID string ID of the note to delete."}
            },
            "required": ["note_id"]
        }
    },
    {
        "name": "create_todo",
        "description": "Create a new todo item.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "The task details or description."},
                "due_date": {"type": "string", "description": "Optional ISO format due date (YYYY-MM-DD)."}
            },
            "required": ["task"]
        }
    },
    {
        "name": "list_todos",
        "description": "List all active todo items for the current user.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "update_todo",
        "description": "Update an existing todo item's description or completion status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "todo_id": {"type": "string", "description": "The UUID string ID of the todo."},
                "task": {"type": "string", "description": "Optional updated task description."},
                "completed": {"type": "boolean", "description": "Optional updated completion status (true or false)."}
            },
            "required": ["todo_id"]
        }
    },
    {
        "name": "delete_todo",
        "description": "Delete a todo item.",
        "input_schema": {
            "type": "object",
            "properties": {
                "todo_id": {"type": "string", "description": "The UUID string ID of the todo to delete."}
            },
            "required": ["todo_id"]
        }
    },
    {
        "name": "create_calendar_event",
        "description": "Create a new event in the user's calendar.",
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "The title or summary of the event."},
                "start_time": {"type": "string", "description": "ISO start time string (e.g. YYYY-MM-DDTHH:MM:SSZ)."},
                "end_time": {"type": "string", "description": "ISO end time string (e.g. YYYY-MM-DDTHH:MM:SSZ)."},
                "location": {"type": "string", "description": "Optional location of the event."},
                "description": {"type": "string", "description": "Optional description details of the event."}
            },
            "required": ["summary", "start_time", "end_time"]
        }
    },
    {
        "name": "list_calendar_events",
        "description": "List active calendar events.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "check_upcoming_reminders",
        "description": "Check if there are any upcoming tasks or calendar events scheduled within the next 24 hours.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    }
]

# --- Google Calendar API Client Helpers ---

def get_calendar_service():
    """Initializes Google Calendar Client using OAuth refresh credentials if set."""
    client_id = settings.GOOGLE_CLIENT_ID or os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = settings.GOOGLE_CLIENT_SECRET or os.environ.get("GOOGLE_CLIENT_SECRET")
    refresh_token = settings.GOOGLE_REFRESH_TOKEN or os.environ.get("GOOGLE_REFRESH_TOKEN")
    
    if client_id and client_secret and refresh_token:
        try:
            creds = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret
            )
            service = build("calendar", "v3", credentials=creds)
            return service
        except Exception as e:
            print(f"[Calendar API Warning] Google Calendar client build failed: {e}")
            return None
    return None

async def list_calendar_events_helper(db: Session, user_id: str) -> list:
    """Lists calendar events from Google Calendar if configured, otherwise falls back to local database."""
    service = get_calendar_service()
    if service:
        try:
            loop = asyncio.get_event_loop()
            now = datetime.utcnow().isoformat() + "Z"
            events_result = await loop.run_in_executor(
                None,
                lambda: service.events().list(
                    calendarId="primary",
                    timeMin=now,
                    maxResults=10,
                    singleEvents=True,
                    orderBy="startTime"
                ).execute()
            )
            g_events = events_result.get("items", [])
            formatted = []
            for e in g_events:
                start = e.get("start", {}).get("dateTime") or e.get("start", {}).get("date", "")
                end = e.get("end", {}).get("dateTime") or e.get("end", {}).get("date", "")
                formatted.append({
                    "id": e.get("id"),
                    "summary": e.get("summary", "No Title"),
                    "description": e.get("description", ""),
                    "start_time": start,
                    "end_time": end,
                    "location": e.get("location", ""),
                    "source": "Google Calendar"
                })
            return formatted
        except Exception as e:
            print(f"[Calendar API Warning] Google list failed: {e}. Falling back to database calendar.")
            
    # Local calendar fallback
    local_events = db.query(CalendarEvent).filter(CalendarEvent.user_id == user_id).order_by(CalendarEvent.start_time.asc()).limit(10).all()
    return [{
        "id": e.id,
        "summary": e.summary,
        "description": e.description or "",
        "start_time": e.start_time.isoformat(),
        "end_time": e.end_time.isoformat(),
        "location": e.location or "",
        "source": "Local Calendar (Fallback)"
    } for e in local_events]

async def create_calendar_event_helper(db: Session, user_id: str, summary: str, start_time: str, end_time: str, location: Optional[str] = None, description: Optional[str] = None) -> dict:
    """Inserts a calendar event to Google Calendar if configured, otherwise saves to local database."""
    service = get_calendar_service()
    if service:
        try:
            event_body = {
                "summary": summary,
                "location": location or "",
                "description": description or "",
                "start": {"dateTime": start_time},
                "end": {"dateTime": end_time}
            }
            loop = asyncio.get_event_loop()
            created_event = await loop.run_in_executor(
                None,
                lambda: service.events().insert(calendarId="primary", body=event_body).execute()
            )
            return {
                "id": created_event.get("id"),
                "summary": created_event.get("summary"),
                "description": created_event.get("description", ""),
                "start_time": start_time,
                "end_time": end_time,
                "location": location or "",
                "source": "Google Calendar"
            }
        except Exception as e:
            print(f"[Calendar API Warning] Google insert failed: {e}. Falling back to database calendar.")
            
    # Local calendar fallback
    try:
        parsed_start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        parsed_end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    except ValueError:
        parsed_start = datetime.utcnow()
        parsed_end = datetime.utcnow()
        
    db_event = CalendarEvent(
        user_id=user_id,
        summary=summary,
        description=description,
        start_time=parsed_start,
        end_time=parsed_end,
        location=location
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    
    return {
        "id": db_event.id,
        "summary": db_event.summary,
        "description": db_event.description or "",
        "start_time": db_event.start_time.isoformat(),
        "end_time": db_event.end_time.isoformat(),
        "location": db_event.location or "",
        "source": "Local Calendar (Fallback)"
    }

# --- Storage Helper Functions ---

def get_supabase_client() -> Optional[supabase.Client]:
    """Initialize the Supabase client if URL and KEY are set."""
    url = settings.SUPABASE_URL or os.environ.get("SUPABASE_URL")
    key = settings.SUPABASE_KEY or os.environ.get("SUPABASE_KEY")
    if url and key:
        try:
            return supabase.create_client(url, key)
        except Exception as e:
            print(f"[Supabase Storage Error] Failed to initialize client: {e}")
            return None
    return None

async def upload_file_to_storage(filename: str, file_bytes: bytes, file_id: str) -> str:
    """Uploads file bytes to Supabase Storage, falling back to local files if credentials are missing."""
    client = get_supabase_client()
    bucket = settings.SUPABASE_BUCKET or "files"
    storage_path = f"uploads/{file_id}_{filename}"
    
    if client:
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: client.storage.from_(bucket).upload(
                    path=storage_path,
                    file=file_bytes,
                    file_options={"cache-control": "3600", "upsert": "true"}
                )
            )
            public_url = client.storage.from_(bucket).get_public_url(storage_path)
            print(f"[Storage System] Uploaded {filename} to Supabase Storage: {public_url}")
            return public_url
        except Exception as e:
            print(f"[Storage System Warning] Supabase upload failed: {e}. Falling back to local storage.")
            
    # Local storage fallback
    local_dir = "/Users/akshatojha/Downloads/AI Assiatance/apps/api/storage"
    os.makedirs(local_dir, exist_ok=True)
    local_path = os.path.join(local_dir, f"{file_id}_{filename}")
    with open(local_path, "wb") as f:
        f.write(file_bytes)
    print(f"[Storage System] Saved {filename} locally at: {local_path}")
    return local_path

async def download_file_from_storage(storage_path: str) -> bytes:
    """Reads file bytes from local filesystem or downloads from Supabase Storage."""
    if storage_path.startswith("http://") or storage_path.startswith("https://"):
        client = get_supabase_client()
        if client:
            try:
                import httpx
                async with httpx.AsyncClient() as httpx_client:
                    resp = await httpx_client.get(storage_path)
                    if resp.status_code == 200:
                        return resp.content
            except Exception as e:
                print(f"[Storage System Warning] Could not download file from Supabase: {e}")
                
    # Fallback to local file read
    if os.path.exists(storage_path):
        with open(storage_path, "rb") as f:
            return f.read()
    else:
        # Resolve path relative to local storage dir
        local_dir = "/Users/akshatojha/Downloads/AI Assiatance/apps/api/storage"
        filename = os.path.basename(storage_path)
        fallback_path = os.path.join(local_dir, filename)
        if os.path.exists(fallback_path):
            with open(fallback_path, "rb") as f:
                return f.read()
    raise FileNotFoundError(f"File not found at storage path: {storage_path}")

# --- Text Extraction & Chunking Logic ---

def extract_text_from_bytes(file_bytes: bytes, file_type: str) -> str:
    """Extracts text content based on file mimetype (PDF, TXT, MD)."""
    if "pdf" in file_type.lower():
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            text_list = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_list.append(page_text)
            return "\n\n".join(text_list)
        except Exception as e:
            print(f"[Extraction Error] Failed to parse PDF: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to parse PDF document: {str(e)}"
            )
            
    # Plain text and Markdown files
    try:
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return file_bytes.decode("latin-1")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to decode file contents as text."
            )

def chunk_text(text_content: str, chunk_size=800, chunk_overlap=150) -> List[str]:
    """Splits a document text string into smaller overlapping chunks on word boundaries."""
    chunks = []
    start = 0
    text_len = len(text_content)
    
    while start < text_len:
        end = start + chunk_size
        if end >= text_len:
            chunks.append(text_content[start:].strip())
            break
        
        # Split on word boundary (space) to prevent chopping words in half
        split_idx = text_content.rfind(' ', start, end)
        if split_idx != -1 and split_idx > start + (chunk_size // 2):
            end = split_idx
            
        chunks.append(text_content[start:end].strip())
        start = end - chunk_overlap
        if start < 0:
            start = 0
            
    return [c for c in chunks if c]

# --- Memory System Helper Functions ---

def cosine_similarity(v1, v2):
    """Calculate the cosine similarity between two float vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)

async def get_embedding(text_content: str, api_key: str | None) -> list[float]:
    """Generate 1536-dimensional embeddings via OpenAI or fall back to simulated embeddings."""
    if not api_key:
        random.seed(hash(text_content))
        return [random.uniform(-0.1, 0.1) for _ in range(1536)]

    try:
        client = openai.AsyncOpenAI(api_key=api_key)
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=text_content
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[Memory System Warning] OpenAI embedding API failed: {e}. Falling back to dummy vectors.")
        random.seed(hash(text_content))
        return [random.uniform(-0.1, 0.1) for _ in range(1536)]

async def extract_memories(user_message: str, api_key: str | None) -> list[str]:
    """Instruct Claude to extract persistent facts from the user message, or run rule-based triggers in mock mode."""
    if not api_key:
        msg = user_message.lower()
        extracted = []
        if "my name is" in msg:
            val = user_message[msg.find("my name is") + 10:].split(".")[0].strip()
            extracted.append(f"User's name is {val}")
        if "i live in" in msg:
            val = user_message[msg.find("i live in") + 10:].split(".")[0].strip()
            extracted.append(f"User lives in {val}")
        if "i prefer" in msg:
            val = user_message[msg.find("i prefer") + 8:].split(".")[0].strip()
            extracted.append(f"User prefers {val}")
        if "my favorite" in msg:
            val = user_message[msg.find("my favorite") + 11:].split(".")[0].strip()
            extracted.append(f"User's favorite item: {val}")
        return extracted

    try:
        client = AsyncAnthropic(api_key=api_key)
        prompt = (
            "Analyze the following user message from a chat conversation. Determine if it contains any persistent personal facts, preferences, or settings about the user that are worth remembering for future sessions (e.g., 'I live in Seattle', 'I prefer dark mode', 'My dog is named Max').\n"
            "Only extract facts that are direct user preferences or characteristics. Ignore transient questions, temporary commands, or general knowledge queries.\n\n"
            "If there are facts worth remembering, return them as a JSON array of strings (e.g. [\"User lives in Seattle\", \"User's dog is named Max\"]).\n"
            "If there are no facts worth remembering, return an empty JSON array: [].\n\n"
            "Respond ONLY with the raw JSON array. Do not include any explanations, formatting, markdown, or text outside the JSON.\n\n"
            f"User Message: \"{user_message}\""
        )
        
        response = await client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}]
        )
        
        content = response.content[0].text.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```json") or lines[0].startswith("```"):
                content = "\n".join(lines[1:-1]).strip()
                
        facts = json.loads(content)
        if isinstance(facts, list):
            return [str(f) for f in facts]
        return []
    except Exception as e:
        print(f"[Memory System Warning] Extract memories call failed: {e}")
        return []

# --- Web Search Tool Execution Helper ---

async def execute_tavily_search(query: str, api_key: str) -> str:
    """Executes search query via Tavily Search API."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": api_key, "query": query, "search_depth": "basic"}
            )
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                if not results:
                    return f"No search results found for query: '{query}'."
                formatted = []
                for r in results[:3]:
                    formatted.append(f"Title: {r['title']}\nURL: {r['url']}\nContent: {r['content']}")
                return "\n\n".join(formatted)
            return f"Search API error status: {resp.status_code}"
    except Exception as e:
        return f"Web search connection failed: {str(e)}"

# --- Reminders Helper Function ---

async def get_upcoming_reminders_list(user_id: str, db: Session) -> list:
    """Queries for active todos or calendar events starting in the next 24 hours."""
    now = datetime.utcnow()
    tomorrow = now + timedelta(days=1)
    
    # 1. Fetch uncompleted todos with close due dates
    upcoming_todos = db.query(Todo).filter(
        Todo.user_id == user_id,
        Todo.completed == False,
        Todo.due_date >= now,
        Todo.due_date <= tomorrow
    ).all()
    
    # 2. Fetch upcoming events
    service = get_calendar_service()
    upcoming_events = []
    if service:
        try:
            loop = asyncio.get_event_loop()
            now_iso = now.isoformat() + "Z"
            tomorrow_iso = tomorrow.isoformat() + "Z"
            events_result = await loop.run_in_executor(
                None,
                lambda: service.events().list(
                    calendarId="primary",
                    timeMin=now_iso,
                    timeMax=tomorrow_iso,
                    singleEvents=True,
                    orderBy="startTime"
                ).execute()
            )
            g_events = events_result.get("items", [])
            for e in g_events:
                start = e.get("start", {}).get("dateTime") or e.get("start", {}).get("date", "")
                upcoming_events.append({
                    "id": e.get("id"),
                    "title": e.get("summary", "No Title"),
                    "time": start,
                    "type": "event",
                    "source": "Google Calendar"
                })
        except Exception:
            pass
            
    if not upcoming_events:
        db_events = db.query(CalendarEvent).filter(
            CalendarEvent.user_id == user_id,
            CalendarEvent.start_time >= now,
            CalendarEvent.start_time <= tomorrow
        ).all()
        for e in db_events:
            upcoming_events.append({
                "id": e.id,
                "title": e.summary,
                "time": e.start_time.isoformat(),
                "type": "event",
                "source": "Local"
            })
            
    reminders = []
    for t in upcoming_todos:
        reminders.append({
            "id": t.id,
            "title": f"Task Due: {t.task}",
            "time": t.due_date.isoformat() if t.due_date else None,
            "type": "todo",
            "source": "Database"
        })
    reminders.extend(upcoming_events)
    reminders.sort(key=lambda x: x["time"] if x["time"] else "")
    return reminders

# --- Background Task Workers ---

async def process_memory_task(
    user_id: str,
    user_message: str,
    anthropic_key: str | None,
    openai_key: str | None,
    session_maker
):
    """Background task to extract, embed, and store user memories in the database."""
    facts = await extract_memories(user_message, anthropic_key)
    if not facts:
        return
        
    print(f"[Memory Background Task] Extracted facts: {facts}")
    
    db = session_maker()
    try:
        for fact in facts:
            embedding = await get_embedding(fact, openai_key)
            memory_obj = Memory(
                user_id=user_id,
                content=fact,
                embedding=embedding
            )
            db.add(memory_obj)
        db.commit()
        print(f"[Memory Background Task] Successfully saved {len(facts)} memory records for user {user_id}.")
    except Exception as e:
        print(f"[Memory Background Task] Database error saving memories: {e}")
        db.rollback()
    finally:
        db.close()

async def process_file_task(
    file_id: str,
    user_id: str,
    storage_path: str,
    file_type: str,
    openai_key: str | None,
    session_maker
):
    """Background task to extract text, chunk it, embed, and store document embeddings."""
    print(f"[File Background Task] Starting extraction for file {file_id}...")
    try:
        file_bytes = await download_file_from_storage(storage_path)
        text_content = extract_text_from_bytes(file_bytes, file_type)
        
        if not text_content.strip():
            print(f"[File Background Task Warning] No text extracted from file {file_id}.")
            return
            
        chunks = chunk_text(text_content, chunk_size=800, chunk_overlap=150)
        print(f"[File Background Task] Split file into {len(chunks)} chunks.")
        
        db = session_maker()
        try:
            for idx, chunk in enumerate(chunks):
                embedding = await get_embedding(chunk, openai_key)
                embedding_obj = FileEmbedding(
                    file_id=file_id,
                    user_id=user_id,
                    chunk_index=idx,
                    content=chunk,
                    embedding=embedding
                )
                db.add(embedding_obj)
            db.commit()
            print(f"[File Background Task] Successfully stored {len(chunks)} embeddings for file {file_id}.")
        except Exception as e:
            print(f"[File Background Task Error] Database insert failed: {e}")
            db.rollback()
        finally:
            db.close()
            
    except Exception as e:
        print(f"[File Background Task Error] File extraction failed: {e}")

# --- Endpoint Routing ---

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Backend API is running"}

@app.post("/api/auth/register", response_model=UserResponse, dependencies=[Depends(rate_limiter(max_requests=10))])
async def register(user_in: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists"
        )
    
    hashed_password = get_password_hash(user_in.password)
    db_user = User(
        email=user_in.email,
        name=user_in.name,
        password_hash=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/api/auth/login", response_model=Token, dependencies=[Depends(rate_limiter(max_requests=10))])
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.email})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name
        }
    }

@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# --- File Management Routes ---

@app.post("/api/files/upload", response_model=FileResponse, dependencies=[Depends(rate_limiter(max_requests=15))])
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = FastAPIFile(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    allowed_types = ["application/pdf", "text/plain", "text/markdown"]
    file_type = file.content_type
    filename = file.filename
    
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".txt":
        file_type = "text/plain"
    elif ext == ".md":
        file_type = "text/markdown"
    elif ext == ".pdf":
        file_type = "application/pdf"
        
    if file_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file_type}. Supported formats: PDF, TXT, MD."
        )
        
    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:  # 10MB Limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum limit of 10MB."
        )
        
    file_id = str(uuid.uuid4())
    storage_path = await upload_file_to_storage(filename, file_bytes, file_id)
    
    db_file = File(
        id=file_id,
        user_id=current_user.id,
        filename=filename,
        file_type=file_type,
        storage_path=storage_path
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    
    openai_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
    background_tasks.add_task(
        process_file_task,
        file_id,
        current_user.id,
        storage_path,
        file_type,
        openai_key,
        SessionLocal
    )
    
    return db_file

@app.get("/api/files", response_model=List[FileResponse])
async def list_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(File).filter(File.user_id == current_user.id).order_by(File.created_at.desc()).all()

# --- Notes Database CRUD Routes ---

@app.post("/api/notes", response_model=NoteResponse, dependencies=[Depends(rate_limiter(max_requests=30))])
async def create_note_route(note: NoteCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_note = Note(user_id=current_user.id, title=note.title, content=note.content)
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note

@app.get("/api/notes", response_model=List[NoteResponse])
async def list_notes_route(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Note).filter(Note.user_id == current_user.id).order_by(Note.created_at.desc()).all()

@app.delete("/api/notes/{note_id}")
async def delete_note_route(note_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"status": "ok", "message": "Note deleted successfully"}

# --- Todos Database CRUD Routes ---

@app.post("/api/todos", response_model=TodoResponse, dependencies=[Depends(rate_limiter(max_requests=30))])
async def create_todo_route(todo: TodoCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_todo = Todo(user_id=current_user.id, task=todo.task, due_date=todo.due_date)
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    return db_todo

@app.get("/api/todos", response_model=List[TodoResponse])
async def list_todos_route(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Todo).filter(Todo.user_id == current_user.id).order_by(Todo.completed.asc(), Todo.created_at.desc()).all()

@app.put("/api/todos/{todo_id}", response_model=TodoResponse)
async def update_todo_route(todo_id: str, todo_in: TodoUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if not db_todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    if todo_in.task is not None:
        db_todo.task = todo_in.task
    if todo_in.completed is not None:
        db_todo.completed = todo_in.completed
    if todo_in.due_date is not None:
        db_todo.due_date = todo_in.due_date
        
    db.commit()
    db.refresh(db_todo)
    return db_todo

@app.delete("/api/todos/{todo_id}")
async def delete_todo_route(todo_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if not db_todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(db_todo)
    db.commit()
    return {"status": "ok", "message": "Todo deleted successfully"}

# --- Calendar Event Routes ---

@app.post("/api/calendar/events", response_model=CalendarEventResponse, dependencies=[Depends(rate_limiter(max_requests=30))])
async def create_calendar_event_route(event: CalendarEventCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event_dict = await create_calendar_event_helper(
        db=db,
        user_id=current_user.id,
        summary=event.summary,
        start_time=event.start_time.isoformat(),
        end_time=event.end_time.isoformat(),
        location=event.location,
        description=event.description
    )
    try:
        parsed_start = datetime.fromisoformat(event_dict["start_time"].replace("Z", "+00:00"))
        parsed_end = datetime.fromisoformat(event_dict["end_time"].replace("Z", "+00:00"))
    except ValueError:
        parsed_start = datetime.utcnow()
        parsed_end = datetime.utcnow()
        
    return CalendarEventResponse(
        id=event_dict["id"],
        summary=event_dict["summary"],
        description=event_dict["description"],
        start_time=parsed_start,
        end_time=parsed_end,
        location=event_dict["location"],
        created_at=datetime.utcnow()
    )

@app.get("/api/calendar/events")
async def list_calendar_events_route(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return await list_calendar_events_helper(db, current_user.id)

# --- Reminders Endpoint ---

@app.get("/api/reminders")
async def list_reminders_route(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return await get_upcoming_reminders_list(current_user.id, db)

# --- Chat Routing & LLM streaming ---

async def mock_stream_response(custom_text=None):
    """Fallback generator to simulate an AI streaming responses word-by-word."""
    text = custom_text or (
        "Hello! I am your AI assistant. The Anthropic API key is not configured on the backend "
        "right now, so I'm running in mock mode. To connect me to a live model, please add your "
        "ANTHROPIC_API_KEY in the environment or backend configuration (.env)."
    )
    words = text.split(" ")
    for word in words:
        yield f'0:{json.dumps(word + " ")}\n'
        await asyncio.sleep(0.08)

async def handle_agent_tools_execution(tool_name: str, tool_input: dict, current_user_id: str, db: Session) -> str:
    """Executes local databases operations and calendar queries invoked by Claude."""
    try:
        if tool_name == "create_note":
            title = tool_input.get("title", "Untitled Note")
            content = tool_input.get("content", "")
            db_note = Note(user_id=current_user_id, title=title, content=content)
            db.add(db_note)
            db.commit()
            return json.dumps({
                "status": "success",
                "message": "Note created successfully",
                "note": {"id": db_note.id, "title": db_note.title, "content": db_note.content}
            })
            
        elif tool_name == "list_notes":
            notes = db.query(Note).filter(Note.user_id == current_user_id).order_by(Note.created_at.desc()).all()
            return json.dumps({
                "status": "success",
                "notes": [{"id": n.id, "title": n.title, "content": n.content} for n in notes]
            })
            
        elif tool_name == "delete_note":
            note_id = tool_input.get("note_id")
            note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user_id).first()
            if not note:
                return json.dumps({"status": "error", "message": f"Note with ID {note_id} not found."})
            db.delete(note)
            db.commit()
            return json.dumps({"status": "success", "message": "Note deleted successfully"})
            
        elif tool_name == "create_todo":
            task = tool_input.get("task", "")
            due_str = tool_input.get("due_date")
            parsed_due = None
            if due_str:
                try:
                    parsed_due = datetime.fromisoformat(due_str.replace("Z", "+00:00"))
                except ValueError:
                    pass
            db_todo = Todo(user_id=current_user_id, task=task, due_date=parsed_due)
            db.add(db_todo)
            db.commit()
            return json.dumps({
                "status": "success",
                "message": "Todo created successfully",
                "todo": {"id": db_todo.id, "task": db_todo.task, "completed": db_todo.completed, "due_date": due_str}
            })
            
        elif tool_name == "list_todos":
            todos = db.query(Todo).filter(Todo.user_id == current_user_id).order_by(Todo.completed.asc(), Todo.created_at.desc()).all()
            return json.dumps({
                "status": "success",
                "todos": [{"id": t.id, "task": t.task, "completed": t.completed, "due_date": t.due_date.isoformat() if t.due_date else None} for t in todos]
            })
            
        elif tool_name == "update_todo":
            todo_id = tool_input.get("todo_id")
            todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user_id).first()
            if not todo:
                return json.dumps({"status": "error", "message": f"Todo with ID {todo_id} not found."})
            
            task = tool_input.get("task")
            completed = tool_input.get("completed")
            if task is not None:
                todo.task = task
            if completed is not None:
                todo.completed = completed
            db.commit()
            return json.dumps({
                "status": "success",
                "message": "Todo updated successfully",
                "todo": {"id": todo.id, "task": todo.task, "completed": todo.completed}
            })
            
        elif tool_name == "delete_todo":
            todo_id = tool_input.get("todo_id")
            todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user_id).first()
            if not todo:
                return json.dumps({"status": "error", "message": f"Todo with ID {todo_id} not found."})
            db.delete(todo)
            db.commit()
            return json.dumps({"status": "success", "message": "Todo deleted successfully"})
            
        elif tool_name == "create_calendar_event":
            summary = tool_input.get("summary")
            start = tool_input.get("start_time")
            end = tool_input.get("end_time")
            loc = tool_input.get("location")
            desc = tool_input.get("description")
            res = await create_calendar_event_helper(db, current_user_id, summary, start, end, loc, desc)
            return json.dumps({"status": "success", "message": "Calendar event created", "event": res})
            
        elif tool_name == "list_calendar_events":
            events = await list_calendar_events_helper(db, current_user_id)
            return json.dumps({"status": "success", "events": events})
            
        elif tool_name == "check_upcoming_reminders":
            reminders = await get_upcoming_reminders_list(current_user_id, db)
            return json.dumps({"status": "success", "reminders": reminders})
            
        else:
            return json.dumps({"status": "error", "message": f"Unknown tool name: {tool_name}."})
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Database operation failed: {str(e)}"})

def extract_message_text(msg: ChatMessage) -> str:
    if msg.parts:
        return "".join([p.text for p in msg.parts if p.type == "text" and p.text])
    return msg.content or ""

async def anthropic_stream_response(messages_list, system_prompt, current_user_id: str, db: Session, is_code_mode=False):
    """Generator to stream tokens from Anthropic API formatted for Vercel AI SDK, with tool calling support."""
    api_key = settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        fallback_msg = (
            f"Hello! The Anthropic API key is not configured, so I am running in mock mode.\n\n"
            f"Active System Instruction Context:\n======================\n{system_prompt}\n======================\n\n"
            "Try saying 'Create a note named Draft with details' or 'Add a task to buy groceries' to test the CRUD tools loop!"
        )
        async for chunk in mock_stream_response(fallback_msg):
            yield chunk
        return

    client = AsyncAnthropic(api_key=api_key)
    
    anthropic_messages = []
    for msg in messages_list:
        role = msg.role
        if role not in ["user", "assistant"]:
            role = "user"
        anthropic_messages.append({"role": role, "content": extract_message_text(msg)})

    if is_code_mode:
        system_prompt += (
            "\n\nYou are operating in Code Assistant Mode. "
            "Format code blocks using correct language tags. "
            "Prioritize debugging accuracy, step-by-step logic explanation, "
            "and Big O complexity performance analysis."
        )

    try:
        response = await client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=1024,
            system=system_prompt,
            messages=anthropic_messages,
            tools=MANAGE_NOTES_TODOS_TOOLS
        )

        tool_calls = [content for content in response.content if content.type == "tool_use"]
        
        if tool_calls:
            tool_use = tool_calls[0]
            tool_name = tool_use.name
            tool_input = tool_use.input
            tool_call_id = tool_use.id
            
            print(f"[Agent Tool Execution] Claude chose to execute: {tool_name} with: {tool_input}")
            
            tavily_key = settings.TAVILY_API_KEY or os.environ.get("TAVILY_API_KEY")
            tool_result_content = ""
            
            if tool_name == "web_search":
                query = tool_input.get("query", "")
                if tavily_key:
                    tool_result_content = await execute_tavily_search(query, tavily_key)
                else:
                    tool_result_content = (
                        f"Mock Web Search Results for '{query}':\n"
                        "- Tavily API key is not configured. Enable TAVILY_API_KEY in backend settings."
                    )
            else:
                tool_result_content = await handle_agent_tools_execution(tool_name, tool_input, current_user_id, db)
            
            action_desc = f"Executing tool: {tool_name}..."
            if tool_name == "create_note":
                action_desc = f"📝 Creating note \"{tool_input.get('title')}\"..."
            elif tool_name == "list_notes":
                action_desc = "📁 Fetching your notes list..."
            elif tool_name == "create_todo":
                action_desc = f"✅ Adding task \"{tool_input.get('task')}\"..."
            elif tool_name == "list_todos":
                action_desc = "📋 Checking your todo items..."
            elif tool_name == "create_calendar_event":
                action_desc = f"📅 Scheduling event \"{tool_input.get('summary')}\"..."
            elif tool_name == "list_calendar_events":
                action_desc = "📅 Fetching calendar events..."
            elif tool_name == "check_upcoming_reminders":
                action_desc = "🔔 Fetching active alerts and reminders..."
            elif tool_name == "web_search":
                action_desc = f"🔍 Searching the web for: \"{tool_input.get('query')}\"..."
                
            yield f'0:{json.dumps(action_desc + "\n\n")}\n'
            
            assistant_content = []
            for content in response.content:
                if content.type == "text":
                    assistant_content.append({"type": "text", "text": content.text})
                elif content.type == "tool_use":
                    assistant_content.append({
                        "type": "tool_use",
                        "id": content.id,
                        "name": content.name,
                        "input": content.input
                    })
            anthropic_messages.append({"role": "assistant", "content": assistant_content})
            
            anthropic_messages.append({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_call_id,
                        "content": tool_result_content
                    }
                ]
            })
            
            async with client.messages.stream(
                model="claude-3-5-sonnet-20240620",
                max_tokens=1024,
                system=system_prompt,
                messages=anthropic_messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield f'0:{json.dumps(text)}\n'
        else:
            text_blocks = [content.text for content in response.content if content.type == "text"]
            full_text = "".join(text_blocks)
            words = full_text.split(" ")
            for word in words:
                yield f'0:{json.dumps(word + " ")}\n'
                await asyncio.sleep(0.01)

    except APIStatusError as e:
        yield f'0:{json.dumps(f"\\n[Anthropic API Error: {e.message}]")}\n'
    except Exception as e:
        yield f'0:{json.dumps(f"\\n[Error: {str(e)}]")}\n'

@app.post("/api/chat", dependencies=[Depends(rate_limiter(max_requests=15))])
async def chat(
    request: ChatRequest,
    fastapi_request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    latest_user_message = next((extract_message_text(m) for m in reversed(request.messages) if m.role == "user"), "")
    is_code_mode = fastapi_request.headers.get("x-code-assistant") == "true"
    
    memories_text = ""
    file_context_text = ""
    openai_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
    anthropic_key = settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY")

    if latest_user_message:
        query_embedding = await get_embedding(latest_user_message, openai_key)
        
        limit = 3
        if not engine.url.drivername.startswith("sqlite"):
            memories = db.query(Memory).filter(Memory.user_id == current_user.id).order_by(Memory.embedding.cosine_distance(query_embedding)).limit(limit).all()
        else:
            all_memories = db.query(Memory).filter(Memory.user_id == current_user.id).all()
            scored = []
            for m in all_memories:
                emb = m.embedding
                if isinstance(emb, str):
                    emb = json.loads(emb)
                sim = cosine_similarity(query_embedding, emb)
                scored.append((sim, m))
            scored.sort(key=lambda x: x[0], reverse=True)
            memories = [m for _, m in scored[:limit]]
            
        if memories:
            memories_list = "\n".join([f"- {m.content}" for m in memories])
            memories_text = (
                "\n\nHere are some facts and preferences you remember about the user from previous conversations:\n"
                f"{memories_list}\n"
                "Use these details to personalize your answers. Do not mention them if they are not relevant to the current conversation."
            )

        file_chunks = []
        if not engine.url.drivername.startswith("sqlite"):
            db_chunks = db.query(FileEmbedding, File.filename)\
                .join(File, FileEmbedding.file_id == File.id)\
                .filter(FileEmbedding.user_id == current_user.id)\
                .order_by(FileEmbedding.embedding.cosine_distance(query_embedding))\
                .limit(3).all()
            file_chunks = db_chunks
        else:
            all_chunks = db.query(FileEmbedding, File.filename)\
                .join(File, FileEmbedding.file_id == File.id)\
                .filter(FileEmbedding.user_id == current_user.id).all()
            scored_chunks = []
            for chunk, filename in all_chunks:
                emb = chunk.embedding
                if isinstance(emb, str):
                    emb = json.loads(emb)
                sim = cosine_similarity(query_embedding, emb)
                scored_chunks.append((sim, chunk, filename))
            scored_chunks.sort(key=lambda x: x[0], reverse=True)
            file_chunks = [(c, fn) for sim, c, fn in scored_chunks[:3] if sim > 0.35]

        if file_chunks:
            context_excerpts = []
            for chunk, filename in file_chunks:
                context_excerpts.append(
                    f'Excerpt from file "{filename}":\n'
                    f'"""\n{chunk.content}\n"""'
                )
            context_str = "\n\n".join(context_excerpts)
            file_context_text = (
                "\n\nHere are some relevant excerpts matching the user's query from their uploaded files:\n"
                "==================================================================\n"
                f"{context_str}\n"
                "==================================================================\n"
                "Use the context above to help answer the user's question. "
                "Cite the filename (e.g. \"[document.pdf]\") when referencing information from these files. "
                "If the context does not contain the answer, reply using your general knowledge but note that the information was not found in the uploaded documents."
            )

    system_prompt = "You are Aether, a premium personal AI assistant. Assist the user with clarity and precision."
    if memories_text:
        system_prompt += memories_text
    if file_context_text:
        system_prompt += file_context_text

    if latest_user_message:
        background_tasks.add_task(
            process_memory_task,
            current_user.id,
            latest_user_message,
            anthropic_key,
            openai_key,
            SessionLocal
        )

    return StreamingResponse(
        anthropic_stream_response(request.messages, system_prompt, current_user.id, db, is_code_mode),
        media_type="text/event-stream",
        headers={
            "x-vercel-ai-ui-message-stream": "v1",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

# --- Vision Endpoint ---

@app.post("/api/chat/vision", dependencies=[Depends(rate_limiter(max_requests=15))])
async def chat_vision(
    prompt: str = Form(...),
    file: UploadFile = FastAPIFile(...),
    current_user: User = Depends(get_current_user)
):
    """Processes multipart image upload + text prompt, base64 encodes it, and streams analysis from Claude."""
    file_bytes = await file.read()
    base64_data = base64.b64encode(file_bytes).decode("utf-8")
    file_type = file.content_type or "image/jpeg"
    
    api_key = settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        mock_msg = (
            "Hello! I received your image successfully. However, the Anthropic API key is not configured "
            "on the backend. To enable active image analysis via Claude 3.5 Sonnet, please configure "
            "ANTHROPIC_API_KEY in the environment."
        )
        return StreamingResponse(
            mock_stream_response(mock_msg),
            media_type="text/event-stream"
        )
        
    client = AsyncAnthropic(api_key=api_key)
    
    async def stream_vision_response():
        try:
            async with client.messages.stream(
                model="claude-3-5-sonnet-20240620",
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": file_type,
                                    "data": base64_data
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            ) as stream:
                async for text in stream.text_stream:
                    yield f'0:{json.dumps(text)}\n'
        except Exception as e:
            yield f'0:{json.dumps(f"\\n[Vision System Error: {str(e)}]")}\n'

    return StreamingResponse(
        stream_vision_response(),
        media_type="text/event-stream",
        headers={
            "x-vercel-ai-ui-message-stream": "v1",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
