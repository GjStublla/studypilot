import os
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from rate_limit import limiter, validate_limiter_concurrency, get_rate_limit_storage_uri, get_web_concurrency
from routers import auth, users, sessions, rubrics, action_items
import supabase_client


DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:5180",
    "http://127.0.0.1:5180",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "https://studypilot.app",
]


def parse_cors_origins(cors_env: str | None = None) -> list[str]:
    raw = cors_env if cors_env is not None else os.getenv("CORS_ORIGINS", "")
    extra = [o.strip() for o in raw.split(",") if o.strip()]
    origins = list(DEFAULT_ALLOWED_ORIGINS)
    for origin in extra:
        if origin not in origins:
            origins.append(origin)
    return origins


def validate_cors_origins(origins: list[str], allow_credentials: bool = True) -> None:
    if allow_credentials and "*" in origins:
        raise ValueError("CORS cannot allow wildcard '*' origin when credentials are enabled.")


def create_app(db_client: Any = None) -> FastAPI:
    # Validate worker concurrency and rate limiter storage on startup
    storage_uri = get_rate_limit_storage_uri()
    concurrency = get_web_concurrency()
    validate_limiter_concurrency(storage_uri, concurrency)

    app = FastAPI(title="StudyPilot API", version="1.0.0")

    # Rate limiting — register the shared limiter and the 429 handler.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Store db_client on app state for dependency injection/testing
    app.state.db_client = db_client or supabase_client.supabase_admin

    # CORS configuration with strict origin validation
    origins = parse_cors_origins()
    validate_cors_origins(origins, allow_credentials=True)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(sessions.router)
    app.include_router(rubrics.router)
    app.include_router(action_items.router)

    @app.get("/health", tags=["health"])
    def health():
        """
        Liveness + readiness probe.
        Checks that the Supabase PostgREST connection is reachable so a load
        balancer or uptime monitor can detect a broken DB connection, not just
        a crashed process. Returns 503 if the DB is unreachable.
        """
        client = getattr(app.state, "db_client", supabase_client.supabase)
        try:
            # Lightweight query — fetches zero rows, just validates connectivity.
            client.table("profiles").select("id").limit(1).execute()
            db_status = "ok"
        except Exception as e:
            print(f"[health] DB connectivity check failed: {e}")
            db_status = "unreachable"

        payload = {"status": "ok", "db": db_status}
        if db_status != "ok":
            return JSONResponse(content=payload, status_code=503)
        return payload

    return app


app = create_app()
