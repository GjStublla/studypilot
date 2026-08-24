"""Shared rate limiter.

Lives in its own module so both main.py and the routers can import the same
Limiter instance without a circular import (main imports the routers).

Storage defaults to in-memory, which is correct for a single uvicorn worker.
If the API is run with multiple workers/processes (WEB_CONCURRENCY > 1),
a shared backend (e.g. Redis) MUST be configured via `RATE_LIMIT_STORAGE_URI`.
"""

import os
from slowapi import Limiter
from slowapi.util import get_remote_address


def get_rate_limit_storage_uri() -> str:
    return os.getenv("RATE_LIMIT_STORAGE_URI", "memory://")


def get_web_concurrency() -> int:
    try:
        return int(os.getenv("WEB_CONCURRENCY", "1"))
    except ValueError:
        return 1


def validate_limiter_concurrency(storage_uri: str, concurrency: int) -> None:
    is_in_memory = not storage_uri or storage_uri.startswith("memory://")
    if concurrency > 1 and is_in_memory:
        raise RuntimeError(
            f"Multi-worker configuration (WEB_CONCURRENCY={concurrency}) requires a shared "
            f"RATE_LIMIT_STORAGE_URI (e.g. redis://...). In-memory rate limiting is only safe for a single worker."
        )


_storage_uri = get_rate_limit_storage_uri()
_concurrency = get_web_concurrency()
validate_limiter_concurrency(_storage_uri, _concurrency)

limiter = Limiter(key_func=get_remote_address, storage_uri=_storage_uri)
