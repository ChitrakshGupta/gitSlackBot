"""
GitHub webhook receiver — processes events, acts on GitHub, notifies Slack.

Security:
  - HMAC-SHA256 signature verification (X-Hub-Signature-256)
  - Idempotent processing via unique github_delivery_id

Handled events:
  - issues (opened)       → AI triage → labels via GitHub API + rich Slack notification
  - pull_request (opened) → AI analysis → welcome comment via GitHub API + Slack notification
  - push                  → AI changelog → Slack notification (no GitHub write-back needed)
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
from app.services.ai import (
    IssueAnalysis,
    PRAnalysis,
    PushAnalysis,
    analyze_issue,
    analyze_pr,
    analyze_push,
    complexity_emoji,
    priority_emoji,
)
from app.services.automation import get_user_settings, render_template

router = APIRouter(tags=["webhook"])
logger = logging.getLogger("webhook")


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _verify_signature(payload_body: bytes, signature_header: str | None) -> bool:
    """Verify the GitHub webhook HMAC-SHA256 signature."""
    if not settings.GITHUB_WEBHOOK_SECRET:
        # No secret configured — skip verification (dev mode only)
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
            logger.error("Slack responded with %s: %s", resp.status_code, resp.text)
            return False
    except Exception as e:
        logger.error("Slack notification failed: %s", e)
        return False


async def _github_api(
    method: str, url: str, access_token: str, json: dict | None = None
) -> httpx.Response | None:
    """Call GitHub REST API with the user's OAuth access token."""
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
        logger.error("GitHub API call failed: %s", e)
        return None


# ─────────────────────────────────────────────────────────────
# Slack Block Kit builders
# ─────────────────────────────────────────────────────────────

def _ai_issue_blocks(analysis: IssueAnalysis) -> list[dict]:
    """Return Block Kit section blocks for AI issue analysis."""
    p_emoji = priority_emoji(analysis.priority)
    confidence_pct = round(analysis.confidence * 100)
    return [
        {"type": "divider"},
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*🤖 AI Triage*\n"
                    f"{p_emoji} *Priority:* {analysis.priority.value}  |  "
                    f"*Category:* `{analysis.suggested_label.value}` ({confidence_pct}%)  |  "
                    f"*Sentiment:* {analysis.sentiment.value}"
                ),
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Summary:* {analysis.summary}",
            },
        },
    ]


def _ai_pr_blocks(analysis: PRAnalysis) -> list[dict]:
    """Return Block Kit section blocks for AI PR analysis."""
    c_emoji = complexity_emoji(analysis.complexity)
    risk_text = (
        "  •  ".join(analysis.risk_flags)
        if analysis.risk_flags
        else "_No risks detected_"
    )
    return [
        {"type": "divider"},
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*🤖 AI Analysis*\n"
                    f"{c_emoji} *Complexity:* {analysis.complexity.value}"
                ),
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Summary:* {analysis.summary}",
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*⚠️ Risk flags:* {risk_text}",
            },
        },
    ]


def _ai_push_blocks(analysis: PushAnalysis) -> list[dict]:
    """Return Block Kit section blocks for AI push changelog."""
    return [
        {"type": "divider"},
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*🤖 AI Changelog:* {analysis.changelog}",
            },
        },
    ]


# ─────────────────────────────────────────────────────────────
# Event handlers — return (action_taken_str, ai_analysis_dict | None)
# ─────────────────────────────────────────────────────────────

