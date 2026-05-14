from __future__ import annotations

from dataclasses import dataclass
from datetime import MINYEAR, datetime, timezone
from time import monotonic
from typing import TYPE_CHECKING, Iterable

from const import ANON_PREFIX, BLOCK, MAX_USER_BLOCK
from glicko2.glicko2 import perf_map_with_defaults
from typing_defs import PerfMap, RelationDocument, UserCount, UserDocument
from user_stats import normalize_user_count
from variants import RATED_VARIANTS

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from user import User


PUBLIC_PROFILE_CACHE_TTL_SECONDS = 60.0
PUBLIC_TITLE_CACHE_TTL_SECONDS = 300.0
PUBLIC_CACHE_CLEANUP_INTERVAL_SECONDS = 60.0


@dataclass(frozen=True)
class PublicProfile:
    username: str
    title: str
    bot: bool
    enabled: bool
    created_at: datetime
    count: UserCount
    perfs: PerfMap
    blocked: frozenset[str]
    oauth_id: str
    oauth_provider: str


class PublicUsers:
    def __init__(self, app_state: PychessGlobalAppState) -> None:
        self.app_state = app_state
        self._profiles: dict[str, tuple[float, PublicProfile | None]] = {}
        self._titles: dict[str, tuple[float, str | None]] = {}
        self._last_cleanup = 0.0

    def _cleanup_if_needed(self) -> None:
        now = monotonic()
        if now - self._last_cleanup < PUBLIC_CACHE_CLEANUP_INTERVAL_SECONDS:
            return

        for cache in (self._profiles, self._titles):
            for key, (expires_at, _) in tuple(cache.items()):
                if expires_at <= now:
                    del cache[key]

        self._last_cleanup = now

    def _live_user(self, username: str) -> User | None:
        return self.app_state.users.data.get(username)

    @staticmethod
    def _profile_from_live_user(user: User) -> PublicProfile:
        return PublicProfile(
            username=user.username,
            title=user.title,
            bot=user.bot,
            enabled=user.enabled,
            created_at=user.created_at,
            count=normalize_user_count(user.count),
            perfs=user.perfs,
            blocked=frozenset(user.blocked),
            oauth_id=user.oauth_id,
            oauth_provider=user.oauth_provider,
        )

    @staticmethod
    def _profile_from_doc(
        username: str,
        doc: UserDocument,
        blocked: frozenset[str],
    ) -> PublicProfile:
        title = doc.get("title") or ""
        return PublicProfile(
            username=username,
            title=title,
            bot=title == "BOT",
            enabled=doc.get("enabled", True),
            created_at=doc.get("createdAt", datetime(MINYEAR, 1, 1, tzinfo=timezone.utc)),
            count=normalize_user_count(doc.get("count")),
            perfs=perf_map_with_defaults(RATED_VARIANTS, doc.get("perfs")),
            blocked=blocked,
            oauth_id=doc.get("oauth_id") or "",
            oauth_provider=doc.get("oauth_provider") or "",
        )

    @staticmethod
    def _anon_profile(username: str) -> PublicProfile:
        return PublicProfile(
            username=username,
            title="",
            bot=False,
            enabled=True,
            created_at=datetime(MINYEAR, 1, 1, tzinfo=timezone.utc),
            count=normalize_user_count(None),
            perfs=perf_map_with_defaults(RATED_VARIANTS, None),
            blocked=frozenset(),
            oauth_id="",
            oauth_provider="",
        )

    async def get_profile(self, username: str) -> PublicProfile | None:
        live_user = self._live_user(username)
        if live_user is not None:
            return self._profile_from_live_user(live_user)

        self._cleanup_if_needed()
        cached = self._profiles.get(username)
        now = monotonic()
        if cached is not None and cached[0] > now:
            return cached[1]

        if username.startswith(ANON_PREFIX):
            profile = self._anon_profile(username)
            self._profiles[username] = (now + PUBLIC_PROFILE_CACHE_TTL_SECONDS, profile)
            self._titles[username] = (now + PUBLIC_TITLE_CACHE_TTL_SECONDS, "")
            return profile

        if self.app_state.db is None:
            self._profiles[username] = (now + PUBLIC_PROFILE_CACHE_TTL_SECONDS, None)
            return None

        doc: UserDocument | None = await self.app_state.db.user.find_one({"_id": username})
        if doc is None:
            self._profiles[username] = (now + PUBLIC_PROFILE_CACHE_TTL_SECONDS, None)
            self._titles[username] = (now + PUBLIC_TITLE_CACHE_TTL_SECONDS, None)
            return None

        cursor = self.app_state.db.relation.find({"u1": username, "r": BLOCK})
        docs: list[RelationDocument] = await cursor.to_list(MAX_USER_BLOCK)
        profile = self._profile_from_doc(
            username=username,
            doc=doc,
            blocked=frozenset(doc["u2"] for doc in docs),
        )
        self._profiles[username] = (now + PUBLIC_PROFILE_CACHE_TTL_SECONDS, profile)
        self._titles[username] = (now + PUBLIC_TITLE_CACHE_TTL_SECONDS, profile.title)
        return profile

    async def get_titles(self, usernames: Iterable[str]) -> dict[str, str]:
        self._cleanup_if_needed()
        now = monotonic()
        unique_usernames = tuple(dict.fromkeys(username for username in usernames if username))
        titles: dict[str, str] = {}
        missing: list[str] = []

        for username in unique_usernames:
            live_user = self._live_user(username)
            if live_user is not None:
                titles[username] = live_user.title
                continue

            if username.startswith(ANON_PREFIX):
                titles[username] = ""
                self._titles[username] = (now + PUBLIC_TITLE_CACHE_TTL_SECONDS, "")
                continue

            cached = self._titles.get(username)
            if cached is not None and cached[0] > now:
                if cached[1] is not None:
                    titles[username] = cached[1]
                continue

            missing.append(username)

        if len(missing) == 0 or self.app_state.db is None:
            return titles

        docs = await self.app_state.db.user.find(
            {"_id": {"$in": missing}},
            projection={"_id": 1, "title": 1},
        ).to_list(None)
        found: dict[str, str] = {}
        for doc in docs:
            username = doc["_id"]
            title = doc.get("title") or ""
            found[username] = title
            self._titles[username] = (now + PUBLIC_TITLE_CACHE_TTL_SECONDS, title)

        for username in missing:
            if username in found:
                titles[username] = found[username]
            else:
                self._titles[username] = (now + PUBLIC_TITLE_CACHE_TTL_SECONDS, None)

        return titles
