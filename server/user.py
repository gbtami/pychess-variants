import asyncio
import logging
from datetime import datetime, timezone

from aiohttp import web
import aiohttp_session

from const import STARTED, VARIANTS
from broadcast import lobby_broadcast, round_broadcast
from glicko2.glicko2 import gl2, DEFAULT_PERF, Rating
from login import RESERVED_USERS
from newid import id8
from seek import get_seeks

log = logging.getLogger(__name__)

SILENCE = 10 * 60
ANON_TIMEOUT = 10 * 60
PENDING_SEEK_TIMEOUT = 10
ABANDON_TIMEOUT = 90


class User:
    def __init__(
        self,
        app,
        bot=False,
        username=None,
        anon=False,
        title="",
        perfs=None,
        pperfs=None,
        enabled=True,
        lang=None,
        theme="dark",
    ):
        self.app = app
        self.db = app["db"] if "db" in app else None
        self.bot = False if username == "PyChessBot" else bot
        self.anon = anon
        self.lang = lang
        self.theme = theme
        if username is None:
            self.anon = True
            self.username = "Anon-" + id8()
        else:
            self.username = username
        self.seeks = {}
        self.lobby_sockets = set()
        self.tournament_sockets = {}  # {tournamentId: set()}

        self.puzzles = {}  # {pizzleId: vote} where vote 0 = not voted, 1 = up, -1 = down
        self.puzzle_variant = None

        self.game_sockets = {}
        self.title = title
        self.game_in_progress = None
        self.abandon_game_task = None

        if self.bot:
            self.event_queue = asyncio.Queue()
            self.game_queues = {}
            self.title = "BOT"

        self.online = False

        if perfs is None:
            self.perfs = {variant: DEFAULT_PERF for variant in VARIANTS}
        else:
            self.perfs = {
                variant: perfs[variant] if variant in perfs else DEFAULT_PERF
                for variant in VARIANTS
            }

        if pperfs is None:
            self.pperfs = {variant: DEFAULT_PERF for variant in VARIANTS}
        else:
            self.pperfs = {
                variant: pperfs[variant] if variant in pperfs else DEFAULT_PERF
                for variant in VARIANTS
            }

        self.enabled = enabled
        self.fen960_as_white = None

        # last game played
        self.tv = None

        # lobby chat spammer time out (10 min)
        self.silence = 0

        # purge inactive anon users after ANON_TIMEOUT sec
        if self.anon and self.username not in RESERVED_USERS:
            self.remove_task = asyncio.create_task(self.remove())

    async def remove(self):
        while True:
            await asyncio.sleep(ANON_TIMEOUT)
            if not self.online:
                # give them a second chance
                await asyncio.sleep(3)
                if not self.online:
                    try:
                        del self.app["users"][self.username]
                    except KeyError:
                        log.info("Failed to del %s from users", self.username)
                    break

    async def abandon_game(self, game):
        await asyncio.sleep(ABANDON_TIMEOUT)
        if game.status <= STARTED and game.id not in self.game_sockets:
            if game.bot_game or self.anon:
                response = await game.game_ended(self, "abandon")
                await round_broadcast(game, response)
            else:
                # TODO: message opp to let him claim win
                pass

    def update_online(self):
        self.online = (
            len(self.game_sockets) > 0
            or len(self.lobby_sockets) > 0
            or len(self.tournament_sockets) > 0
        )

    def get_rating(self, variant: str, chess960: bool) -> Rating:
        if variant in self.perfs:
            gl = self.perfs[variant + ("960" if chess960 else "")]["gl"]
            la = self.perfs[variant + ("960" if chess960 else "")]["la"]
            return gl2.create_rating(gl["r"], gl["d"], gl["v"], la)
        rating = gl2.create_rating()
        self.perfs[variant + ("960" if chess960 else "")] = DEFAULT_PERF
        return rating

    def get_puzzle_rating(self, variant: str, chess960: bool) -> Rating:
        if variant in self.pperfs:
            gl = self.pperfs[variant + ("960" if chess960 else "")]["gl"]
            la = self.pperfs[variant + ("960" if chess960 else "")]["la"]
            return gl2.create_rating(gl["r"], gl["d"], gl["v"], la)
        rating = gl2.create_rating()
        self.pperfs[variant + ("960" if chess960 else "")] = DEFAULT_PERF
        return rating

    def set_silence(self):
        self.silence += SILENCE

        async def silencio():
            await asyncio.sleep(SILENCE)
            self.silence -= SILENCE

        asyncio.create_task(silencio())

    async def set_rating(self, variant, chess960, rating):
        if self.anon:
            return
        gl = {"r": rating.mu, "d": rating.phi, "v": rating.sigma}
        la = datetime.now(timezone.utc)
        nb = self.perfs[variant + ("960" if chess960 else "")].get("nb", 0)
        self.perfs[variant + ("960" if chess960 else "")] = {
            "gl": gl,
            "la": la,
            "nb": nb + 1,
        }

        if self.db is not None:
            await self.db.user.find_one_and_update(
                {"_id": self.username}, {"$set": {"perfs": self.perfs}}
            )

    async def set_puzzle_rating(self, variant, chess960, rating):
        if self.anon:
            return
        gl = {"r": rating.mu, "d": rating.phi, "v": rating.sigma}
        la = datetime.now(timezone.utc)
        nb = self.pperfs[variant + ("960" if chess960 else "")].get("nb", 0)
        self.pperfs[variant + ("960" if chess960 else "")] = {
            "gl": gl,
            "la": la,
            "nb": nb + 1,
        }

        if self.db is not None:
            await self.db.user.find_one_and_update(
                {"_id": self.username}, {"$set": {"pperfs": self.pperfs}}
            )

    def as_json(self, requester):
        return {
            "_id": self.username,
            "title": self.title,
            "online": True if self.username == requester else self.online,
        }

    async def clear_seeks(self):
        if len(self.seeks) > 0:
            seeks = self.app["seeks"]
            sockets = self.app["lobbysockets"]

            for seek in self.seeks:
                game_id = self.seeks[seek].game_id
                # preserve invites (seek with game_id)!
                if game_id is None:
                    del seeks[seek]
            self.seeks.clear()

            await lobby_broadcast(sockets, get_seeks(seeks))

    def delete_pending_seek(self, seek):
        async def delete_seek(seek):
            await asyncio.sleep(PENDING_SEEK_TIMEOUT)

            if seek.pending:
                try:
                    del self.seeks[seek.id]
                    del self.app["seeks"][seek.id]
                except KeyError:
                    log.info("Failed to del %s from seeks", seek.id)

        asyncio.create_task(delete_seek(seek))

    async def update_seeks(self, pending=True):
        if len(self.seeks) > 0:
            seeks = self.app["seeks"]
            sockets = self.app["lobbysockets"]

            for seek_id in self.seeks:
                # preserve invites (seek with game_id)!
                if self.seeks[seek_id].game_id is None:
                    seeks[seek_id].pending = pending
                    if pending:
                        self.delete_pending_seek(seeks[seek_id])

            await lobby_broadcast(sockets, get_seeks(seeks))

    def __str__(self):
        return "%s %s bot=%s" % (self.title, self.username, self.bot)


async def set_theme(request):
    post_data = await request.post()
    theme = post_data.get("theme")

    if theme is not None:
        referer = request.headers.get("REFERER")
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        users = request.app["users"]
        if session_user in users:
            user = users[session_user]
            user.theme = theme
            if user.db is not None:
                await user.db.user.find_one_and_update(
                    {"_id": user.username}, {"$set": {"theme": theme}}
                )
        session["theme"] = theme
        return web.HTTPFound(referer)
    else:
        raise web.HTTPNotFound()