async def _handle_issues(
    payload: dict, user: User
) -> tuple[str, dict | None]:
    """
    Handle 'issues' event.
    Reads the user's automation settings to decide which actions to take:
    1. Keyword filter — skip if title doesn't match
    2. AI triage (if enabled)
    3. Auto-label (if enabled) — uses user's label_name + optional AI label
    4. Post comment (if enabled) — template supports {{variables}}
    5. Slack notification (if enabled) — respects ai_skip_low_priority
    """
    action = payload.get("action")
    if action != "opened":
        return f"issues.{action} — ignored (not opened)", None

    issue = payload.get("issue", {})
    repo_full = payload.get("repository", {}).get("full_name", "")
    issue_number = issue.get("number")
    issue_title = issue.get("title", "")
    issue_body = issue.get("body")
    issue_author = issue.get("user", {}).get("login", "unknown")
    issue_url = issue.get("html_url", "")

    # ── Load settings ─────────────────────────────────────────
    cfg = get_user_settings(user)["issues"]

    actions: list[str] = []
    ai_analysis: IssueAnalysis | None = None
    ai_dict: dict | None = None

    # ── Keyword filter ────────────────────────────────────────
    if cfg["keyword_filter"]:
        if not any(kw.lower() in issue_title.lower() for kw in cfg["keyword_filter"]):
            return "skipped — keyword filter did not match", None

    # ── 1. AI triage (if enabled) ─────────────────────────────
    if cfg["ai_triage"]:
        ai_analysis = await analyze_issue(issue_title, issue_body)
        if ai_analysis:
            ai_dict = ai_analysis.model_dump(mode="json")
            actions.append(
                f"AI: {ai_analysis.priority.value} / {ai_analysis.suggested_label.value} "
                f"({round(ai_analysis.confidence * 100)}%)"
            )
            logger.info(
                "AI triage for issue #%s in %s: priority=%s label=%s",
                issue_number, repo_full,
                ai_analysis.priority.value, ai_analysis.suggested_label.value,
            )
        else:
            logger.info("AI triage skipped for issue #%s (disabled or failed)", issue_number)

    # ── 2. Auto-label (if enabled) ────────────────────────────
    if cfg["auto_label"]:
        labels = [cfg["label_name"]]
        if ai_analysis and cfg["ai_apply_label"]:
            ai_label = ai_analysis.suggested_label.value
            if ai_label not in labels:
                labels.append(ai_label)

        label_url = f"https://api.github.com/repos/{repo_full}/issues/{issue_number}/labels"
        resp = await _github_api("POST", label_url, user.access_token, json={"labels": labels})
        if resp and resp.status_code in (200, 201):
            actions.append(f"added labels {labels}")
        else:
            status_code = resp.status_code if resp else "no response"
            actions.append(f"label failed ({status_code})")
            logger.warning("Failed to add labels %s to issue #%s: %s", labels, issue_number, status_code)

    # ── 3. Post comment (if enabled) ──────────────────────────
    if cfg["post_comment"]:
        comment_url = f"https://api.github.com/repos/{repo_full}/issues/{issue_number}/comments"
        custom_text = cfg.get("comment_text", "").strip()

        if custom_text:
            comment_body = render_template(custom_text, {
                "title": issue_title,
                "author": issue_author,
                "repo": repo_full,
                "number": issue_number,
                "ai_summary": ai_analysis.summary if ai_analysis else "",
                "ai_priority": ai_analysis.priority.value if ai_analysis else "",
                "ai_label": ai_analysis.suggested_label.value if ai_analysis else "",
            })
        elif ai_analysis:
            p_emoji = priority_emoji(ai_analysis.priority)
            confidence_pct = round(ai_analysis.confidence * 100)
            comment_body = (
                f"👋 Thanks for opening this issue, @{issue_author}!\n\n"
                f"**🤖 AI Triage Summary**\n\n"
                f"{p_emoji} **Priority:** {ai_analysis.priority.value} | "
                f"**Category:** `{ai_analysis.suggested_label.value}` ({confidence_pct}%)\n\n"
                f"**Summary:** {ai_analysis.summary}\n\n"
                f"---\n"
                f"_This triage was generated automatically by the GitBot AI system._"
            )
        else:
            comment_body = (
                f"👋 Thanks for opening this issue, @{issue_author}! "
                f"The bot has logged this event and will track it on the dashboard."
            )

        resp = await _github_api("POST", comment_url, user.access_token, json={"body": comment_body})
        if resp and resp.status_code in (200, 201):
            actions.append("posted comment")
        else:
            status_code = resp.status_code if resp else "no response"
            actions.append(f"comment failed ({status_code})")
            logger.warning("Failed to post comment on issue #%s: %s", issue_number, status_code)

    # ── 4. Slack notification (if enabled) ────────────────────
    if cfg["slack_notify"] and user.slack_webhook_url:
        # Check ai_skip_low_priority: skip P2/P3 if toggle is on
        skip_slack = False
        if cfg["ai_skip_low_priority"] and ai_analysis:
            if ai_analysis.priority.value in ("P2-medium", "P3-low"):
                actions.append("slack skipped (low priority)")
                skip_slack = True

        if not skip_slack:
            blocks: list[dict] = [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": "🐛 New Issue Opened"},
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Repo:*\n{repo_full}"},
                        {"type": "mrkdwn", "text": f"*Issue:*\n#{issue_number}"},
                        {"type": "mrkdwn", "text": f"*Title:*\n{issue_title}"},
                        {"type": "mrkdwn", "text": f"*Author:*\n{issue_author}"},
                    ],
                },
            ]

            # AI blocks — only if AI triage enabled and result available
            if ai_analysis and cfg.get("ai_show_priority_slack", True):
                blocks.extend(_ai_issue_blocks(ai_analysis))

            blocks.append({
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View Issue"},
                        "url": issue_url,
                        "style": "primary",
                    }
                ],
            })

            slack_ok = await _send_slack_notification(
                user.slack_webhook_url,
                {
                    "text": f"🐛 New issue in {repo_full}: {issue_title}",
                    "blocks": blocks,
                },
            )
            actions.append("slack notified" if slack_ok else "slack failed")
    elif not cfg["slack_notify"]:
        actions.append("slack skipped (disabled in settings)")
    else:
        actions.append("slack skipped (no webhook URL)")

    return "; ".join(actions), ai_dict


