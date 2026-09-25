"""
User settings routes — Slack webhook URL management.
All routes require a valid JWT (get_current_user dependency).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/settings", tags=["settings"])


class SlackWebhookRequest(BaseModel):
    slack_webhook_url: str  # e.g. "https://hooks.slack.com/services/..."


@router.post("/slack")
async def save_slack_webhook(
    body: SlackWebhookRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save or update the user's Slack Incoming Webhook URL."""
    url = body.slack_webhook_url.strip()

    # Basic validation
    if url and not url.startswith("https://hooks.slack.com/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Slack webhook URL — must start with https://hooks.slack.com/",
        )

    user.slack_webhook_url = url or None  # empty string → null
    return {
        "message": "Slack webhook URL saved" if url else "Slack webhook URL removed",
        "slack_configured": url is not None and url != "",
    }


@router.delete("/slack")
async def remove_slack_webhook(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the user's Slack webhook URL."""
    user.slack_webhook_url = None
    return {"message": "Slack webhook URL removed", "slack_configured": False}


@router.get("/")
async def get_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current user settings."""
    return {
        "user": {
            "id": str(user.id),
            "username": user.username,
            "github_id": user.github_id,
        },
        "slack_configured": user.slack_webhook_url is not None,
        "slack_webhook_url_preview": (
            user.slack_webhook_url[:40] + "..." if user.slack_webhook_url else None
        ),
        # True when SLACK_CLIENT_ID is set → show "Add to Slack" OAuth button
        "slack_oauth_available": bool(settings.SLACK_CLIENT_ID),
    }


@router.get("/webhook-secret")
async def get_webhook_secret(
    user: User = Depends(get_current_user),
):
    """
    Return the webhook secret for manual GitHub webhook setup.
    Requires authentication — never returned in unauthenticated responses.
    """
    return {
        "webhook_secret": settings.GITHUB_WEBHOOK_SECRET,
        "webhook_secret_hint": settings.GITHUB_WEBHOOK_SECRET[:8] + "..." if settings.GITHUB_WEBHOOK_SECRET else "",
    }
