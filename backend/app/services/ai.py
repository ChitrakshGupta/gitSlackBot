"""
AI service — powered by Google Gemini (free tier via Google AI Studio).

Provides structured analysis of GitHub issues, pull requests, and pushes.

Design principles:
  - Every function returns None when AI is unavailable — the bot works fine without it.
  - Input is truncated to avoid token blowout on free tier.
  - Pydantic structured output guarantees valid JSON — no parsing hacks.
  - Enum constraints prevent the model from hallucinating invalid labels or priorities.
  - A lazily-initialised singleton client avoids creating a new connection per webhook.

Free tier limits (gemini-2.0-flash as of 2026):
  - 15 requests / minute
  - 1000 requests / day
  - 250,000 tokens / minute
"""

import logging
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger("ai")

# ── Lazy Gemini client singleton ────────────────────────────────────────────

_client = None  # type: ignore[assignment]


def _get_client():
    """Return a shared Gemini client, initialising it on first call."""
    global _client
    if _client is None:
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not set")
        from google import genai  # noqa: PLC0415 — deferred to keep import fast
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


# ── Structured output schemas ───────────────────────────────────────────────


class IssuePriority(str, Enum):
    """Triage priority levels. P0 = drop everything; P3 = handle when convenient."""
    P0_CRITICAL = "P0-critical"
    P1_HIGH = "P1-high"
    P2_MEDIUM = "P2-medium"
    P3_LOW = "P3-low"


class IssueLabel(str, Enum):
    """Controlled set of labels the model may suggest — prevents hallucination."""
    BUG = "bug"
    FEATURE = "feature"
    ENHANCEMENT = "enhancement"
    QUESTION = "question"
    DOCUMENTATION = "documentation"
    SECURITY = "security"
    PERFORMANCE = "performance"
    MAINTENANCE = "maintenance"
    DUPLICATE = "duplicate"
    WONTFIX = "wontfix"


class IssueSentiment(str, Enum):
    """User sentiment inferred from issue tone."""
    URGENT = "urgent"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    POSITIVE = "positive"


class IssueAnalysis(BaseModel):
    """Structured AI analysis of a GitHub issue."""
    summary: str = Field(
        description="1–2 sentence plain-English summary of the issue. "
                    "Focus on what the problem is, not how it was written."
    )
    suggested_label: IssueLabel = Field(
        description="Best-fitting label for this issue from the allowed enum values."
    )
    priority: IssuePriority = Field(
        description=(
            "Triage priority. "
            "P0 = system down / security breach / data loss. "
            "P1 = major feature broken or severely degraded. "
            "P2 = normal bug or feature request. "
            "P3 = minor, cosmetic, or nice-to-have."
        )
    )
    sentiment: IssueSentiment = Field(
        description="Overall tone of the issue author."
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score 0.0–1.0 for the suggested_label. "
                    "Use 1.0 only when the label is unambiguous."
    )


class PRComplexity(str, Enum):
    """Rough estimate of pull request scope."""
    SMALL = "small"    # < 50 lines, single concern
    MEDIUM = "medium"  # 50–300 lines or multiple concerns
    LARGE = "large"    # > 300 lines, risky surface area


class PRAnalysis(BaseModel):
    """Structured AI analysis of a GitHub pull request."""
    summary: str = Field(
        description="1–2 sentence plain-English summary of what this PR does and why."
    )
    complexity: PRComplexity = Field(
        description="Estimated scope of the change."
    )
    risk_flags: list[str] = Field(
        description=(
            "List of short risk descriptions, e.g. 'modifies authentication flow', "
            "'no tests mentioned', 'breaking API change', 'touches payment logic'. "
            "Return an empty list when no concerns are detected."
        )
    )


class PushAnalysis(BaseModel):
    """Structured AI changelog summary of a push event."""
    changelog: str = Field(
        description=(
            "2–3 sentence human-readable changelog summarising what changed in this push. "
            "Write it as if it will appear in a team Slack channel."
        )
    )


# ── Analysis functions ──────────────────────────────────────────────────────

_CANDIDATE_MODELS = [
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-3.8-flash",
]
_MAX_BODY_CHARS = 2000  # truncate to avoid free-tier token limits


def _is_ai_enabled() -> bool:
    """Return True only when a Gemini API key is configured."""
    return bool(settings.GEMINI_API_KEY)


