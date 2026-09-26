# gitSlackBot

A GitHub automation bot that connects your repos, auto-labels issues, comments on PRs, and sends real-time Slack notifications — all from a dashboard.


**Live app → [https://git-slack-bot.vercel.app](https://git-slack-bot.vercel.app)**  
**API → [https://git-slack-bot-api.onrender.com](https://git-slack-bot-api.onrender.com)**

---

## What the App Does

GitSlackBot connects your GitHub repositories to Slack through a fully automated event pipeline:

1. **Sign in with GitHub** — OAuth grants the bot permission to read repos and write labels/comments on your behalf.
2. **Connect a repository** — Pick any repo you own from the searchable onboarding screen; the app installs a webhook automatically via the GitHub API.
3. **Receive webhook events** — GitHub delivers `issues`, `pull_request`, and `push` events to your endpoint.
4. **Act on GitHub** — For new issues the bot adds a `bot-triaged` label; for new PRs it posts a welcome comment.
5. **Notify Slack** — Rich Block Kit messages go to your Slack channel in real time.
6. **AI triage (stretch goal)** — Each event is run through Gemini 2.0 Flash: issues get a priority score + suggested label, PRs get a complexity rating + code-quality tip, pushes get a one-line changelog summary. Results appear in both the Slack notification and the dashboard.
7. **Dashboard** — Protected behind login; shows every processed event, the action the bot took, and the AI analysis.
8. **Configurable automation** — Toggle each automation on/off from the Settings panel without redeploying.

### Event types handled

| Event | GitHub write-back | Slack notification | AI analysis |
|-------|-------------------|--------------------|-------------|
| `issues` (opened) | Adds `bot-triaged` label | ✅ Rich Block Kit | Priority + suggested label |
| `pull_request` (opened) | Posts welcome comment | ✅ Rich Block Kit | Complexity rating + tip |
| `push` | — | ✅ Rich Block Kit | Changelog summary |

### Security & reliability highlights

- **HMAC-SHA256 signature verification** on every incoming webhook (`X-Hub-Signature-256`)
- **Idempotent event processing** — `github_delivery_id UNIQUE` constraint prevents duplicate actions even if GitHub re-delivers
- **Stateless CSRF protection** — OAuth `state` parameter is a short-lived signed JWT (not in-memory dict), survives server restarts and multiple workers
- **Secrets never in client-side code or logs**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.12 |
| Database | Neon (Postgres 16) + SQLAlchemy async |
| Frontend | React 18 + Vite + Tailwind CSS v4 |
| Auth | GitHub OAuth + JWT |
| Notifications | Slack Incoming Webhooks (via Slack OAuth "Add to Slack") |
| AI | Google Gemini 2.0 Flash (free tier, optional) |
| Deployment | Render (backend) + Vercel (frontend) |
| Uptime | UptimeRobot pings `/health` every 5 min to prevent Render cold starts |

---

## Local Development

### Prerequisites

- Python 3.12+
- Node 18+
- A [Neon](https://neon.tech) Postgres database (free, no card)
- A GitHub OAuth App
- A Slack App with an Incoming Webhook URL
- (Optional) [ngrok](https://ngrok.com) for receiving live webhooks locally — the app starts it automatically if `pyngrok` is installed

### 1. Clone and configure

```bash
git clone https://github.com/<your-username>/gitSlackBot.git
cd gitSlackBot
cp .env.example backend/.env   # then fill in your credentials
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

On startup the server:
- Creates / migrates all database tables automatically
- Starts an ngrok tunnel in the background (if `BACKEND_URL` is `http://localhost:*` and `pyngrok` is installed)
- Prints the public webhook URL to the console

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The Vite config proxies `/api/*` to `http://localhost:8000` so you only need one origin during development.

### 4. GitHub OAuth App settings

In your GitHub OAuth App:
- **Homepage URL**: `http://localhost:5173`
- **Authorization callback URL**: `http://localhost:5173/auth/callback`

### 5. Slack App settings

Create a Slack App and add the **Incoming Webhooks** feature. Copy the webhook URL into your `.env`.  
For the "Add to Slack" button, configure the OAuth redirect URL to `http://localhost:8000/auth/slack/callback`.

---

## Environment Variables

Copy `.env.example` to `backend/.env` and fill in your values. **Never commit real secrets.**

```
# ── GitHub OAuth ──────────────────────────────────────────
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# ── GitHub Webhook Signature Verification ────────────────
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# ── Slack OAuth ("Add to Slack" button) ──────────────────
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret

# ── Neon Postgres (async connection string) ──────────────
# Format: postgresql+asyncpg://user:pass@host/dbname?sslmode=require
NEON_DATABASE_URL=postgresql+asyncpg://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require

# ── JWT Signing ──────────────────────────────────────────
JWT_SECRET=your_jwt_secret_at_least_32_chars

# ── AI (Google Gemini — free tier, no credit card required) ──
# Get your free API key at: https://aistudio.google.com/app/apikey
# Leave blank to disable AI features — the bot works fine without it.
GEMINI_API_KEY=your_gemini_api_key

# ── URLs ─────────────────────────────────────────────────
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000

# ── Extra CORS origins (comma-separated, optional) ──────
# CORS_ORIGINS=https://your-app.vercel.app
```

> **Note:** `SLACK_WEBHOOK_URL` is not here. Each user's Slack webhook URL is obtained via the "Add to Slack" OAuth flow and stored per-user in the database.

See [`.env.example`](.env.example) for the full annotated reference.

---

## Deployment

### Backend — [Render](https://render.com) (free tier)

1. Create a new **Web Service** on Render, point it at the `backend/` directory.
2. Set the **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Add all environment variables from `.env.example` in the Render dashboard (set `BACKEND_URL` to your Render URL and `FRONTEND_URL` to your Vercel URL).
4. The app auto-creates database tables on startup — no manual migration step.

### Frontend — [Vercel](https://vercel.com) (free tier)

1. Import the `frontend/` directory into Vercel.
2. Set the environment variable `VITE_API_URL` to your Render backend URL.
3. Deploy — Vercel picks up `vercel.json` automatically and rewrites `/api/*` to the backend.

### Uptime (prevent Render cold starts)

Create a free [UptimeRobot](https://uptimerobot.com) monitor pinging `GET https://<your-render-url>/health` every 5 minutes. The `/health` endpoint is lightweight and returns database + tunnel status.

### GitHub OAuth & Webhook config for production

Update your GitHub OAuth App callback to your Vercel URL:
```
https://your-app.vercel.app/auth/callback
```

The app registers webhooks on connected repos automatically via the GitHub API — no manual webhook setup needed.

---

## Testing the App

### Quick end-to-end test

1. Open the live URL: **https://git-slack-bot.vercel.app**
2. Click **Sign in with GitHub** and authorize the app.
3. On the onboarding screen, search for and select any **public repo you own** (or use the demo repo below).
4. Click **Connect Repository** — the app installs a webhook automatically.
5. On that repo, open a new Issue. Within seconds:
   - The issue should receive a `bot-triaged` label
   - Your Slack channel should receive a notification
   - The Dashboard tab should show the event and the AI triage
6. Open a new Pull Request on the same repo. Within seconds:
   - The bot should post a welcome comment on the PR
   - Your Slack channel should receive a notification
7. Push a commit. The Slack channel should receive a push notification with an AI-generated changelog.

### Demo repository

You can point the webhook at this throwaway public repo:  
**https://github.com/chitrakshgupta/gitslackbot-demo**

Open issues or PRs there after connecting it in the dashboard — the bot will process them.

### Verify webhook delivery

1. Go to your repo on GitHub → **Settings → Webhooks**
2. Click on the webhook the bot installed
3. Under **Recent Deliveries**, you can see each payload, the response code (should be `200`), and re-deliver any event

### Manual API test (no browser)

```bash
# Health check
curl https://git-slack-bot-api.onrender.com/health

# Expected response:
# {"status":"ok","database":"connected","webhook_url":"https://git-slack-bot-api.onrender.com/webhook/github"}
```

---

## Project Structure

```
gitSlackBot/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, lifespan, CORS, ngrok
│   │   ├── config.py         # Pydantic settings (reads .env)
│   │   ├── database.py       # SQLAlchemy async engine + session
│   │   ├── models.py         # ORM models: User, Repo, Event
│   │   ├── deps.py           # FastAPI dependencies (auth, DB)
│   │   ├── routers/
│   │   │   ├── auth.py       # GitHub OAuth + Slack OAuth
│   │   │   ├── webhook.py    # Webhook receiver, HMAC verify, event dispatch
│   │   │   ├── dashboard.py  # Dashboard & events API
│   │   │   └── settings.py   # User automation settings API
│   │   └── services/
│   │       ├── ai.py         # Gemini 2.0 Flash integration
│   │       └── automation.py # Configurable automation rules engine
│   ├── schema.sql            # Raw SQL schema reference
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── OnboardingPage.jsx  # Repo picker + Slack connect
│       │   ├── DashboardPage.jsx   # Event log + settings
│       │   └── AuthCallbackPage.jsx
│       └── api.js            # Typed API client
├── .env.example              # All env vars (no real secrets)
├── AI_NOTES.md               # AI collaboration notes
└── IMPLEMENTATION_PLAN.md    # Living design doc used during development
```

---

## AI Context Files

The file I used as my primary AI context document is [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). I updated it at the start of each session so the AI (Claude via Cursor, and Gemini via Antigravity) always had full project state without me re-explaining the architecture.

See [`AI_NOTES.md`](AI_NOTES.md) for the full account of how I used AI tools, key decisions I made myself, and the hardest bug the AI led me into.

---

## License

MIT
