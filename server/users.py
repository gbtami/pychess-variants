from collections import UserDict

from glicko2.glicko2 import DEFAULT_PERF
from const import VARIANTS
from user import User


class Users(UserDict):
    def __init__(self, app):
        super().__init__()
        self.app = app

    def __getitem__(self, username):
        if username in self.data:
            return self.data[username]
        else:
            print("%s is not in Users. Use await users.get() instead.")
            raise Exception

    async def get(self, username):
        if username in self.data:
            return self.data[username]

        doc = await self.app["db"].user.find_one({"_id": username})
        if doc is None:
            print("--- users.get() %s NOT IN db ---" % username)
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
