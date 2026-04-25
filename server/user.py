from __future__ import annotations
from typing import TYPE_CHECKING, Any, Coroutine, List, Mapping, Set
import asyncio
from asyncio import Queue
from datetime import MINYEAR, datetime, timezone
from urllib.parse import urlparse

import aiohttp_session
from aiohttp import web
from aiohttp.web_ws import WebSocketResponse

from broadcast import round_broadcast
from const import (
    ANON_PREFIX,
    STARTED,
    TEST_PREFIX,
    reserved,
    CATEGORY_VARIANTS,
    CATEGORY_VARIANT_GROUPS,
    CATEGORY_VARIANT_CODES,
    CATEGORY_VARIANT_LISTS,
    CATEGORY_VARIANT_SETS,
    GAME_CATEGORY_ALL,
    normalize_game_category,
)
from glicko2.glicko2 import gl2, new_default_perf, perf_map_with_defaults, Rating
from newid import id8
from notify import notify
from const import BLOCK, MAX_USER_BLOCK
from websocket_utils import ws_send_json_many

if TYPE_CHECKING:
    from typing_defs import (
        NotificationContent,
        NotificationDocument,
        PerfGl,
        PerfMap,
        UserBlocksResponse,
        UserJson,
        UserStatusJson,
    )
from variants import RATED_VARIANTS, VARIANTS
from settings import (
    URI,
    LOCALHOST,
)
from redirects import safe_redirect_path
from request_utils import read_post_data

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from game import Game
    from seek import Seek

from pychess_global_app_state_utils import get_app_state
import logging

log = logging.getLogger(__name__)


SILENCE = 15 * 60
ANON_TIMEOUT = 10 * 60
# Fresh anons that never established any socket connection are likely one-off
# page hits (often crawlers/no-cookie clients). Keep them much shorter-lived.
ANON_NEVER_CONNECTED_TIMEOUT = 60
PENDING_SEEK_TIMEOUT = 10
ABANDON_TIMEOUT = 30


class RatingResetError(Exception):
    """Raised when new User object created with perft=None, but user already exists in leaderboards"""


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _as_required_utc(dt: datetime) -> datetime:
    normalized = _as_utc(dt)
    assert normalized is not None
    return normalized


