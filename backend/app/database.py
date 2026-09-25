"""
Async SQLAlchemy engine and session factory for Neon Postgres.
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Build engine only when a DATABASE_URL is configured
# (avoids crash during local dev before .env is set up)
_engine_kwargs = dict(
    echo=False,
    pool_pre_ping=True,
    # Neon idles connections aggressively — keep the pool small
    pool_size=5,
    max_overflow=10,
)

engine = (
    create_async_engine(settings.DATABASE_URL, **_engine_kwargs)
    if settings.DATABASE_URL
    else None
)

async_session = (
    async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    if engine
    else None
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields an async DB session."""
    if async_session is None:
        raise RuntimeError(
            "Database not configured. Set NEON_DATABASE_URL in your .env file."
        )
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
