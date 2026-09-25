#!/usr/bin/env python3
"""
Deep test suite for Phases 1-3.
Tests imports, config, JWT, models, database operations, OAuth helpers, and HTTP endpoints.
"""

import asyncio
import sys
import traceback

sys.path.insert(0, ".")

PASS = 0
FAIL = 0
ERRORS = []


def test(name):
    """Decorator for test functions."""
    def decorator(func):
        async def wrapper():
            global PASS, FAIL
            try:
                if asyncio.iscoroutinefunction(func):
                    await func()
                else:
                    func()
                PASS += 1
                print(f"  ✅ {name}")
            except Exception as e:
                FAIL += 1
                err_msg = f"  ❌ {name}: {e}"
                print(err_msg)
                ERRORS.append(err_msg)
                traceback.print_exc()
        wrapper._test_name = name
        return wrapper
    return decorator


# ═══════════════════════════════════════════════════════════════
# 1. IMPORT TESTS
# ═══════════════════════════════════════════════════════════════

@test("Import app.config")
def test_import_config():
    from app.config import settings
    assert settings is not None

@test("Import app.database")
def test_import_database():
    from app.database import engine, async_session, Base, get_db
    assert engine is not None

@test("Import app.models")
def test_import_models():
    from app.models import User, Repo, Event
    assert User.__tablename__ == "users"
    assert Repo.__tablename__ == "repos"
    assert Event.__tablename__ == "events"

@test("Import app.deps")
def test_import_deps():
    from app.deps import create_jwt, decode_jwt, get_current_user
    assert callable(create_jwt)
    assert callable(decode_jwt)

@test("Import app.main")
def test_import_main():
    from app.main import app
    assert app.title == "GitHub Automation Bot"

@test("Import all routers")
def test_import_routers():
    from app.routers.auth import router as r1
    from app.routers.webhook import router as r2
    from app.routers.dashboard import router as r3
    from app.routers.settings import router as r4
    assert r1.prefix == "/auth"
    assert r4.prefix == "/settings"

@test("No circular imports")
def test_no_circular():
    # Force reimport chain
    import importlib
    importlib.reload(sys.modules.get("app.config", __import__("app.config")))


# ═══════════════════════════════════════════════════════════════
# 2. CONFIG TESTS
# ═══════════════════════════════════════════════════════════════

@test("Config reads GITHUB_CLIENT_ID from .env")
def test_config_github():
    from app.config import settings
    assert settings.GITHUB_CLIENT_ID == "Ov23likZhV05chLoWaot", f"Got: {settings.GITHUB_CLIENT_ID}"

@test("Config reads GITHUB_CLIENT_SECRET from .env")
def test_config_secret():
    from app.config import settings
    assert len(settings.GITHUB_CLIENT_SECRET) == 40, f"Length: {len(settings.GITHUB_CLIENT_SECRET)}"

@test("Config reads DATABASE_URL from .env")
def test_config_db():
    from app.config import settings
    assert "neondb" in settings.DATABASE_URL
    assert "asyncpg" in settings.DATABASE_URL

@test("Config JWT_SECRET is not the default")
def test_config_jwt():
    from app.config import settings
    assert settings.JWT_SECRET != "change-me-in-production"
    assert len(settings.JWT_SECRET) > 20

@test("Config CORS_ORIGINS includes FRONTEND_URL")
def test_config_cors():
    from app.config import settings
    assert settings.FRONTEND_URL in settings.CORS_ORIGINS

@test("Config BACKEND_URL is set")
def test_config_backend_url():
    from app.config import settings
    assert settings.BACKEND_URL == "http://localhost:8000"


# ═══════════════════════════════════════════════════════════════
# 3. JWT TESTS
# ═══════════════════════════════════════════════════════════════

@test("JWT create and decode round-trip")
def test_jwt_roundtrip():
    from app.deps import create_jwt, decode_jwt
    token = create_jwt("user-123", "testuser")
    payload = decode_jwt(token)
    assert payload["sub"] == "user-123"
    assert payload["username"] == "testuser"
    assert "exp" in payload
    assert "iat" in payload

@test("JWT decode rejects tampered token")
def test_jwt_tampered():
    from app.deps import create_jwt, decode_jwt
    token = create_jwt("user-123", "testuser")
    # Tamper with the token by changing last character
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    try:
        decode_jwt(tampered)
        assert False, "Should have raised"
    except Exception as e:
        assert "Invalid token" in str(e.detail) or "Signature" in str(e.detail)

