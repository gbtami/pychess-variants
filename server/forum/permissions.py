from __future__ import annotations

from datetime import datetime, timedelta, timezone

from settings import ADMINS

from forum.utils import to_utc


def is_admin(username: str) -> bool:
    """Return whether the provided username matches a configured forum admin."""
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


def can_write(user) -> bool:
    """Apply forum write permissions (age/games/title/admin/bot/shadowban checks)."""
    if user.anon or user.bot or bool(getattr(user, "shadowban", False)):
        return False
    if is_admin(user.username):
        return True
    if user.title:
        return True
    created_at = to_utc(getattr(user, "created_at", None))
    if created_at is None:
        return False
    account_age = datetime.now(timezone.utc) - created_at
    return user.count.get("game", 0) > 0 and account_age >= timedelta(days=2)


def can_moderate(user) -> bool:
    """Return whether a user can perform moderator-only forum operations."""
    return is_admin(user.username)
