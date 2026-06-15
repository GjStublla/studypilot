from fastapi import APIRouter, HTTPException, Header, Request, status
from pydantic import BaseModel, EmailStr, Field

from rate_limit import limiter
from supabase_client import supabase

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------- Request / Response models ----------

class SignUpRequest(BaseModel):
    email: EmailStr
    # Enforced server-side so it can't be bypassed by calling the API directly
    # (the client also checks). Keep in sync with the Supabase dashboard password
    # policy (Auth → Policies) since there is no supabase/config.toml.
    password: str = Field(min_length=8)
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: str
    # The Supabase SDK can return a user with no email in some flows, so allow None
    # rather than risk a 500 from response-model validation.
    email: str | None = None


class SignupPendingResponse(BaseModel):
    message: str
    email_confirmation_required: bool


class MessageResponse(BaseModel):
    message: str


# ---------- Sign up ----------

@router.post(
    "/signup",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new student account",
)
@limiter.limit("5/minute")
def signup(request: Request, body: SignUpRequest):
    """
    Creates a new Supabase Auth user.
    The auth trigger in the database automatically creates a profiles row.

    If email confirmation is enabled in Supabase, returns a pending message.
    If email confirmation is disabled, returns a JWT immediately.
    """
    try:
        response = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {
                "data": {
                    # Stored in auth.users.raw_user_meta_data
                    # The DB trigger reads this to populate profiles.name and profiles.initials
                    "name": body.name,
                }
            },
        })
    except Exception as e:
        # Log the real error server-side, but return a generic message so we don't
        # leak SDK internals or whether the email is already registered.
        print(f"[signup] sign_up failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create account. Please try again.",
        )

    # Email confirmation OFF (or auto-confirm) — a session is returned, log in now.
    if response.session is not None and response.user is not None:
        return AuthResponse(
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
            user_id=str(response.user.id),
            email=response.user.email or body.email,
        )

    # Email confirmation ON (our configuration): Supabase returns no session and
    # deliberately obfuscates whether the email already existed. Return the *same*
    # response in every case so this endpoint can't be used to enumerate accounts.
    return SignupPendingResponse(
        message="Account created. Please check your email to confirm your account, then sign in.",
        email_confirmation_required=True,
    )


# ---------- Login ----------

@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Sign in with email and password",
)
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest):
    """
    Authenticates an existing user with email and password.

    Returns a JWT access token. The frontend stores this and sends it
    as Authorization: Bearer <token> on every subsequent request.
    """
    try:
        response = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        # Return a generic message — don't reveal whether the email exists
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if response.user is None or response.session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return AuthResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
        user_id=str(response.user.id),
        email=response.user.email or body.email,
    )


# ---------- Logout ----------

@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Sign out the current user",
)
def logout(authorization: str = Header(...)):
    """
    Signs out the current user by invalidating their session on Supabase.
    The frontend should also clear the stored JWT after calling this.
    """
    if authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        try:
            # Sign out this specific user's session using their token
            supabase.auth.admin.sign_out(token)
        except Exception:
            pass  # Always return success — client clears token regardless

    return MessageResponse(message="Logged out successfully.")


# ---------- Refresh token ----------

@router.post(
    "/refresh",
    response_model=AuthResponse,
    summary="Refresh an expired access token",
)
def refresh(body: RefreshRequest):
    """
    Exchanges a refresh token for a new access token.
    Call this when the frontend gets a 401 on any protected endpoint.
    The refresh token comes in the request body, not the URL.
    """
    try:
        response = supabase.auth.refresh_session(body.refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired. Please log in again.",
        )

    if response.session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired. Please log in again.",
        )

    return AuthResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
        user_id=str(response.user.id),
        email=response.user.email,
    )
