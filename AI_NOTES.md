# AI_NOTES

## Tools and Models Used

I used **Claude** (via Cursor) and **Google Gemini** (via Antigravity) as my primary AI assistants. I also maintained an `IMPLEMENTATION_PLAN.md` as a living context file — updated at the start of each session so the AI always had full project state without re-explaining.

- **Me (~60%)**: Architecture design, manual end-to-end pipeline verification before writing app code, security decisions (HMAC verification, signed JWT CSRF state tokens), OAuth + webhook integration debugging, database schema design (idempotency via `github_delivery_id UNIQUE`), and deployment configuration.
- **AI (~40%)**: Boilerplate scaffolding (FastAPI project structure, SQLAlchemy models, React component skeletons), Slack Block Kit JSON payloads, and test suite generation.

---

## Key Decisions I Made (Not the AI)

### 1. Manual Pipeline Verification Before Writing Any Code

Before touching FastAPI or React, I verified the entire event flow end-to-end using only the terminal:

1. Tested Slack incoming webhook via `curl` → received `ok`
2. Set up ngrok → got a public endpoint (`https://nondeficient-zayn-skeptically.ngrok-free.dev`)
3. Registered endpoint in a GitHub repo's webhook settings (send-all)
4. Wrote a script that parsed incoming GitHub payloads and forwarded them to Slack

This proved the integration worked — GitHub delivers events to my endpoint, my script parses them, Slack receives the notification — before wrapping anything in a framework. When I eventually built the FastAPI webhook handler, I already knew exactly what GitHub's raw payload looked like and what Slack expected. The AI would have jumped straight to building the full app; validating the pipeline first saved me from "is it my code or the webhook config?" debugging later.

### 2. End-to-End Dual-OAuth Architecture (GitHub + Slack) with Stateless Security

Rather than letting the AI assemble a generic, naive OAuth template, I designed the complete dual-OAuth flow myself to handle two distinct third-party platforms with different requirements:

- **Dual-Provider Architecture**:
  - **GitHub OAuth**: Authenticates user identity and grants repo-level API scopes (enabling the bot to auto-label issues and comment on PRs).
  - **Slack OAuth**: Implements an in-app "Add to Slack" handshake that exchanges temporary authorization codes for channel-specific incoming webhook URLs stored in the user profile.
- **Redirect URI Orchestration**:
  - Both providers enforce strict redirect URI matching. I mapped and manually verified the redirect routes to ensure flawless transitions between local development (Vite dev proxy on port 5173 ↔ FastAPI on port 8000) and production (Vercel frontend ↔ Render backend).
- **Stateless CSRF Protection via Purpose-Scoped JWTs**:
  - The AI initially suggested storing OAuth `state` in an in-memory Python dictionary. I rejected this because it fails across server restarts, multiple workers, or auto-scaling.
  - Instead, I architected a stateless solution using signed, short-lived (10-minute) JWT tokens as the `state` parameter. By embedding a `purpose` claim (`github_oauth` vs `slack_oauth`) and user UUID directly in the cryptographic payload, the system achieves tamper-proof CSRF security, survives server restarts without an external session store (like Redis), and prevents cross-platform replay attacks.

---

## Hardest Bug the AI Led Me Into

The AI generated a webhook handler that called `await request.json()` to parse the GitHub payload, then `await request.body()` to get raw bytes for HMAC verification. This intermittently broke signature verification.

**Root cause**: `request.json()` consumes the request body stream. In some FastAPI/middleware configurations, calling `request.body()` afterward returns cached bytes inconsistently. The HMAC was computed on different bytes than what GitHub signed. The AI tested with mocks, so it never surfaced.

**How I noticed**: I registered a real webhook, pushed a commit, and got `403 Invalid signature`. I verified my secret was correct by computing the HMAC in a standalone Python script against GitHub's delivery log payload — the secret was fine, the bytes were wrong.

**Fix**: Read raw body **first**, verify HMAC, **then** parse JSON:

```python
body = await request.body()       # raw bytes first
if not verify_signature(body, signature_header):
    return Response(status_code=403)
payload = await request.json()     # parse after verification
```

The key was diagnosing the root cause myself (body stream consumption order) before giving the AI a constrained instruction. When I first asked "why is my HMAC verification failing?", it suggested wrong secret, wrong encoding, whitespace — all wrong.

---

## What I'd Improve With More Time

- **Background task queue**: GitHub API and Slack calls currently happen inline during webhook processing. I'd add a lightweight queue (Redis + Celery or FastAPI `BackgroundTasks`) for asynchronous processing and dead-letter retries.
- **Real-time dashboard**: The events tab requires manual polling. I'd implement Server-Sent Events (SSE) or WebSockets so new webhook events and bot actions update the UI in real time.
- **Bi-directional Slack bot interactions**: Extend Slack notifications with interactive Block Kit components (buttons and modals) and slash commands. This would enable developers to merge/close PRs or re-assign issues directly from Slack conversations without navigating to GitHub.
- **Branch- & Environment-based Multi-Channel Routing**: Support configurable multi-channel routing based on branches (e.g., `main` vs. `staging`) and user roles. High-stakes actions on `main` could route to dedicated lead/approver channels with gating safeguards, while feature branch activity posts to general developer channels.