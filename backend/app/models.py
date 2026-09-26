"""
SQLAlchemy ORM models — mirrors the schema from the implementation plan.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    github_id = Column(Integer, unique=True, nullable=False)
    username = Column(Text, nullable=False)
    access_token = Column(Text, nullable=False)  # GitHub OAuth token
    slack_webhook_url = Column(Text, nullable=True)
    automation_settings = Column(JSONB, nullable=True)  # null = use defaults
    created_at = Column(DateTime(timezone=True), default=utcnow)

    repos = relationship("Repo", back_populates="user", cascade="all, delete-orphan")


class Repo(Base):
    __tablename__ = "repos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    repo_full_name = Column(Text, nullable=False)  # e.g. "ChitrakshGupta/test"
    webhook_id = Column(Integer, nullable=True)  # GitHub webhook ID for cleanup
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="repos")
    events = relationship("Event", back_populates="repo", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id = Column(UUID(as_uuid=True), ForeignKey("repos.id", ondelete="CASCADE"), nullable=False)
    github_delivery_id = Column(Text, unique=True, nullable=False)  # deduplication
    event_type = Column(Text, nullable=False)  # push, issues, pull_request
    payload = Column(JSONB, nullable=False)
    ai_analysis = Column(JSONB, nullable=True)  # AI triage result (None when AI disabled/failed)
    action_taken = Column(Text, nullable=True)  # what the bot did
    status = Column(Text, nullable=False, default="processed")  # processed / failed
    created_at = Column(DateTime(timezone=True), default=utcnow)

    repo = relationship("Repo", back_populates="events")
