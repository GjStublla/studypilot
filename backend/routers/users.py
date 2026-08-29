"""
Users router — /users

Endpoints:
    GET   /users/me    Return the logged-in user's profile row
    PATCH /users/me    Update allowed profile fields (name, theme, default_coach_mode)
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints

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


class UpdateProfileRequest(BaseModel):
    """
    Only the fields a user is allowed to change are exposed here.
    All fields are optional so the client can send a partial update.
    Email and initials are derived/managed by the DB and are not editable here.
    """
    name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    ] | None = None
    theme: str | None = Field(default=None, pattern="^(dark|light)$")
    default_coach_mode: str | None = Field(default=None, pattern="^(essay|lecture|reader)$")


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


@router.patch(
    "/me",
    response_model=ProfileResponse,
    summary="Update the logged-in user's profile",
)
def update_me(
    body: UpdateProfileRequest,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Partially updates the authenticated user's profile.

    Only name, theme, and default_coach_mode are writable — email, initials,
    and system fields are excluded from the request model so they can never be
    mass-assigned through this endpoint.

    If name is updated, initials are recomputed from the new name so the
    avatar stays in sync without a separate call.

    Returns the full updated profile.
    """
    # Build the update dict from only the fields that were explicitly provided.
    # Pydantic sets unset optional fields to None, so we use model_fields_set
    # to distinguish "not provided" from "explicitly set to null".
    updates: dict = {}
    if "name" in body.model_fields_set and body.name is not None:
        updates["name"] = body.name
        # Recompute initials from the new name so the avatar stays in sync.
        parts = body.name.split()
        updates["initials"] = "".join(p[0].upper() for p in parts if p)[:2] or body.name[0].upper()
    if "theme" in body.model_fields_set and body.theme is not None:
        updates["theme"] = body.theme
    if "default_coach_mode" in body.model_fields_set and body.default_coach_mode is not None:
        updates["default_coach_mode"] = body.default_coach_mode

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No valid fields provided for update.",
        )

    try:
        client = get_user_client(token)
        result = (
            client.table("profiles")
            .update(updates)
            .eq("id", user_id)
            .execute()
        )
    except Exception as e:
        print(f"[users/me PATCH] update failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update profile. Please try again.",
        )

    # An update that matches no row (missing profile, or RLS blocked it) comes
    # back as an empty list rather than raising — surface that as a 404.
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    profile = result.data[0]
    return ProfileResponse(
        user_id=user_id,
        name=profile["name"],
        email=profile["email"],
        initials=profile["initials"],
        theme=profile["theme"],
        default_coach_mode=profile["default_coach_mode"],
    )