@test("JWT decode rejects expired token")
def test_jwt_expired():
    import jwt as pyjwt
    from datetime import datetime, timedelta, timezone
    from app.config import settings
    from app.deps import decode_jwt
    # Create already-expired token
    payload = {
        "sub": "user-123",
        "username": "test",
        "iat": datetime.now(timezone.utc) - timedelta(hours=48),
        "exp": datetime.now(timezone.utc) - timedelta(hours=24),
    }
    token = pyjwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    try:
        decode_jwt(token)
        assert False, "Should have raised"
    except Exception as e:
        assert "expired" in str(e.detail).lower()

@test("JWT decode rejects token signed with wrong key")
def test_jwt_wrong_key():
    import jwt as pyjwt
    from datetime import datetime, timedelta, timezone
    from app.deps import decode_jwt
    payload = {
        "sub": "user-123",
        "username": "test",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = pyjwt.encode(payload, "wrong-secret-key", algorithm="HS256")
    try:
        decode_jwt(token)
        assert False, "Should have raised"
    except Exception as e:
        assert "Invalid token" in str(e.detail)

@test("JWT decode rejects empty string")
def test_jwt_empty():
    from app.deps import decode_jwt
    try:
        decode_jwt("")
        assert False, "Should have raised"
    except Exception:
        pass  # Expected

@test("JWT decode rejects random garbage")
def test_jwt_garbage():
    from app.deps import decode_jwt
    try:
        decode_jwt("not.a.jwt.token")
        assert False, "Should have raised"
    except Exception:
        pass  # Expected


# ═══════════════════════════════════════════════════════════════
# 4. OAUTH STATE TOKEN TESTS
# ═══════════════════════════════════════════════════════════════

@test("OAuth state token create and verify")
def test_state_roundtrip():
    from app.routers.auth import _create_state_token, _verify_state_token
    token = _create_state_token(purpose="github_oauth")
    payload = _verify_state_token(token, expected_purpose="github_oauth")
    assert payload["purpose"] == "github_oauth"

@test("OAuth state rejects wrong purpose")
def test_state_wrong_purpose():
    from app.routers.auth import _create_state_token, _verify_state_token
    token = _create_state_token(purpose="github_oauth")
    try:
        _verify_state_token(token, expected_purpose="slack_oauth")
        assert False, "Should have raised"
    except Exception as e:
        assert "Invalid OAuth state" in str(e.detail)

@test("Slack state token includes user ID")
def test_state_with_uid():
    from app.routers.auth import _create_state_token, _verify_state_token
    token = _create_state_token(purpose="slack_oauth", user_id="abc-123")
    payload = _verify_state_token(token, expected_purpose="slack_oauth")
    assert payload["uid"] == "abc-123"

@test("State token rejects tampered value")
def test_state_tampered():
    from app.routers.auth import _create_state_token, _verify_state_token
    token = _create_state_token(purpose="github_oauth")
    tampered = token[:-1] + ("x" if token[-1] != "x" else "y")
    try:
        _verify_state_token(tampered, expected_purpose="github_oauth")
        assert False, "Should have raised"
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════
# 5. MODEL TESTS
# ═══════════════════════════════════════════════════════════════

@test("User model has correct columns")
def test_user_columns():
    from app.models import User
    cols = {c.name for c in User.__table__.columns}
    expected = {"id", "github_id", "username", "access_token", "slack_webhook_url", "created_at"}
    assert cols == expected, f"Got: {cols}"

@test("Repo model has correct columns")
def test_repo_columns():
    from app.models import Repo
    cols = {c.name for c in Repo.__table__.columns}
    expected = {"id", "user_id", "repo_full_name", "webhook_id", "created_at"}
    assert cols == expected, f"Got: {cols}"

@test("Event model has correct columns")
def test_event_columns():
    from app.models import Event
    cols = {c.name for c in Event.__table__.columns}
    expected = {"id", "repo_id", "github_delivery_id", "event_type", "payload", "action_taken", "status", "created_at"}
    assert cols == expected, f"Got: {cols}"

@test("User.github_id is unique")
def test_user_github_id_unique():
    from app.models import User
    col = User.__table__.c.github_id
    assert col.unique is True

@test("Event.github_delivery_id is unique")
def test_event_delivery_unique():
    from app.models import Event
    col = Event.__table__.c.github_delivery_id
    assert col.unique is True

@test("Repo.user_id FK has CASCADE delete")
def test_repo_fk_cascade():
    from app.models import Repo
    fks = Repo.__table__.c.user_id.foreign_keys
    for fk in fks:
        assert fk.ondelete == "CASCADE", f"Got: {fk.ondelete}"

@test("Event.repo_id FK has CASCADE delete")
def test_event_fk_cascade():
    from app.models import Event
    fks = Event.__table__.c.repo_id.foreign_keys
    for fk in fks:
        assert fk.ondelete == "CASCADE", f"Got: {fk.ondelete}"

@test("User.slack_webhook_url is nullable")
def test_user_slack_nullable():
    from app.models import User
    col = User.__table__.c.slack_webhook_url
    assert col.nullable is True

@test("Event.action_taken is nullable")
def test_event_action_nullable():
    from app.models import Event
    col = Event.__table__.c.action_taken
    assert col.nullable is True

@test("Event.status defaults to 'processed'")
def test_event_status_default():
    from app.models import Event
    col = Event.__table__.c.status
    assert col.default is not None
    assert col.default.arg == "processed"

@test("User → Repo relationship exists")
def test_user_repo_rel():
    from app.models import User
    assert hasattr(User, "repos")

@test("Repo → Event relationship exists")
def test_repo_event_rel():
    from app.models import Repo
    assert hasattr(Repo, "events")

@test("User.id is UUID type")
def test_user_id_uuid():
    from app.models import User
    from sqlalchemy.dialects.postgresql import UUID
    col = User.__table__.c.id
    assert isinstance(col.type, UUID)

@test("Event.payload is JSONB type")
def test_event_payload_jsonb():
    from app.models import Event
    from sqlalchemy.dialects.postgresql import JSONB
    col = Event.__table__.c.payload
    assert isinstance(col.type, JSONB)


# ═══════════════════════════════════════════════════════════════
# 6. DATABASE TESTS (live Neon connection)
# ═══════════════════════════════════════════════════════════════

@test("DB engine connects successfully")
async def test_db_connect():
    from app.database import engine
    from sqlalchemy import text
    async with engine.connect() as conn:
        r = await conn.execute(text("SELECT 1"))
        assert r.scalar() == 1

@test("DB has all 3 tables")
async def test_db_tables():
    from app.database import engine
    from sqlalchemy import text
    async with engine.connect() as conn:
        r = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
        ))
        tables = [row[0] for row in r.fetchall()]
        assert "users" in tables
        assert "repos" in tables
        assert "events" in tables

