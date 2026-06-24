"""
Shared FastAPI dependencies.

Using Depends() keeps JWT verification in one place — every protected route
calls verify_token() and gets back a verified user_id string.  If the token is
missing, malformed, or expired the dependency raises 401 before the route
handler even runs.
"""

from fastapi import Depends, Header, HTTPException, status

from supabase_client import supabase


def verify_token(authorization: str = Header(...)) -> str:
    """
    Dependency that validates the Bearer JWT and returns the verified user_id.

    Usage in a route:
        @router.get("/something")
        def get_something(user_id: str = Depends(verify_token)):
            ...
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected: Bearer <token>",
        )

    token = authorization.replace("Bearer ", "", 1)

    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
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


def get_token(authorization: str = Header(...)) -> str:
    """
    Dependency that returns the raw Bearer token string (already validated
    by verify_token).  Use alongside verify_token when you also need to pass
    the token to get_user_client() for RLS-scoped Supabase queries.

    Usage:
        @router.get("/something")
        def get_something(
            user_id: str = Depends(verify_token),
            token: str = Depends(get_token),
        ):
            client = get_user_client(token)
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        )
    return authorization.replace("Bearer ", "", 1)
