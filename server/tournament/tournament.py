from __future__ import annotations
from typing import Any, TYPE_CHECKING, ClassVar, Deque, Mapping, Set, Tuple, TypeAlias
import asyncio
import logging
import collections
import random
import traceback
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from functools import cache
from operator import neg

from pymongo import ReturnDocument
from sortedcollections import ValueSortedDict
from sortedcontainers import SortedKeysView

from compress import R2C
from const import (
    ABORTED,
    CASUAL,
    DARK_FEN,
    RATED,
    CREATED,
    STARTED,
    BYEGAME,
    VARIANTEND,
    FLAG,
    ARENA,
    RR,
    T_CREATED,
    T_STARTED,
    T_ABORTED,
    T_FINISHED,
    T_ARCHIVED,
    SHIELD,
    MAX_CHAT_LINES,
)
from game import Game
from lichess_team_msg import lichess_team_msg
from misc import time_control_str
from newid import new_id
from websocket_utils import ws_send_json
from typing_defs import (
    TournamentDuelItem,
    TournamentDuelsResponse,
    TournamentGameJson,
    TournamentGamesResponse,
    TournamentPairingDoc,
    TournamentPairingUpdate,
    TournamentPlayerJson,
    TournamentPlayerUpdate,
    TournamentPlayersResponse,
    TournamentPoint,
    TournamentSpotlightsResponse,
    TournamentStatusResponse,
    TournamentTopGameResponse,
    TournamentUpdateData,
)

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from typing import Literal
    from bug.game_bug import GameBug
    from ws_types import ChatLine
    from ws_types import SpectatorsMessage
from spectators import spectators
from tournament.tournament_spotlights import tournament_spotlights
from user import User
from utils import insert_game_to_db
from settings import URI
from variants import get_server_variant

log = logging.getLogger(__name__)

SCORE, STREAK, DOUBLE = range(1, 4)

SCORE_SHIFT = 100000

NOTIFY1_MINUTES = 60 * 6
NOTIFY2_MINUTES = 10

Point = TournamentPoint
if TYPE_CHECKING:
    GameType: TypeAlias = Game | GameBug
else:
    GameType: TypeAlias = Game


class EnoughPlayer(Exception):
    """Raised when RR is already full"""

    pass


class ByeGame:
    """Used in RR/Swiss tournaments when pairing odd number of players"""

    __slots__ = "date", "status"

    if TYPE_CHECKING:
        wplayer: User
        bplayer: User

    def __init__(self) -> None:
        self.date: datetime = datetime.now(timezone.utc)
        self.status: int = BYEGAME

    def game_json(self, player: User) -> TournamentGameJson:
        return {
            "gameId": "",
            "title": "",
            "name": "",
            "rating": "",
            "prov": "",
            "color": "",
            "result": "-",
        }


class PlayerData:
    """Used to save/load tournament players to/from mongodb tournament-player documents"""

    __slots__ = (
        "id",
        "title",
        "username",
        "rating",
        "provisional",
        "free",
        "paused",
        "withdrawn",
        "win_streak",
        "games",
        "points",
        "nb_win",
        "nb_berserk",
        "nb_not_paired",
        "performance",
        "prev_opp",
        "color_balance",
        "page",
    )

    def __init__(self, title: str, username: str, rating: int, provisional: str) -> None:
        self.id: str | None = (
            None  # db.tournament_player._id will be generated when user firt joins
        )
        self.title: str = title
        self.username: str = username
        self.rating: int = rating
        self.provisional: str = provisional
        self.free: bool = True
        self.paused: bool = False
        self.withdrawn: bool = False
        self.win_streak: int = 0
        self.games: list[Game | GameData | ByeGame] = []
        self.points: list[Point] = []
        self.nb_win: int = 0
        self.nb_berserk: int = 0
        self.nb_not_paired: int = 0
        self.performance: int = 0
        self.prev_opp: str = ""
        self.color_balance: int = 0  # +1 when played as white, -1 when played as black
        self.page: int = 0

    def __str__(self) -> str:
        return " ".join(str(point) for point in self.points)


@cache
def player_json(player: PlayerData, full_score: int, paused: bool) -> TournamentPlayerJson:
    response: TournamentPlayerJson = {
        "paused": paused,
        "title": player.title,
        "name": player.username,
        "rating": player.rating,
        "points": player.points,
        "fire": player.win_streak,
        "score": full_score,  # SCORE_SHIFT-ed + performance rating
        "perf": player.performance,
        "nbGames": len(player.points),
        "nbWin": player.nb_win,
        "nbBerserk": player.nb_berserk,
    }
    return response


class GameData:
    """Used to save/load tournament games to/from mongodb tournament-pairing documents"""

    __slots__ = (
        "id",
        "wplayer",
        "wrating",
        "bplayer",
        "brating",
        "result",
        "date",
        "wberserk",
        "bberserk",
    )

    def __init__(
        self,
        _id: str,
        wplayer: User,
        wrating: str,
        bplayer: User,
        brating: str,
        result: str,
        date: datetime,
        wberserk: bool,
        bberserk: bool,
    ) -> None:
        self.id: str = _id
        self.wplayer: User = wplayer
        self.bplayer: User = bplayer
        self.result: str = result
        self.date: datetime = date
        self.wrating: str = wrating
        self.brating: str = brating
        self.wberserk: bool = wberserk
        self.bberserk: bool = bberserk

    def game_json(self, player: User) -> TournamentGameJson:
        color = "w" if self.wplayer == player else "b"
        opp_player = self.bplayer if color == "w" else self.wplayer
        opp_rating = self.brating if color == "w" else self.wrating
        prov = "?" if opp_rating.endswith("?") else ""
        opp_rating = opp_rating.replace("?", "")
        response: TournamentGameJson = {
            "gameId": self.id,
            "title": opp_player.title,
            "name": opp_player.username,
            "rating": int(opp_rating),
            "prov": prov,
            "color": color,
            "result": self.result,
        }
        return response