class User:
    def __init__(
        self,
        app_state: PychessGlobalAppState,
        bot: bool = False,
        username: str | None = None,
        anon: bool = False,
        title: str = "",
        perfs: PerfMap | None = None,
        pperfs: PerfMap | None = None,
        enabled: bool = True,
        lang: str | None = None,
        theme: str = "dark",
        game_category: str = "all",
        oauth_id: str = "",
        oauth_provider: str = "",
        created_at: datetime | None = None,
        swiss_ban_until: datetime | None = None,
        swiss_ban_hours: int = 0,
    ) -> None:
        self.app_state: PychessGlobalAppState = app_state
        self.bot: bool = False if username == "PyChessBot" else bot
        self.anon: bool = anon
        self.lang: str | None = lang
        self.theme: str = theme
        self.game_category: str = "all"
        self.game_category_set: bool = False
        self.oauth_id: str = oauth_id
        self.oauth_provider: str = oauth_provider
        self.created_at: datetime = (
            datetime(MINYEAR, 1, 1, tzinfo=timezone.utc)
            if created_at is None
            else _as_required_utc(created_at)
        )
        self.swiss_ban_until: datetime | None = _as_utc(swiss_ban_until)
        self.swiss_ban_hours: int = swiss_ban_hours
        self.notifications: list[NotificationDocument] | None = None
        self.update_game_category(game_category)

        if username is None:
            self.anon = False if self.app_state.anon_as_test_users else True
            self.username: str = (
                TEST_PREFIX if self.app_state.anon_as_test_users else ANON_PREFIX
            ) + id8()
        else:
            self.username = username

        self.seeks: dict[str, Seek] = {}

        self.ready_for_auto_pairing: bool = False
        self.lobby_sockets: Set[WebSocketResponse] = set()
        self.tournament_sockets: dict[
            str, set[WebSocketResponse | None]
        ] = {}  # {tournamentId: set()}
        self.simul_sockets: dict[str, set[WebSocketResponse]] = {}  # {simulId: set()}

        self.notify_channels: Set[Queue[str]] = set()
        self.challenge_channels: Set[Queue[str]] = set()
        self.challenge_offline_task: asyncio.Task[None] | None = None

        self.puzzles: dict[
            str, int
        ] = {}  # {pizzleId: vote} where vote 0 = not voted, 1 = up, -1 = down
        self.puzzle_variant: str | None = None

        self.game_sockets: dict[str, set[WebSocketResponse]] = {}
        self.title: str = title
        self.game_in_progress: str | None = None
        self.abandon_game_tasks: dict[str, asyncio.Task[None]] = {}
        self.background_tasks: set[asyncio.Task[None]] = set()
        self.correspondence_games: List[Game] = []

        self.blocked: set[str] = set()

        if self.bot:
            self.event_queue: Queue[str] = asyncio.Queue()
            self.game_queues: dict[str, Queue[str]] = {}
            self.title = "BOT"

        self.online: bool = False
        self.ever_connected: bool = False

        if perfs is None and (not self.anon) and (not self.bot):
            # User() with perfs=None can be dangerous
            _id = "%s|%s" % (self.username, self.title)
            hs = app_state.highscore
            if any((_id in hs[variant] for variant in RATED_VARIANTS)):
                raise RatingResetError(
                    "%s User() called with perfs=None. Use await users.get() instead.", username
                )

        self.perfs = perf_map_with_defaults(RATED_VARIANTS, perfs)
        self.pperfs = perf_map_with_defaults(RATED_VARIANTS, pperfs)

        self.enabled: bool = enabled

        self.last_seen: datetime = datetime(MINYEAR, 1, 1, tzinfo=timezone.utc)

        # last game played
        self.tv: str | None = None

        # lobby chat spammer time out (10 min)
        self.silence: int = 0

        # purge inactive anon users after ANON_TIMEOUT sec
        if self.anon and not reserved(self.username):
            task = self.create_background_task(
                self.remove(),
                name="user-remove-%s" % self.username,
            )
            self.remove_anon_task: asyncio.Task[None] | None = task
        else:
            self.remove_anon_task = None

    async def remove(self) -> None:
        def can_remove_anon() -> bool:
            self.update_online()
            return not (
                self.online
                or self.game_in_progress is not None
                or self.correspondence_games
                or self.is_user_active_in_game()
                or self.is_user_active_in_lobby()
            )

        async def remove_from_cache() -> None:
            for seek_id, seek in tuple(self.seeks.items()):
                self.app_state.seeks.pop(seek_id, None)
                if seek.game_id is not None:
                    self.app_state.invites.pop(seek.game_id, None)
                self.seeks.pop(seek_id, None)

            await self.clear_spectator_references()

            # This task may race with other anon cleanup paths that already removed
            # or replaced the cache entry for this username.
            current = self.app_state.users.data.get(self.username)
            if current is self:
                del self.app_state.users[self.username]
            elif current is None:
                log.debug("User.remove() skipped, %s is already gone", self.username)
            else:
                log.debug(
                    "User.remove() skipped, %s cache points to a different instance",
                    self.username,
                )

        # Fast-path: if an anon user never connected any socket, do not keep it
        # around for the full reconnect timeout window.
        if URI != LOCALHOST and not self.ever_connected:
            await asyncio.sleep(ANON_NEVER_CONNECTED_TIMEOUT)
            if (not self.ever_connected) and can_remove_anon():
                # Give a second chance to account for races around first socket open.
                await asyncio.sleep(3)
                if (not self.ever_connected) and can_remove_anon():
                    await remove_from_cache()
                    self.remove_anon_task = None
                    return

        while True:
            await asyncio.sleep(1 if URI == LOCALHOST else ANON_TIMEOUT)
            if can_remove_anon():
                # give them a second chance
                await asyncio.sleep(3)
                if can_remove_anon():
                    await remove_from_cache()
                    break
        self.remove_anon_task = None

    async def clear_spectator_references(self) -> None:
        affected_games = []
        for game in tuple(self.app_state.games.values()):
            if self in game.spectators:
                game.spectators.discard(self)
                affected_games.append(game)

        for game in affected_games:
            await round_broadcast(game, game.spectator_list, full=True)

    def _background_task_done(self, task: asyncio.Task[None]) -> None:
        self.background_tasks.discard(task)
        if task.cancelled():
            return
        try:
            exc = task.exception()
        except Exception:
            log.exception(
                "Failed to inspect background task %s for %s",
                task.get_name(),
                self.username,
            )
            return
        if exc is not None:
            log.error(
                "Background task %s failed for %s",
                task.get_name(),
                self.username,
                exc_info=(type(exc), exc, exc.__traceback__),
            )

    def create_background_task(
        self,
        coro: Coroutine[Any, Any, None],
        *,
        name: str,
    ) -> asyncio.Task[None]:
        task = asyncio.create_task(coro, name=name)
        self.background_tasks.add(task)
        task.add_done_callback(self._background_task_done)
        return task

    def abandon_task_done(self, task: asyncio.Task[None], game_id: str) -> None:
        try:
            del self.abandon_game_tasks[game_id]
        except KeyError:
            pass

    async def abandon_game(self, game: Game) -> None:
        abandon_timeout = ABANDON_TIMEOUT * (2 if game.base >= 3 else 1)
        await asyncio.sleep(abandon_timeout)
        if game.status <= STARTED and not self.is_user_active_in_game(game.id):
            response = await game.game_ended(self, "abandon")
            await round_broadcast(game, response)

            opp_name = (
                game.wplayer.username
                if self.username == game.bplayer.username
                else game.bplayer.username
            )
            users = self.app_state.users
            if opp_name in users:
                opp_player = users[opp_name]
                if opp_player.bot:
                    if game.id in opp_player.game_queues:
                        await opp_player.game_queues[game.id].put(game.game_end)
                else:
                    await opp_player.send_game_message(game.id, response)

            await self.app_state.maybe_remove_finished_game_from_cache_now(game)

    def update_online(self) -> None:
        self.online = (
            len(self.game_sockets) > 0
            or len(self.lobby_sockets) > 0
            or len(self.challenge_channels) > 0
            or len(self.tournament_sockets) > 0
            or len(self.simul_sockets) > 0
        )
        if self.online:
            self.ever_connected = True

    def get_rating_value(self, variant: str, chess960: bool | None) -> int:
        try:
            return int(round(self.perfs[variant + ("960" if chess960 else "")]["gl"]["r"], 0))
        except KeyError:
            return 1500

    def get_rating(self, variant: str, chess960: bool | None) -> Rating:
        try:
            gl = self.perfs[variant + ("960" if chess960 else "")]["gl"]
            la = self.perfs[variant + ("960" if chess960 else "")]["la"]
            return gl2.create_rating(gl["r"], gl["d"], gl["v"], la)
        except KeyError:
            rating = gl2.create_rating()
            self.perfs[variant + ("960" if chess960 else "")] = new_default_perf()
            return rating

    def get_puzzle_rating(self, variant: str, chess960: bool | None) -> Rating:
        try:
            gl = self.pperfs[variant + ("960" if chess960 else "")]["gl"]
            la = self.pperfs[variant + ("960" if chess960 else "")]["la"]
            return gl2.create_rating(gl["r"], gl["d"], gl["v"], la)
        except KeyError:
            rating = gl2.create_rating()
            self.pperfs[variant + ("960" if chess960 else "")] = new_default_perf()
            return rating

    def set_silence(self) -> None:
        self.silence += SILENCE

        async def silencio() -> None:
            await asyncio.sleep(SILENCE)
            self.silence -= SILENCE

        self.create_background_task(silencio(), name="silence-%s" % self.username)

    async def set_rating(self, variant: str, chess960: bool, rating: Rating) -> None:
        if self.anon:
            return
        gl: PerfGl = {"r": rating.mu, "d": rating.phi, "v": rating.sigma}
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

    async def set_puzzle_rating(self, variant: str, chess960: bool, rating: Rating) -> None:
        if self.anon:
            return
        gl: PerfGl = {"r": rating.mu, "d": rating.phi, "v": rating.sigma}
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

    async def notify_game_end(self, game: Game) -> None:
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
        content: NotificationContent = {
            "id": game.id,
            "opp": opp_name,
            "win": win,
        }
        await notify(self.app_state.db, self, notif_type, content)

    async def notified(self) -> None:
        if self.notifications is not None:
            self.notifications = [{**notif, "read": True} for notif in self.notifications]

        if self.app_state.db is not None:
            await self.app_state.db.notify.update_many(
                {"notifies": self.username}, {"$set": {"read": True}}
            )

    def as_json(self, requester: str) -> UserJson:
        return {
            "_id": self.username,
            "title": self.title,
            "online": True if self.username == requester else self.online,
            "simul": len(self.simul_sockets) > 0,
        }

    async def clear_seeks(self) -> None:
        if len(self.seeks) > 0:
            for seek_id in tuple(self.seeks):
                game_id = self.seeks[seek_id].game_id
                # preserve invites (seek with game_id), corr seeks, and direct challenges
                if (
                    game_id is None
                    and self.seeks[seek_id].day == 0
                    and not self.seeks[seek_id].is_direct_challenge
                ):
                    del self.app_state.seeks[seek_id]
                    del self.seeks[seek_id]

            await self.app_state.lobby.lobby_broadcast_seeks()

    def remove_from_auto_pairings(self) -> None:
        try:
            del self.app_state.auto_pairing_users[self]
        except KeyError:
            pass
        [
            variant_tc
            for variant_tc in self.app_state.auto_pairings
            if self.app_state.auto_pairings[variant_tc].discard(self)
        ]
        self.ready_for_auto_pairing = False

    def delete_pending_auto_pairing(self) -> None:
        async def delete_auto_pairing() -> None:
            await asyncio.sleep(PENDING_SEEK_TIMEOUT)

            if not self.ready_for_auto_pairing:
                self.remove_from_auto_pairings()

        self.create_background_task(
            delete_auto_pairing(),
            name="delete-auto-pending-%s" % self.username,
        )

    def update_auto_pairing(self, ready: bool = True) -> None:
        self.ready_for_auto_pairing = ready
        if not ready:
            self.delete_pending_auto_pairing()

    def delete_pending_seek(self, seek: Seek) -> None:
        async def delete_seek(seek: Seek) -> None:
            await asyncio.sleep(PENDING_SEEK_TIMEOUT)

            if seek.pending:
                removed_user_seek = self.seeks.pop(seek.id, None)
                removed_global_seek = self.app_state.seeks.pop(seek.id, None)
                if removed_user_seek is None and removed_global_seek is None:
                    log.debug("delete_pending_seek() %s already removed", seek.id)
                elif removed_user_seek is None or removed_global_seek is None:
                    log.warning(
                        "delete_pending_seek() partial cleanup for %s user_removed=%s global_removed=%s",
                        seek.id,
                        removed_user_seek is not None,
                        removed_global_seek is not None,
                    )

        self.create_background_task(
            delete_seek(seek),
            name="delete-pending-seek-%s" % seek.id,
        )

    async def update_seeks(self, pending: bool = True) -> None:
        if len(self.seeks) > 0:
            for seek in self.seeks.values():
                # preserve invites (seek with game_id), corr seeks, and direct challenges
                if seek.game_id is None and seek.day == 0 and not seek.is_direct_challenge:
                    seek.pending = pending
                    if pending:
                        self.delete_pending_seek(seek)
            await self.app_state.lobby.lobby_broadcast_seeks()

    async def send_game_message(self, game_id: str, message: Mapping[str, object]) -> None:
        # todo: for now just logging dropped messages, but at some point should evaluate whether to queue them when no socket
        #       or include info about the complete round state in some more general message that is always
        #       sent on reconnect so client doesn't lose state
        ws_set = self.game_sockets.get(game_id)
        if ws_set is None or len(ws_set) == 0:
            return
        # TODO: make this switchable somehow
        #    if self.title != "TEST":
        #        log.debug("No ws for that game. Dropping message %s for %s", message, self.username)
        #        log.debug(
        #            "Currently user %s has these game_sockets: %r", self.username, self.game_sockets
        #        )
        #    return
        await ws_send_json_many(ws_set, message)

    async def close_all_game_sockets(self) -> None:
        for ws_set in tuple(
            self.game_sockets.values()
        ):  # todo: also clean up this dict after closing?
            for ws in tuple(ws_set):
                try:
                    await ws.close()
                except Exception:
                    log.error("close_all_game_sockets() Exception for %s %s", self.username, ws)

    def is_user_active_in_game(self, game_id: str | None = None) -> bool:
        # todo: maybe also check if ws is still open or that the sets corresponding to (each) game_id are not empty?
        if game_id is None:
            return len(self.game_sockets) > 0
        else:
            return game_id in self.game_sockets

    def is_user_active_in_lobby(self) -> bool:
        return len(self.lobby_sockets) > 0  # todo: check also if open maybe?

    def add_ws_for_game(self, game_id: str, ws: WebSocketResponse) -> None:
        if game_id not in self.game_sockets:
            self.game_sockets[game_id] = set()
        self.game_sockets[game_id].add(ws)

    def remove_ws_for_game(self, game_id: str, ws: WebSocketResponse) -> bool:
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

    def auto_compatible_with_other_user(
        self, other_user: User, variant: str, chess960: bool
    ) -> bool:
        """Users are compatible when their auto pairing rating ranges are ok
        and the users are not blocked by any direction"""

        self_rating = self.get_rating_value(variant, chess960)
        self_rrmin, self_rrmax = self.app_state.auto_pairing_users[self]

        other_rating = other_user.get_rating_value(variant, chess960)
        other_rrmin, other_rrmax = self.app_state.auto_pairing_users[other_user]

        return (
            (other_user.username not in self.blocked)
            and (self.username not in other_user.blocked)
            and self_rating >= other_rating + other_rrmin
            and self_rating <= other_rating + other_rrmax
            and other_rating >= self_rating + self_rrmin
            and other_rating <= self_rating + self_rrmax
        )

    def auto_compatible_with_seek(self, seek: Seek) -> bool:
        """Seek is auto pairing compatible when the rating ranges are ok
        and the users are not blocked by any direction"""

        if seek.target not in ("", self.username, seek.creator.username):
            return False

        self_rating = self.get_rating_value(seek.variant, seek.chess960)
        seek_user = self.app_state.users[seek.creator.username]

        auto_rrmin, auto_rrmax = self.app_state.auto_pairing_users[self]

        return (
            (seek_user.username not in self.blocked)
            and (self.username not in seek_user.blocked)
            and self_rating >= seek.rating + seek.rrmin
            and self_rating <= seek.rating + seek.rrmax
            and seek.rating >= self_rating + auto_rrmin
            and seek.rating <= self_rating + auto_rrmax
        )

    def compatible_with_seek(self, seek: Seek) -> bool:
        """Seek is compatible when my rating is inside the seek rating range
        and the users are not blocked by any direction"""

        if seek.target not in ("", self.username, seek.creator.username):
            return False

        self_rating = self.get_rating_value(seek.variant, seek.chess960)
        seek_user = self.app_state.users[seek.creator.username]
        return (
            (seek_user.username not in self.blocked)
            and (self.username not in seek_user.blocked)
            and self_rating >= seek.rating + seek.rrmin
            and self_rating <= seek.rating + seek.rrmax
        )

    def __repr__(self) -> str:
        return self.__str__()

    def __str__(self) -> str:
        return "%s %s bot=%s anon=%s chess=%s" % (
            self.title,
            self.username,
            self.bot,
            self.anon,
            self.perfs["chess"]["gl"]["r"],
        )

    def update_game_category(self, game_category: str) -> None:
        normalized = normalize_game_category(game_category)
        self.game_category = normalized
        self.category_variants = CATEGORY_VARIANTS[normalized]
        self.category_variant_groups = CATEGORY_VARIANT_GROUPS[normalized]
        self.category_variant_list = CATEGORY_VARIANT_LISTS[normalized]
        self.category_variant_set = CATEGORY_VARIANT_SETS[normalized]
        self.category_variant_codes = CATEGORY_VARIANT_CODES[normalized]


