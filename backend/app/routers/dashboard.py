"""
Dashboard API routes — event log, repo management, and webhook creation.
All routes require a valid JWT (get_current_user dependency).
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Event, Repo, User

router = APIRouter(tags=["dashboard"])
logger = logging.getLogger("dashboard")


def _get_public_webhook_url() -> str:
    """Lazily import public_webhook_url from main to avoid circular imports."""
    from app.main import public_webhook_url
    return public_webhook_url


# ── Request / Response schemas ───────────────────────────────

class ConnectRepoRequest(BaseModel):
    repo_full_name: str  # e.g. "ChitrakshGupta/test"


# ─────────────────────────────────────────────────────────────
# GET /repos/github — list user's actual GitHub repos
# ─────────────────────────────────────────────────────────────

@router.get("/repos/github")
async def list_github_repos(
    search: str = "",
    user: User = Depends(get_current_user),
):
    """
    Fetch the logged-in user's GitHub repos via GitHub API.
    Used to power the searchable repo picker (like Render / Vercel).
    """
    all_repos = []
    page = 1

    async with httpx.AsyncClient(timeout=15.0) as client:
        while True:
            resp = await client.get(
                "https://api.github.com/user/repos",
                params={
                    "per_page": 100,
                    "page": page,
                    "sort": "updated",
                    "affiliation": "owner,collaborator,organization_member",
                },
                headers={
                    "Authorization": f"Bearer {user.access_token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"GitHub API error: {resp.status_code}",
                )
            batch = resp.json()
            if not batch:
                break
            all_repos.extend(batch)
            if len(batch) < 100:
                break
            page += 1

    # Filter by search term
    if search:
        q = search.lower()
        all_repos = [r for r in all_repos if q in r["full_name"].lower()]

    return {
        "repos": [
            {
                "full_name": r["full_name"],
                "private": r["private"],
                "description": r.get("description") or "",
                "updated_at": r.get("updated_at", ""),
                "language": r.get("language") or "",
            }
            for r in all_repos[:50]  # Cap at 50 results
        ],
        "total": len(all_repos),
    }


# ─────────────────────────────────────────────────────────────
# GET /events — list events for the logged-in user's repos
# ─────────────────────────────────────────────────────────────

@router.get("/events")
async def list_events(
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List recent events for all repos connected by the logged-in user."""
    # Get user's repo IDs
    result = await db.execute(
        select(Repo.id).where(Repo.user_id == user.id)
    )
    repo_ids = [row[0] for row in result.fetchall()]

    if not repo_ids:
        return {"events": [], "total": 0}

    # Fetch events for those repos, newest first
    result = await db.execute(
        select(Event)
        .where(Event.repo_id.in_(repo_ids))
        .order_by(Event.created_at.desc())
        .limit(min(limit, 200))
    )
    events = result.scalars().all()

    return {
        "events": [
            {
                "id": str(e.id),
                "repo_id": str(e.repo_id),
                "event_type": e.event_type,
                "action_taken": e.action_taken,
                "status": e.status,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "github_delivery_id": e.github_delivery_id,
            }
            for e in events
        ],
        "total": len(events),
    }


# ─────────────────────────────────────────────────────────────
# GET /repos — list repos connected by the logged-in user
# ─────────────────────────────────────────────────────────────

