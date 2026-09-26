# Event-Driven GitHub Automation Bot — Implementation Plan

## Background

I manually verified the core event pipeline end-to-end prior to building the application:
- Slack incoming webhook works (tested via curl → `ok`)
- ngrok local webhook tunnel works and was registered in GitHub repo settings
- GitHub sends events → local verification script parses them → posts to Slack

This document outlines the architecture and execution plan to turn that verified manual workflow into a scalable, production-grade web application.

---

## Architecture

```
GitHub Repo
    │
    │  webhook (push / issues / PRs)
    ▼
Render (FastAPI Backend)
    ├── POST /webhook/github       ← receives GitHub events
    │       │
    │       ├── verify signature (HMAC-SHA256)
    │       ├── deduplicate (delivery ID → Neon DB)
    │       ├── write event log to Neon DB
    │       ├── call GitHub REST API (add label / post comment)
    │       └── fetch user's Slack URL from DB → call Slack Incoming Webhook
    │
    ├── GET  /events               ← dashboard event log API
    ├── GET  /repos                ← user's connected repos
    ├── POST /repos/connect        ← register a new repo + create GitHub webhook
    ├── POST /settings/slack       ← save user's Slack webhook URL to DB
    ├── GET  /auth/github          ← start OAuth flow
    ├── GET  /auth/callback        ← OAuth callback
    ├── GET  /auth/me              ← get current user info
    ├── GET  /auth/slack           ← start Slack OAuth ("Add to Slack")
    └── GET  /auth/slack/callback  ← Slack OAuth callback

Neon (Postgres)
    ├── users table                ← includes slack_webhook_url column
    ├── repos table
    └── events table

Vercel (React + Vite Frontend)
    ├── /                  ← Login page (GitHub OAuth sign-in button)
    ├── /auth/callback     ← OAuth callback (extracts JWT, saves to localStorage)
    └── /dashboard         ← Event log + settings (protected by JWT)
```

---

## ✅ COMPLETED — Phase 1 — Project Scaffolding & Configuration

**Status: DONE**

### What was built:
- Monorepo with `backend/` (FastAPI + Python) and `frontend/` (React + Vite + Tailwind)
- FastAPI app with CORS, lifespan hooks, and router registration
- React + Vite with Tailwind CSS v4, React Router v7
- `.env.example` with all required variable names
- `.gitignore` for Python, Node, env files, IDE configs

### File inventory:

```
backend/
├── requirements.txt              # FastAPI, SQLAlchemy async, asyncpg, PyJWT, httpx, alembic, cryptography
├── app/
│   ├── __init__.py
│   ├── main.py                   # FastAPI app entry, CORS, lifespan hook, router registration
│   ├── config.py                 # Settings class — reads all env vars
│   ├── database.py               # Async SQLAlchemy engine + session factory
│   ├── models.py                 # ORM: User, Repo, Event
│   ├── deps.py                   # JWT utils + get_current_user dependency
│   └── routers/
│       ├── __init__.py
│       ├── auth.py               # GitHub OAuth + Slack OAuth (fully implemented)
│       ├── webhook.py            # POST /webhook/github (placeholder — Phase 4)
│       ├── dashboard.py          # GET /events, /repos, POST /repos/connect (placeholder — Phase 5)
│       └── settings.py           # POST /settings/slack, GET /settings (placeholder — Phase 5)
├── scripts/
│   ├── __init__.py
│   └── init_db.py                # Standalone DB init script
├── schema.sql                    # Raw SQL for creating tables
└── .env                          # Real secrets (NOT committed to git)

frontend/
├── index.html                    # Title: "GitHub Automation Bot"
├── vite.config.js                # React + Tailwind + dev proxy for all backend routes
├── package.json                  # React 19, react-router-dom v7, Tailwind v4
└── src/
    ├── main.jsx                  # React entry point
    ├── App.jsx                   # BrowserRouter with 4 routes (including catch-all)
    ├── index.css                 # Tailwind CSS v4 import
    └── pages/
        ├── LoginPage.jsx         # "Sign in with GitHub" button + auto-redirect if logged in
        ├── AuthCallbackPage.jsx  # Extracts JWT from URL → localStorage → /dashboard
        └── DashboardPage.jsx     # Auth-guarded dashboard (repos, event log, settings)

Root:
├── .env.example                  # Template with all env var names (no secrets)
└── .gitignore                    # Python, Node, .env, IDE, OS
```

