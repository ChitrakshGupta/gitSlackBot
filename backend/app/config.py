"""
Centralised configuration — loaded once from environment variables.
"""

import os
from dotenv import load_dotenv

load_dotenv()  # reads .env in the backend/ directory


class Settings:
    """Application settings sourced from environment variables."""

    # GitHub OAuth
    GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "")

    # GitHub Webhook signature verification
    GITHUB_WEBHOOK_SECRET: str = os.getenv("GITHUB_WEBHOOK_SECRET", "")

    # Slack OAuth (for "Add to Slack" button)
    SLACK_CLIENT_ID: str = os.getenv("SLACK_CLIENT_ID", "")
    SLACK_CLIENT_SECRET: str = os.getenv("SLACK_CLIENT_SECRET", "")
    # Default Slack webhook URL — auto-assigned to new users on signup
    DEFAULT_SLACK_WEBHOOK_URL: str = os.getenv("DEFAULT_SLACK_WEBHOOK_URL", "")

    # Neon Postgres connection string  (async driver)
    DATABASE_URL: str = os.getenv("NEON_DATABASE_URL", "")

    # JWT signing key
    JWT_SECRET: str = os.getenv("JWT_SECRET", "change-me-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24

    # URLs
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")
    # Public URL for GitHub webhook delivery (use ngrok URL in dev)
    # Falls back to BACKEND_URL if not set
    WEBHOOK_URL: str = os.getenv("WEBHOOK_URL", "") or os.getenv("BACKEND_URL", "http://localhost:8000")

    # CORS origins
    @property
    def CORS_ORIGINS(self) -> list[str]:
        extra = os.getenv("CORS_ORIGINS", "")
        origins = [self.FRONTEND_URL]
        if extra:
            origins.extend([o.strip() for o in extra.split(",") if o.strip()])
        return origins


settings = Settings()
