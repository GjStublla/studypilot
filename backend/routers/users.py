"""
Users router — /users

Endpoints:
    GET /users/me    Return the logged-in user's profile row
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from dependencies import verify_token, get_token
from supabase_client import get_user_client

router = APIRouter(prefix="/users", tags=["users"])


# ─── Response model ───────────────────────────────────────────────────────────
# Matches the columns returned from public.profiles

class ProfileResponse(BaseModel):
    user_id: str
    name: str
    email: str
    initials: str
    theme: str
    default_coach_mode: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=ProfileResponse,
    summary="Get the logged-in user's profile",
)
def get_me(
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Returns the full profile for the currently logged-in user.

    JWT verification is handled by the verify_token dependency.
    The profile query runs as the verified user (RLS-scoped) so the DB
    policy (auth.uid() = id) limits the read to their own row.
    """
    try:
        client = get_user_client(token)
        result = (
            client.table("profiles")
            .select("id, name, email, initials, theme, default_coach_mode")
            .eq("id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        error_str = str(e).lower()
        # PGRST116 = .single() found no rows → genuine 404 (trigger may not
        # have run yet, or the profile was manually deleted).
        if "pgrst116" in error_str or "no rows" in error_str:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found. The account may not have been set up correctly.",
            )
        # Any other error is an infrastructure problem — log it and return 500
        # so the client doesn't misdiagnose it as a missing profile.
        print(f"[users/me] profile query failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve profile. Please try again.",
        )

    profile = result.data
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    return ProfileResponse(
        user_id=user_id,
        name=profile["name"],
        email=profile["email"],
        initials=profile["initials"],
        theme=profile["theme"],
        default_coach_mode=profile["default_coach_mode"],
    )
