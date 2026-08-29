import pytest
from pydantic import ValidationError

from routers.auth import SignUpRequest
from routers.rubrics import CreateCriterionRequest, CreateRubricRequest
from routers.sessions import CreateMessageRequest, CreateSessionRequest
from routers.users import UpdateProfileRequest


def test_request_models_strip_user_supplied_text() -> None:
    signup = SignUpRequest(
        email="student@example.edu",
        name="  Student Name  ",
        password="Strong123",
    )
    rubric = CreateRubricRequest(
        title="  Final Essay  ",
        course="  Writing 101  ",
        criteria=[CreateCriterionRequest(name="  Thesis clarity  ")],
    )
    session = CreateSessionRequest(
        title="  Revision session  ",
        mode="Essay Coach",
        duration_seconds=60,
    )
    message = CreateMessageRequest(role="user", message_text="  Explain this  ")
    profile = UpdateProfileRequest(name="  Updated Name  ")

    assert signup.name == "Student Name"
    assert rubric.title == "Final Essay"
    assert rubric.course == "Writing 101"
    assert rubric.criteria[0].name == "Thesis clarity"
    assert session.title == "Revision session"
    assert message.message_text == "Explain this"
    assert profile.name == "Updated Name"


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (
            SignUpRequest,
            {
                "email": "student@example.edu",
                "name": "   ",
                "password": "Strong123",
            },
        ),
        (CreateCriterionRequest, {"name": "   "}),
        (
            CreateRubricRequest,
            {"title": "   ", "course": "Writing 101"},
        ),
        (
            CreateSessionRequest,
            {
                "title": "   ",
                "mode": "Essay Coach",
                "duration_seconds": 0,
            },
        ),
        (CreateMessageRequest, {"role": "user", "message_text": "   "}),
        (UpdateProfileRequest, {"name": "   "}),
    ],
)
def test_request_models_reject_whitespace_only_text(model, payload) -> None:
    with pytest.raises(ValidationError):
        model(**payload)
