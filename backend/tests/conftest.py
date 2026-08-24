import os
import sys
from pathlib import Path
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

# Ensure backend root is in sys.path
backend_path = Path(__file__).resolve().parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

# Set test environment defaults before imports
os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0.test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.test-service-role-key")

from main import create_app
from dependencies import verify_token, get_token


class MockUser:
    def __init__(self, user_id: str, email: str = "student@university.edu"):
        self.id = user_id
        self.email = email


class MockAuthResponse:
    def __init__(self, user: MockUser | None):
        self.user = user


class MockExecuteResult:
    def __init__(self, data: list | dict | None = None):
        self.data = data if data is not None else []


class MockPostgrestQuery:
    def __init__(self, data: list | dict | None = None, should_fail: bool = False):
        self._data = data
        self._should_fail = should_fail

    def select(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def execute(self):
        if self._should_fail:
            raise RuntimeError("Database connection unreachable")
        return MockExecuteResult(self._data)


class FakeSupabaseClient:
    def __init__(self, healthy: bool = True):
        self.healthy = healthy
        self.auth = MagicMock()

    def table(self, table_name: str):
        if not self.healthy:
            return MockPostgrestQuery(should_fail=True)
        return MockPostgrestQuery(data=[{"id": "test-id"}])


@pytest.fixture
def mock_db_healthy():
    return FakeSupabaseClient(healthy=True)


@pytest.fixture
def mock_db_unreachable():
    return FakeSupabaseClient(healthy=False)


@pytest.fixture
def client_healthy(mock_db_healthy):
    app = create_app(db_client=mock_db_healthy)
    return TestClient(app)


@pytest.fixture
def client_unreachable(mock_db_unreachable):
    app = create_app(db_client=mock_db_unreachable)
    return TestClient(app)
