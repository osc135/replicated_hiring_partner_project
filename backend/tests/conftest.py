import json
import os
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# ---- Fake user / JWT helpers ----

FAKE_USER_ID = uuid4()
FAKE_USER_EMAIL = "testuser@example.com"
FAKE_USER_PASSWORD = "securepassword123"
FAKE_HASHED_PASSWORD = "$2b$12$LJ3m4ys3Lk0vD1FqFkYyxOWsf0vGtF2.SjK9vBxKz2z6XJpMq7cCm"  # bcrypt hash placeholder


def _fake_user_row(include_hashed=False):
    row = {
        "id": FAKE_USER_ID,
        "email": FAKE_USER_EMAIL,
        "created_at": datetime.now(timezone.utc),
    }
    if include_hashed:
        row["hashed_password"] = FAKE_HASHED_PASSWORD
    return row


# ---- Fixtures ----


@pytest.fixture
def fake_user_id():
    return FAKE_USER_ID


@pytest.fixture
def jwt_token():
    """Create a real JWT token for the fake user."""
    from api.auth import _create_access_token

    return _create_access_token(str(FAKE_USER_ID))


@pytest.fixture
def auth_headers(jwt_token):
    return {"Authorization": f"Bearer {jwt_token}"}


@pytest.fixture
def mock_db_pool():
    """Return a MagicMock that mimics an asyncpg Pool."""
    pool = MagicMock()
    pool.acquire = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool


@pytest_asyncio.fixture
async def client(mock_db_pool):
    """
    Async HTTP test client with mocked database pool.
    """
    patches = [
        patch("db.database._pool", mock_db_pool),
        patch("db.database.get_pool", return_value=mock_db_pool),
        patch("db.database.create_pool", new_callable=AsyncMock),
        patch("db.database.init_db", new_callable=AsyncMock),
        patch("db.database.close_pool", new_callable=AsyncMock),
    ]

    for p in patches:
        p.start()

    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    for p in reversed(patches):
        p.stop()


@pytest.fixture
def extracted_bundle_dir(tmp_path):
    """
    Create a realistic extracted K8s support bundle directory structure.
    """
    # cluster-resources/events/default.json
    events_dir = tmp_path / "cluster-resources" / "events"
    events_dir.mkdir(parents=True)
    events_data = {
        "items": [
            {
                "reason": "BackOff",
                "message": "Back-off restarting failed container, status CrashLoopBackOff",
                "involvedObject": {"name": "my-app-pod-abc123", "namespace": "default"},
            },
            {
                "reason": "Failed",
                "message": "Failed to pull image 'myregistry.io/app:latest': ImagePullBackOff",
                "involvedObject": {"name": "my-other-pod-xyz", "namespace": "default"},
            },
        ]
    }
    (events_dir / "default.json").write_text(json.dumps(events_data, indent=2))

    # cluster-resources/pods/default.json
    pods_dir = tmp_path / "cluster-resources" / "pods"
    pods_dir.mkdir(parents=True)
    pods_data = {
        "items": [
            {
                "metadata": {"name": "my-app-pod-abc123", "namespace": "default"},
                "status": {
                    "containerStatuses": [
                        {
                            "name": "app",
                            "state": {"waiting": {"reason": "CrashLoopBackOff"}},
                            "lastState": {
                                "terminated": {"reason": "OOMKilled", "exitCode": 137}
                            },
                        }
                    ]
                },
            },
            {
                "metadata": {"name": "broken-pod-def456", "namespace": "default"},
                "status": {
                    "containerStatuses": [
                        {
                            "name": "init",
                            "state": {"waiting": {"reason": "RunContainerError"}},
                        }
                    ]
                },
            },
        ]
    }
    (pods_dir / "default.json").write_text(json.dumps(pods_data, indent=2))

    # pod-logs/default/some-pod/some-container.log
    logs_dir = tmp_path / "pod-logs" / "default" / "some-pod"
    logs_dir.mkdir(parents=True)
    log_content = (
        "2024-01-15T10:00:00Z INFO Starting application...\n"
        "2024-01-15T10:00:01Z ERROR Failed to connect to database\n"
        "2024-01-15T10:00:02Z FATAL OOMKilled: memory limit exceeded\n"
    )
    (logs_dir / "some-container.log").write_text(log_content)

    # analysis.json
    analysis_data = {
        "spec": {"analyzers": [{"textAnalyze": {"checkName": "Check Memory"}}]},
        "results": [
            {
                "name": "Memory usage",
                "isPass": False,
                "isFail": True,
                "message": "Memory usage is above threshold",
            }
        ],
    }
    (tmp_path / "analysis.json").write_text(json.dumps(analysis_data, indent=2))

    return tmp_path


@pytest.fixture
def bundle_tar_gz(extracted_bundle_dir, tmp_path_factory):
    """
    Create a minimal .tar.gz bundle from the extracted bundle directory.
    """
    out_dir = tmp_path_factory.mktemp("tarballs")
    tar_path = str(out_dir / "support-bundle.tar.gz")

    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(str(extracted_bundle_dir), arcname="support-bundle")

    return tar_path
