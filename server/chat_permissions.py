from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from const import (
    LOBBY_CHAT_MIN_ACCOUNT_AGE,
    LOBBY_CHAT_MIN_GAMES,
    LOBBY_CHAT_MIN_RATED_VARIANT_GAMES,
)

if TYPE_CHECKING:
    from user import User


def lobby_chat_eligible(user: User, *, now: datetime | None = None) -> bool:
    """Return whether a regular account may write in the main lobby chat."""

    if user.anon:
        return False

    current_time = datetime.now(timezone.utc) if now is None else now
    if current_time - user.created_at < LOBBY_CHAT_MIN_ACCOUNT_AGE:
        return False

    if user.count["game"] < LOBBY_CHAT_MIN_GAMES:
        return False

    # Per-variant performance counts contain rated games only. Chess960 and
    # all other variants count; only ordinary standard Chess is excluded.
    rated_variant_games = sum(
        perf.get("nb", 0) for variant, perf in user.perfs.items() if variant != "chess"
    )
    return rated_variant_games >= LOBBY_CHAT_MIN_RATED_VARIANT_GAMES
