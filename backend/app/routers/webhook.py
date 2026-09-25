"""
GitHub webhook receiver — processes events, acts on GitHub, notifies Slack.

Security:
  - HMAC-SHA256 signature verification (X-Hub-Signature-256)
  - Idempotent processing via unique github_delivery_id

Handled events:
  - issues (opened)   → adds "bot-triaged" label via GitHub API + Slack notification
  - pull_request (opened) → posts welcome comment via GitHub API + Slack notification
  - push              → Slack notification only (no GitHub write-back)
"""

import hashlib
import hmac
import logging

import httpx
from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Event, Repo, User

router = APIRouter(tags=["webhook"])
logger = logging.getLogger("webhook")


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _verify_signature(payload_body: bytes, signature_header: str | None) -> bool:
    """Verify the GitHub webhook HMAC-SHA256 signature."""
    if not settings.GITHUB_WEBHOOK_SECRET:
        # No secret configured — skip verification (dev mode)
        logger.warning("GITHUB_WEBHOOK_SECRET not set — skipping signature verification")
        return True

    if not signature_header:
        return False

    # GitHub sends: sha256=<hex_digest>
    if not signature_header.startswith("sha256="):
        return False

    expected = hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode("utf-8"),
        payload_body,
        hashlib.sha256,
    ).hexdigest()

    received = signature_header[7:]  # strip "sha256="
    return hmac.compare_digest(expected, received)


async def _send_slack_notification(webhook_url: str, message: dict) -> bool:
    """POST a message to a Slack Incoming Webhook. Returns True on success."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=message)
            if resp.status_code == 200:
                return True
            logger.error(f"Slack responded with {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        logger.error(f"Slack notification failed: {e}")
        return False


async def _github_api(
    method: str, url: str, access_token: str, json: dict | None = None
) -> httpx.Response | None:
    """Call GitHub REST API with the user's access token."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(
                method,
                url,
                json=json,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            return resp
    except Exception as e:
        logger.error(f"GitHub API call failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────
# Event handlers
# ─────────────────────────────────────────────────────────────

async def _handle_issues(payload: dict, user: User) -> str:
    """Handle 'issues' event — add label when an issue is opened."""
    action = payload.get("action")
    if action != "opened":
        return f"issues.{action} — ignored (not opened)"

    issue = payload.get("issue", {})
    repo_full = payload.get("repository", {}).get("full_name", "")
    issue_number = issue.get("number")
    issue_title = issue.get("title", "")

    actions = []

    # Add a label via GitHub API
    label_url = f"https://api.github.com/repos/{repo_full}/issues/{issue_number}/labels"
    resp = await _github_api("POST", label_url, user.access_token, json={"labels": ["bot-triaged"]})
    if resp and resp.status_code in (200, 201):
        actions.append("added label 'bot-triaged'")
    else:
        status = resp.status_code if resp else "no response"
        actions.append(f"label failed ({status})")

    # Send Slack notification
    if user.slack_webhook_url:
        slack_ok = await _send_slack_notification(user.slack_webhook_url, {
            "text": f"🐛 New issue opened in {repo_full}",
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": "🐛 New Issue Opened"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Repo:*\n{repo_full}"},
                        {"type": "mrkdwn", "text": f"*Issue:*\n#{issue_number}"},
                        {"type": "mrkdwn", "text": f"*Title:*\n{issue_title}"},
                        {"type": "mrkdwn", "text": f"*Author:*\n{issue.get('user', {}).get('login', 'unknown')}"},
                    ]
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "View Issue"},
                            "url": issue.get("html_url", ""),
                        }
                    ]
                }
            ]
        })
        actions.append("slack notified" if slack_ok else "slack failed")
    else:
        actions.append("slack skipped (no webhook URL)")

    return "; ".join(actions)


async def _handle_pull_request(payload: dict, user: User) -> str:
    """Handle 'pull_request' event — post a comment when a PR is opened."""
    action = payload.get("action")
    if action != "opened":
        return f"pull_request.{action} — ignored (not opened)"

    pr = payload.get("pull_request", {})
    repo_full = payload.get("repository", {}).get("full_name", "")
    pr_number = pr.get("number")
    pr_title = pr.get("title", "")
    pr_author = pr.get("user", {}).get("login", "unknown")

    actions = []

    # Post a comment via GitHub API
    comment_url = f"https://api.github.com/repos/{repo_full}/issues/{pr_number}/comments"
    comment_body = (
        f"👋 Thanks for the PR, @{pr_author}! "
        f"The bot has logged this event and will track it on the dashboard."
    )
    resp = await _github_api("POST", comment_url, user.access_token, json={"body": comment_body})
    if resp and resp.status_code in (200, 201):
        actions.append("posted welcome comment")
    else:
        status = resp.status_code if resp else "no response"
        actions.append(f"comment failed ({status})")

    # Send Slack notification
    if user.slack_webhook_url:
        slack_ok = await _send_slack_notification(user.slack_webhook_url, {
            "text": f"🔀 New PR opened in {repo_full}",
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": "🔀 New Pull Request"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Repo:*\n{repo_full}"},
                        {"type": "mrkdwn", "text": f"*PR:*\n#{pr_number}"},
                        {"type": "mrkdwn", "text": f"*Title:*\n{pr_title}"},
                        {"type": "mrkdwn", "text": f"*Author:*\n{pr_author}"},
                    ]
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "View PR"},
                            "url": pr.get("html_url", ""),
                        }
                    ]
                }
            ]
        })
        actions.append("slack notified" if slack_ok else "slack failed")
    else:
        actions.append("slack skipped (no webhook URL)")

    return "; ".join(actions)


