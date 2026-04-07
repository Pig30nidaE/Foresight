import pytest
from fastapi import HTTPException

from app.shared.display_name import normalize_display_name


def test_normalize_display_name_collapses_spaces():
    assert normalize_display_name("  Alice   Bob  ") == "Alice Bob"


@pytest.mark.parametrize(
    "bad_name",
    [
        "a",  # too short
        "x" * 51,  # too long
        "admin",  # reserved
        "a<script>",  # invalid char
    ],
)
def test_normalize_display_name_rejects_invalid_values(bad_name: str):
    with pytest.raises(HTTPException):
        normalize_display_name(bad_name)
