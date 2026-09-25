"""
Authentication routes — GitHub OAuth + Slack OAuth ("Add to Slack").
"""

from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import create_jwt, decode_jwt, get_current_user
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Helpers ──────────────────────────────────────────────────

def _create_state_token(purpose: str, user_id: str | None = None) -> str:
    """Create a short-lived signed state token for CSRF protection."""
    import jwt as pyjwt
    from datetime import datetime, timedelta, timezone

    payload = {
        "purpose": purpose,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
    }
    if user_id:
        payload["uid"] = user_id
    return pyjwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _verify_state_token(token: str, expected_purpose: str) -> dict:
    """Verify and decode a state token. Returns the payload."""
    payload = decode_jwt(token)  # raises HTTPException on invalid/expired
    if payload.get("purpose") != expected_purpose:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state parameter",
        )
    return payload


# ─────────────────────────────────────────────────────────────
# GitHub OAuth
# ─────────────────────────────────────────────────────────────

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


@router.get("/github")
async def github_login():
    """
    Step 1 — Redirect the user to GitHub's OAuth consent screen.
    """
    state = _create_state_token(purpose="github_oauth")
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": f"{settings.BACKEND_URL}/auth/callback",
        "scope": "repo admin:repo_hook",  # repo: labels/comments; admin:repo_hook: create/list webhooks
        "state": state,
    }
    url = f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"
    return RedirectResponse(url=url)


@router.get("/callback")
async def github_callback(
    code: str | None = Query(None, description="Authorization code from GitHub"),
    state: str | None = Query(None, description="CSRF state token"),
    error: str | None = Query(None, description="Error from GitHub"),
    error_description: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2 — GitHub redirects here with ?code=...
    Exchange the code for an access token, fetch user profile, upsert in DB, issue JWT.
    """
    # Handle GitHub error redirects (e.g. access_denied, redirect_uri_mismatch)
    if error:
        msg = error_description or error
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/?error={msg}")

    # Ensure we have the required params
    if not code or not state:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/?error=missing_params")

    # Validate CSRF state
    _verify_state_token(state, expected_purpose="github_oauth")

    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": f"{settings.BACKEND_URL}/auth/callback",
            },
            headers={"Accept": "application/json"},
        )

    if token_resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to exchange code with GitHub",
        )

    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        error = token_data.get("error_description", "Unknown error")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub OAuth error: {error}",
        )

    # Fetch GitHub user profile
    async with httpx.AsyncClient() as client:
        user_resp = await client.get(
            GITHUB_USER_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )

    if user_resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch GitHub user profile",
        )

    github_user = user_resp.json()
    github_id = github_user["id"]
    username = github_user["login"]

    # Upsert user in database
    result = await db.execute(select(User).where(User.github_id == github_id))
    user = result.scalar_one_or_none()

    if user is None:
        # New user — insert with Slack URL auto-configured
        user = User(
            github_id=github_id,
            username=username,
            access_token=access_token,
            # Auto-assign default Slack webhook so user never has to paste it manually
            slack_webhook_url=settings.DEFAULT_SLACK_WEBHOOK_URL or None,
        )
        db.add(user)
        await db.flush()  # populate user.id
    else:
        # Existing user — update token and username
        user.access_token = access_token
        user.username = username
        # Backfill Slack URL if they don't have one yet
        if not user.slack_webhook_url and settings.DEFAULT_SLACK_WEBHOOK_URL:
            user.slack_webhook_url = settings.DEFAULT_SLACK_WEBHOOK_URL

    # Explicitly commit here — RedirectResponse can bypass the get_db generator cleanup
    await db.commit()

    # Issue JWT
    token = create_jwt(user_id=str(user.id), username=username)

    # Redirect to frontend with token as query param
    # The frontend's /auth/callback page extracts it and stores in localStorage
    redirect_url = f"{settings.FRONTEND_URL}/auth/callback?token={token}"
    return RedirectResponse(url=redirect_url)


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    """Return the currently authenticated user's info."""
    return {
        "id": str(user.id),
        "username": user.username,
        "github_id": user.github_id,
        "slack_configured": user.slack_webhook_url is not None,
    }


# ─────────────────────────────────────────────────────────────
# Slack OAuth ("Add to Slack" button)
# ─────────────────────────────────────────────────────────────

SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access"


@router.get("/slack")
async def slack_login(user=Depends(get_current_user)):
    """
    Redirect the authenticated user to Slack's OAuth consent screen.
    The user picks a workspace + channel, and Slack returns a webhook URL.
    """
    if not settings.SLACK_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Slack OAuth not configured — set SLACK_CLIENT_ID",
        )

    # Sign the user ID into the state token so callback can verify ownership
    state = _create_state_token(purpose="slack_oauth", user_id=str(user.id))

    params = {
        "client_id": settings.SLACK_CLIENT_ID,
        "scope": "incoming-webhook",
        "redirect_uri": f"{settings.BACKEND_URL}/auth/slack/callback",
        "state": state,
    }
    url = f"{SLACK_AUTHORIZE_URL}?{urlencode(params)}"
    return {"redirect_url": url}


@router.get("/slack/callback")
async def slack_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Slack redirects here after the user authorises.
    Exchange the code for a webhook URL and save it to the user's row.
    """
    # Verify the signed state token and extract user ID
    state_payload = _verify_state_token(state, expected_purpose="slack_oauth")
    user_id_str = state_payload.get("uid")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid state — missing user ID",
        )

    # Exchange code for access + webhook URL
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            SLACK_TOKEN_URL,
            data={
                "client_id": settings.SLACK_CLIENT_ID,
                "client_secret": settings.SLACK_CLIENT_SECRET,
                "code": code,
                "redirect_uri": f"{settings.BACKEND_URL}/auth/slack/callback",
            },
        )

    data = resp.json()
    if not data.get("ok"):
        error = data.get("error", "Unknown Slack error")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Slack OAuth error: {error}",
        )

    webhook_url = data.get("incoming_webhook", {}).get("url")
    channel = data.get("incoming_webhook", {}).get("channel")

    if not webhook_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slack did not return a webhook URL",
        )

    # Update user's slack_webhook_url — user ID verified from signed state token
    from uuid import UUID
    result = await db.execute(select(User).where(User.id == UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    user.slack_webhook_url = webhook_url
    await db.commit()  # explicit commit — same pattern as GitHub OAuth callback

    # Redirect back to the onboarding wizard with success signal
    redirect_url = f"{settings.FRONTEND_URL}/onboarding?slack=connected&channel={channel or ''}"
    return RedirectResponse(url=redirect_url)
