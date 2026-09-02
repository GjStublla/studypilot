"""
Sessions router — /sessions

Endpoints:
    GET    /sessions                        List the logged-in user's sessions (paginated)
    GET    /sessions/{id}                   Full session detail: metadata + transcript + action items
    POST   /sessions                        Save a new session (called by the Chrome extension)
    PATCH  /sessions/{id}                   Update session title / summary / rubric
    DELETE /sessions/{id}                   Delete a session and its messages + action items
    POST   /sessions/{id}/messages          Append a single transcript message
    POST   /sessions/{id}/messages/batch    Append multiple transcript messages in one call

All routes are RLS-scoped: the Supabase PostgREST client runs as the verified
user, so the DB enforces that users can only read/write their own rows.
"""

from __future__ import annotations

from typing import Annotated, Literal, NoReturn
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, StringConstraints

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

        time_str = dt.strftime("%I:%M %p").lstrip("0")

        if delta == 0:
            return f"Today · {time_str}"
        if delta == 1:
            return f"Yesterday · {time_str}"
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


def _require_session_owner(client, session_id: str, user_id: str) -> dict:
    """
    Fetch a session row and verify ownership. Raises 404 if not found or not owned.
    Returns the raw session dict on success.
    """
    try:
        result = (
            client.table("sessions")
            .select("id, title, source, mode, duration_seconds, when_timestamp, rubric_id, summary, active")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        _handle_postgrest_error(e, "Session")

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return result.data


# ─── Response / Request models ────────────────────────────────────────────────

class SessionSummary(BaseModel):
    id: str
    title: str
    source: str
    mode: str
    duration: str
    when: str
    rubric_id: str | None
    summary: str | None


class TranscriptMessage(BaseModel):
    id: str
    who: Literal["You", "StudyPilot"]
    text: str
    t: str


class ActionItemInSession(BaseModel):
    id: str
    text: str
    done: bool


class SessionDetail(BaseModel):
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


class CreateSessionRequest(BaseModel):
    title: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=300),
    ]
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


class UpdateSessionRequest(BaseModel):
    """All fields optional — send only what changed."""
    title: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=300),
    ] | None = None
    summary: str | None = Field(default=None, max_length=5000)
    rubric_id: str | None = None


class CreateMessageRequest(BaseModel):
    role: Literal["user", "ai", "system"]
    message_text: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=10_000),
    ]
    time_offset_seconds: int = Field(default=0, ge=0)


class CreateMessageResponse(BaseModel):
    id: str


class BatchCreateMessageRequest(BaseModel):
    messages: list[CreateMessageRequest] = Field(min_length=1, max_length=500)


class BatchCreateMessageResponse(BaseModel):
    inserted: int
    ids: list[str]


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[SessionSummary],
    summary="List the logged-in user's sessions",
)
def list_sessions(
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
):
    """
    Returns sessions for the authenticated user, most recent first.
    Supports pagination via limit/offset and optional server-side search via ?q=.
    """
    try:
        client = get_user_client(token)
        query = (
            client.table("sessions")
            .select("id, title, source, mode, duration_seconds, when_timestamp, rubric_id, summary")
            .eq("user_id", user_id)
            .order("when_timestamp", desc=True)
            .range(offset, offset + limit - 1)
        )
        if q and q.strip():
            # Push search to the DB with a case-insensitive pattern match on title.
            query = query.ilike("title", f"%{q.strip()}%")
        result = query.execute()
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
    session_id: UUID,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    client = get_user_client(token)
    session_id = str(session_id)

    session = _require_session_owner(client, session_id, user_id)

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

    def _who(role: str) -> Literal["You", "StudyPilot"]:
        return "You" if role == "user" else "StudyPilot"

    def _t_label(offset_seconds: int) -> str:
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
    client = get_user_client(token)

    insert_data: dict = {
        "user_id": user_id,
        "title": body.title,
        "mode": body.mode,
        "duration_seconds": body.duration_seconds,
        "source": body.source,
    }
    if body.rubric_id is not None:
        insert_data["rubric_id"] = body.rubric_id
    if body.page_title is not None:
        insert_data["page_title"] = body.page_title
    if body.page_url is not None:
        insert_data["page_url"] = body.page_url
    if body.summary is not None:
        insert_data["summary"] = body.summary

    try:
        result = client.table("sessions").insert(insert_data).execute()
    except Exception as e:
        error_str = str(e).lower()
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

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save session. Please try again.",
        )

    row = result.data[0]
    return CreateSessionResponse(id=row["id"], title=row["title"])


