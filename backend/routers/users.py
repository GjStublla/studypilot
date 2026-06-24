from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel

from supabase_client import supabase, get_user_client

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

    # --- Step 3: Query the profiles table as the user (RLS-enforced) ---
    # Use a client scoped to the caller's verified JWT so the profiles RLS policy
    # (auth.uid() = id) limits the read to their own row. No service-role key on
    # this path — defense in depth.
    try:
        user_client = get_user_client(token)
        result = user_client.table("profiles").select("*").eq("id", user_id).single().execute()
    except Exception as e:
        error_str = str(e).lower()
        # PostgREST returns "PGRST116" when .single() finds no rows — that's a
        # genuine 404. Any other exception is an infrastructure or auth problem
        # and should surface as 500 so the client doesn't misdiagnose it as a
        # missing profile and attempt to re-create the account.
        if "pgrst116" in error_str or "no rows" in error_str:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found. The account may not have been set up correctly.",
            )
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

    # --- Step 4: Return the profile ---
    return ProfileResponse(
        user_id=user_id,
        name=profile["name"],
        email=profile["email"],
        initials=profile["initials"],
        theme=profile["theme"],
        default_coach_mode=profile["default_coach_mode"],
    )
