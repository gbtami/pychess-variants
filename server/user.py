from __future__ import annotations
import asyncio
import logging
from asyncio import Queue
from datetime import datetime, timezone
from typing import Set, List

import aiohttp_session
from aiohttp import web

from broadcast import round_broadcast
from const import ANON_PREFIX, STARTED, VARIANTS
from glicko2.glicko2 import gl2, DEFAULT_PERF, Rating
from login import RESERVED_USERS
from newid import id8
from notify import notify
from const import TYPE_CHECKING
from seek import Seek

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from game import Game
    from utils import MyWebSocketResponse

from pychess_global_app_state_utils import get_app_state

log = logging.getLogger(__name__)

SILENCE = 15 * 60
ANON_TIMEOUT = 10 * 60
PENDING_SEEK_TIMEOUT = 10
ABANDON_TIMEOUT = 90


class User:
    def __init__(
        self,
        app_state: PychessGlobalAppState,
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
        self.app_state = app_state
        self.bot = False if username == "PyChessBot" else bot
        self.anon = anon
        self.lang = lang
        self.theme = theme
        self.notifications = None

        if username is None:
            self.anon = True
            self.username = ANON_PREFIX + id8()
        else:
            self.username = username

        self.seeks: dict[int, Seek] = {}
        self.lobby_sockets: Set[MyWebSocketResponse] = set()
        self.tournament_sockets: dict[str, MyWebSocketResponse] = {}  # {tournamentId: set()}

        self.notify_channels: Set[Queue] = set()

        self.puzzles = {}  # {pizzleId: vote} where vote 0 = not voted, 1 = up, -1 = down
        self.puzzle_variant = None

        self.game_sockets: dict[str, MyWebSocketResponse] = {}
        self.title = title
        self.game_in_progress = None
        self.abandon_game_task = None
        self.correspondence_games: List[Game] = []

        if self.bot:
            self.event_queue: Queue = asyncio.Queue()
            self.game_queues: dict[str, Queue] = {}
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
                        del self.app_state.users[self.username]
                    except KeyError:
                        log.error("Failed to del %s from users", self.username, exc_info=True)
                    break

    async def abandon_game(self, game):
        abandon_timeout = ABANDON_TIMEOUT * (2 if game.base >= 3 else 1)
        await asyncio.sleep(abandon_timeout)
        if game.status <= STARTED and not self.is_user_active_in_game(game.id):
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

        if self.app_state.db is not None:
            await self.app_state.db.user.find_one_and_update(
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

        if self.app_state.db is not None:
            await self.app_state.db.user.find_one_and_update(
                {"_id": self.username}, {"$set": {"pperfs": self.pperfs}}
            )

    async def notify_game_end(self, game):
        opp_name = (
            game.wplayer.username
            if game.bplayer.username == self.username
            else game.bplayer.username
        )

        if game.result in ("1/2-1/2", "*"):
            win = None
        else:
            if (game.result == "1-0" and game.wplayer.username == self.username) or (
                game.result == "0-1" and game.bplayer.username == self.username
            ):
                win = True
            else:
                win = False

        notif_type = "gameAborted" if game.result == "*" else "gameEnd"
        content = {
            "id": game.id,
            "opp": opp_name,
            "win": win,
        }
        await notify(self.app_state.db, self, notif_type, content)

    async def notified(self):
        self.notifications = [{**notif, "read": True} for notif in self.notifications]

        if self.app_state.db is not None:
            await self.app_state.db.notify.update_many(
                {"notifies": self.username}, {"$set": {"read": True}}
            )

    def as_json(self, requester):
        return {
            "_id": self.username,
            "title": self.title,
            "online": True if self.username == requester else self.online,
        }

    async def clear_seeks(self):
        if len(self.seeks) > 0:
            for seek_id in list(self.seeks):
                game_id = self.seeks[seek_id].game_id
                # preserve invites (seek with game_id) and corr seeks!
                if game_id is None and self.seeks[seek_id].day == 0:
                    del self.app_state.seeks[seek_id]
                    del self.seeks[seek_id]

            await self.app_state.lobby.lobby_broadcast_seeks()

    def delete_pending_seek(self, seek):
        async def delete_seek(seek):
            await asyncio.sleep(PENDING_SEEK_TIMEOUT)

            if seek.pending:
                try:
                    del self.seeks[seek.id]
                    del self.app_state.seeks[seek.id]
                except KeyError:
                    log.error("Failed to del %s from seeks", seek.id, exc_info=True)

        asyncio.create_task(delete_seek(seek))

    async def update_seeks(self, pending=True):
        if len(self.seeks) > 0:
            for seek in self.seeks.values():
                # preserve invites (seek with game_id) and corr seeks
                if seek.game_id is None and seek.day == 0:
                    seek.pending = pending
                    if pending:
                        self.delete_pending_seek(seek)
            await self.app_state.lobby.lobby_broadcast_seeks()

    async def send_game_message(self, game_id, message):
        # todo: for now just logging dropped messages, but at some point should evaluate whether to queue them when no socket
        #       or include info about the complete round state in some more general message that is always
        #       sent on reconnect so client doesn't lose state
        ws_set = self.game_sockets.get(game_id)
        if ws_set is None or len(ws_set) == 0:
            if self.title != "TEST":
                log.error("No ws for that game. Dropping message %s for %s", message, self.username)
                log.debug(
                    "Currently user %s has these game_sockets: %r", self.username, self.game_sockets
                )
            return
        for ws in ws_set:
            log.debug("Sending message %s to %s. ws = %r", message, self.username, ws)
            try:
                await ws.send_json(message)
            except Exception:  # ConnectionResetError
                log.error("dropping message %s for %s", stack_info=True, exc_info=True)

    async def close_all_game_sockets(self):
        for ws_set in list(
            self.game_sockets.values()
        ):  # todo: also clean up this dict after closing?
            for ws in list(ws_set):
                try:
                    await ws.close()
                except Exception as e:
                    log.error(e, stack_info=True, exc_info=True)

    def is_user_active_in_game(self, game_id=None):
        # todo: maybe also check if ws is still open or that the sets corresponding to (each) game_id are not empty?
        if game_id is None:
            return len(self.game_sockets) > 0
        else:
            return game_id in self.game_sockets

    def is_user_active_in_lobby(self):
        return len(self.lobby_sockets) > 0  # todo: check also if open maybe?

    def add_ws_for_game(self, game_id, ws):
        if game_id not in self.game_sockets:
            self.game_sockets[game_id] = set()
        self.game_sockets[game_id].add(ws)

    def remove_ws_for_game(self, game_id, ws) -> bool:
        if game_id in self.game_sockets:
            try:
                self.game_sockets[game_id].remove(ws)
            except KeyError:
                return False
            if len(self.game_sockets[game_id]) == 0:
                del self.game_sockets[game_id]
            return True
        else:
            return False

    def __repr__(self):
        return self.__str__()

    def __str__(self):
        return "%s %s bot=%s anon=%s chess=%s" % (
            self.title,
            self.username,
            self.bot,
            self.anon,
            self.perfs["chess"]["gl"]["r"],
        )


async def set_theme(request):
    app_state = get_app_state(request.app)
    post_data = await request.post()
    theme = post_data.get("theme")

    if theme is not None:
        referer = request.headers.get("REFERER")
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        if session_user in app_state.users:
            user = app_state.users[session_user]
            user.theme = theme
            if app_state.db is not None:
                await app_state.db.user.find_one_and_update(
                    {"_id": user.username}, {"$set": {"theme": theme}}
                )
        session["theme"] = theme
        return web.HTTPFound(referer)
    else:
        raise web.HTTPNotFound()
