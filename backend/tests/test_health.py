import pytest
from main import parse_cors_origins, validate_cors_origins
from rate_limit import validate_limiter_concurrency


def test_health_returns_200_when_healthy(client_healthy):
    response = client_healthy.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["db"] == "ok"


def test_health_returns_503_when_db_unreachable(client_unreachable):
    response = client_unreachable.get("/health")
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "ok"
    assert data["db"] == "unreachable"


def test_cors_origins_includes_defaults():
    origins = parse_cors_origins("")
    assert "https://studypilot.app" in origins
    assert "http://localhost:5173" in origins


def test_cors_origins_parses_extra_origins():
    origins = parse_cors_origins("https://custom.studypilot.app, https://preview.studypilot.app")
    assert "https://custom.studypilot.app" in origins
    assert "https://preview.studypilot.app" in origins
    assert "https://studypilot.app" in origins


def test_cors_rejects_wildcard_with_credentials():
    with pytest.raises(ValueError, match="CORS cannot allow wildcard"):
        validate_cors_origins(["*"], allow_credentials=True)


def test_limiter_rejects_multi_worker_with_memory():
    with pytest.raises(RuntimeError, match="Multi-worker configuration"):
        validate_limiter_concurrency("memory://", concurrency=4)


def test_limiter_allows_single_worker_with_memory():
    # Should not raise
    validate_limiter_concurrency("memory://", concurrency=1)


def test_limiter_allows_multi_worker_with_redis():
    # Should not raise
    validate_limiter_concurrency("redis://localhost:6379/0", concurrency=4)
