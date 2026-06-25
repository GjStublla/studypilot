"""
Sessions router — /sessions

Endpoints:
    GET  /sessions              List the logged-in user's sessions (summary list)
    GET  /sessions/{id}         Full session detail: metadata + transcript + action items
    POST /sessions              Save a new session (called by the Chrome extension)
    POST /sessions/{id}/messages  Append transcript messages to an existing session

All routes are RLS-scoped: the Supabase PostgREST client runs as the verified
user, so the DB enforces that users can only read/write their own rows.
"""

from __future__ import annotations

from typing import Literal, NoReturn
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from dependencies import verify_token, get_token
from supabase_client import get_user_client

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _duration_str(seconds: int) -> str:
    """Convert integer seconds to a human-readable string like '24m' or '1h 5m'."""
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours, remaining = divmod(minutes, 60)
    return f"{hours}h {remaining}m" if remaining else f"{hours}h"


def _when_str(ts: str | None) -> str:
    """
    Convert an ISO timestamp string to a relative label the dashboard
    expects ('Today · 2:38 PM', 'Yesterday · 8:12 PM', or 'Apr 21 · 10:02 AM').
    """
    if not ts:
        return ""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta = (now.date() - dt.date()).days

        # Format hour:minute AM/PM without a leading zero.
        # strftime %-I is Linux-only; %#I is Windows-only.
        # Use %I and strip the leading zero manually for cross-platform safety.
        time_str = dt.strftime("%I:%M %p").lstrip("0")

        if delta == 0:
            return f"Today · {time_str}"
        if delta == 1:
            return f"Yesterday · {time_str}"
        # Use %d and strip leading zero manually — %-d is not portable either.
        day = str(dt.day)
        month = dt.strftime("%b")
        return f"{month} {day} · {time_str}"
    except Exception:
        return ts or ""


def _handle_postgrest_error(e: Exception, context: str) -> NoReturn:
    """
    Re-raise Supabase/PostgREST exceptions as appropriate HTTP errors.
    PGRST116 means .single() found no rows → 404.
    Everything else is an infrastructure problem → 500 with server-side log.

    Typed as NoReturn because it always raises — callers don't need a
    guard `return` after calling this.
    """
    error_str = str(e).lower()
    if "pgrst116" in error_str or "no rows" in error_str:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{context} not found.",
        )
    print(f"[sessions] DB error ({context}): {e}")
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="A database error occurred. Please try again.",
    )


# ─── Response / Request models ────────────────────────────────────────────────

class SessionSummary(BaseModel):
    """Lightweight session row used in the list view."""
    id: str
    title: str
    source: str
    mode: str
    duration: str        # formatted e.g. "24m"
    when: str            # formatted relative label
    rubric_id: str | None
    summary: str | None


class TranscriptMessage(BaseModel):
    id: str
    who: Literal["You", "StudyPilot"]
    text: str
    t: str               # formatted time offset e.g. "2:39"


class ActionItemInSession(BaseModel):
    id: str
    text: str
    done: bool


class SessionDetail(BaseModel):
    """Full session: metadata + transcript + action items."""
    id: str
    title: str
    source: str
    mode: str
    duration: str
    when: str
    rubric_id: str | None
    summary: str | None
    transcript: list[TranscriptMessage]
    action_items: list[ActionItemInSession]


# POST /sessions
class CreateSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300, strip_whitespace=True)
    mode: Literal[
        "Essay Coach", "Presentation Coach", "Study Coach", "Lecture", "Research Reader"
    ]
    duration_seconds: int = Field(ge=0)
    rubric_id: str | None = None
    page_title: str | None = Field(default=None, max_length=500)
    page_url: str | None = Field(default=None, max_length=2000)
    summary: str | None = Field(default=None, max_length=5000)
    source: str = Field(default="Chrome Extension", max_length=100)


class CreateSessionResponse(BaseModel):
    id: str
    title: str


# POST /sessions/{id}/messages
class CreateMessageRequest(BaseModel):
    role: Literal["user", "ai", "system"]
    message_text: str = Field(min_length=1, max_length=10_000, strip_whitespace=True)
    time_offset_seconds: int = Field(default=0, ge=0)


