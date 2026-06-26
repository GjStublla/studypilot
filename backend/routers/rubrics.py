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

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

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
    file_search_status: str
    criteria: list[RubricCriterion]


# Criterion supplied when creating a rubric.
# id is omitted — the DB generates it.
class CreateCriterionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200, strip_whitespace=True)
    max_score: int = Field(default=4, ge=1, le=100)


class CreateRubricRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300, strip_whitespace=True)
    course: str = Field(min_length=1, max_length=200, strip_whitespace=True)
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
                "id, title, course, uploaded_at, active, sessions_count, file_search_status, "
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
    Creates a rubric row and inserts all supplied criteria in a single
    operation. The rubric starts inactive — use PATCH /rubrics/{id}/active
    to make it the active one for coaching sessions.
    """
    client = get_user_client(token)

    # --- Insert the rubric row ---
    try:
        rubric_result = (
            client.table("rubrics")
            .insert({
                "user_id": user_id,
                "title": body.title,
                "course": body.course,
                "active": False,
                "file_search_status": "not_indexed",
            })
            .select("id, title, course")
            .single()
            .execute()
        )
    except Exception as e:
        print(f"[rubrics] create_rubric insert failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create rubric. Please try again.",
        )

    rubric_id = rubric_result.data["id"]

    # --- Insert criteria if any were provided ---
    if body.criteria:
        criteria_rows = [
            {
                "rubric_id": rubric_id,
                "name": c.name,
                "score": 0,          # starts ungraded
                "max_score": c.max_score,
            }
            for c in body.criteria
        ]
        try:
            client.table("rubric_criteria").insert(criteria_rows).execute()
        except Exception as e:
            # Rubric was created — roll it back so we don't leave an orphan row.
            print(f"[rubrics] criteria insert failed for rubric {rubric_id}: {e}")
            try:
                client.table("rubrics").delete().eq("id", rubric_id).execute()
            except Exception as rollback_err:
                # Rollback failed — log so the orphan can be cleaned up manually.
                print(f"[rubrics] rollback failed for rubric {rubric_id}: {rollback_err}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not save rubric criteria. Please try again.",
            )

    return CreateRubricResponse(
        id=rubric_id,
        title=rubric_result.data["title"],
        course=rubric_result.data["course"],
    )


@router.delete(
    "/{rubric_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a rubric and all its criteria",
)
def delete_rubric(
    rubric_id: str,
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
    rubric_id: str,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Marks the given rubric as active and deactivates all others owned by
    the same user. Only one rubric can be active at a time.

    The active rubric is what the extension and Chat Coach use as context
    during a coaching session.
    """
    client = get_user_client(token)

    # Verify the target rubric exists and belongs to this user BEFORE
    # deactivating everything. If we deactivated first and the rubric doesn't
    # exist, the user ends up with zero active rubrics.
    try:
        check = (
            client.table("rubrics")
            .select("id")
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
        print(f"[rubrics] set_active_rubric check failed for rubric {rubric_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not activate rubric. Please try again.",
        )

    if not check.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rubric not found.",
        )

    # Safe to deactivate all — we know the target exists.
    try:
        client.table("rubrics").update({"active": False}).eq("user_id", user_id).execute()
    except Exception as e:
        print(f"[rubrics] deactivate all failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update rubric. Please try again.",
        )

    # Activate the target rubric.
    try:
        result = (
            client.table("rubrics")
            .update({"active": True})
            .eq("id", rubric_id)
            .eq("user_id", user_id)
            .select(
                "id, title, course, uploaded_at, active, sessions_count, file_search_status, "
                "rubric_criteria(id, name, score, max_score)"
            )
            .single()
            .execute()
        )
    except Exception as e:
        print(f"[rubrics] activate failed for rubric {rubric_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not activate rubric. Please try again.",
        )

    row = result.data
    criteria = [
        RubricCriterion(
            id=c["id"],
            name=c["name"],
            score=c["score"] if c["score"] is not None else 0,
            max_score=c["max_score"] if c["max_score"] is not None else 4,
        )
        for c in (row.get("rubric_criteria") or [])
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