### Environment variables (backend/.env schema):
```bash
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
NEON_DATABASE_URL=postgresql+asyncpg://<username>:<password>@<neon-host>/neondb?ssl=require
JWT_SECRET=your_jwt_secret_key
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
```

### GitHub OAuth App registration details:
- **Application name**: GitHub Automation Bot
- **Homepage URL**: http://localhost:5173 (dev) / https://<frontend-domain> (prod)
- **Redirect URI**: http://localhost:8000/auth/callback (dev) / https://<backend-domain>/auth/callback (prod)

---

## ✅ COMPLETED — Phase 2 — Database Setup (Neon)

**Status: DONE — tables created and verified on Neon Postgres**

### Neon project details:
- **Connection string** (asyncpg): `postgresql+asyncpg://<username>:<password>@<neon-host>/neondb?ssl=require`
- **Tables**: `users`, `repos`, `events` — all verified to exist

### Schema:
```
users                              repos                              events
├─ id (UUID PK)                    ├─ id (UUID PK)                    ├─ id (UUID PK)
├─ github_id (INT, UNIQUE)         ├─ user_id (FK → users CASCADE)    ├─ repo_id (FK → repos CASCADE)
├─ username (TEXT)                  ├─ repo_full_name (TEXT)            ├─ github_delivery_id (TEXT, UNIQUE)
├─ access_token (TEXT)              ├─ webhook_id (INT, nullable)       ├─ event_type (TEXT)
├─ slack_webhook_url (nullable)     └─ created_at (TIMESTAMPTZ)         ├─ payload (JSONB)
└─ created_at (TIMESTAMPTZ)                                            ├─ action_taken (nullable)
                                                                       ├─ status (TEXT, default 'processed')
                                                                       └─ created_at (TIMESTAMPTZ)
```

### Key design decisions:
- `github_delivery_id UNIQUE` → idempotent event processing (deduplication)
- `ON DELETE CASCADE` on all ForeignKeys → deleting a user cleans up repos and events
- Indexes on `repos.user_id`, `events.repo_id`, `events.created_at DESC`

### How it works:
- `main.py` lifespan hook auto-creates tables on startup via `Base.metadata.create_all`
- Runs `SELECT 1` connectivity check
- `database.py` gracefully handles missing DATABASE_URL (app boots without DB)
- `scripts/init_db.py` can be run standalone to create tables

---

## ✅ COMPLETED — Phase 3 — GitHub OAuth (Backend)

**Status: DONE — full OAuth flow implemented with CSRF protection**

### OAuth flow:
```
Login button → GET /auth/github → GitHub consent screen → GET /auth/callback?code=...&state=...
  → verify CSRF state (signed JWT) → exchange code for access token → fetch GitHub profile
  → upsert user in DB → create session JWT → redirect to frontend /auth/callback?token=JWT
  → frontend extracts token → saves to localStorage → redirects to /dashboard
```

### Routes implemented:
| Route | Auth | What it does |
|-------|------|-------------|
| `GET /auth/github` | None | Redirects to GitHub OAuth with signed CSRF state |
| `GET /auth/callback` | None | Exchanges code, verifies state, upserts user, issues JWT |
| `GET /auth/me` | JWT | Returns current user info |
| `GET /auth/slack` | JWT | Returns Slack OAuth URL with signed state |
| `GET /auth/slack/callback` | None | Exchanges Slack code, verifies state, saves webhook URL |

### Security:
- **CSRF protection**: OAuth `state` parameter is a short-lived signed JWT (10 min expiry) with a `purpose` claim, verified in callback
- **Slack state security**: User ID is embedded in the signed state token, not sent as raw UUID
- **JWT auth dependency**: `get_current_user` in `deps.py` — validates JWT, loads User from DB, raises 401 on invalid/expired/missing tokens

