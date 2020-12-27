import asyncio
import logging
import random
import string
from datetime import datetime

from const import VARIANTS
from broadcast import lobby_broadcast
from glicko2.glicko2 import gl2, DEFAULT_PERF
from login import RESERVED_USERS
from seek import get_seeks

log = logging.getLogger(__name__)

SILENCE = 10 * 60

ANON_TIMEOUT = 10 * 60


class MissingRatingsException(Exception):
    pass


class User:
    def __init__(self, app, bot=False, username=None, anon=False, title="", country="", first_name="", last_name="", perfs=None, enabled=True):
        self.app = app
        self.db = app["db"] if "db" in app else None
        self.notify_queue = None
        self.bot = bot
        self.anon = anon
        if username is None:
            self.anon = True
            self.username = "Anon-" + "".join(random.sample(string.ascii_letters, 8))
        else:
            self.username = username
        self.first_name = first_name
        self.last_name = last_name
        self.country = country
        self.seeks = {}
        self.lobby_sockets = set()

        if self.bot:
            self.event_queue = asyncio.Queue()
            self.game_queues = {}
            self.title = "BOT"
        else:
            self.game_sockets = {}
            self.title = title
            self.game_in_progress = None

        self.ping_counter = 0
        self.bot_online = False

        if perfs is None:
            if (not anon) and (not bot):
                raise MissingRatingsException(username)
            self.perfs = {variant: DEFAULT_PERF for variant in VARIANTS}
        else:
            self.perfs = {variant: perfs[variant] if variant in perfs else DEFAULT_PERF for variant in VARIANTS}
        self.enabled = enabled
        self.fen960_as_white = None

        # last game played
        self.tv = None

        # lobby chat spammer time out (10 min)
        self.silence = 0

        # purge inactive anon users after ANON_TIMEOUT sec
        if self.anon and self.username not in RESERVED_USERS:
            loop = asyncio.get_event_loop()
            loop.create_task(self.remove())

    async def remove(self):
        while True:
            await asyncio.sleep(ANON_TIMEOUT)
            if not self.online():
                # give them a second chance
                await asyncio.sleep(3)
                if not self.online():
                    try:
                        del self.app["users"][self.username]
                    except KeyError:
                        log.error("Failed to del %s from users", self.username)
                    break

    def online(self, username=None):
        if username is None:
            if self.bot:
                return self.bot_online
            return len(self.game_sockets) > 0 or len(self.lobby_sockets) > 0
        else:
            return username == self.username or self.online()

    def get_rating(self, variant, chess960):
        if variant in self.perfs:
            gl = self.perfs[variant + ("960" if chess960 else "")]["gl"]
            la = self.perfs[variant + ("960" if chess960 else "")]["la"]
            return gl2.create_rating(gl["r"], gl["d"], gl["v"], la)
        rating = gl2.create_rating()
        self.perfs[variant + ("960" if chess960 else "")] = DEFAULT_PERF
        return rating

    def set_silence(self):
        self.silence += SILENCE

        async def silencio():
            await asyncio.sleep(SILENCE)
            self.silence -= SILENCE

        loop = asyncio.get_event_loop()
        loop.create_task(silencio())

    async def set_rating(self, variant, chess960, rating):
        if self.anon:
            return
        gl = {"r": rating.mu, "d": rating.phi, "v": rating.sigma}
        la = datetime.utcnow()
        nb = self.perfs[variant + ("960" if chess960 else "")].get("nb", 0)
        self.perfs[variant + ("960" if chess960 else "")] = {"gl": gl, "la": la, "nb": nb + 1}

        if self.db is not None:
            await self.db.user.find_one_and_update({"_id": self.username}, {"$set": {"perfs": self.perfs}})

    def as_json(self, requester):
        return {
            "_id": self.username,
            "title": self.title,
            "first_name": self.first_name,
            "last-name": self.last_name,
            "online": True if self.username == requester else self.online(),
            "country": self.country,
        }

    async def clear_seeks(self, sockets, seeks):
        has_seek = len(self.seeks) > 0
        if has_seek:
            for seek in self.seeks:
                game_id = self.seeks[seek].game_id
                # preserve invites (seek with game_id)!
                if game_id is None:
                    del seeks[seek]
            self.seeks.clear()

            await lobby_broadcast(sockets, get_seeks(seeks))

    def __str__(self):
        return self.username
