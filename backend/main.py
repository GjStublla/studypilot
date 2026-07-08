import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from rate_limit import limiter
from routers import auth, users, sessions, rubrics, action_items
from supabase_client import supabase

app = FastAPI(title="StudyPilot API", version="1.0.0")

# Rate limiting — register the shared limiter and the 429 handler.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Allow the React frontend and Chrome extension to call this API.
# Extra origins (e.g. the Dockerized nginx frontend) can be added via the
# comma-separated CORS_ORIGINS env var without touching this list.
_extra_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://127.0.0.1:5173",
        "http://localhost:5180",   # Vite dev server (Claude preview, .claude/launch.json)
        "http://127.0.0.1:5180",
        "http://localhost:4173",   # Vite preview
        "https://studypilot.app",  # production domain — update when known
    ] + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(sessions.router)
app.include_router(rubrics.router)
app.include_router(action_items.router)


@app.get("/health")
def health():
    """
    Liveness + readiness probe.
    Checks that the Supabase PostgREST connection is reachable so a load
    balancer or uptime monitor can detect a broken DB connection, not just
    a crashed process.  Returns 503 if the DB is unreachable.
    """
    try:
        # Lightweight query — fetches zero rows, just validates connectivity.
        supabase.table("profiles").select("id").limit(1).execute()
        db_status = "ok"
    except Exception as e:
        print(f"[health] DB connectivity check failed: {e}")
        db_status = "unreachable"

    payload = {"status": "ok", "db": db_status}
    if db_status != "ok":
        return JSONResponse(content=payload, status_code=503)
    return payload