def _generate_with_fallback(prompt: str, schema_class, system_instruction: str):
    """
    Attempt generation across candidate models in priority order.
    Handles temporary 503 spikes or availability differences gracefully.
    """
    from google import genai  # noqa: PLC0415
    client = _get_client()

    last_error = None
    for model_name in _CANDIDATE_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema_class,
                    system_instruction=system_instruction,
                ),
            )
            if response.parsed is not None:
                return response.parsed
        except Exception as exc:
            last_error = exc
            logger.warning("Gemini model %s failed: %s. Trying fallback...", model_name, exc)

    if last_error:
        logger.error("All Gemini models failed. Last error: %s", last_error)
    return None


async def analyze_issue(title: str, body: str | None) -> Optional[IssueAnalysis]:
    """
    Analyse a GitHub issue and return structured triage data.
    """
    if not _is_ai_enabled():
        return None

    body_text = (body or "No description provided.")[:_MAX_BODY_CHARS]
    prompt = f"Analyse this GitHub issue for triage.\n\nTitle: {title}\n\nBody:\n{body_text}"
    sys_inst = (
        "You are a senior software engineer acting as a GitHub issue triage assistant. "
        "Analyse the issue carefully and return structured JSON. "
        "Be concise and objective. "
        "Priority guide: "
        "P0 = system is down, security breach, or data loss. "
        "P1 = major feature broken or severely degraded UX. "
        "P2 = normal bug report or feature request. "
        "P3 = minor, cosmetic, or informational."
    )

    try:
        return _generate_with_fallback(prompt, IssueAnalysis, sys_inst)
    except Exception as exc:
        logger.error("AI issue analysis failed for '%s': %s", title, exc)
        return None


async def analyze_pr(
    title: str,
    body: str | None,
    branch: str,
) -> Optional[PRAnalysis]:
    """
    Analyse a GitHub pull request and return structured review data.
    """
    if not _is_ai_enabled():
        return None

    body_text = (body or "No description provided.")[:_MAX_BODY_CHARS]
    prompt = f"Analyse this GitHub pull request.\n\nTitle: {title}\nBranch: {branch}\n\nDescription:\n{body_text}"
    sys_inst = (
        "You are a senior software engineer reviewing a pull request. "
        "Summarise what the PR does and flag any risks. "
        "Risk examples: 'modifies authentication logic', 'no tests mentioned', "
        "'breaking API change', 'touches database schema', 'large diff'. "
        "Return an empty risk_flags list when there are no concerns."
    )

    try:
        return _generate_with_fallback(prompt, PRAnalysis, sys_inst)
    except Exception as exc:
        logger.error("AI PR analysis failed for '%s': %s", title, exc)
        return None


async def analyze_push(commits: list[dict]) -> Optional[PushAnalysis]:
    """
    Summarise a batch of push commits into a changelog entry.
    """
    if not _is_ai_enabled():
        return None

    if not commits:
        return None

    lines = []
    for c in commits[:10]:
        sha = (c.get("id") or "")[:7]
        msg = (c.get("message") or "").split("\n")[0]
        lines.append(f"- {sha}: {msg}")
    if len(commits) > 10:
        lines.append(f"  … and {len(commits) - 10} more commits")

    commit_text = "\n".join(lines)
    prompt = f"Summarise these git commits into a team changelog entry:\n\n{commit_text}"
    sys_inst = (
        "You are a technical writer creating a concise team changelog. "
        "Write the summary as if it will be posted to a team Slack channel. "
        "Be informative but brief — 2 to 3 sentences maximum."
    )

    try:
        return _generate_with_fallback(prompt, PushAnalysis, sys_inst)
    except Exception as exc:
        logger.error("AI push analysis failed: %s", exc)
        return None


# ── Priority display helpers ────────────────────────────────────────────────

_PRIORITY_EMOJI = {
    IssuePriority.P0_CRITICAL: "🔴",
    IssuePriority.P1_HIGH: "🟠",
    IssuePriority.P2_MEDIUM: "🟡",
    IssuePriority.P3_LOW: "🟢",
}

_COMPLEXITY_EMOJI = {
    PRComplexity.SMALL: "🟢",
    PRComplexity.MEDIUM: "🟡",
    PRComplexity.LARGE: "🔴",
}


def priority_emoji(priority: IssuePriority) -> str:
    return _PRIORITY_EMOJI.get(priority, "⚪")


def complexity_emoji(complexity: PRComplexity) -> str:
    return _COMPLEXITY_EMOJI.get(complexity, "⚪")
