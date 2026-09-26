"""
Configurable automation settings service.

Stores user preferences as a single JSONB blob on the users table.
The webhook handlers read these settings before executing each action,
allowing users to toggle behaviours on/off from the dashboard.

Design:
- No separate rules table — just one JSONB column on users
- Merge with defaults at read time: new settings added later automatically
  inherit the default value for existing users without any migration
- Template variables: {{author}}, {{title}}, {{repo}}, etc. in comment text
"""

from __future__ import annotations

import copy
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import User


# ── Default settings ─────────────────────────────────────────────────────────
#
# These are the values used when a user has never saved custom settings.
# They also serve as the "schema" — add new keys here and all existing users
# automatically get the default value (via the merge in get_user_settings).

DEFAULT_SETTINGS: dict = {
    "issues": {
        # Auto-apply a label to every new issue
        "auto_label": True,
        "label_name": "bot-triaged",
        # Send a Slack notification for new issues
        "slack_notify": True,
        # AI triage — classify issues with Gemini
        "ai_triage": True,
        # Apply the AI-suggested label in addition to label_name
        "ai_apply_label": True,
        # Show priority badge (P0–P3) in the Slack message
        "ai_show_priority_slack": True,
        # Skip Slack for P2-medium and P3-low issues (reduce noise)
        "ai_skip_low_priority": False,
        # Post a comment on new issues
        "post_comment": False,
        "comment_text": "",
        # Only trigger if any of these keywords appear in the issue title
        # (empty list = no filter — always trigger)
        "keyword_filter": [],
    },
    "pull_request": {
        # Post a welcome comment on every new PR
        "post_comment": True,
        "comment_text": "👋 Thanks for the PR, @{{author}}! The bot has logged this event.",
        # Send a Slack notification for new PRs
        "slack_notify": True,
        # AI analysis — summarize PR and flag risks
        "ai_analysis": True,
        # Show complexity rating (small/medium/large) in Slack
        "ai_show_complexity": True,
        # Highlight risky PRs (breaking changes, missing tests, etc.)
        "ai_flag_risks": True,
        # Auto-apply a label to every new PR
        "auto_label": False,
        "label_name": "needs-review",
        # Skip all actions for these GitHub usernames (bots, renovate, etc.)
        "skip_authors": [],
    },
    "push": {
        # Send a Slack notification for every push
        "slack_notify": True,
        # AI changelog — summarize commit messages
        "ai_changelog": True,
        # Only notify for pushes to these branches
        # (empty list = all branches)
        "branch_filter": [],
    },
}


def get_user_settings(user: "User") -> dict:
    """
    Return the effective automation settings for a user.

    Merges the user's saved overrides with DEFAULT_SETTINGS so that:
    - New settings added after a user last saved still get the default value.
    - Users with no saved settings get the full defaults.
    - Null or non-dict section overrides are safely ignored.
    - Mutable lists like filters are deep-copied to prevent shared reference bugs.
    """
    if not user.automation_settings or not isinstance(user.automation_settings, dict):
        return copy.deepcopy(DEFAULT_SETTINGS)

    merged: dict = {}
    for event_type, defaults in DEFAULT_SETTINGS.items():
        base = copy.deepcopy(defaults)
        user_overrides = user.automation_settings.get(event_type)
        if isinstance(user_overrides, dict):
            base.update(user_overrides)
        merged[event_type] = base
    return merged


def render_template(template: str, context: dict) -> str:
    """
    Replace {{variable}} placeholders in template with values from context.

    Supported variables:
      {{title}}       — Issue/PR title
      {{author}}      — GitHub username
      {{repo}}        — Full repo name (owner/repo)
      {{number}}      — Issue/PR number
      {{ai_summary}}  — AI-generated summary
      {{ai_priority}} — AI priority (P0-critical, etc.)
      {{ai_label}}    — AI suggested label
    """
    result = template
    for key, value in context.items():
        result = result.replace(f"{{{{{key}}}}}", str(value or ""))
    return result
