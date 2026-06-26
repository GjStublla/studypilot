from fastapi import APIRouter, HTTPException, Header, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
import re

from rate_limit import limiter
from supabase_client import supabase, supabase_admin

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------- Password policy ----------
# Kept in one place so backend and any future tooling stay in sync.
# Min 8 chars, at least one uppercase letter, at least one digit.
# The regex enforces all three — the Field min_length is a fast pre-check
# that short-circuits before the regex runs.
PASSWORD_POLICY_RE = re.compile(r'^(?=.*[A-Z])(?=.*\d).{8,}$')
PASSWORD_POLICY_MSG = (
    "Password must be at least 8 characters and contain "
    "at least one uppercase letter and one number."
)


# ---------- Request / Response models ----------

class SignUpRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100, strip_whitespace=True)
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not PASSWORD_POLICY_RE.match(v):
            raise ValueError(PASSWORD_POLICY_MSG)
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    # Max length prevents oversized payload attacks on the login endpoint.
    password: str = Field(min_length=1, max_length=256)


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
    email_confirmation_required: bool =True


class MessageResponse(BaseModel):
    message: str


# ---------- Sign up ----------

@router.post(
    "/signup",
    response_model=SignupPendingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new student account",
)
@limiter.limit("5/minute")
def signup(request: Request, body: SignUpRequest):
    """
    Register a new student account.

    Password policy: min 8 characters, at least one uppercase letter, one number.
    Enforced by the SignUpRequest validator above — invalid passwords get a 422
    with a clear message before this function is even called.

    Duplicate email handling: Supabase deliberately returns the same response
    whether the email already exists or not (anti-enumeration). This means a
    user with a duplicate email will see "check your email" but won't receive
    one. This is the correct industry standard behavior — we do not leak
    whether an email is registered.

    Google OAuth + email/password: if a user previously signed up via Google
    with the same email, Supabase will link the accounts when they set a
    password through the "forgot password" flow. They cannot sign up again
    from scratch — the duplicate email behavior above applies.
    """
    try:
        supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {
                "data": {
                    # Stored in auth.users.raw_user_meta_data.
                    # The DB trigger reads this to populate profiles.name and initials.
                    "name": body.name,
                }
            },
        })
    except Exception as e:
        print(f"[signup] {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create account. Please check your information and try again.",
        )

    # Always return the same message whether the email is new or already exists.
    # The second sentence nudges duplicate-email users toward signing in
    # without explicitly confirming whether the email is registered.
    return SignupPendingResponse(
        message="Check your email to confirm your account, then sign in. If you already have an account, sign in directly.",
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

    If the email belongs to a Google OAuth account (no password set), returns
    a specific error code so the frontend can prompt the user to use Google
    sign-in instead.
    """
    try:
        response = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        # Login failed — check whether this is a Google-only account so we
        # can give a more helpful error than the generic "invalid credentials".
        # Uses a targeted admin lookup by email — does NOT fetch all users.
        try:
            user_lookup = supabase_admin.auth.admin.get_user_by_email(body.email)
            if user_lookup and user_lookup.user:
                identities = user_lookup.user.identities or []
                has_google = any(getattr(i, "provider", None) == "google" for i in identities)
                has_email  = any(getattr(i, "provider", None) == "email"  for i in identities)
                if has_google and not has_email:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="This account uses Google sign-in. Please use the 'Continue with Google' button to log in.",
                    )
        except HTTPException:
            raise
        except Exception:
            pass  # lookup failed — fall through to generic error

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
@limiter.limit("20/minute")
def logout(request: Request, authorization: str = Header(...)):
    """
    Signs out the current user by invalidating their session on Supabase.
    Uses the service-role admin client, which is the only client permitted
    to call sign_out() on behalf of another user's token.
    The frontend should also clear the stored JWT after calling this.
    """
    # Reject malformed headers rather than silently skipping the sign-out.
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        )

    token = authorization.replace("Bearer ", "", 1)
    try:
        # admin.sign_out() requires the service-role client — the anon client
        # does not have permission to invalidate sessions.
        supabase_admin.auth.admin.sign_out(token)
    except Exception as e:
        # Log but still return success — the client clears its token regardless,
        # and leaking sign-out errors could aid session enumeration.
        print(f"[logout] sign_out failed (session may still be valid server-side): {e}")

    return MessageResponse(message="Logged out successfully.")


# ---------- Refresh token ----------

@router.post(
    "/refresh",
    response_model=AuthResponse,
    summary="Refresh an expired access token",
)
@limiter.limit("30/minute")
def refresh(request: Request, body: RefreshRequest):
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

    # Guard both session and user — either being None would cause an AttributeError below.
    if response.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired. Please log in again.",
        )

    return AuthResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
        user_id=str(response.user.id),
        # email can be None for OAuth users in some Supabase flows — fall back
        # to empty string so the frontend never stores the literal "null".
        email=response.user.email or "",
    )