async def _handle_pull_request(
    payload: dict, user: User
) -> tuple[str, dict | None]:
    """
    Handle 'pull_request' event.
    Reads user's automation settings to decide which actions to take:
    1. skip_authors filter — skip bots/specific users
    2. AI analysis (if enabled) — summary, complexity, risk flags
    3. Post welcome comment (if enabled) — custom template or AI-enriched
    4. Auto-label PR (if enabled)
    5. Slack notification (if enabled) — with optional AI blocks
    """
    action = payload.get("action")
    if action != "opened":
        return f"pull_request.{action} — ignored (not opened)", None

    pr = payload.get("pull_request", {})
    repo_full = payload.get("repository", {}).get("full_name", "")
    pr_number = pr.get("number")
    pr_title = pr.get("title", "")
    pr_body = pr.get("body")
    pr_author = pr.get("user", {}).get("login", "unknown")
    pr_url = pr.get("html_url", "")
    branch = pr.get("head", {}).get("ref", "")

    # ── Load settings ─────────────────────────────────────────
    cfg = get_user_settings(user)["pull_request"]

    # ── skip_authors filter ───────────────────────────────────
    if cfg["skip_authors"] and pr_author in cfg["skip_authors"]:
        return f"skipped — author '{pr_author}' in skip list", None

    actions: list[str] = []
    ai_analysis: PRAnalysis | None = None
    ai_dict: dict | None = None

    # ── 1. AI analysis (if enabled) ───────────────────────────
    if cfg["ai_analysis"]:
        ai_analysis = await analyze_pr(pr_title, pr_body, branch)
        if ai_analysis:
            ai_dict = ai_analysis.model_dump(mode="json")
            actions.append(f"AI: {ai_analysis.complexity.value} complexity")
            logger.info(
                "AI analysis for PR #%s in %s: complexity=%s risks=%d",
                pr_number, repo_full,
                ai_analysis.complexity.value, len(ai_analysis.risk_flags),
            )
        else:
            logger.info("AI analysis skipped for PR #%s (disabled or failed)", pr_number)

    # ── 2. Welcome comment (if enabled) ───────────────────────
    if cfg["post_comment"]:
        comment_url = f"https://api.github.com/repos/{repo_full}/issues/{pr_number}/comments"
        custom_text = cfg.get("comment_text", "").strip()

        if custom_text:
            # User has a custom comment template — render and post
            comment_body = render_template(custom_text, {
                "title": pr_title,
                "author": pr_author,
                "repo": repo_full,
                "number": pr_number,
                "ai_summary": ai_analysis.summary if ai_analysis else "",
                "ai_priority": "",
                "ai_label": "",
            })
        elif ai_analysis:
            # No custom text but AI is available — use rich AI-generated comment
            c_emoji = complexity_emoji(ai_analysis.complexity)
            risk_lines = (
                "\n".join(f"  - {r}" for r in ai_analysis.risk_flags)
                if ai_analysis.risk_flags
                else "  - None detected ✅"
            )
            comment_body = (
                f"👋 Thanks for the PR, @{pr_author}!\n\n"
                f"**🤖 AI Review Summary**\n\n"
                f"**Summary:** {ai_analysis.summary}\n\n"
                f"{c_emoji} **Complexity:** {ai_analysis.complexity.value}\n\n"
                f"**⚠️ Risk flags:**\n{risk_lines}\n\n"
                f"---\n"
                f"_This analysis was generated automatically by the GitBot AI triage system._"
            )
        else:
            # Default fallback comment
            comment_body = (
                f"👋 Thanks for the PR, @{pr_author}! "
                f"The bot has logged this event and will track it on the dashboard."
            )

        resp = await _github_api(
            "POST", comment_url, user.access_token, json={"body": comment_body}
        )
        if resp and resp.status_code in (200, 201):
            actions.append("posted welcome comment")
        else:
            status_code = resp.status_code if resp else "no response"
            actions.append(f"comment failed ({status_code})")
            logger.warning("Failed to post comment on PR #%s: %s", pr_number, status_code)

    # ── 3. Auto-label PR (if enabled) ─────────────────────────
    if cfg["auto_label"]:
        labels = [cfg["label_name"]]
        label_url = f"https://api.github.com/repos/{repo_full}/issues/{pr_number}/labels"
        resp = await _github_api("POST", label_url, user.access_token, json={"labels": labels})
        if resp and resp.status_code in (200, 201):
            actions.append(f"added labels {labels}")
        else:
            status_code = resp.status_code if resp else "no response"
            actions.append(f"label failed ({status_code})")
            logger.warning("Failed to add labels %s to PR #%s: %s", labels, pr_number, status_code)

    # ── 4. Slack notification (if enabled) ────────────────────
    if cfg["slack_notify"] and user.slack_webhook_url:
        blocks: list[dict] = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "🔀 New Pull Request"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Repo:*\n{repo_full}"},
                    {"type": "mrkdwn", "text": f"*PR:*\n#{pr_number}"},
                    {"type": "mrkdwn", "text": f"*Title:*\n{pr_title}"},
                    {"type": "mrkdwn", "text": f"*Author:*\n{pr_author}"},
                ],
            },
        ]

        # AI blocks — respects ai_show_complexity and ai_flag_risks toggles
        if ai_analysis:
            if cfg.get("ai_show_complexity", True) or cfg.get("ai_flag_risks", True):
                blocks.extend(_ai_pr_blocks(ai_analysis))

        blocks.append({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View PR"},
                    "url": pr_url,
                    "style": "primary",
                }
            ],
        })

        slack_ok = await _send_slack_notification(
            user.slack_webhook_url,
            {
                "text": f"🔀 New PR in {repo_full}: {pr_title}",
                "blocks": blocks,
            },
        )
        actions.append("slack notified" if slack_ok else "slack failed")
    elif not cfg["slack_notify"]:
        actions.append("slack skipped (disabled in settings)")
    else:
        actions.append("slack skipped (no webhook URL)")

    return "; ".join(actions), ai_dict


