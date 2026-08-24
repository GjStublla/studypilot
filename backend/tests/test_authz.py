from unittest.mock import patch, MagicMock
import pytest
from fastapi import HTTPException
from dependencies import _extract_token, verify_token
from conftest import MockAuthResponse, MockUser


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
