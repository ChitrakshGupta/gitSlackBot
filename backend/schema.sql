-- =============================================================
-- Event-Driven GitHub Automation Bot — Database Schema
-- Target: Neon (PostgreSQL 16+)
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id       INTEGER     NOT NULL UNIQUE,
    username        TEXT        NOT NULL,
    access_token    TEXT        NOT NULL,
    slack_webhook_url TEXT      NULL,
    automation_settings JSONB   NULL,               -- user-configured automation toggles (null = use defaults)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Repos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repos (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repo_full_name  TEXT        NOT NULL,
    webhook_id      INTEGER     NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repos_user_id ON repos(user_id);

-- ── Events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id             UUID    NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    github_delivery_id  TEXT    NOT NULL UNIQUE,   -- deduplication key
    event_type          TEXT    NOT NULL,           -- push, issues, pull_request
    payload             JSONB   NOT NULL,
    ai_analysis         JSONB   NULL,               -- structured Gemini output (null when AI disabled)
    action_taken        TEXT    NULL,               -- what the bot did
    status              TEXT    NOT NULL DEFAULT 'processed',  -- processed / failed
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_repo_id    ON events(repo_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