@test("DB users.github_id has UNIQUE constraint")
async def test_db_unique_github_id():
    from app.database import engine
    from sqlalchemy import text
    async with engine.connect() as conn:
        r = await conn.execute(text(
            "SELECT constraint_name FROM information_schema.table_constraints "
            "WHERE table_name='users' AND constraint_type='UNIQUE'"
        ))
        constraints = [row[0] for row in r.fetchall()]
        assert any("github_id" in c for c in constraints), f"Constraints: {constraints}"

@test("DB events.github_delivery_id has UNIQUE constraint")
async def test_db_unique_delivery():
    from app.database import engine
    from sqlalchemy import text
    async with engine.connect() as conn:
        r = await conn.execute(text(
            "SELECT constraint_name FROM information_schema.table_constraints "
            "WHERE table_name='events' AND constraint_type='UNIQUE'"
        ))
        constraints = [row[0] for row in r.fetchall()]
        assert any("delivery" in c for c in constraints), f"Constraints: {constraints}"

@test("DB CRUD: insert, read, delete user")
async def test_db_crud_user():
    from app.database import async_session
    from app.models import User
    from sqlalchemy import select
    import uuid

    async with async_session() as session:
        # Insert
        test_user = User(
            github_id=99999999,
            username="_test_deep_audit_",
            access_token="test_token_for_audit",
        )
        session.add(test_user)
        await session.flush()
        user_id = test_user.id
        assert user_id is not None

        # Read
        result = await session.execute(select(User).where(User.id == user_id))
        found = result.scalar_one_or_none()
        assert found is not None
        assert found.username == "_test_deep_audit_"
        assert found.slack_webhook_url is None

        # Delete
        await session.delete(found)
        await session.commit()

        # Verify deleted
        result = await session.execute(select(User).where(User.id == user_id))
        assert result.scalar_one_or_none() is None

@test("DB rejects duplicate github_id")
async def test_db_duplicate_github_id():
    from app.database import async_session
    from app.models import User
    from sqlalchemy.exc import IntegrityError

    async with async_session() as session:
        u1 = User(github_id=88888888, username="_dup_test_1_", access_token="tok1")
        session.add(u1)
        await session.flush()

        u2 = User(github_id=88888888, username="_dup_test_2_", access_token="tok2")
        session.add(u2)
        try:
            await session.flush()
            assert False, "Should have raised IntegrityError"
        except IntegrityError:
            await session.rollback()

    # Cleanup
    async with async_session() as session:
        from sqlalchemy import delete
        await session.execute(delete(User).where(User.github_id == 88888888))
        await session.commit()

