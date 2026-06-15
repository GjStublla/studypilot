from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from rate_limit import limiter
from routers import auth, users

app = FastAPI(title="StudyPilot API", version="1.0.0")

# Rate limiting — register the shared limiter and the 429 handler.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Allow the React frontend and Chrome extension to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://127.0.0.1:5173",
        "http://localhost:4173",   # Vite preview
        "https://studypilot.app",  # production domain — update when known
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)


@app.get("/health")
def health():
    return {"status": "ok"}
