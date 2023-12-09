import logging
from collections import UserDict

from typedefs import db_key, users_key
from glicko2.glicko2 import DEFAULT_PERF
from const import ANON_PREFIX, VARIANTS
from user import User

log = logging.getLogger(__name__)


class NotInUsers(Exception):
    """Raised when dict acces syntax was used, but username not in Users dict"""


class Users(UserDict):
    """
    The Users class: store user objects in memory

    If we know for sure that username is already in the dict, we can use dictionary access syntax.
    If not, await get(username) will load user data from mongodb
    """

    def __init__(self, app):
        super().__init__()
        self.app = app

    def __getitem__(self, username):
        if username in self.data:
            return self.data[username]
        else:
            raise NotInUsers("%s is not in Users. Use await users.get() instead.", username)

    async def get(self, username):
        if username in self.data:
            return self.data[username]

        if username.startswith(ANON_PREFIX):
            user = User(self.app, username=username, anon=True)
            self.app[users_key][username] = user
            return user

        doc = await self.app[db_key].user.find_one({"_id": username})
        if doc is None:
            log.error("--- users.get() %s NOT IN db ---", username)
            return None
        else:
            perfs = doc.get("perfs", {variant: DEFAULT_PERF for variant in VARIANTS})
            pperfs = doc.get("pperfs", {variant: DEFAULT_PERF for variant in VARIANTS})

            user = User(
                self.app,
                username=username,
                title=doc.get("title"),
                bot=doc.get("title") == "BOT",
                perfs=perfs,
                pperfs=pperfs,
                enabled=doc.get("enabled", True),
                lang=doc.get("lang", "en"),
                theme=doc.get("theme", "dark"),
            )
            self.data[username] = user
            return user
