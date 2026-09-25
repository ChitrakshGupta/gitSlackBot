"""
Event-Driven GitHub Automation Bot — FastAPI Backend
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.routers.auth import router as auth_router
from app.routers.webhook import router as webhook_router
from app.routers.dashboard import router as dashboard_router
from app.routers.settings import router as settings_router

# Module-level public URL — set during startup
# Defaults to BACKEND_URL; overridden with ngrok URL in local dev
public_webhook_url: str = settings.BACKEND_URL


def _start_ngrok_background(port: int) -> None:
    """
    Start ngrok in a daemon thread so it NEVER blocks server startup or hot reload.
    Updates public_webhook_url once the tunnel is established.
    """
    import threading

    def _tunnel():
        global public_webhook_url
        try:
            from pyngrok import ngrok, conf

            auth_token = os.getenv("NGROK_AUTHTOKEN", "")
            if auth_token:
                conf.get_default().auth_token = auth_token

            # Kill any stale tunnels from previous sessions before starting
            try:
                ngrok.kill()
            except Exception:
                pass

            tunnel = ngrok.connect(port, "http")
            public_url = tunnel.public_url.replace("http://", "https://")
            public_webhook_url = public_url
            print(f"🌐 ngrok tunnel active: {public_url}")
            print(f"   Webhook URL: {public_url}/webhook/github")
        except ImportError:
            print("⚠️  pyngrok not installed — skipping auto-tunnel")
        except Exception as e:
            print(f"⚠️  ngrok failed: {e}")

    t = threading.Thread(target=_tunnel, daemon=True)
    t.start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""

    # ── Startup ──
    if engine is not None:
        import app.models  # noqa: F401
        from app.database import Base

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            assert result.scalar() == 1, "DB connectivity check failed"
        print("✅ Database connected and tables verified")
    else:
        print("⚠️  No DATABASE_URL configured — running without database")

    # Start ngrok in background (non-blocking) only when running on localhost
    if settings.BACKEND_URL.startswith("http://localhost"):
        _start_ngrok_background(port=8000)
        print("ℹ️  Starting ngrok tunnel in background (takes ~3s)...")
    else:
        print(f"🌐 Webhook URL: {settings.BACKEND_URL}/webhook/github")

    yield  # app is running

    # ── Shutdown — ngrok daemon thread dies automatically with the process ──
    if engine is not None:
        await engine.dispose()
        print("🔌 Database connection pool closed")


app = FastAPI(
    title="GitHub Automation Bot",
    description="Event-driven bot that reacts to GitHub repository activity",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the Vite frontend (local dev + deployed Vercel URL)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(webhook_router)
app.include_router(dashboard_router)
app.include_router(settings_router)


@app.get("/health")
async def health_check():
    """Health check — also reports DB and tunnel status."""
    db_status = "connected" if engine is not None else "not configured"
    return {
        "status": "ok",
        "database": db_status,
        "webhook_url": f"{public_webhook_url}/webhook/github",
    }
