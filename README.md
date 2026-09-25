# gitSlackBot

A GitHub automation bot that connects your repos, auto-labels issues, comments on PRs, and sends real-time Slack notifications — all from a single dashboard.

## Features

- 🔐 **GitHub OAuth** — Sign in with GitHub, no manual token setup
- 📁 **Repo Picker** — Search and connect any of your GitHub repos (like Render/Vercel)
- 🤖 **Auto-label Issues** — New issues automatically get `bot-triaged` label
- 🔀 **PR Comments** — Bot posts a welcome comment on every new pull request
- 🚀 **Slack Alerts** — Real-time push/issue/PR notifications to your Slack channel
- 📊 **Event Dashboard** — See all processed events in one place
- 🔔 **Add to Slack** — One-click Slack OAuth (no manual webhook URL needed)

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI + Python 3.12 |
| Database | Neon (Postgres) + SQLAlchemy async |
| Frontend | React + Vite + Tailwind CSS v4 |
| Auth | GitHub OAuth + JWT |
| Notifications | Slack Incoming Webhooks |
| Deployment | Render (backend) + Vercel (frontend) |

## Local Development

### Prerequisites
- Python 3.12+
- Node 18+
- Neon Postgres database
- GitHub OAuth App
- Slack App (for Slack OAuth)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your credentials
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Environment Variables

See `backend/.env.example` for all required variables.

## Deployment

- **Backend** → [Render](https://render.com) (free tier)
- **Frontend** → [Vercel](https://vercel.com) (free tier)
- **Uptime** → [UptimeRobot](https://uptimerobot.com) pings `/health` every 5 minutes

## License

MIT