async def _handle_push(
    payload: dict, user: User
) -> tuple[str, dict | None]:
    """
    Handle 'push' event.
    Reads user's automation settings to decide which actions to take:
    1. Branch filter — skip branches not in the whitelist
    2. AI changelog (if enabled) — summarize commits
    3. Slack notification (if enabled)
    """
    repo_full = payload.get("repository", {}).get("full_name", "")
    ref = payload.get("ref", "").replace("refs/heads/", "")
    commits = payload.get("commits", [])
    pusher = payload.get("pusher", {}).get("name", "unknown")
    compare_url = payload.get("compare", "")

    # ── Load settings ─────────────────────────────────────────
    cfg = get_user_settings(user)["push"]

    actions: list[str] = []
    ai_analysis: PushAnalysis | None = None
    ai_dict: dict | None = None

    # ── Branch filter ─────────────────────────────────────────
    if cfg["branch_filter"] and ref not in cfg["branch_filter"]:
        return f"skipped — branch '{ref}' not in branch filter", None

    # ── 1. AI changelog (if enabled) ─────────────────────────
    if cfg["ai_changelog"] and commits:
        ai_analysis = await analyze_push(commits)
        if ai_analysis:
            ai_dict = ai_analysis.model_dump(mode="json")
            actions.append("AI: changelog generated")
            logger.info("AI changelog generated for push to %s/%s", repo_full, ref)
        else:
            logger.info("AI changelog skipped for push to %s/%s (disabled or failed)", repo_full, ref)

    # Build commit list for Slack (max 5 shown)
    commit_lines = []
    for c in commits[:5]:
        short_sha = (c.get("id") or "")[:7]
        msg = (c.get("message") or "").split("\n")[0]
        commit_lines.append(f"`{short_sha}` {msg}")
    if len(commits) > 5:
        commit_lines.append(f"_…and {len(commits) - 5} more_")

    # ── 2. Slack notification (if enabled) ────────────────────
    if cfg["slack_notify"] and user.slack_webhook_url:
        blocks: list[dict] = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "🚀 New Push"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Repo:*\n{repo_full}"},
                    {"type": "mrkdwn", "text": f"*Branch:*\n{ref}"},
                    {"type": "mrkdwn", "text": f"*Pushed by:*\n{pusher}"},
                    {"type": "mrkdwn", "text": f"*Commits:*\n{len(commits)}"},
                ],
            },
        ]

        # Raw commit list
        if commit_lines:
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "\n".join(commit_lines),
                },
            })

        # AI changelog block
        if ai_analysis:
            blocks.extend(_ai_push_blocks(ai_analysis))

        if compare_url:
            blocks.append({
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View Diff"},
                        "url": compare_url,
                    }
                ],
            })

        slack_ok = await _send_slack_notification(
            user.slack_webhook_url,
            {
                "text": f"🚀 {len(commits)} commit(s) pushed to {repo_full}/{ref}",
                "blocks": blocks,
            },
        )
        actions.append("slack notified" if slack_ok else "slack failed")
    elif not cfg["slack_notify"]:
        actions.append("slack skipped (disabled in settings)")
    else:
        actions.append("slack skipped (no webhook URL)")

    return "; ".join(actions), ai_dict


