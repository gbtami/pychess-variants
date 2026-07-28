from collections.abc import Mapping
from typing import Protocol

from const import GAME_CATEGORY_ALL, normalize_game_category

DEFAULT_THEME = "dark"
VALID_THEMES = frozenset({"dark", "light"})


class PreferenceUser(Protocol):
    anon: bool
    theme: str
    game_category: str

    def update_game_category(self, game_category: str) -> None: ...


def session_theme(session: Mapping[str, object], fallback: str = DEFAULT_THEME) -> str:
    """Return a validated theme stored in the browser session cookie."""

    value = session.get("theme")
    return value if isinstance(value, str) and value in VALID_THEMES else fallback


def session_game_category(session: Mapping[str, object], fallback: str = GAME_CATEGORY_ALL) -> str:
    """Return a normalized game category stored in the browser session cookie."""

    value = session.get("game_category")
    if not isinstance(value, str):
        value = fallback
    return normalize_game_category(value)


def effective_theme(session: Mapping[str, object], user: PreferenceUser | None) -> str:
    """Resolve theme without letting stale anonymous state override registered prefs."""

    if user is None:
        return session_theme(session)
    return session_theme(session, user.theme) if user.anon else user.theme


def effective_game_category(session: Mapping[str, object], user: PreferenceUser | None) -> str:
    """Resolve category from the session for anonymous browsers only."""

    if user is None:
        return session_game_category(session)
    if user.anon:
        return session_game_category(session, user.game_category)
    return normalize_game_category(user.game_category)


def apply_anonymous_session_preferences(
    session: Mapping[str, object], user: PreferenceUser
) -> None:
    """Seed or restore a materialized anonymous user from its browser session."""

    if not user.anon:
        return
    user.theme = effective_theme(session, user)
    user.update_game_category(effective_game_category(session, user))