async def set_theme(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    post_data = await read_post_data(request)
    if post_data is None:
        return web.Response(status=204)
    theme = post_data.get("theme")

    if isinstance(theme, str):
        referer = request.headers.get("REFERER")
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        if isinstance(session_user, str) and session_user in app_state.users:
            user = app_state.users[session_user]
            user.theme = theme
            if app_state.db is not None:
                await app_state.db.user.find_one_and_update(
                    {"_id": user.username}, {"$set": {"theme": theme}}
                )
        session["theme"] = theme
        redirect_url = safe_redirect_path(referer)
        return web.HTTPFound(redirect_url)
    else:
        raise web.HTTPNotFound()


async def set_game_category(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    post_data = await read_post_data(request)
    if post_data is None:
        return web.Response(status=204)
    game_category = post_data.get("game_category")

    if isinstance(game_category, str):
        referer = request.headers.get("REFERER")
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        normalized = normalize_game_category(game_category)
        if isinstance(session_user, str) and session_user in app_state.users:
            user = app_state.users[session_user]
            user.update_game_category(normalized)
            user.game_category_set = True
            if app_state.db is not None:
                await app_state.db.user.find_one_and_update(
                    {"_id": user.username}, {"$set": {"ct": normalized}}
                )
        session["game_category"] = normalized
        redirect_url = safe_redirect_path(referer)
        if referer and normalized != GAME_CATEGORY_ALL:
            parsed = urlparse(redirect_url)
            path_parts = [part for part in parsed.path.split("/") if part]
            if path_parts:
                section = path_parts[0]
                variant_segment = path_parts[1] if len(path_parts) > 1 else None
                current_variant = (
                    path_parts[1] if len(path_parts) > 1 and path_parts[1] in VARIANTS else None
                )
                if current_variant not in CATEGORY_VARIANT_SETS[normalized]:
                    default_variant = (
                        CATEGORY_VARIANT_LISTS[normalized][0]
                        if CATEGORY_VARIANT_LISTS[normalized]
                        else "chess"
                    )
                    if section == "puzzle":
                        redirect_url = f"/puzzle/{default_variant}"
                    elif section == "analysis":
                        redirect_url = f"/analysis/{default_variant}"
                    elif section == "editor":
                        redirect_url = f"/editor/{default_variant}"
                    elif section == "variants" and variant_segment in VARIANTS:
                        redirect_url = f"/variants/{default_variant}"
        return web.HTTPFound(redirect_url)
    else:
        raise web.HTTPNotFound()


async def block_user(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    profileId = request.match_info["profileId"]

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = await app_state.users.get(session_user)

    if len(user.blocked) >= MAX_USER_BLOCK:
        # TODO: Alert the user about blocked quota reached
        raise web.HTTPFound("/@/%s" % profileId)

    post_data = await read_post_data(request)
    if post_data is None:
        return web.json_response({})
    block = post_data["block"] == "true"
    try:
        if block:
            await app_state.db.relation.find_one_and_update(
                {"_id": "%s/%s" % (user.username, profileId)},
                {"$set": {"u1": user.username, "u2": profileId, "r": BLOCK}},
                upsert=True,
            )
            user.blocked.add(profileId)
        else:
            await app_state.db.relation.delete_one({"_id": "%s/%s" % (user.username, profileId)})
            user.blocked.remove(profileId)
    except Exception:
        log.error(
            "block_user() Exception. Failed to save new relation for %s to mongodb!", session_user
        )

    return web.json_response({})


async def get_blocked_users(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = await app_state.users.get(session_user)

    if user.anon:
        await asyncio.sleep(3)
        return web.json_response({})

    response: UserBlocksResponse = {"blocks": list(user.blocked)}
    return web.json_response(response)


async def get_status(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)

    ids_param = request.rel_url.query.get("ids")
    if ids_param is None:
        raise web.HTTPBadRequest(text="missing ids")

    ids = [uid for uid in ids_param.split(",") if uid]
    if not ids:
        raise web.HTTPBadRequest(text="missing ids")

    status_list: list[UserStatusJson] = []
    for uid in ids:
        user = await app_state.users.get(uid)
        status_entry: UserStatusJson = {"status": user.online, "id": uid}
        status_list.append(status_entry)

    return web.json_response(status_list)