@router.get("/repos")
async def list_repos(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all repos connected by the logged-in user."""
    result = await db.execute(
        select(Repo).where(Repo.user_id == user.id).order_by(Repo.created_at.desc())
    )
    repos = result.scalars().all()

    return {
        "repos": [
            {
                "id": str(r.id),
                "repo_full_name": r.repo_full_name,
                "webhook_id": r.webhook_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in repos
        ],
        "total": len(repos),
    }


# ─────────────────────────────────────────────────────────────
# POST /repos/connect — connect a repo + auto-create GitHub webhook
# ─────────────────────────────────────────────────────────────

@router.post("/repos/connect", status_code=201)
async def connect_repo(
    body: ConnectRepoRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Connect a GitHub repo and auto-create a webhook.

    1. Verify the user has access to the repo via GitHub API
    2. Check if repo is already connected
    3. Create a webhook on the repo via GitHub API
    4. Save the repo + webhook ID to the database
    """
    repo_full_name = body.repo_full_name.strip()

    # Validate format
    if "/" not in repo_full_name or len(repo_full_name.split("/")) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid repo name — expected format: owner/repo",
        )

    # Check if already connected
    result = await db.execute(
        select(Repo).where(
            Repo.user_id == user.id,
            Repo.repo_full_name == repo_full_name,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Repo {repo_full_name} is already connected",
        )

    # Verify user has access to the repo
    async with httpx.AsyncClient(timeout=10.0) as client:
        check_resp = await client.get(
            f"https://api.github.com/repos/{repo_full_name}",
            headers={
                "Authorization": f"Bearer {user.access_token}",
                "Accept": "application/vnd.github+json",
            },
        )

    if check_resp.status_code == 404:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repo {repo_full_name} not found or you don't have access",
        )
    elif check_resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub API error: {check_resp.status_code}",
        )

    # Create webhook on the repo via GitHub API
    # Uses the live ngrok URL in dev, or BACKEND_URL when deployed
    webhook_url = f"{_get_public_webhook_url()}/webhook/github"
    webhook_payload = {
        "name": "web",
        "active": True,
        "events": ["issues", "pull_request", "push"],
        "config": {
            "url": webhook_url,
            "content_type": "json",
            "secret": settings.GITHUB_WEBHOOK_SECRET,
            "insecure_ssl": "0",
        },
    }

    webhook_id = None
    webhook_error = None
    async with httpx.AsyncClient(timeout=10.0) as client:
        wh_resp = await client.post(
            f"https://api.github.com/repos/{repo_full_name}/hooks",
            json=webhook_payload,
            headers={
                "Authorization": f"Bearer {user.access_token}",
                "Accept": "application/vnd.github+json",
            },
        )

    if wh_resp.status_code in (200, 201):
        webhook_id = wh_resp.json().get("id")
        logger.info(f"Created webhook {webhook_id} on {repo_full_name}")
    elif wh_resp.status_code == 422:
        # Webhook already exists — find it and reuse its ID
        logger.info(f"Webhook already exists on {repo_full_name} — looking up existing hook...")
        async with httpx.AsyncClient(timeout=10.0) as client:
            list_resp = await client.get(
                f"https://api.github.com/repos/{repo_full_name}/hooks",
                headers={
                    "Authorization": f"Bearer {user.access_token}",
                    "Accept": "application/vnd.github+json",
                },
            )
        if list_resp.status_code == 200:
            for hook in list_resp.json():
                if hook.get("config", {}).get("url") == webhook_url:
                    webhook_id = hook.get("id")
                    logger.info(f"Reusing existing webhook {webhook_id} on {repo_full_name}")
                    break
        if not webhook_id:
            webhook_error = wh_resp.json().get("message", wh_resp.text)
            logger.warning(f"Failed to create webhook on {repo_full_name}: {wh_resp.status_code} — {webhook_error}")
    else:
        webhook_error = wh_resp.json().get("message", wh_resp.text)
        logger.warning(
            f"Failed to create webhook on {repo_full_name}: {wh_resp.status_code} — {webhook_error}"
        )

    # Save repo to database regardless of webhook status
    repo = Repo(
        user_id=user.id,
        repo_full_name=repo_full_name,
        webhook_id=webhook_id,
    )
    db.add(repo)
    await db.flush()

    if webhook_id:
        message = f"✅ Connected {repo_full_name} — webhook auto-created (ID: {webhook_id})"
    else:
        # Localhost can't be reached by GitHub — give the user manual instructions
        message = (
            f"✅ Repo {repo_full_name} connected. "
            f"GitHub can't reach localhost — add the webhook manually in "
            f"GitHub → {repo_full_name} → Settings → Webhooks:\n"
            f"  Payload URL: {webhook_url}\n"
            f"  Content type: application/json\n"
            f"  Secret: {settings.GITHUB_WEBHOOK_SECRET}\n"
            f"  Events: Issues, Pull requests, Pushes\n"
            f"(Will auto-create once deployed to a public URL)"
        )

    return {
        "id": str(repo.id),
        "repo_full_name": repo.repo_full_name,
        "webhook_id": webhook_id,
        "webhook_created": webhook_id is not None,
        "webhook_url": webhook_url,
        # Never return the full secret in an API response.
        # Provide only the first 8 chars as a hint so user can verify which secret to use.
        "webhook_secret_hint": settings.GITHUB_WEBHOOK_SECRET[:8] + "..." if not webhook_id else None,
        "message": message,
    }
