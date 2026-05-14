from __future__ import annotations

from typing import Mapping

from typing_defs import UserCount

DEFAULT_USER_COUNT: UserCount = {
    "game": 0,
    "win": 0,
    "loss": 0,
    "draw": 0,
    "rated": 0,
}


def _default_user_count() -> UserCount:
    return {
        "game": 0,
        "win": 0,
        "loss": 0,
        "draw": 0,
        "rated": 0,
    }


def normalize_user_count(raw: Mapping[str, object] | None) -> UserCount:
    if raw is None:
        return _default_user_count()

    normalized = _default_user_count()
    for key in DEFAULT_USER_COUNT:
        value = raw.get(key)
        normalized[key] = int(value) if isinstance(value, (int, float)) else 0
    return normalized
