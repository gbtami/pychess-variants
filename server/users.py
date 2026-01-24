from __future__ import annotations
from typing import TYPE_CHECKING
from collections import UserDict
from const import ANON_PREFIX, BLOCK, MAX_USER_BLOCK, NONE_USER
from glicko2.glicko2 import DEFAULT_PERF
from typing_defs import PerfMap, RelationDocument, UserDocument
from user import User
import logging
from variants import RATED_VARIANTS

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

    def __getitem__(self, username: str) -> User:
        if username in self.data:
            return self.data[username]
        else:
            # raise NotInAppUsers("%s is not in Users. Use await users.get() instead.", username)
            user = self.data[NONE_USER]
            return user

    async def get(self, username: str | None) -> User:  # type: ignore[override]
        if username in self.data:
            return self.data[username]

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
            perfs: PerfMap = doc.get("perfs", {variant: DEFAULT_PERF for variant in RATED_VARIANTS})
            pperfs: PerfMap = doc.get(
                "pperfs", {variant: DEFAULT_PERF for variant in RATED_VARIANTS}
            )

            user = User(
                self.app_state,
                username=username,
                title=doc.get("title"),
                bot=doc.get("title") == "BOT",
                perfs=perfs,
                pperfs=pperfs,
                enabled=doc.get("enabled", True),
                lang=doc.get("lang", "en"),
                theme=doc.get("theme", "dark"),
                game_category=doc.get("ct", "all"),
                oauth_id=doc.get("oauth_id"),
                oauth_provider=doc.get("oauth_provider"),
            )
            user.game_category_set = "ct" in doc
            self.data[username] = user

            cursor = self.app_state.db.relation.find({"u1": username, "r": BLOCK})
            docs: list[RelationDocument] = await cursor.to_list(MAX_USER_BLOCK)
            user.blocked = {doc["u2"] for doc in docs}

            return user
