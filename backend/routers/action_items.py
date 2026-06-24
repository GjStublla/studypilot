"""
Action items router — /action-items

Endpoints:
    GET   /action-items        List all action items for the logged-in user
    PATCH /action-items/{id}   Toggle an action item's done state

RLS is enforced on every query via get_user_client().
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from dependencies import verify_token, get_token
from supabase_client import get_user_client

router = APIRouter(prefix="/action-items", tags=["action-items"])


# ─── Response / Request models ────────────────────────────────────────────────

class ActionItemResponse(BaseModel):
    id: str
    text: str
    session_id: str | None
    rubric_id: str | None
    done: bool


class ToggleActionItemRequest(BaseModel):
    done: bool


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[ActionItemResponse],
    summary="List all action items for the logged-in user",
)
def list_action_items(
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Returns all action items owned by the authenticated user.
    Open items come first (done=false), then completed ones, both ordered
    by creation date ascending so older items appear first within each group.
    """
    client = get_user_client(token)

    try:
        result = (
            client.table("action_items")
            .select("id, text, session_id, rubric_id, done")
            .eq("user_id", user_id)
            # Primary sort: open before done. Secondary: oldest first.
            .order("done", desc=False)
            .order("created_at", desc=False)
            .execute()
        )
    except Exception as e:
        print(f"[action-items] list_action_items failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve action items. Please try again.",
        )

    return [
        ActionItemResponse(
            id=row["id"],
            text=row["text"],
            session_id=row.get("session_id"),
            rubric_id=row.get("rubric_id"),
            done=row["done"],
        )
        for row in (result.data or [])
    ]


@router.patch(
    "/{item_id}",
    response_model=ActionItemResponse,
    summary="Toggle an action item's done state",
)
def toggle_action_item(
    item_id: str,
    body: ToggleActionItemRequest,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Updates the done field on a single action item.

    The action item must belong to the authenticated user — RLS enforces this
    at the DB level (auth.uid() = user_id).  An item that doesn't exist or
    belongs to another user returns 404 rather than 403 to avoid leaking
    whether the ID exists at all.
    """
    client = get_user_client(token)

    try:
        result = (
            client.table("action_items")
            .update({"done": body.done})
            .eq("id", item_id)
            .eq("user_id", user_id)   # belt-and-suspenders on top of RLS
            .select("id, text, session_id, rubric_id, done")
            .single()
            .execute()
        )
    except Exception as e:
        error_str = str(e).lower()
        # PGRST116: .single() found no rows → item doesn't exist or belongs to
        # another user.  Return 404 in both cases (don't leak ownership).
        if "pgrst116" in error_str or "no rows" in error_str:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Action item not found.",
            )
        print(f"[action-items] toggle_action_item failed for item {item_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update action item. Please try again.",
        )

    row = result.data
    return ActionItemResponse(
        id=row["id"],
        text=row["text"],
        session_id=row.get("session_id"),
        rubric_id=row.get("rubric_id"),
        done=row["done"],
    )