class CreateMessageResponse(BaseModel):
    id: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[SessionSummary],
    summary="List the logged-in user's sessions",
)
def list_sessions(
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Returns all sessions for the authenticated user, ordered by most recent first.
    Each item is a summary (no transcript or action items) for fast list rendering.
    """
    try:
        client = get_user_client(token)
        result = (
            client.table("sessions")
            .select("id, title, source, mode, duration_seconds, when_timestamp, rubric_id, summary")
            .eq("user_id", user_id)
            .order("when_timestamp", desc=True)
            .execute()
        )
    except Exception as e:
        print(f"[sessions] list_sessions failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve sessions. Please try again.",
        )

    return [
        SessionSummary(
            id=row["id"],
            title=row["title"],
            source=row["source"] or "Chrome Extension",
            mode=row["mode"],
            duration=_duration_str(row["duration_seconds"] or 0),
            when=_when_str(row["when_timestamp"]),
            rubric_id=row.get("rubric_id"),
            summary=row.get("summary"),
        )
        for row in (result.data or [])
    ]


@router.get(
    "/{session_id}",
    response_model=SessionDetail,
    summary="Get full session detail including transcript and action items",
)
def get_session(
    session_id: str,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Returns the full session: metadata, transcript messages, and associated
    action items.  RLS ensures the user can only fetch their own sessions.
    """
    client = get_user_client(token)

    # --- Fetch session row ---
    try:
        session_result = (
            client.table("sessions")
            .select("id, title, source, mode, duration_seconds, when_timestamp, rubric_id, summary")
            .eq("id", session_id)
            .eq("user_id", user_id)   # belt-and-suspenders on top of RLS
            .single()
            .execute()
        )
    except Exception as e:
        _handle_postgrest_error(e, "Session")

    session = session_result.data

    # --- Fetch transcript messages ---
    try:
        messages_result = (
            client.table("session_messages")
            .select("id, role, message_text, time_offset_seconds")
            .eq("session_id", session_id)
            .order("time_offset_seconds", desc=False)
            .execute()
        )
    except Exception as e:
        print(f"[sessions] messages query failed for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve transcript. Please try again.",
        )

    # --- Fetch action items linked to this session ---
    try:
        actions_result = (
            client.table("action_items")
            .select("id, text, done")
            .eq("session_id", session_id)
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
    except Exception as e:
        print(f"[sessions] action_items query failed for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve action items. Please try again.",
        )

    # --- Map transcript role → dashboard "who" label ---
    def _who(role: str) -> Literal["You", "StudyPilot"]:
        return "You" if role == "user" else "StudyPilot"

    def _t_label(offset_seconds: int) -> str:
        """Convert offset seconds to MM:SS display string."""
        m, s = divmod(offset_seconds, 60)
        return f"{m}:{s:02d}"

    transcript = [
        TranscriptMessage(
            id=msg["id"],
            who=_who(msg["role"]),
            text=msg["message_text"],
            t=_t_label(msg["time_offset_seconds"] or 0),
        )
        for msg in (messages_result.data or [])
    ]

    action_items = [
        ActionItemInSession(id=a["id"], text=a["text"], done=a["done"])
        for a in (actions_result.data or [])
    ]

    return SessionDetail(
        id=session["id"],
        title=session["title"],
        source=session["source"] or "Chrome Extension",
        mode=session["mode"],
        duration=_duration_str(session["duration_seconds"] or 0),
        when=_when_str(session["when_timestamp"]),
        rubric_id=session.get("rubric_id"),
        summary=session.get("summary"),
        transcript=transcript,
        action_items=action_items,
    )


@router.post(
    "",
    response_model=CreateSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save a new coaching session (called by the Chrome extension)",
)
def create_session(
    body: CreateSessionRequest,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Creates a new session row for the authenticated user.
    Typically called by the Chrome extension at the end of a coaching session.

    If rubric_id is provided, the caller must own that rubric — RLS enforces
    this at the DB level; a foreign-key violation will surface as 400.
    """
    client = get_user_client(token)

    insert_data: dict = {
        "user_id": user_id,
        "title": body.title,
        "mode": body.mode,
        "duration_seconds": body.duration_seconds,
        "source": body.source,
    }
    # Only include optional fields when present to avoid sending null where
    # the DB column has a NOT NULL constraint or a meaningful default.
    if body.rubric_id is not None:
        insert_data["rubric_id"] = body.rubric_id
    if body.page_title is not None:
        insert_data["page_title"] = body.page_title
    if body.page_url is not None:
        insert_data["page_url"] = body.page_url
    if body.summary is not None:
        insert_data["summary"] = body.summary

    try:
        result = (
            client.table("sessions")
            .insert(insert_data)
            .select("id, title")
            .single()
            .execute()
        )
    except Exception as e:
        error_str = str(e).lower()
        # Foreign-key violation means the supplied rubric_id doesn't belong to
        # this user — return 400 rather than leaking a 500.
        if "foreign key" in error_str or "fk_" in error_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="rubric_id is invalid or does not belong to your account.",
            )
        print(f"[sessions] create_session failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save session. Please try again.",
        )

    return CreateSessionResponse(id=result.data["id"], title=result.data["title"])


@router.post(
    "/{session_id}/messages",
    response_model=CreateMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Append a transcript message to a session",
)
def create_message(
    session_id: str,
    body: CreateMessageRequest,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Saves a single transcript message into session_messages.

    The session must belong to the authenticated user — RLS on session_messages
    enforces this via a join to sessions.user_id = auth.uid().

    Callers can batch-insert by calling this endpoint repeatedly, or save
    messages incrementally as the session progresses.
    """
    client = get_user_client(token)

    # Verify the session belongs to this user before writing a message.
    # This gives a cleaner 404 than letting the RLS violation surface as a
    # generic DB error.
    try:
        session_check = (
            client.table("sessions")
            .select("id")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        _handle_postgrest_error(e, "Session")

    if not session_check.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    try:
        result = (
            client.table("session_messages")
            .insert({
                "session_id": session_id,
                "role": body.role,
                "message_text": body.message_text,
                "time_offset_seconds": body.time_offset_seconds,
            })
            .select("id")
            .single()
            .execute()
        )
    except Exception as e:
        print(f"[sessions] create_message failed for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save message. Please try again.",
        )

    return CreateMessageResponse(id=result.data["id"])
