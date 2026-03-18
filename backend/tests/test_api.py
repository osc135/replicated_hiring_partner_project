import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from tests.conftest import (
    FAKE_HASHED_PASSWORD,
    FAKE_USER_EMAIL,
    FAKE_USER_ID,
    FAKE_USER_PASSWORD,
    _fake_user_row,
)


# ---- Health check ----


@pytest.mark.asyncio
async def test_health_check(client):
    """GET /health returns 200."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"


# ---- Auth: Register ----


@pytest.mark.asyncio
async def test_register(client):
    """POST /auth/register with valid email/password returns token."""
    new_id = uuid4()
    fake_user = {
        "id": new_id,
        "email": "newuser@example.com",
        "created_at": datetime.now(timezone.utc),
    }

    with patch("api.auth.get_user_by_email", new_callable=AsyncMock, return_value=None), \
         patch("api.auth.create_user", new_callable=AsyncMock, return_value=fake_user), \
         patch("api.auth._hash_password", return_value="fakehash"):
        resp = await client.post(
            "/auth/register",
            json={"email": "newuser@example.com", "password": "testpass123"},
        )

    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    """POST /auth/register with existing email returns 409."""
    existing_user = _fake_user_row(include_hashed=True)

    with patch(
        "api.auth.get_user_by_email",
        new_callable=AsyncMock,
        return_value=existing_user,
    ):
        resp = await client.post(
            "/auth/register",
            json={"email": FAKE_USER_EMAIL, "password": "testpass123"},
        )

    assert resp.status_code == 409


# ---- Auth: Login ----


@pytest.mark.asyncio
async def test_login(client):
    """POST /auth/login with correct credentials returns token."""
    user_row = {
        "id": FAKE_USER_ID,
        "email": FAKE_USER_EMAIL,
        "hashed_password": "fakehash",
        "created_at": datetime.now(timezone.utc),
    }

    with patch("api.auth.get_user_by_email", new_callable=AsyncMock, return_value=user_row), \
         patch("api.auth._verify_password", return_value=True):
        resp = await client.post(
            "/auth/login",
            json={"email": FAKE_USER_EMAIL, "password": "correctpassword"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    """POST /auth/login with wrong password returns 401."""
    user_row = {
        "id": FAKE_USER_ID,
        "email": FAKE_USER_EMAIL,
        "hashed_password": "fakehash",
        "created_at": datetime.now(timezone.utc),
    }

    with patch("api.auth.get_user_by_email", new_callable=AsyncMock, return_value=user_row), \
         patch("api.auth._verify_password", return_value=False):
        resp = await client.post(
            "/auth/login",
            json={"email": FAKE_USER_EMAIL, "password": "wrongpassword"},
        )

    assert resp.status_code == 401


# ---- Bundles: Auth required ----


@pytest.mark.asyncio
async def test_upload_requires_auth(client):
    """POST /bundles/upload without token returns 401 or 403."""
    resp = await client.post("/bundles/upload")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_upload_rejects_non_targz(client, auth_headers):
    """POST /bundles/upload with .txt file returns 400."""
    with patch(
        "api.auth.get_user_by_id",
        new_callable=AsyncMock,
        return_value=_fake_user_row(),
    ):
        resp = await client.post(
            "/bundles/upload",
            headers=auth_headers,
            files={"file": ("readme.txt", b"hello world", "text/plain")},
        )

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_bundles_requires_auth(client):
    """GET /bundles without token returns 401 or 403."""
    resp = await client.get("/bundles")
    assert resp.status_code in (401, 403)


# ---- Analysis: Not found ----


@pytest.mark.asyncio
async def test_get_analysis_not_found(client, auth_headers):
    """GET /analysis/{random_uuid} returns 404."""
    random_id = uuid4()

    with patch("api.auth.get_user_by_id", new_callable=AsyncMock, return_value=_fake_user_row()), \
         patch("api.analysis.get_analysis_by_bundle", new_callable=AsyncMock, return_value=None):
        resp = await client.get(
            f"/analysis/{random_id}",
            headers=auth_headers,
        )

    assert resp.status_code == 404
