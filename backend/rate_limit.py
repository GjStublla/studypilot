"""Shared rate limiter.

Lives in its own module so both main.py and the routers can import the same
Limiter instance without a circular import (main imports the routers).

Storage is in-memory, which is correct for a single uvicorn worker. If the API
is ever run with multiple workers/processes, configure a shared backend
(e.g. Redis) via `storage_uri` so limits are enforced across them.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
