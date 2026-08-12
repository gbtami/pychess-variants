from __future__ import annotations

import logging
from collections import UserDict
from collections.abc import Collection, ItemsView, ValuesView
from time import monotonic
from typing import TYPE_CHECKING

from const import (
    ANON_PREFIX,
    BLOCK,
    FOLLOW,
    MAX_USER_BLOCK,
    NONE_USER,
    reserved,
)
from typing_defs import RelationDocument, UserDocument
from user import User

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

log = logging.getLogger(__name__)


class NotInAppUsers(Exception):
    """Raised when dict access syntax was used, but username not in Users dict"""


class NotInDbUsers(Exception):
    """Raised when await get() syntax was used, but username not in db users"""


class Users(UserDict[str, User]):
    """
    The Users class: store user objects in memory

    If we know for sure that username is already in the dict, we can use dictionary access syntax.
    If not, await get(username) will load user data from mongodb
    """

    def __init__(self, app_state: PychessGlobalAppState) -> None:
        super().__init__()
        self.app_state: PychessGlobalAppState = app_state
        self.cache_access: dict[str, float] = {}
        self.registered_cache_evictions = 0

    def _in_registered_cache(self, user: User) -> bool:
        """Whether this user is subject to the registered-user cache TTL.

        Test users are excluded alongside anons: they exist only in memory, so
        evicting one destroys an identity that no db lookup can restore.
        """
        if user.anon or user.bot or reserved(user.username):
            return False
        return not self.app_state.is_test_user(user.username)

    def __setitem__(self, username: str, user: User) -> None:
        super().__setitem__(username, user)
        if self._in_registered_cache(user):
            self.cache_access[username] = monotonic()
        else:
            self.cache_access.pop(username, None)

    def __delitem__(self, username: str) -> None:
        super().__delitem__(username)
        self.cache_access.pop(username, None)

    def __getitem__(self, username: str) -> User:
        if username in self.data:
            user = self.data[username]
            if self._in_registered_cache(user):
                self.cache_access[username] = monotonic()
            return user
        else:
            # raise NotInAppUsers("%s is not in Users. Use await users.get() instead.", username)
            user = self.data[NONE_USER]
            return user

    def values(self) -> ValuesView[User]:
        """Enumerate cached users without marking every entry as recently accessed."""
        return self.data.values()

    def items(self) -> ItemsView[str, User]:
        """Enumerate cache entries without marking every user as recently accessed."""
        return self.data.items()

    async def get(self, username: str | None) -> User:  # type: ignore[override]
        if username in self.data:
            return self[username]

        if username is None:
            user = self.data[NONE_USER]
            return user

        if username.startswith(ANON_PREFIX):
            user = User(self.app_state, username=username, anon=True)
            self.app_state.users[username] = user
            return user

        doc: UserDocument | None = await self.app_state.db.user.find_one({"_id": username})
        if doc is None:
            log.warning("users.get() %s NOT IN db", username)
            # raise NotInDbUsers
            return self.data[NONE_USER]
        else:
            user = User(
                self.app_state,
                username=username,
                title=doc.get("title") or "",
                bot=doc.get("title") == "BOT",
                perfs=doc.get("perfs"),
                pperfs=doc.get("pperfs"),
                count=doc.get("count"),
                enabled=doc.get("enabled", True),
                shadowban=doc.get("shadowban", False),
                lang=doc.get("lang", "en"),
                theme=doc.get("theme", "dark"),
                game_category=doc.get("ct", "all"),
                pm_friends_only=doc.get("pmf", False),
                corr_push=doc.get("cps", True),
                catalogued_variant_favorites=doc.get("cvf") or [],
                oauth_id=doc.get("oauth_id") or "",
                oauth_provider=doc.get("oauth_provider") or "",
                created_at=doc.get("createdAt"),
                swiss_ban_until=doc.get("swissBanUntil"),
                swiss_ban_hours=doc.get("swissBanHours", 0),
                swiss_ban_game_id=doc.get("swissBanGameId"),
            )
            user.game_category_set = "ct" in doc
            self[username] = user

            blocked_cursor = self.app_state.db.relation.find(
                {"u1": username, "r": BLOCK}, projection={"_id": 0, "u2": 1}
            )
            blocked_docs: list[RelationDocument] = await blocked_cursor.to_list(MAX_USER_BLOCK)
            user.blocked = {doc["u2"] for doc in blocked_docs}

            following_cursor = self.app_state.db.relation.find(
                {"u1": username, "r": FOLLOW}, projection={"_id": 0, "u2": 1}
            )
            following_docs: list[RelationDocument] = await following_cursor.to_list(None)
            user.following = {doc["u2"] for doc in following_docs}

            return user

    def is_registered_cache_only(self, user: User, protected_users: Collection[User]) -> bool:
        if not self._in_registered_cache(user) or user in protected_users:
            return False

        user.update_online()
        return not (
            user.online
            or user.game_in_progress is not None
            or user.correspondence_games
            or user.seeks
            or user.game_sockets
            or user.lobby_sockets
            or user.tournament_sockets
            or user.simul_sockets
            or user.notify_channels
            or user.inbox_channels
            or user.challenge_channels
            or user.challenge_offline_task is not None
            or user.abandon_game_tasks
            or user.background_tasks
            or user.watched_games
            or user.ready_for_auto_pairing
        )

    def prune_registered_cache(
        self,
        protected_users: Collection[User],
        *,
        max_idle_seconds: float,
        now: float | None = None,
    ) -> list[str]:
        cutoff = (monotonic() if now is None else now) - max_idle_seconds
        evicted: list[str] = []
        for username, user in tuple(self.data.items()):
            last_access = self.cache_access.get(username)
            if last_access is None or last_access > cutoff:
                continue
            if not self.is_registered_cache_only(user, protected_users):
                continue
            if self.data.get(username) is not user:
                continue
            del self[username]
            evicted.append(username)

        self.registered_cache_evictions += len(evicted)
        return evicted