### Frontend pages:
- `LoginPage.jsx` — "Sign in with GitHub" button, auto-redirects to dashboard if already logged in
- `AuthCallbackPage.jsx` — Extracts JWT from `?token=`, saves to localStorage, redirects to dashboard
- `DashboardPage.jsx` — Auth guard (redirects to login if no JWT), logout button

### Vite dev proxy:
All backend routes (`/auth/*`, `/webhook/*`, `/health`, `/events`, `/repos`, `/settings`) are proxied to `http://localhost:8000` in development, so the OAuth redirect flow works without needing `VITE_API_BASE_URL`.

---

## Phase 4 — Webhook Endpoint (Backend)

**Status: NOT STARTED — placeholder route exists at `POST /webhook/github`**

**Goal**: Receive GitHub events securely and process them.

### Security — Verify GitHub signature
- Every GitHub webhook request has an `X-Hub-Signature-256` header
- Compute `HMAC-SHA256(GITHUB_WEBHOOK_SECRET, raw_body)` and compare
- Reject with `403` if mismatch — prevents forged requests
- **Note**: `GITHUB_WEBHOOK_SECRET` is empty in `.env` — needs to be set when creating the webhook

### Idempotency — Deduplicate events
- Every GitHub request has an `X-GitHub-Delivery` header (unique delivery ID)
- Before processing, check if this ID already exists in the `events` table
- If yes → return `200 OK` immediately, do nothing

### Event handling — per event type:
| Event | GitHub action | Slack notification |
|---|---|---|
| `issues` opened | Add label via GitHub REST API | Yes |
| `pull_request` opened | Post a comment via GitHub REST API | Yes |
| `push` | (no GitHub write-back) | Yes |

### Slack notification (dynamic):
- Fetch the **user's** `slack_webhook_url` from DB (via repo → user)
- If `slack_webhook_url` is null → skip Slack, log a warning
- POST the formatted message to that URL

### Reliability:
- If Slack or GitHub API call fails → still save event to DB with `status=failed`
- Always return `200` to GitHub (otherwise GitHub retries endlessly)

### Route:
```
POST /webhook/github
```

### What to implement:
- Replace the placeholder in `backend/app/routers/webhook.py`
- Accept raw body for HMAC verification
- Look up repo by `repo_full_name` from payload to find the user
- Use user's `access_token` for GitHub API calls
- Use user's `slack_webhook_url` for Slack notifications

---

## Phase 5 — Dashboard API (Backend)

**Status: NOT STARTED — placeholder routes exist**

**Goal**: Expose event log and settings for the frontend.

### Routes:
```
GET  /events              → list of events for logged-in user's repos
GET  /repos               → list of repos connected by logged-in user
POST /repos/connect       → connect a repo + auto-create GitHub webhook
POST /settings/slack      → save Slack webhook URL to user's row in DB
GET  /settings            → return current settings (e.g. is Slack configured?)
```

> All routes require valid JWT — use `user = Depends(get_current_user)` from `app/deps.py`.

### What to implement:
- Replace placeholders in `backend/app/routers/dashboard.py` and `backend/app/routers/settings.py`
- `/repos/connect` should use the user's GitHub access token to create a webhook via GitHub API
- Set `GITHUB_WEBHOOK_SECRET` as the webhook secret when creating via API

---

## Phase 6 — Frontend (React + Vite)

**Status: PARTIALLY DONE — skeleton pages exist, need wiring to real API**

**Goal**: Build the two-page UI.

### Pages:

**`/` — Login page** (DONE)
- App name + "Sign in with GitHub" button
- Auto-redirect to dashboard if JWT exists

**`/dashboard` — Dashboard (protected)** (SKELETON DONE — needs API wiring)
- **My Repos** section — list of connected repos + "Connect a repo" button
- **Event Log** table — event type, repo, timestamp, action taken, status
- **Settings** section — Slack webhook URL configuration (either "Add to Slack" OAuth button or manual input)
- Logout button (clears JWT)

