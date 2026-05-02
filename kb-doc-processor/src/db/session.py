from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.config import AppConfig

engine = None
SessionLocal = None


def init_db(config: AppConfig):
    global engine, SessionLocal
    db = config.database
    engine = create_engine(
        db.url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
    )
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_session():
    """返回一个新的 SQLAlchemy session。调用方负责关闭。"""
    if SessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return SessionLocal()
