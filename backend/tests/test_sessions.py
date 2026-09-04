from uuid import UUID
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from routers import sessions


SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")
USER_ID = "22222222-2222-4222-8222-222222222222"


class Result:
    def __init__(self, data):
        self.data = data


class SessionQuery:
    def __init__(self, row):
        self.row = row
        self.filters = []
        self.delete_called = False

    def select(self, *args, **kwargs):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def single(self):
        return self

    def delete(self):
        self.delete_called = True
        return self

    def execute(self):
        assert ("id", str(SESSION_ID)) in self.filters
        assert ("user_id", USER_ID) in self.filters
        if self.delete_called:
            return Result([{"id": str(SESSION_ID)}])
        return Result(self.row)


class SessionClient:
    def __init__(self, row):
        self.query = SessionQuery(row)
        self.action_items_query = MagicMock()
        self.action_items_query.delete.return_value = self.action_items_query
        self.action_items_query.eq.return_value = self.action_items_query
        self.action_items_query.execute.return_value = Result([])

    def table(self, name):
        if name == "sessions":
            return self.query
        if name == "action_items":
            return self.action_items_query
        raise AssertionError(f"Unexpected table: {name}")


def test_owned_session_capture_path_accepts_exact_user_session_object():
    path = f"{USER_ID}/{SESSION_ID}/capture.jpg"
    assert sessions._owned_session_capture_path(path, USER_ID, str(SESSION_ID)) == path


@pytest.mark.parametrize(
    "path",
    [
        None,
        "",
        f"/{USER_ID}/{SESSION_ID}/capture.jpg",
        f"{USER_ID}/{SESSION_ID}/nested/capture.jpg",
        f"{USER_ID}/33333333-3333-4333-8333-333333333333/capture.jpg",
        f"33333333-3333-4333-8333-333333333333/{SESSION_ID}/capture.jpg",
        f"{USER_ID}/{SESSION_ID}/../capture.jpg",
        f"{USER_ID}\\{SESSION_ID}\\capture.jpg",
    ],
)
def test_owned_session_capture_path_rejects_untrusted_paths(path):
    assert sessions._owned_session_capture_path(path, USER_ID, str(SESSION_ID)) is None


def test_delete_session_removes_owned_capture_before_row_delete():
    path = f"{USER_ID}/{SESSION_ID}/capture.jpg"
    client = SessionClient({
        "id": str(SESSION_ID),
        "title": "Session",
        "source": "Chrome Extension",
        "mode": "Study Coach",
        "duration_seconds": 60,
        "when_timestamp": None,
        "rubric_id": None,
        "summary": None,
        "active": False,
        "screenshot_path": path,
    })
    bucket = MagicMock()

    with patch.object(sessions, "get_user_client", return_value=client), patch.object(
        sessions.supabase_admin.storage,
        "from_",
        return_value=bucket,
    ) as from_bucket:
        sessions.delete_session(SESSION_ID, user_id=USER_ID, token="token")

    from_bucket.assert_called_once_with("session-captures")
    bucket.remove.assert_called_once_with([path])
    assert client.query.delete_called is True


def test_delete_session_stops_when_owned_capture_cleanup_fails():
    path = f"{USER_ID}/{SESSION_ID}/capture.jpg"
    client = SessionClient({
        "id": str(SESSION_ID),
        "title": "Session",
        "source": "Chrome Extension",
        "mode": "Study Coach",
        "duration_seconds": 60,
        "when_timestamp": None,
        "rubric_id": None,
        "summary": None,
        "active": False,
        "screenshot_path": path,
    })
    bucket = MagicMock()
    bucket.remove.side_effect = RuntimeError("storage down")

    with patch.object(sessions, "get_user_client", return_value=client), patch.object(
        sessions.supabase_admin.storage,
        "from_",
        return_value=bucket,
    ):
        with pytest.raises(HTTPException) as exc:
            sessions.delete_session(SESSION_ID, user_id=USER_ID, token="token")

    assert exc.value.status_code == 500
    assert client.query.delete_called is False