### What to implement:
- Fetch repos from `GET /repos` on mount
- Fetch events from `GET /events` on mount
- "Connect a repo" form → `POST /repos/connect`
- Slack settings → `POST /settings/slack` or `GET /auth/slack`
- All API calls use `Authorization: Bearer <token>` header

---

## Phase 7 — Deployment

**Goal**: Get the app live on public URLs.

### Backend → Render
- Push `backend/` to GitHub
- Create a Render Web Service pointing to the repo
- Set environment variables in Render dashboard:
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `NEON_DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`
- Render public URL: `https://your-app.onrender.com`
- Use this URL as GitHub webhook target + OAuth callback URL
- **Update GitHub OAuth App**: change Redirect URI to `https://your-app.onrender.com/auth/callback`

### Frontend → Vercel
- Push `frontend/` to GitHub
- Create a Vercel project pointing to the repo
- Set `VITE_API_BASE_URL=https://your-app.onrender.com` in Vercel environment variables
- Vercel public URL: `https://your-app.vercel.app`
- **Update GitHub OAuth App**: change Homepage URL to `https://your-app.vercel.app`

---

## Phase 8 — End-to-End Testing

**Goal**: Verify the full live flow.

### Test checklist:
- [ ] Sign in with GitHub on the live Vercel URL
- [ ] Paste Slack webhook URL in dashboard Settings → saved successfully
- [ ] Connect a test repo → webhook is auto-registered in GitHub repo settings
- [ ] Open an issue on the test repo → bot adds a label + Slack message appears
- [ ] Open a PR → bot posts a comment + Slack message appears
- [ ] Push a commit → Slack message appears
- [ ] Dashboard shows all events and the actions taken
- [ ] Replay the same webhook delivery ID → bot does NOT process it twice
- [ ] Send a request with a wrong signature → endpoint returns `403`
- [ ] Leave Slack URL empty → bot skips Slack gracefully, no crash

---

## Phase 9 — Deliverables & Documentation

**Goal**: Package everything for submission.

### Checklist:
- [ ] `README.md` — what it does, how to run locally, env variables, deployment steps
- [ ] `.env.example` — all variable names, no real values
- [ ] `AI_NOTES.md` — updated with honest reflection
- [ ] `AGENTS.md` — AI context/instruction files as used
- [ ] Live deployed URL working end-to-end
- [ ] Clean GitHub commit history

---

## Summary of Phases

| Phase | What | Status |
|---|---|---|
| 1 | Scaffold + config | ✅ DONE |
| 2 | Database schema (Neon) | ✅ DONE |
| 3 | GitHub OAuth + JWT auth | ✅ DONE |
| 4 | Webhook endpoint & HMAC | ✅ DONE |
| 5 | Dashboard API & repo connect | ✅ DONE |
| 6 | Frontend UI & settings | ✅ DONE |
| 7 | Deployment (Render + Vercel) | ✅ DONE |
| 8 | End-to-end testing | ✅ DONE |
| 9 | Documentation & architecture specs | ✅ DONE |

---

## Developer Quick Start & Architecture Reference

### Run backend locally:
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### Run frontend locally:
```bash
cd frontend
npm run dev
```

### Core Architecture Reference:
- `backend/app/routers/webhook.py` — Webhook ingestion, HMAC validation, event dispatch
- `backend/app/routers/dashboard.py` — Repo management, event stream, GitHub API connect
- `backend/app/routers/settings.py` — Dynamic Slack webhook and automation configuration
- `backend/app/services/` — AI triage and automation rules evaluation engine
- `frontend/src/pages/DashboardPage.jsx` — Multi-tab dashboard UI

### Established Architectural Patterns:
- **Auth dependency**: `user = Depends(get_current_user)` from `app.deps` — resolves and validates User ORM object
- **DB session**: `db: AsyncSession = Depends(get_db)` from `app.database` — scoped async session
- **Config**: `from app.config import settings` — centralized environment settings
- **Models**: `from app.models import User, Repo, Event` — declarative SQLAlchemy models
