from fastapi import APIRouter, HTTPException, Header, Request, status
from gotrue.errors import AuthApiError
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


class SignupResponse(BaseModel):
    message: str
    email_confirmation_required: bool
    access_token: str | None = None
    refresh_token: str | None = None
    user_id: str | None = None
    email: str | None = None


def _raise_signup_auth_error(e: AuthApiError) -> None:
    if e.code == "email_address_invalid":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "That email address was rejected as undeliverable. "
                "Use a real, reachable email address."
            ),
        )
    if e.code in ("over_email_send_rate_limit", "over_request_rate_limit") or e.status == 429:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many confirmation emails sent. Please wait an hour and try again.",
        )
    if e.code in ("user_already_exists", "email_exists"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists — sign in instead.",
        )
    raise HTTPException(status_code=e.status or status.HTTP_400_BAD_REQUEST, detail=e.message)


class MessageResponse(BaseModel):
    message: str


# ---------- Sign up ----------

@router.post(
    "/signup",
    response_model=SignupResponse,
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

    Accounts are created pre-confirmed via the admin API rather than
    supabase.auth.sign_up(): the project uses Supabase's built-in email
    service, which validates recipient deliverability and caps confirmation
    emails at 2/hour — both of which made normal signups fail. The admin path
    sends no email, so neither restriction applies. A session is minted right
    after so the client can log the user in. Duplicate emails return a clear
    409 error.

    Google OAuth + email/password: if a user previously signed up via Google
    with the same email, Supabase will link the accounts when they set a
    password through the "forgot password" flow. They cannot sign up again
    from scratch — duplicate signup returns an explicit error.
    """
    try:
        created = supabase_admin.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
            "user_metadata": {
                # Stored in auth.users.raw_user_meta_data.
                # The DB trigger reads this to populate profiles.name and initials.
                "name": body.name,
            },
        })
    except AuthApiError as e:
        _raise_signup_auth_error(e)
    except Exception as e:
        print(f"[signup] {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach authentication service. Please try again shortly.",
        )

    # Mint a session so the client can take the user straight to the dashboard.
    try:
        res = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception as e:
        # Account exists at this point — don't fail the signup over a login
        # hiccup; the client falls back to the sign-in form.
        print(f"[signup] post-create sign-in failed: {type(e).__name__}: {e}")
        res = None

    if res is not None and res.session is not None and res.user is not None:
        return SignupResponse(
            message="Account created successfully.",
            email_confirmation_required=False,
            access_token=res.session.access_token,
            refresh_token=res.session.refresh_token,
            user_id=str(res.user.id),
            email=res.user.email or body.email,
        )

    return SignupResponse(
        message="Account created. You can sign in now.",
        email_confirmation_required=False,
        user_id=str(created.user.id) if created.user else None,
        email=body.email,
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
    except AuthApiError as e:
        if e.code == "email_not_confirmed":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=(
                    "Please confirm your email before signing in. "
                    "Check your inbox for the confirmation link."
                ),
            )
        if e.code == "invalid_credentials":
            # Check whether this is a Google-only account so we can give a more
            # helpful error than the generic "invalid credentials".
            try:
                user_lookup = supabase_admin.auth.admin.get_user_by_email(body.email)
                if user_lookup and user_lookup.user:
                    identities = user_lookup.user.identities or []
                    has_google = any(getattr(i, "provider", None) == "google" for i in identities)
                    has_email = any(getattr(i, "provider", None) == "email" for i in identities)
                    if has_google and not has_email:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="This account uses Google sign-in. Please use the 'Continue with Google' button to log in.",
                        )
            except HTTPException:
                raise
            except Exception:
                pass
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )
        raise HTTPException(status_code=e.status or status.HTTP_401_UNAUTHORIZED, detail=e.message)
    except Exception:
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
        # Swallow the error — the client clears its token regardless.
        # "Session does not exist" is expected for admin-created users whose
        # sessions aren't tracked in auth.sessions; the token is already invalid.
        pass

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