class Tournament(ABC):
    """Abstract base class for Arena/Swisss/RR Tournament classes
    They have to implement create_pairing() for waiting_players"""

    system: ClassVar[int] = ARENA
    beforeStart: int
    bp: int
    translated_name: str

    def __init__(
        self,
        app_state: PychessGlobalAppState,
        tournamentId: str,
        variant: str = "chess",
        chess960: bool = False,
        rated: bool | int = True,
        before_start: int = 5,
        minutes: int = 45,
        name: str = "",
        password: str = "",
        description: str = "",
        fen: str = "",
        base: float = 1,
        inc: int = 0,
        byoyomi_period: int = 0,
        rounds: int = 0,
        created_by: str = "",
        created_at: datetime | None = None,
        starts_at: datetime | None = None,
        status: int | None = None,
        with_clock: bool = True,
        frequency: str = "",
    ) -> None:
        self.app_state: PychessGlobalAppState = app_state
        self.id: str = tournamentId
        self.name: str = name
        self.password: str = password
        self.description: str = description
        self.variant: str = variant
        self.rated: bool | int = rated
        self.before_start: int = before_start  # in minutes
        self.minutes: int = minutes  # in minutes
        self.fen: str = fen
        self.base: float = base
        self.inc: int = inc
        self.byoyomi_period: int = byoyomi_period
        self.chess960: bool = chess960
        self.rounds: int = rounds
        self.frequency: str = frequency
        self.created_by: str = created_by
        self.starts_at: datetime = starts_at  # type: ignore[assignment]
        self.created_at: datetime = datetime.now(timezone.utc) if created_at is None else created_at
        self.ends_at: datetime
        self.with_clock = with_clock

        self.tourneychat: Deque[ChatLine] | list[ChatLine] = collections.deque([], MAX_CHAT_LINES)

        self.wave = timedelta(seconds=7)
        self.wave_delta = timedelta(seconds=1)
        self.current_round = 0
        self.prev_pairing: datetime | None = None
        self.bye_players: list[User] = []

        self.messages: collections.deque = collections.deque([], MAX_CHAT_LINES)
        self.spectators: Set[User] = set()
        self.players: dict[User, PlayerData] = {}

        self.leaderboard: Any = ValueSortedDict(neg)
        self.leaderboard_keys_view = SortedKeysView(self.leaderboard)
        self.status = T_CREATED if status is None else status
        self.ongoing_games: set[Game] = set()
        self.nb_players = 0

        self.nb_games_finished = 0
        self.w_win = 0
        self.b_win = 0
        self.draw = 0
        self.nb_berserk = 0

        self.first_pairing = False
        self.top_game: Game | None = None
        self.top_game_rank = 1

        self.notify1 = False
        self.notify2 = False

        self.clock_task: asyncio.Task[None] | None = None
        self.winner: str = ""

        self.initialize()

    def initialize(self):
        """Set properties which may be updated by the creator before the tournament starts"""

        self.server_variant = get_server_variant(self.variant, self.chess960)

        if self.starts_at == "" or self.starts_at is None:
            self.starts_at = self.created_at + timedelta(seconds=int(self.before_start * 60))

        if self.minutes is None:
            self.ends_at = self.starts_at + timedelta(days=1)
        else:
            self.ends_at = self.starts_at + timedelta(minutes=self.minutes)

        self.browser_title = "%s Tournament • %s" % (
            self.server_variant.display_name,
            self.name,
        )

        if self.with_clock:
            # Only start the clock for active or pending tournaments. Finished/aborted/archived
            # tournaments are loaded for display or history and do not need a live clock task.
            # Avoiding task creation here keeps the monitor free of finished tournament-clock noise.
            if self.status in (T_CREATED, T_STARTED):
                self.clock_task = asyncio.create_task(self.clock(), name="tournament-clock")

    @property
    def creator(self) -> str:
        return self.created_by

    def __repr__(self) -> str:
        return " ".join((self.id, self.name, self.created_at.isoformat()))

    @abstractmethod
    def create_pairing(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        pass

    def user_status(self, user: User) -> str:
        if user in self.players:
            return (
                "paused"
                if self.players[user].paused
                else "withdrawn"
                if self.players[user].withdrawn
                else "joined"
            )
        else:
            return "spectator"

    def user_rating(self, user: User) -> int | str:
        if user in self.players:
            return self.players[user].rating
        else:
            return "%s%s" % user.get_rating(self.variant, self.chess960).rating_prov

    def players_json(
        self, page: int | None = None, user: User | None = None
    ) -> TournamentPlayersResponse:
        if (page is None) and (user is not None) and (user in self.players):
            if self.players[user].page > 0:
                page = self.players[user].page
            else:
                leaderboard_index: int = self.leaderboard.index(user)
                div, mod = divmod(leaderboard_index + 1, 10)
                page = div + (1 if mod > 0 else 0)
                if self.status == T_CREATED:
                    self.players[user].page = page
        if page is None:
            page = 1

        start = (page - 1) * 10
        end = min(start + 10, self.nb_players)

        page_json: TournamentPlayersResponse = {
            "type": "get_players",
            "requestedBy": user.username if user is not None else "",
            "nbPlayers": self.nb_players,
            "nbGames": self.nb_games_finished,
            "page": page,
            "players": [
                player_json(self.players[player], full_score, self.players[player].paused)
                for player, full_score in self.leaderboard.items()[start:end]
            ],
        }

        if self.status > T_STARTED:
            page_json["podium"] = [
                player_json(self.players[player], full_score, self.players[player].paused)
                for player, full_score in self.leaderboard.items()[0:3]
            ]

        return page_json

    async def games_json(self, player_name: str) -> TournamentGamesResponse:
        player = await self.app_state.users.get(player_name)
        response: TournamentGamesResponse = {
            "type": "get_games",
            "rank": self.leaderboard.index(player) + 1,
            "title": player.title,
            "name": player_name,
            "perf": self.players[player].performance,
            "nbGames": len(self.players[player].points),
            "nbWin": self.players[player].nb_win,
            "nbBerserk": self.players[player].nb_berserk,
            "games": [game.game_json(player) for game in self.players[player].games],
        }
        return response

    @property
    def spectator_list(self) -> SpectatorsMessage:
        return spectators(self.spectators)

    @property
    def top_game_json(self) -> TournamentTopGameResponse:
        top_game = self.top_game
        if TYPE_CHECKING:
            assert top_game is not None
        chess960 = top_game.chess960
        if TYPE_CHECKING:
            assert chess960 is not None
        response: TournamentTopGameResponse = {
            "type": "top_game",
            "gameId": top_game.id,
            "variant": top_game.variant,
            "fen": DARK_FEN if top_game.fow else top_game.board.fen,
            "w": top_game.wplayer.username,
            "b": top_game.bplayer.username,
            "wr": self.leaderboard_keys_view.index(top_game.wplayer) + 1,
            "br": self.leaderboard_keys_view.index(top_game.bplayer) + 1,
            "chess960": chess960,
            "base": top_game.base,
            "inc": top_game.inc,
            "byoyomi": top_game.byoyomi_period,
            "lastMove": "" if top_game.fow else top_game.lastmove,
        }
        return response

    @property
    def duels_json(self) -> TournamentDuelsResponse:
        duels: list[TournamentDuelItem] = [
            {
                "id": game.id,
                "wp": game.wplayer.username,
                "wt": game.wplayer.title,
                "wr": game.wrating,
                "wk": game.wrank if isinstance(game, Game) else "",
                "bp": game.bplayer.username,
                "bt": game.bplayer.title,
                "br": game.brating,
                "bk": game.brank if isinstance(game, Game) else "",
            }
            for game in self.ongoing_games
        ]
        response: TournamentDuelsResponse = {
            "type": "duels",
            "duels": duels[0:6],
        }
        return response

    def waiting_players(self) -> list[User]:
        return [
            p
            for p in self.leaderboard
            if self.players[p].free
            and self.id in p.tournament_sockets
            and len(p.tournament_sockets[self.id]) > 0
            and not self.players[p].paused
            and not self.players[p].withdrawn
        ]

    async def clock(self):
        try:
            while self.status not in (T_ABORTED, T_FINISHED, T_ARCHIVED):
                now = datetime.now(timezone.utc)

                if self.status == T_CREATED:
                    remaining_time = self.starts_at - now
                    remaining_mins_to_start = int(
                        ((remaining_time.days * 3600 * 24) + remaining_time.seconds) / 60
                    )
                    if now >= self.starts_at:
                        if self.system != ARENA and len(self.players) < 3:
                            # Swiss and RR Tournaments need at least 3 players to start
                            await self.abort()
                            log.info("T_ABORTED: less than 3 player joined")
                            break

                        await self.start(now)
                        continue

                    elif (not self.notify2) and remaining_mins_to_start <= NOTIFY2_MINUTES:
                        self.notify1 = True
                        self.notify2 = True
                        await self.app_state.discord.send_to_discord(
                            "notify_tournament",
                            self.notify_discord_msg(remaining_mins_to_start),
                        )
                        continue

                    elif (not self.notify1) and remaining_mins_to_start <= NOTIFY1_MINUTES:
                        self.notify1 = True
                        await self.app_state.discord.send_to_discord(
                            "notify_tournament",
                            self.notify_discord_msg(remaining_mins_to_start),
                        )
                        asyncio.create_task(
                            lichess_team_msg(self.app_state), name="t-lichess-team-msg"
                        )
                        continue

                elif (self.minutes is not None) and now >= self.ends_at:
                    await self.finish()
                    log.info("T_FINISHED: no more time left")
                    break

                elif self.status == T_STARTED:
                    if self.system == ARENA:
                        # In case of server restart
                        if self.prev_pairing is None:
                            self.prev_pairing = now - self.wave - self.wave_delta

                        if now >= self.prev_pairing + self.wave + (
                            self.wave_delta * random.uniform(-1, 1)
                        ):
                            waiting_players = self.waiting_players()
                            nb_waiting_players = len(waiting_players)
                            if nb_waiting_players >= 2:
                                log.debug("Enough player (%s), do pairing", nb_waiting_players)
                                await self.create_new_pairings(waiting_players)
                                self.prev_pairing = now
                        else:
                            log.debug("Waiting for new pairing wave...")

                    elif len(self.ongoing_games) == 0:
                        if self.current_round < self.rounds:
                            self.current_round += 1
                            log.debug("Do %s. round pairing", self.current_round)
                            waiting_players = self.waiting_players()
                            await self.create_new_pairings(waiting_players)
                            await self.save_current_round()
                        else:
                            await self.finish()
                            log.debug("T_FINISHED: no more round left")
                            break
                    else:
                        log.info(
                            "%s has %s ongoing game(s)..."
                            % (
                                "RR" if self.system == RR else "Swiss",
                                len(self.ongoing_games),
                            )
                        )

                await asyncio.sleep(1)
        except Exception as exc:
            log.critical("".join(traceback.format_exception(exc)))
        finally:
            # Clear the task reference so a finished tournament clock does not stay
            # reachable from the tournament object (reduces monitor noise + allows GC).
            self.clock_task = None

    async def start(self, now: datetime) -> None:
        self.status = T_STARTED

        self.first_pairing = True

        response: TournamentStatusResponse = {
            "type": "tstatus",
            "tstatus": self.status,
            "secondsToFinish": (self.ends_at - now).total_seconds(),
        }
        await self.broadcast(response)

        # force first pairing wave in arena
        if self.system == ARENA:
            self.prev_pairing = now - self.wave

        if self.app_state.db is not None:
            u = await self.app_state.db.tournament.find_one_and_update(
                {"_id": self.id},
                {"$set": {"status": self.status}},
                return_document=ReturnDocument.AFTER,
            )
            log.info("Updated status: %s", u)

    @property
    def summary(self) -> TournamentStatusResponse:
        response: TournamentStatusResponse = {
            "type": "tstatus",
            "tstatus": self.status,
            "nbPlayers": self.nb_players,
            "nbGames": self.nb_games_finished,
            "wWin": self.w_win,
            "bWin": self.b_win,
            "draw": self.draw,
            "berserk": self.nb_berserk,
            "sumRating": sum(
                self.players[player].rating
                for player in self.players
                if not self.players[player].withdrawn
            ),
        }
        return response

    async def finalize(self, status: int) -> None:
        self.status = status

        if len(self.players) > 0:
            self.print_leaderboard()
            log.info("--- TOURNAMENT RESULT ---")
            for i in range(min(3, len(self.leaderboard))):
                player = self.leaderboard.peekitem(i)[0]
                log.info("--- #%s --- %s", (i + 1), player.username)
            log.info("--- CACHE INFO ---")
            log.info("%r", player_json.cache_info())

        # remove latest games from players tournament if it was not finished in time
        for player in self.players:
            if len(self.players[player].games) == 0:
                continue
            latest = self.players[player].games[-1]
            if latest and isinstance(latest, Game) and latest.status in (CREATED, STARTED):
                self.players[player].games.pop()

        await self.broadcast(self.summary)
        await self.save()

        await self.broadcast_spotlight()
        self.app_state.schedule_tournament_cache_removal(self)

    async def broadcast_spotlight(self) -> None:
        spotlights = tournament_spotlights(self.app_state)
        response: TournamentSpotlightsResponse = {"type": "spotlights", "items": spotlights}
        await self.app_state.lobby.lobby_broadcast(response)

    async def abort(self) -> None:
        await self.finalize(T_ABORTED)

    async def finish(self) -> None:
        await self.finalize(T_FINISHED)

    async def join(self, user: User, password: str | None = None) -> str | None:
        if user.anon:
            return None
        log.debug("JOIN: %s in tournament %s", user.username, self.id)

        if self.password and self.password != password:
            return "401"

        if self.system == RR and len(self.players) > self.rounds + 1:
            raise EnoughPlayer

        rating, provisional = user.get_rating(self.variant, self.chess960).rating_prov

        if user not in self.players:
            # new player joined
            self.players[user] = PlayerData(user.title, user.username, rating, provisional)
        else:
            # withdrawn player joined again, or already joined player re-joins
            self.players[user].rating = rating
            self.players[user].provisional = provisional

        if user not in self.leaderboard:
            # new player joined or withdrawn player joined again
            self.nb_players += 1

        if self.status == T_CREATED:
            self.leaderboard[user] = rating
        elif user not in self.leaderboard:
            self.leaderboard.setdefault(user, 0)

        player_data = self.players[user]

        player_data.free = True
        player_data.paused = False
        player_data.withdrawn = False

        response = self.players_json(user=user)
        await self.broadcast(response)

        if self.status == T_CREATED:
            await self.broadcast_spotlight()

        await self.db_update_player(user, "JOIN")
        return None

    async def withdraw(self, user: User) -> None:
        if self.status != T_CREATED:
            await self.pause(user)
            return

        log.debug("WITHDRAW: %s in tournament %s", user.username, self.id)
        self.players[user].withdrawn = True

        self.leaderboard.pop(user)
        self.nb_players -= 1

        response = self.players_json(user=user)
        await self.broadcast(response)

        await self.broadcast_spotlight()

        await self.db_update_player(user, "WITHDRAW")

    async def pause(self, user: User) -> None:
        log.debug("PAUSE: %s in tournament %s", user.username, self.id)
        self.players[user].paused = True

        # pause is different from withdraw and join because pause can be initiated from finished games page as well
        response = self.players_json(user=user)
        await self.broadcast(response)

        await self.db_update_player(user, "PAUSE")

    def spactator_join(self, spectator: User) -> None:
        self.spectators.add(spectator)

    def spactator_leave(self, spectator: User) -> None:
        self.spectators.discard(spectator)

    async def create_new_pairings(
        self, waiting_players: list[User]
    ) -> tuple[list[tuple[User, User]], list[Game]]:
        self.bye_players = []
        pairing = self.create_pairing(waiting_players)

        if self.first_pairing:
            self.first_pairing = False
            # Before tournament starts leaderboard is ordered by ratings
            # After first pairing it will be sorted by score points and performance
            # so we have to make a clear (all 0) leaderboard here
            new_leaderboard = [(user, 0) for user in self.leaderboard]
            self.leaderboard = ValueSortedDict(neg, new_leaderboard)
            self.leaderboard_keys_view = SortedKeysView(self.leaderboard)

        await self.persist_byes()

        games = await self.create_games(pairing)

        # save pairings to db
        await self.db_insert_pairing(games)

        return (pairing, games)

    async def persist_byes(self) -> None:
        if not self.bye_players:
            return

        bye_players = self.bye_players
        self.bye_players = []
        for player in bye_players:
            await self.db_update_player(player, "BYE")

    async def create_games(self, pairing: list[tuple[User, User]]) -> list[Game]:
        is_new_top_game = False

        games = []
        game_table = None if self.app_state.db is None else self.app_state.db.game
        for wp, bp in pairing:
            game_id = await new_id(game_table)
            game = Game(
                self.app_state,
                game_id,
                self.variant,
                self.fen,
                wp,
                bp,
                base=self.base,  # type: ignore[arg-type]
                inc=self.inc,
                byoyomi_period=self.byoyomi_period,
                rated=RATED if self.rated else CASUAL,
                tournamentId=self.id,
                chess960=self.chess960,
            )

            if game.has_crosstable:
                doc = await self.app_state.db.crosstable.find_one({"_id": game.ct_id})
                if doc is not None:
                    game.crosstable = doc

            games.append(game)
            self.app_state.games[game_id] = game
            await insert_game_to_db(game, self.app_state)

            self.ongoing_games.add(game)
            self.update_players(game)

            response = {
                "type": "new_game",
                "gameId": game_id,
                "wplayer": wp.username,
                "bplayer": bp.username,
            }

            ws_ok = False
            if wp.title != "TEST":
                for ws in list(wp.tournament_sockets[self.id]):
                    ok = await ws_send_json(ws, response)
                    ws_ok = ws_ok or ok
            if (not ws_ok) and wp.title != "TEST":
                await self.pause(wp)
                log.debug("White player %s left the tournament (ws send failed)", wp.username)

            ws_ok = False
            if bp.title != "TEST":
                for ws in list(bp.tournament_sockets[self.id]):
                    ok = await ws_send_json(ws, response)
                    ws_ok = ws_ok or ok
            if (not ws_ok) and bp.title != "TEST":
                await self.pause(bp)
                log.debug("Black player %s left the tournament (ws send failed)", bp.username)

            if self.update_game_ranks(game):
                is_new_top_game = True

        if is_new_top_game:
            await self.broadcast(self.top_game_json)

        await self.broadcast(self.duels_json)

        return games

    def update_players(self, game: Game | GameData) -> None:
        wp, bp = game.wplayer, game.bplayer

        self.players[wp].games.append(game)
        self.players[bp].games.append(game)

        if game.result == "*":
            self.players[wp].free = False
            self.players[bp].free = False

        self.players[wp].prev_opp = game.bplayer.username
        self.players[bp].prev_opp = game.wplayer.username

        self.players[wp].color_balance += 1
        self.players[bp].color_balance -= 1

        self.players[wp].nb_not_paired = 0
        self.players[bp].nb_not_paired = 0

    def update_game_ranks(self, game: Game) -> bool:
        if game.status != BYEGAME:
            brank = self.leaderboard.index(game.bplayer) + 1
            wrank = self.leaderboard.index(game.wplayer) + 1
            game.brank = brank
            game.wrank = wrank
            if (
                (self.top_game is not None and self.top_game.status > STARTED)
                or brank <= self.top_game_rank
                or wrank <= self.top_game_rank
            ):
                self.top_game_rank = min(brank, wrank)
                self.top_game = game
                return True

        return False

    def points_perfs(self, game: Game) -> Tuple[Point, Point, int, int]:
        wplayer = self.players[game.wplayer]
        bplayer = self.players[game.bplayer]

        wpoint = (0, SCORE)
        bpoint = (0, SCORE)
        wperf = int(game.brating.rstrip("?"))
        bperf = int(game.wrating.rstrip("?"))

        if game.result == "1/2-1/2":
            if self.system == ARENA:
                if game.board.ply > 10:
                    wpoint = (2, SCORE) if wplayer.win_streak == 2 else (1, SCORE)
                    bpoint = (2, SCORE) if bplayer.win_streak == 2 else (1, SCORE)

                wplayer.win_streak = 0
                bplayer.win_streak = 0
            else:
                wpoint, bpoint = (1, SCORE), (1, SCORE)

        elif game.result == "1-0":
            wplayer.nb_win += 1
            if self.system == ARENA:
                if wplayer.win_streak == 2:
                    wpoint = (4, DOUBLE)
                else:
                    wplayer.win_streak += 1
                    wpoint = (2, STREAK if wplayer.win_streak == 2 else SCORE)

                bplayer.win_streak = 0
            else:
                wpoint = (2, SCORE)

            if game.wberserk and game.board.ply >= 13:
                wpoint = (wpoint[0] + 1, wpoint[1])

            wperf += 500
            bperf -= 500

        elif game.result == "0-1":
            bplayer.nb_win += 1
            if self.system == ARENA:
                if bplayer.win_streak == 2:
                    bpoint = (4, DOUBLE)
                else:
                    bplayer.win_streak += 1
                    bpoint = (2, STREAK if bplayer.win_streak == 2 else SCORE)

                wplayer.win_streak = 0
            else:
                bpoint = (2, SCORE)

            if game.bberserk and game.board.ply >= 14:
                bpoint = (bpoint[0] + 1, bpoint[1])

            wperf -= 500
            bperf += 500

        return (wpoint, bpoint, wperf, bperf)

    def points_perfs_janggi(self, game: Game) -> Tuple[Point, Point, int, int]:
        wplayer = self.players[game.wplayer]
        bplayer = self.players[game.bplayer]

        wpoint = (0, SCORE)
        bpoint = (0, SCORE)
        wperf = int(game.brating.rstrip("?"))
        bperf = int(game.wrating.rstrip("?"))

        if game.status == VARIANTEND:
            wplayer.win_streak = 0
            bplayer.win_streak = 0

            if game.result == "1-0":
                if self.system == ARENA:
                    wpoint = (4 * 2 if wplayer.win_streak == 2 else 4, SCORE)
                    bpoint = (2 * 2 if bplayer.win_streak == 2 else 2, SCORE)
                else:
                    wpoint = (4, SCORE)
                    bpoint = (2, SCORE)

            elif game.result == "0-1":
                if self.system == ARENA:
                    bpoint = (4 * 2 if bplayer.win_streak == 2 else 4, SCORE)
                    wpoint = (2 * 2 if wplayer.win_streak == 2 else 2, SCORE)
                else:
                    bpoint = (4, SCORE)
                    wpoint = (2, SCORE)

        elif game.result == "1-0":
            wplayer.nb_win += 1
            if self.system == ARENA:
                if wplayer.win_streak == 2:
                    wpoint = (7 * 2, DOUBLE)
                else:
                    wplayer.win_streak += 1
                    wpoint = (7, STREAK if wplayer.win_streak == 2 else SCORE)

                bplayer.win_streak = 0

                if game.wberserk and game.board.ply >= 13:
                    wpoint = (wpoint[0] + 3, wpoint[1])
            else:
                wpoint = (7, SCORE)
                bpoint = (0, SCORE)

            wperf += 500
            bperf -= 500

        elif game.result == "0-1":
            bplayer.nb_win += 1
            if self.system == ARENA:
                if bplayer.win_streak == 2:
                    bpoint = (7 * 2, DOUBLE)
                else:
                    bplayer.win_streak += 1
                    bpoint = (7, STREAK if bplayer.win_streak == 2 else SCORE)

                wplayer.win_streak = 0

                if game.bberserk and game.board.ply >= 14:
                    bpoint = (bpoint[0] + 3, bpoint[1])
            else:
                wpoint = (0, SCORE)
                bpoint = (7, SCORE)

            wperf -= 500
            bperf += 500

        return (wpoint, bpoint, wperf, bperf)

    async def game_update(self, game: GameType) -> None:
        """Called from Game.update_status()"""
        if self.status in (T_FINISHED, T_ABORTED):
            return
        if TYPE_CHECKING:
            assert isinstance(game, Game)

        wplayer = self.players[game.wplayer]
        bplayer = self.players[game.bplayer]

        if game.status == ABORTED:
            return

        if game.wberserk:
            wplayer.nb_berserk += 1
            self.nb_berserk += 1

        if game.bberserk:
            bplayer.nb_berserk += 1
            self.nb_berserk += 1

        if game.variant == "janggi":
            wpoint, bpoint, wperf, bperf = self.points_perfs_janggi(game)
        else:
            wpoint, bpoint, wperf, bperf = self.points_perfs(game)

        wplayer.points.append(wpoint)
        bplayer.points.append(bpoint)
        if wpoint[1] == STREAK and len(wplayer.points) >= 2:
            wplayer.points[-2] = (wplayer.points[-2][0], STREAK)
        if bpoint[1] == STREAK and len(bplayer.points) >= 2:
            bplayer.points[-2] = (bplayer.points[-2][0], STREAK)

        wplayer.rating = int(game.wrating.rstrip("?")) + (int(game.wrdiff) if game.wrdiff else 0)
        bplayer.rating = int(game.brating.rstrip("?")) + (int(game.brdiff) if game.brdiff else 0)

        # TODO: in Swiss we will need Berger instead of performance to calculate tie breaks
        nb = len(wplayer.points)
        wplayer.performance = int(round((wplayer.performance * (nb - 1) + wperf) / nb, 0))

        nb = len(bplayer.points)
        bplayer.performance = int(round((bplayer.performance * (nb - 1) + bperf) / nb, 0))

        wpscore = self.leaderboard.get(game.wplayer, 0) // SCORE_SHIFT
        self.leaderboard.update(
            {game.wplayer: SCORE_SHIFT * (wpscore + wpoint[0]) + wplayer.performance}
        )

        bpscore = self.leaderboard.get(game.bplayer, 0) // SCORE_SHIFT
        self.leaderboard.update(
            {game.bplayer: SCORE_SHIFT * (bpscore + bpoint[0]) + bplayer.performance}
        )

        self.nb_games_finished += 1

        if game.result == "1-0":
            self.w_win += 1
        elif game.result == "0-1":
            self.b_win += 1
        elif game.result == "1/2-1/2":
            self.draw += 1

        self.ongoing_games.discard(game)

        # save player points to db
        await self.db_update_player(game.wplayer, "GAME_END")
        await self.db_update_player(game.bplayer, "GAME_END")
        await self.db_update_pairing(game)

        await self.broadcast(self.duels_json)

        asyncio.create_task(self.delayed_free(game), name="t-delayed-free")

        await self.broadcast(
            {
                "type": "game_update",
                "wname": game.wplayer.username,
                "bname": game.bplayer.username,
            }
        )

        if self.top_game is not None and self.top_game.id == game.id:
            response = {
                "type": "gameEnd",
                "status": game.status,
                "result": game.result,
                "gameId": game.id,
            }
            await self.broadcast(response)

    async def delayed_free(self, game: Game) -> None:
        if self.system == ARENA:
            await asyncio.sleep(3)

        wplayer = self.players[game.wplayer]
        bplayer = self.players[game.bplayer]

        if game.status == FLAG:
            # pause players when they don't start their game
            if game.board.ply == 0:
                bplayer.free = True
                await self.pause(game.wplayer)
                log.debug("AUTO PAUSE: %s in tournament %s", wplayer.username, self.id)
            elif game.board.ply == 1:
                wplayer.free = True
                await self.pause(game.bplayer)
                log.debug("AUTO PAUSE: %s in tournament %s", bplayer.username, self.id)
            else:
                wplayer.free = True
                bplayer.free = True
        else:
            wplayer.free = True
            bplayer.free = True

    async def broadcast(self, response: Mapping[str, object]) -> None:
        for spectator in self.spectators:
            try:
                for ws in spectator.tournament_sockets[self.id]:
                    await ws_send_json(ws, response)
            except KeyError:
                log.error("tournament broadcast() spectator socket was removed")
            except Exception:
                log.error("Exception in tournament broadcast()")

    async def db_insert_pairing(self, games: list[Game]) -> None:
        if self.app_state.db is None:
            return
        pairing_documents: list[TournamentPairingDoc] = []
        pairing_table = self.app_state.db.tournament_pairing

        for game in games:
            if game.status == BYEGAME:  # TODO: Save or not save? This is the question.
                continue

            pairing_doc: TournamentPairingDoc = {
                "_id": game.id,
                "tid": self.id,
                "u": (game.wplayer.username, game.bplayer.username),
                "r": R2C[game.result],
                "d": game.date,
                "wr": game.wrating,
                "br": game.brating,
                "wb": game.wberserk,
                "bb": game.bberserk,
            }
            pairing_documents.append(pairing_doc)
        if len(pairing_documents) > 0:
            await pairing_table.insert_many(pairing_documents)

    async def db_update_pairing(self, game: Game | GameData) -> None:
        if self.app_state.db is None:
            return
        pairing_table = self.app_state.db.tournament_pairing

        try:
            new_data: TournamentPairingUpdate = {
                "tid": self.id,
                "u": (game.wplayer.username, game.bplayer.username),
                "r": R2C[game.result],
                "d": game.date,
                "wr": game.wrating,
                "br": game.brating,
                "wb": game.wberserk,
                "bb": game.bberserk,
            }

            await pairing_table.update_one(
                {"_id": game.id},
                {"$set": new_data},
                upsert=True,
            )
        except Exception:
            log.exception(
                "db find_one_and_update pairing_table %s into %s failed !!!",
                game.id,
                self.id,
            )

    async def save_current_round(self) -> None:
        if self.app_state.db is None:
            return

        try:
            await self.app_state.db.tournament.update_one(
                {"_id": self.id},
                {"$set": {"cr": self.current_round}},
            )
        except Exception:
            log.exception("Failed to save current round for %s", self.id)

    async def db_update_player(
        self, user: User, action: "Literal['JOIN', 'WITHDRAW', 'PAUSE', 'GAME_END', 'BYE']"
    ) -> None:
        if self.app_state.db is None:
            return

        player_data = self.players[user]
        player_id = player_data.id
        player_table = self.app_state.db.tournament_player
        player_update: TournamentPlayerUpdate

        if action == "JOIN":
            if player_data.id is None:  # new player JOIN
                player_id = await new_id(player_table)
                player_data.id = player_id
                player_update = {
                    "_id": player_id,
                    "tid": self.id,
                    "uid": player_data.username,
                    "r": player_data.rating,
                    "pr": player_data.provisional,
                    "a": False,
                    "f": 0,
                    "s": 0,
                    "w": 0,
                    "b": 0,
                    "e": 0,
                    "p": [],
                    "wd": False,
                }
            else:
                player_update = {
                    "a": False,
                    "wd": False,
                    "r": player_data.rating,
                    "pr": player_data.provisional,
                }

        elif action == "WITHDRAW":
            player_update = {"wd": True}

        elif action == "PAUSE":
            player_update = {"a": True}

        elif action in ("GAME_END", "BYE"):
            full_score = self.leaderboard[user]
            player_update = {
                "_id": player_id,
                "tid": self.id,
                "uid": player_data.username,
                "r": player_data.rating,
                "pr": player_data.provisional,
                "a": player_data.paused,
                "f": player_data.win_streak,  # win_streak == 2 means "fire"
                "s": int(full_score / SCORE_SHIFT),
                "w": player_data.nb_win,
                "b": player_data.nb_berserk,
                "e": player_data.performance,
                "p": player_data.points,
                "wd": player_data.withdrawn,
            }

        try:
            doc_after = await player_table.find_one_and_update(
                {"_id": player_id},
                {"$set": player_update},
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            if doc_after is None:
                log.error(
                    "Failed to save %s player data update %s to mongodb",
                    player_id,
                    player_update,
                )

        except Exception:
            if self.app_state.db is not None:
                log.error(
                    "db find_one_and_update tournament_player %s into %s failed !!!",
                    player_id,
                    self.id,
                )

        tournament_update: TournamentUpdateData = {
            "nbPlayers": self.nb_players,
            "nbBerserk": self.nb_berserk,
        }
        doc_after = await self.app_state.db.tournament.find_one_and_update(
            {"_id": self.id},
            {"$set": tournament_update},
            return_document=ReturnDocument.AFTER,
        )
        if doc_after is None:
            log.error(
                "Failed to save %s player data update %s to mongodb",
                self.id,
                tournament_update,
            )

    async def save(self) -> None:
        if self.app_state.db is None:
            return

        if self.nb_games_finished == 0:
            d = await self.app_state.db.tournament.delete_many({"_id": self.id})
            log.info("Deleted %r", d)
            log.info("Deleted empty tournament %s" % self.id)
            return

        winner = self.leaderboard.peekitem(0)[0].username
        new_data: TournamentUpdateData = {
            "status": self.status,
            "nbPlayers": self.nb_players,
            "nbGames": self.nb_games_finished,
            "winner": winner,
        }

        doc_after = await self.app_state.db.tournament.find_one_and_update(
            {"_id": self.id},
            {"$set": new_data},
            return_document=ReturnDocument.AFTER,
        )
        if doc_after is None:
            log.error("Failed to save %s tournament data update %s to mongodb", self.id, new_data)

        if self.frequency == SHIELD:
            variant_name = self.variant + ("960" if self.chess960 else "")
            self.app_state.shield[variant_name].append((winner, self.starts_at, self.id))
            self.app_state.shield_owners[variant_name] = winner

    def print_leaderboard(self) -> None:
        log.info("--- LEADERBOARD --- %s", self.id)
        for player, full_score in self.leaderboard.items()[:10]:
            log.info(
                "%15s (%8s) %4s %30s %2s %s"
                % (
                    player.username,
                    self.players[player].id,
                    self.players[player].rating,
                    self.players[player].points,
                    full_score,
                    self.players[player].performance,
                )
            )

    @property
    def create_discord_msg(self) -> str:
        tc = time_control_str(self.base, self.inc, self.byoyomi_period)
        tail960 = "960" if self.chess960 else ""
        return "%s: **%s%s** %s tournament starts at UTC %s, duration will be **%s** minutes" % (
            self.created_by,
            self.variant,
            tail960,
            tc,
            self.starts_at.strftime("%Y.%m.%d %H:%M"),
            self.minutes,
        )

    def notify_discord_msg(self, minutes: int) -> str:
        tc = time_control_str(self.base, self.inc, self.byoyomi_period)
        tail960 = "960" if self.chess960 else ""
        url = "%s/tournament/%s" % (URI, self.id)
        if minutes >= 60:
            time = int(minutes / 60)
            time_text = "hours"
        else:
            time = minutes
            time_text = "minutes"
        return "**%s%s** %s tournament starts in **%s** %s! %s" % (
            self.variant,
            tail960,
            tc,
            time,
            time_text,
            url,
        )

    async def tourney_chat_save(self, response: ChatLine) -> None:
        self.tourneychat.append(response)
        response["tid"] = self.id
        await self.app_state.db.tournament_chat.insert_one(response)
        # We have to remove _id added by insert to remain our response JSON serializable
        del response["_id"]


async def upsert_tournament_to_db(tournament: Tournament, app_state: PychessGlobalAppState) -> None:
    # unit test app may have no db
    if app_state.db is None:
        return

    new_data: TournamentUpdateData = {
        "name": tournament.name,
        "password": tournament.password,
        "d": tournament.description,
        "fr": tournament.frequency,
        "minutes": tournament.minutes,
        "v": tournament.server_variant.code,
        "b": tournament.base,
        "i": tournament.inc,
        "bp": tournament.byoyomi_period,
        "f": tournament.fen,
        "y": RATED if tournament.rated else CASUAL,
        "z": int(tournament.chess960),
        "system": tournament.system,
        "rounds": tournament.rounds,
        "nbPlayers": 0,
        "cr": tournament.current_round,
        "createdBy": tournament.created_by,
        "createdAt": tournament.created_at,
        "beforeStart": tournament.before_start,
        "startsAt": tournament.starts_at,
        "status": tournament.status,
    }

    try:
        await app_state.db.tournament.find_one_and_update(
            {"_id": tournament.id}, {"$set": new_data}, upsert=True
        )
    except Exception:
        log.error(
            "upsert_tournament_to_db() Failed to save tournament %s data to mongodb!", tournament.id
        )
