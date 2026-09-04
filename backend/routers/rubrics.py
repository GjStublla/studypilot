"""
Rubrics router — /rubrics

Endpoints:
    GET    /rubrics              List the logged-in user's rubrics with criteria
    POST   /rubrics              Create a new rubric with criteria
    DELETE /rubrics/{id}         Delete a rubric and all its criteria
    PATCH  /rubrics/{id}/active  Set a rubric as the active one (deactivates others)

All queries are RLS-scoped via get_user_client(), so users can only see and
modify their own rubric rows.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints

from dependencies import verify_token, get_token
from supabase_client import get_user_client

router = APIRouter(prefix="/rubrics", tags=["rubrics"])


# ─── Models ───────────────────────────────────────────────────────────────────

class RubricCriterion(BaseModel):
    id: str
    name: str
    score: int
    max_score: int


class RubricResponse(BaseModel):
    id: str
    title: str
    course: str
    uploaded_at: str
    active: bool
    sessions_count: int
    knowledge_document_id: str | None = None
    file_search_status: str
    criteria: list[RubricCriterion]


# Criterion supplied when creating a rubric.
# id is omitted — the DB generates it.
class CreateCriterionRequest(BaseModel):
    name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    ]
    max_score: int = Field(default=4, ge=1, le=100)


class CreateRubricRequest(BaseModel):
    title: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=300),
    ]
    course: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    ]
    criteria: list[CreateCriterionRequest] = Field(
        default=[],
        # Reasonable upper bound — a rubric with 30+ criteria is unusable
        max_length=30,
    )


class CreateRubricResponse(BaseModel):
    id: str
    title: str
    course: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[RubricResponse],
    summary="List the logged-in user's rubrics with their criteria",
)
def list_rubrics(
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Returns all rubrics owned by the authenticated user, ordered by most
    recently uploaded first. Each rubric includes its full criteria list.
    """
    client = get_user_client(token)

    try:
        result = (
            client.table("rubrics")
            .select(
                "id, title, course, uploaded_at, active, sessions_count, knowledge_document_id, file_search_status, "
                "rubric_criteria(id, name, score, max_score)"
            )
            .eq("user_id", user_id)
            .order("uploaded_at", desc=True)
            .execute()
        )
    except Exception as e:
        print(f"[rubrics] list_rubrics failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve rubrics. Please try again.",
        )

    rubrics = []
    for row in (result.data or []):
        criteria = [
            RubricCriterion(
                id=c["id"],
                name=c["name"],
                score=c["score"] if c["score"] is not None else 0,
                max_score=c["max_score"] if c["max_score"] is not None else 4,
            )
            for c in (row.get("rubric_criteria") or [])
        ]
        rubrics.append(
            RubricResponse(
                id=row["id"],
                title=row["title"],
                course=row["course"],
                uploaded_at=row["uploaded_at"],
                active=row.get("active") or False,
                sessions_count=row.get("sessions_count") or 0,
                knowledge_document_id=row.get("knowledge_document_id"),
                file_search_status=row.get("file_search_status") or "not_indexed",
                criteria=criteria,
            )
        )

    return rubrics


@router.post(
    "",
    response_model=CreateRubricResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new rubric with criteria",
)
def create_rubric(
    body: CreateRubricRequest,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Creates a rubric row and inserts all supplied criteria atomically via the
    create_rubric_with_criteria DB function. If the criteria insert fails the
    rubric insert is automatically rolled back — no orphan rows.

    The rubric starts inactive — use PATCH /rubrics/{id}/active to make it
    the active one for coaching sessions.
    """
    client = get_user_client(token)

    criteria_payload = [
        {"name": c.name, "max_score": c.max_score}
        for c in body.criteria
    ]

    try:
        result = client.rpc(
            "create_rubric_with_criteria",
            {
                "p_user_id": user_id,
                "p_title": body.title,
                "p_course": body.course,
                "p_criteria": criteria_payload,
            },
        ).execute()
    except Exception as e:
        print(f"[rubrics] create_rubric_with_criteria rpc failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create rubric. Please try again.",
        )

    row = result.data
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create rubric. Please try again.",
        )

    return CreateRubricResponse(
        id=row["id"],
        title=row["title"],
        course=row["course"],
    )


@router.delete(
    "/{rubric_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a rubric and all its criteria",
)
def delete_rubric(
    rubric_id: UUID,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Permanently deletes a rubric. The rubric_criteria rows are removed
    automatically by the ON DELETE CASCADE constraint in the DB schema.

    Returns 404 if the rubric doesn't exist or belongs to another user.
    Returns 409 if the rubric is currently active — the caller must set
    another rubric as active first, or deactivate this one before deleting.
    This prevents the extension from silently losing its coaching context.
    """
    client = get_user_client(token)
    rubric_id = str(rubric_id)

    # Fetch the rubric first to check ownership and active status.
    try:
        fetch_result = (
            client.table("rubrics")
            .select("id, active")
            .eq("id", rubric_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        error_str = str(e).lower()
        if "pgrst116" in error_str or "no rows" in error_str:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rubric not found.",
            )
        print(f"[rubrics] delete_rubric fetch failed for rubric {rubric_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete rubric. Please try again.",
        )

    if not fetch_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rubric not found.",
        )

    # Block deletion of the active rubric so the extension doesn't lose context.
    if fetch_result.data.get("active"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete the active rubric. Set another rubric as active first.",
        )

    try:
        client.table("rubrics").delete().eq("id", rubric_id).eq("user_id", user_id).execute()
    except Exception as e:
        print(f"[rubrics] delete_rubric failed for rubric {rubric_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete rubric. Please try again.",
        )


@router.patch(
    "/{rubric_id}/active",
    response_model=RubricResponse,
    summary="Set a rubric as the active one for coaching sessions",
)
def set_active_rubric(
    rubric_id: UUID,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Marks the given rubric as active and deactivates all others owned by
    the same user atomically via the set_active_rubric DB function. Both
    updates happen in a single SQL statement so there is never a window
    with zero active rubrics.

    The active rubric is what the extension and Chat Coach use as context
    during a coaching session.
    """
    client = get_user_client(token)
    rubric_id = str(rubric_id)

    try:
        result = client.rpc(
            "set_active_rubric",
            {
                "p_rubric_id": rubric_id,
                "p_user_id": user_id,
            },
        ).execute()
    except Exception as e:
        error_str = str(e).lower()
        print(f"[rubrics] set_active_rubric rpc error for rubric {rubric_id}: {e}")
        if "p0002" in error_str or "rubric not found" in error_str:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rubric not found.",
            )
        if "42501" in error_str or "unauthorized" in error_str:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to activate this rubric.",
            )
        print(f"[rubrics] set_active_rubric rpc failed for rubric {rubric_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not activate rubric. Please try again.",
        )

    row = result.data
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rubric not found.",
        )

    criteria = [
        RubricCriterion(
            id=c["id"],
            name=c["name"],
            score=c["score"] if c["score"] is not None else 0,
            max_score=c["max_score"] if c["max_score"] is not None else 4,
        )
        for c in (row.get("criteria") or [])
    ]

    return RubricResponse(
        id=row["id"],
        title=row["title"],
        course=row["course"],
        uploaded_at=row["uploaded_at"],
        active=row["active"],
        sessions_count=row.get("sessions_count") or 0,
        file_search_status=row.get("file_search_status") or "not_indexed",
        criteria=criteria,
    )
