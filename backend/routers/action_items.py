"""
Action items router — /action-items

Endpoints:
    GET    /action-items        List action items for the logged-in user (paginated)
    PATCH  /action-items/{id}   Toggle an action item's done state
    DELETE /action-items/{id}   Permanently delete an action item

RLS is enforced on every query via get_user_client().
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from uuid import UUID

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
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """
    Returns action items owned by the authenticated user.
    Open items come first (done=false), then completed ones, both ordered
    by creation date ascending so older items appear first within each group.

    Supports pagination via limit/offset query params.
    """
    client = get_user_client(token)

    try:
        result = (
            client.table("action_items")
            .select("id, text, session_id, rubric_id, done")
            .eq("user_id", user_id)
            .order("done", desc=False)
            .order("created_at", desc=False)
            .range(offset, offset + limit - 1)
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
    item_id: UUID,
    body: ToggleActionItemRequest,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Updates the done field on a single action item and returns the updated row
    in a single DB round-trip (PostgREST returns the updated row by default).

    Returns 404 if the item doesn't exist or belongs to another user.
    """
    client = get_user_client(token)
    item_id = str(item_id)

    try:
        result = (
            client.table("action_items")
            .update({"done": body.done})
            .eq("id", item_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        print(f"[action-items] toggle_action_item failed for item {item_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update action item. Please try again.",
        )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action item not found.",
        )

    row = result.data[0]
    return ActionItemResponse(
        id=row["id"],
        text=row["text"],
        session_id=row.get("session_id"),
        rubric_id=row.get("rubric_id"),
        done=row["done"],
    )


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete an action item",
)
def delete_action_item(
    item_id: UUID,
    user_id: str = Depends(verify_token),
    token: str = Depends(get_token),
):
    """
    Permanently deletes an action item.

    Returns 404 if the item doesn't exist or belongs to another user.
    Use PATCH to mark done instead of deleting when you want to keep history.
    """
    client = get_user_client(token)
    item_id = str(item_id)

    try:
        result = (
            client.table("action_items")
            .delete()
            .eq("id", item_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        print(f"[action-items] delete_action_item failed for item {item_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete action item. Please try again.",
        )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action item not found.",
        )
