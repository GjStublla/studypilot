from unittest.mock import patch, MagicMock
import pytest
from fastapi import HTTPException
from dependencies import _extract_token, verify_token
from conftest import MockAuthResponse, MockUser


class OwnershipQuery:
    def __init__(self, owner_id: str):
        self.owner_id = owner_id
        self.filters: list[tuple[str, str]] = []

    def select(self, *args, **kwargs):
        return self

    def eq(self, column: str, value: str):
        self.filters.append((column, value))
        return self

    def single(self):
        return self

    def execute(self):
        requested_id = next((value for column, value in self.filters if column == "id"), None)
        if requested_id != self.owner_id:
            raise RuntimeError("PGRST116: JSON object requested, multiple (or no) rows returned")
        return type("Result", (), {
            "data": {
                "id": self.owner_id,
                "name": "Student A",
                "email": "student-a@example.com",
                "initials": "SA",
                "theme": "dark",
                "default_coach_mode": "essay",
            },
        })()


class OwnershipClient:
    def __init__(self, owner_id: str):
        self.query = OwnershipQuery(owner_id)

    def table(self, table_name: str):
        assert table_name == "profiles"
        return self.query


def test_extract_token_valid():
    header = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token"
    token = _extract_token(authorization=header)
    assert token == "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token"


def test_extract_token_malformed():
    with pytest.raises(HTTPException) as exc:
        _extract_token(authorization="Basic dXNlcjpwYXNz")
    assert exc.value.status_code == 401
    assert "Invalid authorization header format" in exc.value.detail


def test_verify_token_valid():
    fake_user = MockUser(user_id="user-123", email="user@example.com")
    fake_response = MockAuthResponse(user=fake_user)

    with patch("dependencies.supabase.auth.get_user", return_value=fake_response):
        user_id = verify_token(token="valid-token")
        assert user_id == "user-123"


def test_verify_token_expired():
    fake_response = MockAuthResponse(user=None)

    with patch("dependencies.supabase.auth.get_user", return_value=fake_response):
        with pytest.raises(HTTPException) as exc:
            verify_token(token="expired-token")
        assert exc.value.status_code == 401
        assert "Token is invalid or expired" in exc.value.detail


def test_verify_token_network_error():
    with patch("dependencies.supabase.auth.get_user", side_effect=Exception("Connection refused")):
        with pytest.raises(HTTPException) as exc:
            verify_token(token="error-token")
        assert exc.value.status_code == 401
        assert "Token is invalid or expired" in exc.value.detail


def test_profile_route_does_not_return_another_users_row(client_healthy):
    """The verified subject must be the row filter, not a client-supplied ID."""
    from routers import users

    client = OwnershipClient(owner_id="user-a")
    with patch("dependencies.supabase.auth.get_user", return_value=MockAuthResponse(
        MockUser(user_id="user-b", email="student-b@example.com"),
    )), patch.object(users, "get_user_client", return_value=client):
        response = client_healthy.get(
            "/users/me",
            headers={"Authorization": "Bearer user-b-token"},
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Profile not found. The account may not have been set up correctly."
    assert ("id", "user-b") in client.query.filters


@pytest.mark.parametrize("path", [
    "/users/me",
    "/sessions",
    "/rubrics",
    "/action-items",
])
def test_protected_routes_reject_missing_auth(client_healthy, path):
    response = client_healthy.get(path)
    # FastAPI Header(...) dependency returns 422 if missing header
    assert response.status_code in [401, 422]


@pytest.mark.parametrize("path", [
    "/users/me",
    "/sessions",
    "/rubrics",
    "/action-items",
])
def test_protected_routes_reject_invalid_bearer_format(client_healthy, path):
    response = client_healthy.get(path, headers={"Authorization": "InvalidFormat token123"})
    assert response.status_code == 401
    assert "Invalid authorization header format" in response.json()["detail"]


@pytest.mark.parametrize("path", [
    "/users/me",
    "/sessions",
    "/rubrics",
    "/action-items",
])
def test_protected_routes_reject_expired_token(client_healthy, path):
    with patch("dependencies.supabase.auth.get_user", return_value=MockAuthResponse(user=None)):
        response = client_healthy.get(path, headers={"Authorization": "Bearer expired-token"})
        assert response.status_code == 401
        assert "Token is invalid or expired" in response.json()["detail"]
