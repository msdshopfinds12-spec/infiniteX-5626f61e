from collections.abc import Generator
from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from backend.app.config import get_settings


@lru_cache
def get_engine():
    url = get_settings().database_url.get_secret_value()
    kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


@lru_cache
def get_session_factory():
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db_session() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