@test("DB cascade: deleting user deletes repos")
async def test_db_cascade():
    from app.database import async_session
    from app.models import User, Repo
    from sqlalchemy import select

    async with async_session() as session:
        user = User(github_id=77777777, username="_cascade_test_", access_token="tok")
        session.add(user)
        await session.flush()

        repo = Repo(user_id=user.id, repo_full_name="test/cascade-repo")
        session.add(repo)
        await session.flush()
        repo_id = repo.id

        # Delete user
        await session.delete(user)
        await session.commit()

    # Verify repo is also deleted
    async with async_session() as session:
        result = await session.execute(select(Repo).where(Repo.id == repo_id))
        assert result.scalar_one_or_none() is None


# ═══════════════════════════════════════════════════════════════
# 7. FASTAPI ROUTE TESTS
# ═══════════════════════════════════════════════════════════════

@test("All 12 expected routes are registered")
def test_routes_registered():
    from app.main import app
    route_paths = [r.path for r in app.routes if hasattr(r, "methods")]
    expected = [
        "/auth/github", "/auth/callback", "/auth/me",
        "/auth/slack", "/auth/slack/callback",
        "/webhook/github",
        "/events", "/repos", "/repos/connect",
        "/settings/slack", "/settings/",
        "/health",
    ]
    for ep in expected:
        assert ep in route_paths, f"Missing route: {ep}"

@test("CORS middleware is configured")
def test_cors():
    from app.main import app
    from starlette.middleware.cors import CORSMiddleware
    found = any(
        hasattr(m, "cls") and m.cls == CORSMiddleware
        for m in app.user_middleware
    )
    assert found, "CORS middleware not found"

@test("GET /auth/github uses correct HTTP method")
def test_auth_github_method():
    from app.main import app
    for r in app.routes:
        if hasattr(r, "path") and r.path == "/auth/github":
            assert "GET" in r.methods, f"Methods: {r.methods}"
            break

@test("POST /webhook/github uses correct HTTP method")
def test_webhook_method():
    from app.main import app
    for r in app.routes:
        if hasattr(r, "path") and r.path == "/webhook/github":
            assert "POST" in r.methods, f"Methods: {r.methods}"
            break

@test("GET /auth/callback requires 'code' query param")
def test_callback_requires_code():
    from app.routers.auth import github_callback
    import inspect
    sig = inspect.signature(github_callback)
    code_param = sig.parameters.get("code")
    assert code_param is not None

@test("GET /auth/callback requires 'state' query param")
def test_callback_requires_state():
    from app.routers.auth import github_callback
    import inspect
    sig = inspect.signature(github_callback)
    state_param = sig.parameters.get("state")
    assert state_param is not None


# ═══════════════════════════════════════════════════════════════
# 8. EDGE CASE TESTS
# ═══════════════════════════════════════════════════════════════

@test("get_db raises RuntimeError when DB not configured")
async def test_get_db_no_config():
    # Simulate no DB by temporarily patching
    import app.database as db_mod
    original = db_mod.async_session
    db_mod.async_session = None
    try:
        gen = db_mod.get_db()
        try:
            await gen.__anext__()
            assert False, "Should have raised"
        except RuntimeError as e:
            assert "not configured" in str(e).lower()
    finally:
        db_mod.async_session = original

@test("User model default UUID is generated")
def test_user_default_uuid():
    from app.models import User
    col = User.__table__.c.id
    assert col.default is not None

@test("utcnow() returns timezone-aware datetime")
def test_utcnow():
    from app.models import utcnow
    dt = utcnow()
    assert dt.tzinfo is not None


# ═══════════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════════

async def run_all():
    """Collect and run all test functions."""
    tests = []
    for name, obj in list(globals().items()):
        if callable(obj) and hasattr(obj, "_test_name"):
            tests.append(obj)

    print(f"\n🔍 Running {len(tests)} deep tests...\n")

    for t in tests:
        await t()

    print(f"\n{'='*50}")
    print(f"Results: {PASS} passed, {FAIL} failed out of {PASS + FAIL} tests")
    if ERRORS:
        print(f"\nFailed tests:")
        for e in ERRORS:
            print(e)
    print(f"{'='*50}\n")

    return FAIL == 0


if __name__ == "__main__":
    success = asyncio.run(run_all())
    sys.exit(0 if success else 1)