async def _handle_push(payload: dict, user: User) -> str:
    """Handle 'push' event — Slack notification only (no GitHub write-back)."""
    repo_full = payload.get("repository", {}).get("full_name", "")
    ref = payload.get("ref", "").replace("refs/heads/", "")
    commits = payload.get("commits", [])
    pusher = payload.get("pusher", {}).get("name", "unknown")
    compare_url = payload.get("compare", "")

    # Build commit summary
    commit_lines = []
    for c in commits[:5]:  # Show max 5 commits
        short_sha = c.get("id", "")[:7]
        msg = c.get("message", "").split("\n")[0]  # first line only
        commit_lines.append(f"`{short_sha}` {msg}")
    if len(commits) > 5:
        commit_lines.append(f"_...and {len(commits) - 5} more_")

    actions = []

    if user.slack_webhook_url:
        slack_ok = await _send_slack_notification(user.slack_webhook_url, {
            "text": f"🚀 {len(commits)} commit(s) pushed to {repo_full}/{ref}",
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": "🚀 New Push"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Repo:*\n{repo_full}"},
                        {"type": "mrkdwn", "text": f"*Branch:*\n{ref}"},
                        {"type": "mrkdwn", "text": f"*Pushed by:*\n{pusher}"},
                        {"type": "mrkdwn", "text": f"*Commits:*\n{len(commits)}"},
                    ]
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "\n".join(commit_lines) if commit_lines else "_No commits_"}
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "View Diff"},
                            "url": compare_url,
                        }
                    ] if compare_url else []
                }
            ]
        })
        actions.append("slack notified" if slack_ok else "slack failed")
    else:
        actions.append("slack skipped (no webhook URL)")

    return "; ".join(actions)


# Map event type → handler
EVENT_HANDLERS = {
    "issues": _handle_issues,
    "pull_request": _handle_pull_request,
    "push": _handle_push,
}


# ─────────────────────────────────────────────────────────────
# Main webhook endpoint
# ─────────────────────────────────────────────────────────────

@router.post("/webhook/github")
async def receive_github_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_hub_signature_256: str | None = Header(None),
    x_github_delivery: str | None = Header(None),
    x_github_event: str | None = Header(None),
):
    """
    Receive and process GitHub webhook events.

    Security: Verifies HMAC-SHA256 signature.
    Idempotency: Deduplicates by X-GitHub-Delivery header.
    Always returns 200 to GitHub (prevents retries).
    """
    # Read raw body for signature verification
    body = await request.body()

    # ── Step 1: Verify signature ────────────────────────────
    if not _verify_signature(body, x_hub_signature_256):
        logger.warning(f"Invalid signature for delivery {x_github_delivery}")
        return Response(content="Invalid signature", status_code=403)

    # Parse payload
    try:
        payload = await request.json()
    except Exception:
        return Response(content="Invalid JSON", status_code=400)

    # ── Step 2: Identify the repo and user ──────────────────
    repo_full_name = payload.get("repository", {}).get("full_name")
    if not repo_full_name:
        logger.warning("Webhook payload missing repository.full_name")
        return {"status": "ignored", "reason": "no repo in payload"}

    result = await db.execute(
        select(Repo).where(Repo.repo_full_name == repo_full_name)
    )
    repo = result.scalar_one_or_none()

    if repo is None:
        logger.info(f"Repo {repo_full_name} not registered — ignoring")
        return {"status": "ignored", "reason": "repo not registered"}

    # Load the user who owns this repo
    result = await db.execute(select(User).where(User.id == repo.user_id))
    user = result.scalar_one_or_none()

    if user is None:
        logger.error(f"User for repo {repo_full_name} not found")
        return {"status": "ignored", "reason": "user not found"}

    # ── Step 3: Deduplicate ─────────────────────────────────
    delivery_id = x_github_delivery or payload.get("delivery", "unknown")

    result = await db.execute(
        select(Event).where(Event.github_delivery_id == delivery_id)
    )
    if result.scalar_one_or_none() is not None:
        logger.info(f"Duplicate delivery {delivery_id} — skipping")
        return {"status": "duplicate", "delivery_id": delivery_id}

    # ── Step 4: Process the event ───────────────────────────
    event_type = x_github_event or "unknown"
    action_taken = ""
    event_status = "processed"

    handler = EVENT_HANDLERS.get(event_type)
    if handler:
        try:
            action_taken = await handler(payload, user)
        except Exception as e:
            logger.error(f"Handler for {event_type} failed: {e}", exc_info=True)
            action_taken = f"error: {str(e)[:200]}"
            event_status = "failed"
    else:
        action_taken = f"event type '{event_type}' — no handler, logged only"

    # ── Step 5: Save event to database ──────────────────────
    event = Event(
        repo_id=repo.id,
        github_delivery_id=delivery_id,
        event_type=event_type,
        payload=payload,
        action_taken=action_taken,
        status=event_status,
    )
    db.add(event)

    try:
        await db.flush()
    except IntegrityError:
        # Race condition: another request processed this delivery ID
        await db.rollback()
        logger.info(f"Race condition on delivery {delivery_id}")
        return {"status": "duplicate", "delivery_id": delivery_id}

    logger.info(f"Processed {event_type} for {repo_full_name}: {action_taken}")

    # Always return 200 to GitHub
    return {
        "status": event_status,
        "event_type": event_type,
        "action_taken": action_taken,
        "delivery_id": delivery_id,
    }
