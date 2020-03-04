import asyncio
import logging
import random
import string
from time import time
from datetime import datetime

from const import VARIANTS
from broadcast import lobby_broadcast, round_broadcast
from glicko2.glicko2 import gl2, DEFAULT_PERF
from seek import get_seeks

log = logging.getLogger(__name__)


class MissingRatingsException(Exception):
    pass


class User:
    def __init__(self, app, lobby_ws=None, bot=False, username=None, anon=False, title="", country="", first_name="", last_name="", perfs=None, enabled=True):
        self.app = app
        self.db = app["db"]
        self.lobby_ws = lobby_ws
        self.notify_queue = None
        self.bot = bot
        self.anon = anon
        if username is None:
            self.username = "Anonymous" + "".join(random.sample(string.ascii_uppercase, 4))
        else:
            self.username = username
        self.first_name = first_name
        self.last_name = last_name
        self.country = country
        self.seeks = {}
        if self.bot:
            self.event_queue = asyncio.Queue()
            self.game_queues = {}
            self.title = "BOT"
        else:
            self.game_sockets = {}
            self.title = title
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

    @property
    def online(self):
        if self.bot:
            return self.bot_online
        else:
            return len(self.game_sockets) > 0 or (self.lobby_ws is not None)

    def get_rating(self, variant, chess960):
        if variant in self.perfs:
            gl = self.perfs[variant + ("960" if chess960 else "")]["gl"]
            la = self.perfs[variant + ("960" if chess960 else "")]["la"]
            return gl2.create_rating(gl["r"], gl["d"], gl["v"], la)
        else:
            rating = gl2.create_rating()
            self.perfs[variant + ("960" if chess960 else "")] = DEFAULT_PERF
            return rating

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
            "online": True if self.username == requester else self.online,
            "country": self.country,
        }

    async def clear_seeks(self, sockets, seeks):
        has_seek = len(self.seeks) > 0
        if has_seek:
            for seek in self.seeks:
                del seeks[seek]
            self.seeks.clear()

            await lobby_broadcast(sockets, get_seeks(seeks))

    async def quit_lobby(self, sockets, disconnect):
        # print(self.username, "quit_lobby()")

        self.lobby_ws = None
        if self.username in sockets:
            del sockets[self.username]

        # not connected to lobby socket and not connected to game socket
        if len(self.game_sockets) == 0:
            self.app["u_cnt"] -= 1
            response = {"type": "u_cnt", "cnt": self.app["u_cnt"]}
            await lobby_broadcast(sockets, response)

        text = "disconnected" if disconnect else "left the lobby"
        response = {"type": "lobbychat", "user": "", "message": "%s %s" % (self.username, text)}
        await lobby_broadcast(sockets, response)

    async def round_broadcast_disconnect(self, users, games):
        games_involved = self.game_queues.keys() if self.bot else self.game_sockets.keys()

        for gameId in games_involved:
            if gameId not in games:
                continue
            game = games[gameId]
            if self.username != game.wplayer.username and self.username != game.bplayer.username:
                continue

            response = {"type": "user_disconnected", "username": self.username, "gameId": gameId}
            opp = game.bplayer if game.wplayer.username == self.username else game.wplayer
            if (not opp.bot) and gameId in opp.game_sockets:
                await opp.game_sockets[gameId].send_json(response)

            await round_broadcast(game, users, response)

    async def pinger(self, sockets, seeks, users, games):
        while True:
            if self.ping_counter > 2:
                log.info("%s went offline" % self.username)
                await self.round_broadcast_disconnect(users, games)
                await self.clear_seeks(sockets, seeks)
                await self.quit_lobby(sockets, disconnect=True)
                break

            if self.bot:
                await self.event_queue.put("\n")
                # heroku needs something at least in 50 sec not to close BOT connections (stream events) on server side
            else:
                if self.lobby_ws is not None:
                    await self.lobby_ws.send_json({"type": "ping", "timestamp": "%s" % time()})
            await asyncio.sleep(3)
            self.ping_counter += 1

    def __str__(self):
        return self.username