# Map event type → handler
EVENT_HANDLERS: dict = {
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

    Security: Verifies HMAC-SHA256 signature (X-Hub-Signature-256).
    Idempotency: Deduplicates by X-GitHub-Delivery header + UNIQUE constraint.
    Always returns 200 to GitHub after processing (prevents exponential retries).
    """
    # Read raw body FIRST — before any parsing — so HMAC is computed on exact bytes
    body = await request.body()

    # ── Step 1: Verify signature ─────────────────────────────
    if not _verify_signature(body, x_hub_signature_256):
        logger.warning("Invalid signature for delivery %s", x_github_delivery)
        return Response(content="Invalid signature", status_code=403)

    # Parse payload after signature check
    try:
        payload = await request.json()
    except Exception:
        return Response(content="Invalid JSON", status_code=400)

    # ── Step 2: Identify the repo and user ───────────────────
    repo_full_name = payload.get("repository", {}).get("full_name")
    if not repo_full_name:
        logger.warning("Webhook payload missing repository.full_name")
        return {"status": "ignored", "reason": "no repo in payload"}

    result = await db.execute(
        select(Repo).where(Repo.repo_full_name == repo_full_name)
    )
    repo = result.scalar_one_or_none()

    if repo is None:
        logger.info("Repo %s not registered — ignoring", repo_full_name)
        return {"status": "ignored", "reason": "repo not registered"}

    result = await db.execute(select(User).where(User.id == repo.user_id))
    user = result.scalar_one_or_none()

    if user is None:
        logger.error("User for repo %s not found", repo_full_name)
        return {"status": "ignored", "reason": "user not found"}

    # ── Step 3: Deduplicate ──────────────────────────────────
    delivery_id = x_github_delivery or payload.get("delivery", "unknown")

    result = await db.execute(
        select(Event).where(Event.github_delivery_id == delivery_id)
    )
    if result.scalar_one_or_none() is not None:
        logger.info("Duplicate delivery %s — skipping", delivery_id)
        return {"status": "duplicate", "delivery_id": delivery_id}

    # ── Step 4: Process the event ────────────────────────────
    event_type = x_github_event or "unknown"
    action_taken = ""
    ai_dict: dict | None = None
    event_status = "processed"

    handler = EVENT_HANDLERS.get(event_type)
    if handler:
        try:
            action_taken, ai_dict = await handler(payload, user)
        except Exception as e:
            logger.error("Handler for %s failed: %s", event_type, e, exc_info=True)
            action_taken = f"error: {str(e)[:200]}"
            event_status = "failed"
    else:
        action_taken = f"event type '{event_type}' — no handler, logged only"

    # ── Step 5: Persist event (with AI analysis) ─────────────
    event = Event(
        repo_id=repo.id,
        github_delivery_id=delivery_id,
        event_type=event_type,
        payload=payload,
        ai_analysis=ai_dict,
        action_taken=action_taken,
        status=event_status,
    )
    db.add(event)

    try:
        await db.flush()
    except IntegrityError:
        # Race condition: another request processed this delivery ID simultaneously
        await db.rollback()
        logger.info("Race condition on delivery %s — already processed", delivery_id)
        return {"status": "duplicate", "delivery_id": delivery_id}

    logger.info(
        "Processed %s for %s: %s (ai=%s)",
        event_type,
        repo_full_name,
        action_taken,
        "yes" if ai_dict else "no",
    )

    # Always return 200 to GitHub — prevents retry storms
    return {
        "status": event_status,
        "event_type": event_type,
        "action_taken": action_taken,
        "ai_analysis": ai_dict,
        "delivery_id": delivery_id,
    }
