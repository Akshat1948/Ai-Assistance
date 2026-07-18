import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

db_url = settings.DATABASE_URL
connect_args = {}

if db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

try:
    engine = create_engine(db_url, connect_args=connect_args)
    # Test connection
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
except Exception as e:
    if not db_url.startswith("sqlite"):
        print("\n" + "="*80)
        print("DATABASE WARNING:")
        print(f"Could not connect to PostgreSQL at: {db_url}")
        print(f"Error detail: {e}")
        print("FALLING BACK TO LOCAL SQLITE: sqlite:///./dev.db")
        print("="*80 + "\n")
        
        fallback_url = "sqlite:///./dev.db"
        connect_args = {"check_same_thread": False}
        engine = create_engine(fallback_url, connect_args=connect_args)
    else:
        print(f"SQLite initialization error: {e}")
        sys.exit(1)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

