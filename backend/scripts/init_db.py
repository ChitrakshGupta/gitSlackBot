#!/usr/bin/env python3
"""
Standalone script to initialise the Neon database.

Usage:
    cd backend/
    source venv/bin/activate
    python -m scripts.init_db

What it does:
    1. Connects to the Neon Postgres using NEON_DATABASE_URL from .env
    2. Creates all tables defined in app/models.py (idempotent)
    3. Runs a quick SELECT 1 to verify connectivity
    4. Prints a summary of created tables
"""

import asyncio
import sys

# Allow running as `python -m scripts.init_db` from backend/
sys.path.insert(0, ".")

from app.config import settings  # noqa: E402


async def main():
    if not settings.DATABASE_URL:
        print("❌ NEON_DATABASE_URL is not set in .env")
        print("   1. Create a free project at https://neon.tech")
        print("   2. Copy the connection string")
        print("   3. Add it to backend/.env as:")
        print("      NEON_DATABASE_URL=postgresql+asyncpg://user:pass@host/db?sslmode=require")
        sys.exit(1)

    print(f"🔗 Connecting to: {settings.DATABASE_URL[:50]}...")

    from app.database import engine, Base  # noqa: E402
    import app.models  # noqa: F401, E402  — registers models with Base.metadata

    if engine is None:
        print("❌ Failed to create database engine")
        sys.exit(1)

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Verify connectivity
    from sqlalchemy import text

    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        assert result.scalar() == 1

    # List tables
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name"
            )
        )
        tables = [row[0] for row in result.fetchall()]

    await engine.dispose()

    print("✅ Database initialised successfully!")
    print(f"   Tables: {', '.join(tables)}")


if __name__ == "__main__":
    asyncio.run(main())
