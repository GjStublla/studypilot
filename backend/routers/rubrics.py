"""
Rubrics router — /rubrics

Endpoints:
    GET /rubrics    List the logged-in user's rubrics, each including their criteria

All queries are RLS-scoped via get_user_client(), so users can only see their
own rubric rows.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from dependencies import verify_token, get_token
from supabase_client import get_user_client

router = APIRouter(prefix="/rubrics", tags=["rubrics"])


# ─── Response models ──────────────────────────────────────────────────────────

class RubricCriterion(BaseModel):
    id: str
    name: str
    score: int       # current score (0 if not yet graded)
    max_score: int   # maximum possible score


class RubricResponse(BaseModel):
    id: str
    title: str
    course: str
    uploaded_at: str          # ISO timestamp string
    active: bool
    sessions_count: int
    file_search_status: str
    criteria: list[RubricCriterion]


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
    recently uploaded first.  Each rubric includes its full criteria list.

    The criteria are fetched in a single query using PostgREST nested selects
    (rubric_criteria!rubric_id) to avoid N+1 queries.
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
                score=c["score"] or 0,
                max_score=c["max_score"] or 4,
            )
            # PostgREST returns the nested table under the relation name
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
