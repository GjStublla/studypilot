from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel

from supabase_client import supabase, supabase_admin

router = APIRouter(prefix="/users", tags=["users"])


# ---------- Response model ----------
# Matches the columns in the public.profiles table

class ProfileResponse(BaseModel):
    user_id: str
    name: str
    email: str
    initials: str
    theme: str
    default_coach_mode: str


# ---------- GET /users/me ----------

@router.get(
    "/me",
    response_model=ProfileResponse,
    summary="Get the logged-in user's profile",
)
def get_me(authorization: str = Header(...)):
    """
    Returns the full profile for the currently logged-in user.

    The frontend must send:
        Authorization: Bearer <access_token>

    Steps:
    1. Extract the JWT from the Authorization header
    2. Ask Supabase Auth to verify it and return the user
    3. Use the user's ID to query the profiles table
    4. Return the profile data
    """

    # --- Step 1: Extract the token from "Bearer <token>" ---
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        )

    token = authorization.replace("Bearer ", "")

    # --- Step 2: Verify the JWT with Supabase Auth ---
    # This confirms the token is real and not expired
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

    user_id = str(auth_response.user.id)

    # --- Step 3: Query the profiles table using the admin client ---
    # We use supabase_admin (service role) here so RLS doesn't block the query.
    # The JWT was already verified above — this is safe.
    try:
        result = supabase_admin.table("profiles").select("*").eq("id", user_id).single().execute()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found. The account may not have been set up correctly.",
        )

    profile = result.data

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    # --- Step 4: Return the profile ---
    return ProfileResponse(
        user_id=user_id,
        name=profile["name"],
        email=profile["email"],
        initials=profile["initials"],
        theme=profile["theme"],
        default_coach_mode=profile["default_coach_mode"],
    )