@router.patch(
    "/{session_id}",
    response_model=SessionSummary,
    summary="Update a session's title, summary, or rubric",
)
def update_session(
    session_id: UUID,
    body: UpdateSessionRequest,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Partially updates a session. Only title, summary, and rubric_id are
    writable post-creation. Send only the fields you want to change.
    Returns the updated session summary.
    """
    client = get_user_client(token)
    session_id = str(session_id)

    # Build update dict from explicitly provided fields only.
    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.summary is not None:
        updates["summary"] = body.summary
    if "rubric_id" in body.model_fields_set:
        updates["rubric_id"] = body.rubric_id  # allows setting to null

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No valid fields provided for update.",
        )

    # Verify ownership first so we return a clean 404, not a silent no-op.
    _require_session_owner(client, session_id, user_id)

    try:
        result = (
            client.table("sessions")
            .update(updates)
            .eq("id", session_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        error_str = str(e).lower()
        if "foreign key" in error_str or "fk_" in error_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="rubric_id is invalid or does not belong to your account.",
            )
        print(f"[sessions] update_session failed for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update session. Please try again.",
        )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    row = result.data[0]
    return SessionSummary(
        id=row["id"],
        title=row["title"],
        source=row.get("source") or "Chrome Extension",
        mode=row["mode"],
        duration=_duration_str(row.get("duration_seconds") or 0),
        when=_when_str(row.get("when_timestamp")),
        rubric_id=row.get("rubric_id"),
        summary=row.get("summary"),
    )


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a session and all its messages and action items",
)
def delete_session(
    session_id: UUID,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Permanently deletes a session. The associated session_messages and
    action_items rows are removed automatically by ON DELETE CASCADE constraints
    in the DB schema.

    Returns 404 if the session doesn't exist or belongs to another user.
    """
    client = get_user_client(token)
    session_id = str(session_id)

    # Verify ownership before deleting so we can distinguish 404 from a DB error.
    _require_session_owner(client, session_id, user_id)

    try:
        result = (
            client.table("sessions")
            .delete()
            .eq("id", session_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        print(f"[sessions] delete_session failed for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete session. Please try again.",
        )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")


@router.post(
    "/{session_id}/messages",
    response_model=CreateMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Append a single transcript message to a session",
)
def create_message(
    session_id: UUID,
    body: CreateMessageRequest,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Saves a single transcript message into session_messages.
    For multiple messages at once use POST /sessions/{id}/messages/batch.
    """
    client = get_user_client(token)
    session_id = str(session_id)

    _require_session_owner(client, session_id, user_id)

    try:
        result = (
            client.table("session_messages")
            .insert({
                "session_id": session_id,
                "role": body.role,
                "message_text": body.message_text,
                "time_offset_seconds": body.time_offset_seconds,
            })
            .execute()
        )
    except Exception as e:
        print(f"[sessions] create_message failed for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save message. Please try again.",
        )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save message. Please try again.",
        )

    return CreateMessageResponse(id=result.data[0]["id"])


@router.post(
    "/{session_id}/messages/batch",
    response_model=BatchCreateMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Append multiple transcript messages to a session in one call",
)
def batch_create_messages(
    session_id: UUID,
    body: BatchCreateMessageRequest,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Inserts up to 500 transcript messages in a single DB round-trip.
    Preferred over calling POST /messages repeatedly for full transcripts.
    All messages must belong to the same session.
    """
    client = get_user_client(token)
    session_id = str(session_id)

    _require_session_owner(client, session_id, user_id)

    rows = [
        {
            "session_id": session_id,
            "role": m.role,
            "message_text": m.message_text,
            "time_offset_seconds": m.time_offset_seconds,
        }
        for m in body.messages
    ]

    try:
        result = client.table("session_messages").insert(rows).execute()
    except Exception as e:
        print(f"[sessions] batch_create_messages failed for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save messages. Please try again.",
        )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save messages. Please try again.",
        )

    return BatchCreateMessageResponse(
        inserted=len(result.data),
        ids=[row["id"] for row in result.data],
    )
