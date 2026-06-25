"""
Shared FastAPI dependencies.

Using Depends() keeps JWT verification in one place — every protected route
calls verify_token() once and gets back both the verified user_id and the raw
token in a single network round-trip to Supabase.
"""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from supabase_client import supabase


def _extract_token(authorization: str = Header(...)) -> str:
    """
    Internal helper: extract the raw Bearer token from the Authorization header.
    Raises 401 immediately if the header is missing or malformed.
    Not intended to be used directly in routes — use verify_token instead.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected: Bearer <token>",
        )
    return authorization.replace("Bearer ", "", 1)


def verify_token(token: str = Depends(_extract_token)) -> str:
    """
    Dependency that validates the Bearer JWT with Supabase and returns the
    verified user_id string.

    Makes exactly one network call to Supabase per request.
    Raises 401 if the token is missing, malformed, or expired.

    Usage:
        @router.get("/something")
        def get_something(user_id: str = Depends(verify_token)):
            ...
    """
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception as e:
        print(f"[verify_token] Supabase get_user failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or expired. Please log in again.",
        )

    if auth_response.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or expired. Please log in again.",
        )

    return str(auth_response.user.id)


def get_token(token: str = Depends(_extract_token)) -> str:
    """
    Dependency that returns the raw Bearer token string.

    Because both verify_token and get_token depend on the same _extract_token
    dependency, FastAPI's dependency cache ensures _extract_token is called
    only once per request even when both are used together.

    Usage:
        @router.get("/something")
        def get_something(
            user_id: str = Depends(verify_token),
            token: str = Depends(get_token),
        ):
            client = get_user_client(token)
    """
    return token
