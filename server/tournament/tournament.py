from __future__ import annotations
from typing import (
    Any,
    TYPE_CHECKING,
    ClassVar,
    Deque,
    Mapping,
    Set,
    Tuple,
    TypeAlias,
    cast,
    Literal,
)
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

from chat import chat_response
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
    SWISS,
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
from websocket_utils import ws_send_json_many
from typing_defs import (
    TournamentDuelItem,
    TournamentDuelsResponse,
    TournamentGameJson,
    TournamentGamesResponse,
    TournamentManagePlayerJson,
    TournamentPairingDoc,
    TournamentPairingUpdate,
    TournamentPlayerJson,
    TournamentPlayerUpdate,
    TournamentPlayersResponse,
    TournamentPoint,
    TournamentRRManagementResponse,
    TournamentRRSettingsResponse,
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
BERGER_NORM = 2

NOTIFY1_MINUTES = 60 * 6
NOTIFY2_MINUTES = 10
AUTO_ROUND_INTERVAL = -1
MANUAL_ROUND_INTERVAL = -2
MIN_AUTO_ROUND_INTERVAL_SECONDS = 10
MAX_AUTO_ROUND_INTERVAL_SECONDS = 60
RR_DEFAULT_MAX_PLAYERS = 10
RR_MAX_SUPPORTED_PLAYERS = 16

SWISS_FINISH_REASON_NOT_ENOUGH_PLAYERS = "notEnoughPlayers"
SWISS_FINISH_REASON_NO_LEGAL_PAIRING = "noLegalPairing"

Point = TournamentPoint
if TYPE_CHECKING:
    GameType: TypeAlias = Game | GameBug
else:
    GameType: TypeAlias = Game


class EnoughPlayer(Exception):
    """Raised when RR is already full"""

    pass


class PairingUnavailable(RuntimeError):
    """Raised when a fixed-round pairing backend cannot produce legal pairings."""

    pass


class ByeGame:
    """Used in RR/Swiss tournaments when pairing odd number of players"""

    __slots__ = "date", "status", "token", "round"

    if TYPE_CHECKING:
        wplayer: User
        bplayer: User

    def __init__(self, token: str = "U", round_no: int | None = None) -> None:
        self.date: datetime = datetime.now(timezone.utc)
        self.status: int = BYEGAME
        # TRF token for unplayed rounds (U/H/F/Z). Default is pairing-allocated bye.
        self.token: str = token
        self.round: int | None = round_no

    def unplayed_type(self) -> Literal["bye", "late", "absent"]:
        if self.token == "H":
            return "late"
        if self.token == "Z":
            return "absent"
        return "bye"

    def game_json(self, player: User) -> TournamentGameJson:
        return {
            "gameId": "",
            "title": "",
            "name": "",
            "rating": "",
            "prov": "",
            "color": "",
            "result": "-",
            "unplayedType": self.unplayed_type(),
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
        "berger",
        "prev_opp",
        "color_balance",
        "joined_round",
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
        # Sonneborn-Berger score stored as doubled integer (x2) to keep exact .5 steps.
        self.berger: int = 0
        self.prev_opp: str = ""
        self.color_balance: int = 0  # +1 when played as white, -1 when played as black
        # Swiss-only: first round in which the player can be paired.
        self.joined_round: int = 1
        self.page: int = 0

    def __str__(self) -> str:
        return " ".join(str(point) for point in self.points)


def berger_to_float(berger: int) -> float:
    return berger / BERGER_NORM


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
        "berger": berger_to_float(player.berger),
        "nbGames": len(player.points),
        "nbWin": player.nb_win,
        "nbBerserk": player.nb_berserk,
    }
    return response


class _GameDataPlayer:
    __slots__ = ("username", "title")

    def __init__(self, username: str, title: str = "") -> None:
        self.username = username
        self.title = title


class GameData:
    """Used to save/load tournament games to/from mongodb tournament-pairing documents"""

    __slots__ = (
        "id",
        "wname",
        "_wplayer",
        "wrating",
        "bname",
        "_bplayer",
        "brating",
        "result",
        "date",
        "wberserk",
        "bberserk",
        "status",
        "ply",
        "round",
    )

    def __init__(
        self,
        _id: str,
        wplayer: str,
        wrating: str,
        bplayer: str,
        brating: str,
        result: str,
        date: datetime,
        wberserk: bool,
        bberserk: bool,
        wtitle: str = "",
        btitle: str = "",
        status: int | None = None,
        ply: int | None = None,
        round_no: int | None = None,
    ) -> None:
        self.id: str = _id
        self.wname = wplayer
        self._wplayer = _GameDataPlayer(wplayer, wtitle)
        self.bname = bplayer
        self._bplayer = _GameDataPlayer(bplayer, btitle)
        self.result: str = result
        self.date: datetime = date
        self.wrating: str = wrating
        self.brating: str = brating
        self.wberserk: bool = wberserk
        self.bberserk: bool = bberserk
        self.status: int = FLAG if status is None else status
        self.ply: int | None = ply
        self.round: int | None = round_no

    @property
    def wplayer(self) -> _GameDataPlayer:
        return self._wplayer

    @wplayer.setter
    def wplayer(self, player: _GameDataPlayer) -> None:
        self._wplayer = player
        self.wname = player.username

    @property
    def bplayer(self) -> _GameDataPlayer:
        return self._bplayer

    @bplayer.setter
    def bplayer(self, player: _GameDataPlayer) -> None:
        self._bplayer = player
        self.bname = player.username

    def game_json(self, player: User) -> TournamentGameJson:
        color = "w" if self.wname == player.username else "b"
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
            # Needed by clients to distinguish variant-end wins from regular wins when rendering points.
            "status": int(self.status),
        }
        return response


class Tournament(ABC):
    """Abstract base class for Arena/Swisss/RR Tournament classes
    They have to implement create_pairing() for waiting_players"""

    system: ClassVar[int] = ARENA
    beforeStart: int
    bp: int
    round_interval: int
    translated_name: str
    entry_min_rating: int
    entry_max_rating: int
    entry_min_rated_games: int
    entry_min_account_age_days: int
    entry_titled_only: bool
    forbidden_pairings: str
    manual_pairings: str
    finish_reason: str | None
    rr_max_players: int
    rr_requires_approval: bool
    rr_joining_closed: bool

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
        rr_max_players: int = 0,
        rr_requires_approval: bool = False,
        rr_joining_closed: bool = False,
        round_interval: int = 0,
        created_by: str = "",
        created_at: datetime | None = None,
        starts_at: datetime | None = None,
        status: int | None = None,
        finish_reason: str | None = None,
        with_clock: bool = True,
        frequency: str = "",
        entry_min_rating: int = 0,
        entry_max_rating: int = 0,
        entry_min_rated_games: int = 0,
        entry_min_account_age_days: int = 0,
        entry_titled_only: bool = False,
        forbidden_pairings: str = "",
        manual_pairings: str = "",
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
        self.rr_max_players: int = rr_max_players
        self.rr_requires_approval: bool = rr_requires_approval
        self.rr_joining_closed: bool = rr_joining_closed
        self.round_interval: int = round_interval
        self.frequency: str = frequency
        self.entry_min_rating: int = entry_min_rating
        self.entry_max_rating: int = entry_max_rating
        self.entry_min_rated_games: int = entry_min_rated_games
        self.entry_min_account_age_days: int = entry_min_account_age_days
        self.entry_titled_only: bool = entry_titled_only
        self.forbidden_pairings: str = forbidden_pairings
        self.manual_pairings: str = manual_pairings
        self.created_by: str = created_by
        self.starts_at: datetime = starts_at  # type: ignore[assignment]
        self.created_at: datetime = datetime.now(timezone.utc) if created_at is None else created_at
        self.ends_at: datetime
        self.with_clock = with_clock
        self.finish_reason = finish_reason

        self.tourneychat: Deque[ChatLine] | list[ChatLine] = collections.deque([], MAX_CHAT_LINES)

        self.wave = timedelta(seconds=7)
        self.wave_delta = timedelta(seconds=1)
        self.current_round = 0
        self.pairing_in_progress_round: int | None = None
        self.next_round_starts_at: datetime | None = None
        self.manual_next_round_pending = False
        self.prev_pairing: datetime | None = None
        self.bye_players: list[User] = []

        self.messages: collections.deque = collections.deque([], MAX_CHAT_LINES)
        self.spectators: Set[User] = set()
        self.players: dict[User, PlayerData] = {}
        self.rr_pending_players: set[str] = set()
        self.rr_denied_players: set[str] = set()
        # Incremental migration support: canonical username index in parallel with User-key maps.
        self.players_by_name: dict[str, PlayerData] = {}
        self.player_keys_by_name: dict[str, User] = {}

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

    async def create_pairing_async(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        return self.create_pairing(waiting_players)

    async def load_arrangements(self, docs: list[object]) -> None:
        return

    def arrangement_payload(self, *, user: User | None = None) -> dict[str, object]:
        return {"type": "rr_arrangements", "requestedBy": "" if user is None else user.username}

    async def create_arrangement_challenge(self, user: User, arrangement_id: str) -> str | None:
        return "Round-robin challenges are not available for this tournament."

    async def accept_arrangement_challenge(
        self, user: User, arrangement_id: str
    ) -> dict[str, object]:
        return {"type": "error", "message": "Round-robin challenges are not available."}

    def register_player(self, user: User, player_data: PlayerData) -> None:
        for existing in tuple(self.players):
            if existing is user:
                continue
            if existing.username == player_data.username:
                self.players.pop(existing, None)
        self.players[user] = player_data
        self.players_by_name[player_data.username] = player_data
        self.player_keys_by_name[player_data.username] = user

    def player_data_by_name(self, username: str) -> PlayerData | None:
        player_data = self.players_by_name.get(username)
        if player_data is not None:
            return player_data

        player = self.get_player_by_name(username)
        if player is None:
            return None

        player_data = self.players.get(player)
        if player_data is not None:
            self.players_by_name[username] = player_data
        return player_data

    def get_player_by_name(self, username: str) -> User | None:
        mapped_player = self.player_keys_by_name.get(username)
        if mapped_player is not None and mapped_player in self.players:
            self.players_by_name[username] = self.players[mapped_player]
            return mapped_player

        for player, player_data in self.players.items():
            if player.username == username:
                self.player_keys_by_name[username] = player
                self.players_by_name[username] = player_data
                return player

        # Recover from key-map drift where player data exists but User key mapping was dropped.
        player_data = self.players_by_name.get(username)
        if player_data is not None:
            recovered_player = self.app_state.users[username]
            if recovered_player.username != username:
                # Keep tournament internals stable even if the in-memory users cache was evicted.
                recovered_player = User(self.app_state, username=username, title=player_data.title)
                self.app_state.users[username] = recovered_player
            self.players[recovered_player] = player_data
            self.player_keys_by_name[username] = recovered_player
            return recovered_player

        self.player_keys_by_name.pop(username, None)
        return None

    def get_player(self, user: User) -> User | None:
        if user in self.players:
            self.player_keys_by_name[user.username] = user
            self.players_by_name[user.username] = self.players[user]
            return user
        return self.get_player_by_name(user.username)

    def get_rank_by_username(self, username: str) -> int | None:
        for rank, player in enumerate(self.leaderboard, start=1):
            if player.username == username:
                return rank
        return None

    def leaderboard_player_by_username(self, username: str) -> User | None:
        for player in self.leaderboard:
            if player.username == username:
                return player
        return None

    def leaderboard_score_by_username(self, username: str) -> int:
        leaderboard_player = self.leaderboard_player_by_username(username)
        if leaderboard_player is None:
            return 0
        return self.leaderboard.get(leaderboard_player, 0)

    def set_leaderboard_score_by_username(
        self, username: str, score: int, player: User | None = None
    ) -> User | None:
        leaderboard_player = self.leaderboard_player_by_username(username)
        if leaderboard_player is None:
            leaderboard_player = player if player is not None else self.get_player_by_name(username)
        if leaderboard_player is None:
            return None
        self.leaderboard.update({leaderboard_player: score})
        return leaderboard_player

    def pop_leaderboard_player_by_username(self, username: str) -> User | None:
        leaderboard_player = self.leaderboard_player_by_username(username)
        if leaderboard_player is None:
            return None
        self.leaderboard.pop(leaderboard_player, None)
        return leaderboard_player

    def tie_break_value(self, player_data: PlayerData) -> int:
        if self.system == ARENA:
            return player_data.performance
        return player_data.berger

    def compose_leaderboard_score(self, score_points: int, player_data: PlayerData) -> int:
        return SCORE_SHIFT * score_points + self.tie_break_value(player_data)

    def recalculate_berger_tiebreak(self) -> None:
        if self.system == ARENA:
            return

        score_points_by_username = {
            player.username: full_score // SCORE_SHIFT
            for player, full_score in self.leaderboard.items()
        }

        for player_data in self.players.values():
            berger = 0
            for game in player_data.games:
                if isinstance(game, ByeGame):
                    continue

                wname, bname = self.game_player_usernames(game)
                if player_data.username == wname:
                    opponent_username = bname
                    if game.result == "1-0":
                        result_numerator = 2
                    elif game.result == "1/2-1/2":
                        result_numerator = 1
                    else:
                        result_numerator = 0
                elif player_data.username == bname:
                    opponent_username = wname
                    if game.result == "0-1":
                        result_numerator = 2
                    elif game.result == "1/2-1/2":
                        result_numerator = 1
                    else:
                        result_numerator = 0
                else:
                    continue

                if result_numerator == 0:
                    continue
                opponent_score = score_points_by_username.get(opponent_username, 0)
                berger += result_numerator * opponent_score

            player_data.berger = berger

        for leaderboard_player in list(self.leaderboard.keys()):
            player_data = self.player_data_by_name(leaderboard_player.username)
            if player_data is None:
                continue
            score_points = score_points_by_username.get(leaderboard_player.username, 0)
            self.leaderboard.update(
                {
                    leaderboard_player: self.compose_leaderboard_score(
                        score_points,
                        player_data,
                    )
                }
            )

    def tournament_sockets(self, username: str, user: User | None = None) -> set[Any]:
        sockets_by_username = self.app_state.tourneysockets.get(self.id, {})
        sockets = sockets_by_username.get(username)
        if sockets is not None:
            return sockets

        if user is not None:
            return user.tournament_sockets.get(self.id, set())

        player = self.get_player_by_name(username)
        if player is not None:
            return player.tournament_sockets.get(self.id, set())

        return set()

    def player_round_sockets(self, player: User, player_data: PlayerData | None = None) -> set[Any]:
        sockets = set(self.tournament_sockets(player.username, player))
        if self.system == ARENA:
            return sockets

        if player_data is None:
            player_data = self.player_data_by_name(player.username)
        if player_data is None:
            return sockets

        # Fixed-round players often remain on their finished game page instead of going back to the
        # tournament lobby immediately. Reuse those game sockets so they stay pairable and can
        # receive the next-round redirect without opening the tournament page again.
        for game in reversed(player_data.games):
            if isinstance(game, ByeGame):
                continue
            sockets.update(player.game_sockets.get(game.id, set()))

        return sockets

    @staticmethod
    def game_player_usernames(game: Game | GameData) -> tuple[str, str]:
        if isinstance(game, GameData):
            return (game.wname, game.bname)
        return (game.wplayer.username, game.bplayer.username)

    def game_player_data(self, game: Game | GameData) -> tuple[PlayerData, PlayerData] | None:
        wname, bname = self.game_player_usernames(game)
        wplayer = self.player_data_by_name(wname)
        bplayer = self.player_data_by_name(bname)
        if wplayer is None or bplayer is None:
            log.warning(
                "Skipping game %s in tournament %s: player data missing wp=%s bp=%s",
                game.id,
                self.id,
                wname,
                bname,
            )
            return None
        return (wplayer, bplayer)

    def user_status(self, user: User) -> str:
        if user.username in self.rr_pending_players:
            return "pending"
        if user.username in self.rr_denied_players:
            return "denied"
        player_data = self.player_data_by_name(user.username)
        if player_data is not None:
            return (
                "paused"
                if player_data.paused
                else "withdrawn"
                if player_data.withdrawn
                else "joined"
            )
        else:
            return "spectator"

    def user_rating(self, user: User) -> int | str:
        player_data = self.player_data_by_name(user.username)
        if player_data is not None:
            return player_data.rating
        else:
            return "%s%s" % user.get_rating(self.variant, self.chess960).rating_prov

    def players_json(
        self, page: int | None = None, user: User | None = None
    ) -> TournamentPlayersResponse:
        player_data = self.player_data_by_name(user.username) if user is not None else None
        if (page is None) and (user is not None) and (player_data is not None):
            if player_data.page > 0:
                page = player_data.page
            else:
                rank = self.get_rank_by_username(user.username)
                if rank is None:
                    page = 1
                else:
                    div, mod = divmod(rank, 10)
                    page = div + (1 if mod > 0 else 0)
                    if self.status == T_CREATED:
                        player_data.page = page
        if page is None:
            page = 1

        ongoing_players = self.ongoing_fixed_round_players()

        start = (page - 1) * 10
        end = min(start + 10, self.nb_players)

        players: list[TournamentPlayerJson] = []
        for player, full_score in self.leaderboard.items()[start:end]:
            leaderboard_player_data = self.player_data_by_name(player.username)
            if leaderboard_player_data is None:
                log.warning(
                    "Skipping missing leaderboard player %s in %s players_json",
                    player.username,
                    self.id,
                )
                continue
            payload = player_json(
                leaderboard_player_data,
                full_score,
                leaderboard_player_data.paused,
            )
            if leaderboard_player_data.withdrawn:
                payload = cast(TournamentPlayerJson, {**payload, "withdrawn": True})
            points = self.standings_points(leaderboard_player_data, ongoing_players)
            if points is not leaderboard_player_data.points:
                payload = cast(TournamentPlayerJson, {**payload, "points": points})
            players.append(payload)

        page_json: TournamentPlayersResponse = {
            "type": "get_players",
            "requestedBy": user.username if user is not None else "",
            "nbPlayers": self.nb_players,
            "nbGames": self.nb_games_finished,
            "page": page,
            "players": players,
        }

        if self.status > T_STARTED:
            podium: list[TournamentPlayerJson] = []
            for player, full_score in self.leaderboard.items()[0:3]:
                leaderboard_player_data = self.player_data_by_name(player.username)
                if leaderboard_player_data is None:
                    log.warning(
                        "Skipping missing leaderboard player %s in %s podium",
                        player.username,
                        self.id,
                    )
                    continue
                podium.append(
                    player_json(
                        leaderboard_player_data,
                        full_score,
                        leaderboard_player_data.paused,
                    )
                )
            page_json["podium"] = podium

        return page_json

    def ongoing_fixed_round_players(self) -> set[str]:
        if self.system == ARENA or self.status != T_STARTED or self.current_round <= 0:
            return set()

        usernames: set[str] = set()
        for game in self.ongoing_games:
            if getattr(game, "round", self.current_round) != self.current_round:
                continue
            wname, bname = self.game_player_usernames(game)
            usernames.add(wname)
            usernames.add(bname)

        return usernames

    def standings_points(self, player_data: PlayerData, ongoing_players: set[str]) -> list[Point]:
        points = player_data.points

        # Match lichess Swiss sheet rendering for synthetic non-played entries while
        # keeping persisted points numeric in player_data.points.
        for i, game in enumerate(player_data.games):
            if i >= len(points):
                break
            if not isinstance(game, ByeGame):
                continue
            token = getattr(game, "token", "U")
            rendered: Point | None = None
            if token == "Z":
                rendered = "-"
            elif self.system == SWISS:
                if self.variant == "janggi":
                    if token in ("U", "F"):
                        rendered = ("7", SCORE)
                    elif token == "H":
                        rendered = ("2", SCORE)
                else:
                    if token in ("U", "F"):
                        rendered = ("1", SCORE)
                    elif token == "H":
                        rendered = ("½", SCORE)
            if rendered is not None and points[i] != rendered:
                if points is player_data.points:
                    points = list(player_data.points)
                points[i] = rendered

        # Represent an ongoing fixed-round game in the score sheet like lichess.
        # Keep persisted points untouched; this marker is only for websocket standings payload.
        if player_data.username in ongoing_players and len(points) == self.current_round - 1:
            if points is player_data.points:
                points = list(player_data.points)
            points.append(("*", SCORE))

        return points

    async def games_json(self, player_name: str) -> TournamentGamesResponse:
        player_data = self.player_data_by_name(player_name)
        if player_data is None:
            spectator = await self.app_state.users.get(player_name)
            return {
                "type": "get_games",
                "rank": 0,
                "title": spectator.title,
                "name": player_name,
                "perf": 0,
                "berger": 0,
                "nbGames": 0,
                "nbWin": 0,
                "nbBerserk": 0,
                "games": [],
            }

        rank = self.get_rank_by_username(player_name)
        player = self.get_player_by_name(player_name)
        if player is None:
            player = await self.app_state.users.get(player_name)
        response: TournamentGamesResponse = {
            "type": "get_games",
            "rank": rank if rank is not None else 0,
            "title": player.title,
            "name": player_name,
            "perf": player_data.performance,
            "berger": berger_to_float(player_data.berger),
            "nbGames": len(player_data.points),
            "nbWin": player_data.nb_win,
            "nbBerserk": player_data.nb_berserk,
            "games": [game.game_json(player) for game in player_data.games],
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
            "wr": self.get_rank_by_username(top_game.wplayer.username) or 0,
            "br": self.get_rank_by_username(top_game.bplayer.username) or 0,
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
        waiting: list[User] = []
        for player in self.leaderboard:
            player_data = self.player_data_by_name(player.username)
            if player_data is None:
                log.warning(
                    "Skipping missing leaderboard player %s in %s waiting_players",
                    player.username,
                    self.id,
                )
                continue

            if not player_data.free or player_data.paused or player_data.withdrawn:
                continue

            # Fixed-round events keep pairability in persisted tournament state instead of tying it
            # to whichever page socket the user currently has open. Arena still pairs only connected
            # players because its rolling waves depend on live availability.
            if self.system != ARENA or len(self.player_round_sockets(player, player_data)) > 0:
                waiting.append(player)

        return waiting

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
                        min_players_to_start = 0
                        if self.system == RR:
                            min_players_to_start = 3
                        elif self.system == SWISS:
                            min_players_to_start = 2
                        if min_players_to_start > 0 and len(self.players) < min_players_to_start:
                            await self.abort()
                            log.info(
                                "T_ABORTED: less than %s player(s) joined for %s",
                                min_players_to_start,
                                "RR" if self.system == RR else "Swiss",
                            )
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
                        self.app_state.create_background_task(
                            lichess_team_msg(self.app_state),
                            name="t-lichess-team-msg",
                        )
                        continue

                elif self.system == ARENA and (self.minutes is not None) and now >= self.ends_at:
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
                        if not await self.maybe_schedule_next_fixed_round(now):
                            break
                    else:
                        self.next_round_starts_at = None
                        self.manual_next_round_pending = False
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
        if self.system == RR:
            self.rounds = self.rr_rounds_for_start()
        self.status = T_STARTED

        self.first_pairing = True
        self.next_round_starts_at = None
        self.manual_next_round_pending = False

        response = self.live_status(now)
        await self.broadcast(response)

        # force first pairing wave in arena
        if self.system == ARENA:
            self.prev_pairing = now - self.wave

        if self.app_state.db is not None:
            u = await self.app_state.db.tournament.find_one_and_update(
                {"_id": self.id},
                {"$set": {"status": self.status, "rounds": self.rounds}},
                return_document=ReturnDocument.AFTER,
            )
            if u is None:
                log.warning(
                    "Updated status: tournament %s status set to %s but no document returned",
                    self.id,
                    self.status,
                )
            else:
                log.info("Updated status: tournament %s status=%s", self.id, u.get("status"))

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
                player_data.rating
                for player_data in self.players.values()
                if not player_data.withdrawn
            ),
        }
        if self.system != ARENA:
            response["rounds"] = self.rounds
        return response

    def max_recorded_round(self) -> int:
        max_round = 0
        usernames = {player.username for player in self.players}.union(self.players_by_name)
        for username in usernames:
            player_data = self.player_data_by_name(username)
            if player_data is None:
                continue
            for game in player_data.games:
                round_no = getattr(game, "round", None)
                if isinstance(round_no, int) and round_no > max_round:
                    max_round = round_no
        return max_round

    def normalize_finished_swiss_round_state(self) -> None:
        if self.system != SWISS or self.finish_reason is None:
            return

        played_rounds = self.max_recorded_round()
        self.current_round = played_rounds
        self.rounds = played_rounds
        self.next_round_starts_at = None
        self.manual_next_round_pending = False
        if (
            self.pairing_in_progress_round is not None
            and self.pairing_in_progress_round > played_rounds
        ):
            self.pairing_in_progress_round = None

    def round_status(self, now: datetime | None = None) -> tuple[int, float]:
        if self.system == ARENA or self.status != T_STARTED:
            return (0, 0.0)

        if now is None:
            now = datetime.now(timezone.utc)

        round_ongoing_games = len(self.ongoing_games)
        seconds_to_next_round = 0.0
        if (
            round_ongoing_games == 0
            and 0 < self.current_round < self.rounds
            and self.next_round_starts_at is not None
        ):
            seconds_to_next_round = max(
                0.0,
                (self.next_round_starts_at - now).total_seconds(),
            )

        return (round_ongoing_games, seconds_to_next_round)

    def live_status(self, now: datetime | None = None) -> TournamentStatusResponse:
        if now is None:
            now = datetime.now(timezone.utc)
        response: TournamentStatusResponse = {
            "type": "tstatus",
            "tstatus": self.status,
        }
        if self.system != ARENA:
            response["rounds"] = self.rounds
        if self.status == T_STARTED:
            response["secondsToFinish"] = max(0.0, (self.ends_at - now).total_seconds())
            if self.system != ARENA:
                response["currentRound"] = self.current_round
                round_ongoing_games, seconds_to_next_round = self.round_status(now)
                response["roundOngoingGames"] = round_ongoing_games
                response["secondsToNextRound"] = seconds_to_next_round
                response["manualNextRound"] = self.manual_next_round_pending
        return response

    async def maybe_schedule_next_fixed_round(self, now: datetime) -> bool:
        if self.current_round == 0:
            self.current_round += 1
            log.debug("Do %s. round pairing", self.current_round)
            return await self.pair_fixed_round(now)

        if self.current_round < self.rounds:
            if self.round_interval == MANUAL_ROUND_INTERVAL:
                if not self.manual_next_round_pending:
                    self.manual_next_round_pending = True
                    log.debug(
                        "%s round %s complete; waiting for manual start of next round",
                        "RR" if self.system == RR else "Swiss",
                        self.current_round,
                    )
                    await self.broadcast(self.live_status(now))
                return True

            interval_seconds = self.effective_round_interval_seconds()
            if interval_seconds <= 0:
                self.next_round_starts_at = now
            elif self.next_round_starts_at is None:
                self.next_round_starts_at = now + timedelta(seconds=interval_seconds)
                log.debug(
                    "%s round %s complete; waiting %ss before next round",
                    "RR" if self.system == RR else "Swiss",
                    self.current_round,
                    interval_seconds,
                )
                await self.broadcast(self.live_status(now))

            if self.next_round_starts_at is not None and now >= self.next_round_starts_at:
                self.current_round += 1
                self.next_round_starts_at = None
                log.debug("Do %s. round pairing", self.current_round)
                return await self.pair_fixed_round(now)
            return True

        await self.finish()
        log.debug("T_FINISHED: no more round left")
        return False

    async def pair_fixed_round(self, now: datetime) -> bool:
        waiting_players = self.waiting_players()
        if self.system == SWISS and len(waiting_players) < 2:
            await self.finish(SWISS_FINISH_REASON_NOT_ENOUGH_PLAYERS)
            log.info(
                "T_FINISHED: Swiss has fewer than 2 active players to pair in round %s",
                self.current_round,
            )
            return False

        if self.system == RR:
            await self.set_pairing_in_progress_round(self.current_round)

        try:
            pairing, games = await self.create_new_pairings(
                waiting_players,
                publish_pairings=self.system != RR,
            )
        except PairingUnavailable as exc:
            if self.system == SWISS:
                await self.finish(SWISS_FINISH_REASON_NO_LEGAL_PAIRING)
                log.info(
                    "T_FINISHED: Swiss has no legal pairing in round %s (%s)",
                    self.current_round,
                    exc,
                )
                return False
            if self.system == RR:
                await self.set_pairing_in_progress_round(None)
            raise

        if self.system == SWISS and len(waiting_players) >= 2 and len(pairing) == 0:
            await self.finish(SWISS_FINISH_REASON_NO_LEGAL_PAIRING)
            log.info(
                "T_FINISHED: Swiss produced no pairings in round %s with %s active players",
                self.current_round,
                len(waiting_players),
            )
            return False

        await self.save_current_round()
        self.next_round_starts_at = None
        self.manual_next_round_pending = False
        if self.system == RR:
            await self.publish_pairings(games)
        await self.broadcast(self.live_status(now))
        return True

    async def start_next_round_now(self, now: datetime | None = None) -> bool:
        if now is None:
            now = datetime.now(timezone.utc)

        if self.system == ARENA or self.status != T_STARTED:
            return False
        if self.round_interval != MANUAL_ROUND_INTERVAL:
            return False
        if not self.manual_next_round_pending:
            return False
        if len(self.ongoing_games) > 0 or self.current_round >= self.rounds:
            return False

        self.manual_next_round_pending = False
        self.current_round += 1
        log.debug("Do %s. round pairing (manual start)", self.current_round)
        return await self.pair_fixed_round(now)

    async def finalize(self, status: int) -> None:
        self.status = status
        if status == T_FINISHED:
            self.normalize_finished_swiss_round_state()

        if len(self.players) > 0:
            self.print_leaderboard()
            log.info("--- TOURNAMENT RESULT ---")
            for i in range(min(3, len(self.leaderboard))):
                player = self.leaderboard.peekitem(i)[0]
                log.info("--- #%s --- %s", (i + 1), player.username)
            log.info("--- CACHE INFO ---")
            log.info("%r", player_json.cache_info())

        # remove latest games from players tournament if it was not finished in time
        for player_data in self.players.values():
            if len(player_data.games) == 0:
                continue
            latest = player_data.games[-1]
            if latest and isinstance(latest, Game) and latest.status in (CREATED, STARTED):
                player_data.games.pop()

        await self.broadcast(self.summary)
        await self.save()

        await self.broadcast_spotlight()
        self.app_state.schedule_tournament_cache_removal(self)

    async def broadcast_spotlight(self) -> None:
        spotlights = tournament_spotlights(self.app_state)
        response: TournamentSpotlightsResponse = {"type": "spotlights", "items": spotlights}
        await self.app_state.lobby.lobby_broadcast(response)

    async def abort(self) -> None:
        self.finish_reason = None
        await self.finalize(T_ABORTED)

    async def broadcast_system_tourney_chat(self, message: str) -> None:
        response = chat_response("lobbychat", "_server", message)
        await self.tourney_chat_save(response)
        await self.broadcast(response)

    def swiss_finish_chat_message(self, reason: str | None) -> str | None:
        if reason == SWISS_FINISH_REASON_NOT_ENOUGH_PLAYERS:
            return "Not enough players left."
        if reason == SWISS_FINISH_REASON_NO_LEGAL_PAIRING:
            return "All possible pairings were played."
        return None

    async def finish(self, reason: str | None = None) -> None:
        if reason is not None:
            self.finish_reason = reason
        if self.system == SWISS:
            reason_message = self.swiss_finish_chat_message(self.finish_reason)
            if reason_message is not None:
                await self.broadcast_system_tourney_chat(reason_message)
        await self.finalize(T_FINISHED)
        if self.system == SWISS:
            await self.broadcast_system_tourney_chat("Tournament completed!")

    async def join(self, user: User, password: str | None = None) -> str | None:
        if user.anon:
            return None
        log.debug("JOIN: %s in tournament %s", user.username, self.id)

        if self.password and self.password != password:
            return "401"

        player_data = self.player_data_by_name(user.username)
        if self.system == RR:
            if self.status == T_STARTED and player_data is None:
                return "Late join is closed for this round-robin tournament."
            if player_data is None and user.username in self.rr_denied_players:
                return "Your join request was denied by the organizer."
            if (
                player_data is None
                and self.status == T_CREATED
                and self.rr_joining_closed
                and user.username != self.created_by
            ):
                return "Joining is currently closed for this round-robin tournament."
            if player_data is None and self.nb_players >= self.rr_join_limit():
                return "This round-robin tournament is full."
            if (
                player_data is None
                and self.status == T_CREATED
                and self.rr_requires_approval
                and user.username != self.created_by
            ):
                join_error = self.entry_condition_error(user)
                if join_error is not None:
                    return join_error
                if user.username in self.rr_pending_players:
                    return "JOIN_REQUEST_PENDING"
                self.rr_pending_players.add(user.username)
                await self.save()
                await self.send_rr_management_update()
                return "JOIN_REQUESTED"
        if player_data is None:
            join_error = self.entry_condition_error(user)
            if join_error is not None:
                return join_error

        await self._join_approved_user(user, player_data=player_data)
        return None

    async def _join_approved_user(
        self, user: User, *, player_data: PlayerData | None = None
    ) -> None:

        rating, provisional = user.get_rating(self.variant, self.chess960).rating_prov

        player = self.get_player_by_name(user.username) or user
        if player is not user and self.id in user.tournament_sockets:
            player.tournament_sockets[self.id] = user.tournament_sockets[self.id]
        if player_data is None:
            # new player joined
            player_data = PlayerData(user.title, user.username, rating, provisional)
            self.register_player(player, player_data)
        else:
            # withdrawn player joined again, or already joined player re-joins
            self.register_player(player, player_data)
            player_data.rating = rating
            player_data.provisional = provisional

        in_leaderboard = self.leaderboard_player_by_username(user.username) is not None
        if not in_leaderboard:
            # new player joined or withdrawn player joined again
            self.nb_players += 1

        if self.status == T_CREATED:
            self.set_leaderboard_score_by_username(user.username, rating, player=player)
        elif not in_leaderboard:
            self.set_leaderboard_score_by_username(
                user.username, self.compose_leaderboard_score(0, player_data), player=player
            )

        player_data.free = True
        player_data.paused = False
        player_data.withdrawn = False

        response = self.players_json(user=player)
        await self.broadcast(response)

        if self.status == T_CREATED:
            await self.broadcast_spotlight()

        await self.db_update_player(player, "JOIN")

    def rr_management_enabled(self) -> bool:
        return self.system == RR and self.rr_requires_approval

    def rr_settings_payload(self) -> TournamentRRSettingsResponse:
        return {
            "type": "rr_settings",
            "createdBy": self.created_by,
            "approvalRequired": self.rr_requires_approval,
            "joiningClosed": self.rr_joining_closed,
        }

    def rr_manage_player_json(self, username: str) -> TournamentManagePlayerJson:
        user = self.app_state.users[username]
        return {
            "title": user.title,
            "name": username,
            "rating": user.get_rating_value(self.variant, self.chess960),
        }

    def rr_management_payload(self, *, requested_by: str = "") -> TournamentRRManagementResponse:
        return {
            "type": "rr_management",
            "requestedBy": requested_by,
            "createdBy": self.created_by,
            "approvalRequired": self.rr_requires_approval,
            "joiningClosed": self.rr_joining_closed,
            "pendingPlayers": [
                self.rr_manage_player_json(username) for username in sorted(self.rr_pending_players)
            ],
            "deniedPlayers": [
                self.rr_manage_player_json(username) for username in sorted(self.rr_denied_players)
            ],
        }

    async def send_rr_settings_update(self) -> None:
        if self.system != RR:
            return
        sockets_by_username = self.app_state.tourneysockets.get(self.id, {})
        sockets = [socket for user_sockets in sockets_by_username.values() for socket in user_sockets]
        if len(sockets) == 0:
            return
        await ws_send_json_many(sockets, self.rr_settings_payload())

    async def send_rr_user_status_update(self, username: str) -> None:
        if self.system != RR:
            return
        sockets = list(self.tournament_sockets(username))
        if len(sockets) == 0:
            return
        user = await self.app_state.users.get(username)
        if user.username != username:
            return
        await ws_send_json_many(
            sockets,
            {
                "type": "ustatus",
                "username": username,
                "ustatus": self.user_status(user),
            },
        )

    async def send_rr_management_update(self) -> None:
        if not self.rr_management_enabled():
            return
        sockets = list(self.tournament_sockets(self.created_by))
        if len(sockets) == 0:
            return
        await ws_send_json_many(
            sockets,
            self.rr_management_payload(requested_by=self.created_by),
        )

    async def rr_approve_player(self, username: str) -> str | None:
        if not self.rr_management_enabled():
            return "Round-robin approval is not enabled."
        if self.status != T_CREATED:
            return "Player approval closes once the round-robin starts."
        if username == self.created_by:
            return "The organizer cannot be moderated here."

        player_data = self.player_data_by_name(username)
        if (
            username not in self.rr_pending_players
            and username not in self.rr_denied_players
            and player_data is None
        ):
            return "Unknown round-robin player."

        self.rr_pending_players.discard(username)
        self.rr_denied_players.discard(username)
        user = await self.app_state.users.get(username)
        if user.username != username:
            return "Unknown round-robin player."
        await self._join_approved_user(user, player_data=player_data)
        await self.save()
        await self.send_rr_user_status_update(username)
        await self.send_rr_management_update()
        return None

    async def rr_deny_player(self, username: str) -> str | None:
        if not self.rr_management_enabled():
            return "Round-robin approval is not enabled."
        if self.status != T_CREATED:
            return "Player approval closes once the round-robin starts."
        if username == self.created_by:
            return "The organizer cannot be moderated here."
        if username not in self.rr_pending_players:
            return "This player does not have a pending join request."

        self.rr_pending_players.discard(username)
        self.rr_denied_players.add(username)
        await self.save()
        await self.send_rr_user_status_update(username)
        await self.send_rr_management_update()
        return None

    async def rr_kick_player(self, username: str) -> str | None:
        if self.system != RR:
            return "Only round-robin tournaments support player kicking here."
        if self.status != T_CREATED:
            return "Players can only be kicked before the round-robin starts."
        if username == self.created_by:
            return "The organizer cannot be kicked."

        if username in self.rr_pending_players:
            self.rr_pending_players.discard(username)
            self.rr_denied_players.add(username)
            await self.save()
            await self.send_rr_user_status_update(username)
            await self.send_rr_management_update()
            return None

        player = self.get_player_by_name(username)
        if player is None:
            return "Unknown round-robin player."
        await self.withdraw(player)
        self.rr_denied_players.add(username)
        await self.save()
        await self.send_rr_user_status_update(username)
        await self.send_rr_management_update()
        return None

    async def rr_set_joining_closed(self, closed: bool) -> str | None:
        if self.system != RR:
            return "Only round-robin tournaments support join control here."
        if self.status != T_CREATED:
            return "Joining can only be opened or closed before the round-robin starts."
        if self.rr_joining_closed == closed:
            return None
        self.rr_joining_closed = closed
        await self.save()
        await self.send_rr_settings_update()
        await self.send_rr_management_update()
        return None

    def entry_condition_error(self, user: User) -> str | None:
        if self.entry_titled_only and user.title == "":
            return "This tournament is limited to titled players."

        perf_key = self.variant + ("960" if self.chess960 else "")
        perf = user.perfs.get(perf_key, {})
        try:
            rated_games = int(perf.get("nb", 0))
        except (TypeError, ValueError):
            rated_games = 0

        if self.entry_min_rated_games > 0 and rated_games < self.entry_min_rated_games:
            return "This tournament requires at least %s rated %s games." % (
                self.entry_min_rated_games,
                self.server_variant.display_name.title(),
            )

        if self.entry_min_account_age_days > 0:
            account_age = datetime.now(timezone.utc) - user.created_at
            if account_age < timedelta(days=self.entry_min_account_age_days):
                return "This tournament requires accounts to be at least %s days old." % (
                    self.entry_min_account_age_days,
                )

        rating = user.get_rating_value(self.variant, self.chess960)
        if self.entry_min_rating > 0 and rating < self.entry_min_rating:
            return "Your rating is below the minimum allowed for this tournament."
        if self.entry_max_rating > 0 and rating > self.entry_max_rating:
            return "Your rating is above the maximum allowed for this tournament."

        return None

    async def withdraw(self, user: User) -> None:
        if self.status != T_CREATED:
            await self.pause(user)
            return

        log.debug("WITHDRAW: %s in tournament %s", user.username, self.id)
        player_data = self.player_data_by_name(user.username)
        if player_data is None:
            log.warning(
                "WITHDRAW ignored: %s is missing from tournament %s players", user.username, self.id
            )
            return
        player_data.withdrawn = True

        if self.pop_leaderboard_player_by_username(user.username) is not None:
            self.nb_players -= 1

        response_player = self.get_player_by_name(user.username) or user
        response = self.players_json(user=response_player)
        await self.broadcast(response)

        await self.broadcast_spotlight()

        await self.db_update_player(user, "WITHDRAW")

    async def pause(self, user: User) -> None:
        log.debug("PAUSE: %s in tournament %s", user.username, self.id)
        player_data = self.player_data_by_name(user.username)
        if player_data is None:
            log.warning(
                "PAUSE ignored: %s is missing from tournament %s players", user.username, self.id
            )
            return
        player_data.paused = True

        # pause is different from withdraw and join because pause can be initiated from finished games page as well
        response_player = self.get_player_by_name(user.username) or user
        response = self.players_json(user=response_player)
        await self.broadcast(response)

        await self.db_update_player(user, "PAUSE")

    def spactator_join(self, spectator: User) -> None:
        self.spectators.add(spectator)

    def spactator_leave(self, spectator: User) -> None:
        self.spectators.discard(spectator)

    async def create_new_pairings(
        self,
        waiting_players: list[User],
        *,
        publish_pairings: bool = True,
    ) -> tuple[list[tuple[User, User]], list[Game]]:
        self.bye_players = []
        pairing = await self.create_pairing_async(waiting_players)
        round_bye_players = list(self.bye_players)

        if self.first_pairing:
            self.first_pairing = False
            # Before tournament starts leaderboard is ordered by ratings
            # After first pairing it will be sorted by score points and tournament tie-break
            # so we have to make a clear (all 0) leaderboard here
            new_leaderboard = [(user, 0) for user in self.leaderboard]
            self.leaderboard = ValueSortedDict(neg, new_leaderboard)
            self.leaderboard_keys_view = SortedKeysView(self.leaderboard)

        await self.persist_byes()

        games = await self.create_games(pairing)

        # save pairings to db
        await self.db_insert_pairing(games)
        await self.persist_unpaired_round_entries(self.current_round, pairing, round_bye_players)
        if publish_pairings:
            await self.publish_pairings(games)

        return (pairing, games)

    async def persist_byes(self) -> None:
        if not self.bye_players:
            return

        bye_players = self.bye_players
        self.bye_players = []
        for player in bye_players:
            await self.db_insert_bye_pairing(player)
            await self.db_update_player(player, "BYE")

    async def persist_unpaired_round_entries(
        self,
        round_no: int,
        pairing: list[tuple[User, User]],
        bye_players: list[User],
    ) -> None:
        # Default (Arena/RR): no synthetic unpaired-round entries.
        return

    async def create_games(self, pairing: list[tuple[User, User]]) -> list[Game]:
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
            # Round index is persisted with pairing docs to keep Swiss round history unambiguous.
            game.round = self.current_round  # type: ignore[attr-defined]

            if game.has_crosstable:
                doc = await self.app_state.db.crosstable.find_one({"_id": game.ct_id})
                if doc is not None:
                    game.crosstable = doc

            games.append(game)
            self.app_state.games[game_id] = game
            await insert_game_to_db(game, self.app_state)

            self.ongoing_games.add(game)
            self.update_players(game)
            self.update_game_ranks(game)

        return games

    async def publish_pairings(self, games: list[Game]) -> None:
        is_new_top_game = False

        for game in games:
            if self.update_game_ranks(game):
                is_new_top_game = True

            response = {
                "type": "new_game",
                "gameId": game.id,
                "wplayer": game.wplayer.username,
                "bplayer": game.bplayer.username,
            }

            ws_ok = False
            if game.wplayer.title != "TEST":
                wp_data = self.player_data_by_name(game.wplayer.username)
                ws_ok = (
                    await ws_send_json_many(
                        self.player_round_sockets(game.wplayer, wp_data),
                        response,
                    )
                    > 0
                )
            if self.system == ARENA and (not ws_ok) and game.wplayer.title != "TEST":
                await self.pause(game.wplayer)
                log.debug(
                    "White player %s left the tournament (ws send failed)",
                    game.wplayer.username,
                )
            elif (not ws_ok) and game.wplayer.title != "TEST":
                log.debug(
                    "Fixed-round redirect not delivered for white player %s in tournament %s",
                    game.wplayer.username,
                    self.id,
                )

            ws_ok = False
            if game.bplayer.title != "TEST":
                bp_data = self.player_data_by_name(game.bplayer.username)
                ws_ok = (
                    await ws_send_json_many(
                        self.player_round_sockets(game.bplayer, bp_data),
                        response,
                    )
                    > 0
                )
            if self.system == ARENA and (not ws_ok) and game.bplayer.title != "TEST":
                await self.pause(game.bplayer)
                log.debug(
                    "Black player %s left the tournament (ws send failed)",
                    game.bplayer.username,
                )
            elif (not ws_ok) and game.bplayer.title != "TEST":
                log.debug(
                    "Fixed-round redirect not delivered for black player %s in tournament %s",
                    game.bplayer.username,
                    self.id,
                )

        if is_new_top_game:
            await self.broadcast(self.top_game_json)

        await self.broadcast(self.duels_json)

    def update_players(self, game: Game | GameData) -> None:
        player_data = self.game_player_data(game)
        if player_data is None:
            return
        wplayer, bplayer = player_data
        wname, bname = self.game_player_usernames(game)

        wplayer.games.append(game)
        bplayer.games.append(game)

        if game.result == "*":
            wplayer.free = False
            bplayer.free = False

        wplayer.prev_opp = bname
        bplayer.prev_opp = wname

        wplayer.color_balance += 1
        bplayer.color_balance -= 1

        wplayer.nb_not_paired = 0
        bplayer.nb_not_paired = 0

    def update_game_ranks(self, game: Game) -> bool:
        if game.status != BYEGAME:
            brank = self.get_rank_by_username(game.bplayer.username)
            wrank = self.get_rank_by_username(game.wplayer.username)
            if brank is None or wrank is None:
                return False
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
        player_data = self.game_player_data(game)
        if player_data is None:
            return (
                (0, SCORE),
                (0, SCORE),
                int(game.brating.rstrip("?")),
                int(game.wrating.rstrip("?")),
            )
        wplayer, bplayer = player_data

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
        player_data = self.game_player_data(game)
        if player_data is None:
            return (
                (0, SCORE),
                (0, SCORE),
                int(game.brating.rstrip("?")),
                int(game.wrating.rstrip("?")),
            )
        wplayer, bplayer = player_data

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

        player_data = self.game_player_data(game)
        if player_data is None:
            return
        wplayer, bplayer = player_data

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

        nb = len(wplayer.points)
        wplayer.performance = int(round((wplayer.performance * (nb - 1) + wperf) / nb, 0))

        nb = len(bplayer.points)
        bplayer.performance = int(round((bplayer.performance * (nb - 1) + bperf) / nb, 0))

        wpoint_value = wpoint[0] if isinstance(wpoint[0], int) else 0
        bpoint_value = bpoint[0] if isinstance(bpoint[0], int) else 0

        wpscore = self.leaderboard_score_by_username(game.wplayer.username) // SCORE_SHIFT
        self.set_leaderboard_score_by_username(
            game.wplayer.username,
            self.compose_leaderboard_score(wpscore + wpoint_value, wplayer),
            player=game.wplayer,
        )

        bpscore = self.leaderboard_score_by_username(game.bplayer.username) // SCORE_SHIFT
        self.set_leaderboard_score_by_username(
            game.bplayer.username,
            self.compose_leaderboard_score(bpscore + bpoint_value, bplayer),
            player=game.bplayer,
        )

        if self.system != ARENA:
            self.recalculate_berger_tiebreak()

        self.nb_games_finished += 1

        if game.result == "1-0":
            self.w_win += 1
        elif game.result == "0-1":
            self.b_win += 1
        elif game.result == "1/2-1/2":
            self.draw += 1

        self.ongoing_games.discard(game)
        now = datetime.now(timezone.utc)
        if (
            self.system != ARENA
            and self.status == T_STARTED
            and len(self.ongoing_games) == 0
            and 0 < self.current_round < self.rounds
            and self.next_round_starts_at is None
        ):
            self.next_round_starts_at = now + timedelta(
                seconds=self.effective_round_interval_seconds()
            )

        # save player points to db
        await self.db_update_player(game.wplayer, "GAME_END")
        await self.db_update_player(game.bplayer, "GAME_END")
        await self.db_update_pairing(game)

        await self.broadcast(self.duels_json)

        self.app_state.create_background_task(self.delayed_free(game), name="t-delayed-free")

        await self.broadcast(
            {
                "type": "game_update",
                "wname": game.wplayer.username,
                "bname": game.bplayer.username,
            }
        )
        await self.broadcast(self.live_status(now))

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

        player_data = self.game_player_data(game)
        if player_data is None:
            return
        wplayer, bplayer = player_data

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
        sockets = []
        for spectator in self.spectators:
            try:
                sockets.extend(list(self.tournament_sockets(spectator.username, spectator)))
            except KeyError:
                log.error("tournament broadcast() spectator socket was removed")
            except Exception:
                log.error("Exception in tournament broadcast()")
        await ws_send_json_many(sockets, response)

    async def db_insert_pairing(self, games: list[Game]) -> None:
        if self.app_state.db is None:
            return
        pairing_documents: list[TournamentPairingDoc] = []
        pairing_table = self.app_state.db.tournament_pairing

        for game in games:
            if game.status == BYEGAME:
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
                "s": game.status,
                "p": game.board.ply,
                "rn": getattr(game, "round", self.current_round),
            }
            pairing_documents.append(pairing_doc)
        if len(pairing_documents) > 0:
            await pairing_table.insert_many(pairing_documents)

    async def db_insert_bye_pairing(
        self,
        player: User,
        *,
        round_no: int | None = None,
        bye_token: str = "U",
    ) -> None:
        if self.app_state.db is None:
            return
        player_data = self.player_data_by_name(player.username)
        if player_data is None:
            return

        pairing_table = self.app_state.db.tournament_pairing
        pairing_id = await new_id(pairing_table)
        rating = "%s%s" % (player_data.rating, player_data.provisional)

        bye_doc: TournamentPairingDoc = {
            "_id": pairing_id,
            "tid": self.id,
            "u": (player.username, player.username),
            "r": R2C["*"],
            "d": datetime.now(timezone.utc),
            "wr": rating,
            "br": rating,
            "wb": False,
            "bb": False,
            "s": BYEGAME,
            "rn": self.current_round if round_no is None else round_no,
            "bt": bye_token,
        }
        await pairing_table.insert_one(bye_doc)

    async def db_update_pairing(self, game: Game | GameData) -> None:
        if self.app_state.db is None:
            return
        pairing_table = self.app_state.db.tournament_pairing
        wname, bname = self.game_player_usernames(game)

        try:
            ply = getattr(game, "ply", None)
            if ply is None:
                board = getattr(game, "board", None)
                ply = getattr(board, "ply", None)
            new_data: TournamentPairingUpdate = {
                "tid": self.id,
                "u": (wname, bname),
                "r": R2C[game.result],
                "d": game.date,
                "wr": game.wrating,
                "br": game.brating,
                "wb": game.wberserk,
                "bb": game.bberserk,
                "s": game.status,
                "p": ply,
                "rn": getattr(game, "round", self.current_round),
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
            update_doc: dict[str, object] = {"$set": {"cr": self.current_round}}
            if self.pairing_in_progress_round == self.current_round:
                update_doc["$unset"] = {"pairingInProgressRound": ""}

            await self.app_state.db.tournament.update_one(
                {"_id": self.id},
                update_doc,
            )
            if self.pairing_in_progress_round == self.current_round:
                self.pairing_in_progress_round = None
        except Exception:
            log.exception("Failed to save current round for %s", self.id)

    async def set_pairing_in_progress_round(self, round_no: int | None) -> None:
        self.pairing_in_progress_round = round_no
        if self.app_state.db is None:
            return

        try:
            if round_no is None:
                await self.app_state.db.tournament.update_one(
                    {"_id": self.id},
                    {"$unset": {"pairingInProgressRound": ""}},
                )
            else:
                await self.app_state.db.tournament.update_one(
                    {"_id": self.id},
                    {"$set": {"pairingInProgressRound": round_no}},
                )
        except Exception:
            log.exception(
                "Failed to update pairing in-progress round %s for %s",
                round_no,
                self.id,
            )

    async def db_update_player(
        self, user: User | str, action: "Literal['JOIN', 'WITHDRAW', 'PAUSE', 'GAME_END', 'BYE']"
    ) -> None:
        if self.app_state.db is None:
            return

        username = user if isinstance(user, str) else user.username
        player_data = self.player_data_by_name(username)
        if player_data is None:
            log.warning(
                "db_update_player(%s) skipped for %s in %s: user not found in tournament players",
                action,
                username,
                self.id,
            )
            return

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
                    "g": 0,
                    "p": [],
                    "jr": player_data.joined_round,
                    "wd": False,
                }
            else:
                player_update = {
                    "a": False,
                    "wd": False,
                    "r": player_data.rating,
                    "pr": player_data.provisional,
                    "jr": player_data.joined_round,
                }

        elif action == "WITHDRAW":
            player_update = {"wd": True}

        elif action == "PAUSE":
            player_update = {"a": True}

        elif action in ("GAME_END", "BYE"):
            full_score = self.leaderboard_score_by_username(player_data.username)
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
                "g": player_data.berger,
                "p": player_data.points,
                "jr": player_data.joined_round,
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
            "rounds": self.rounds,
            "cr": self.current_round,
        }
        if self.finish_reason is not None:
            new_data["finishReason"] = self.finish_reason

        update_doc: dict[str, object] = {"$set": new_data}
        if self.finish_reason is None:
            update_doc["$unset"] = {"finishReason": ""}

        doc_after = await self.app_state.db.tournament.find_one_and_update(
            {"_id": self.id},
            update_doc,
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
            player_data = self.player_data_by_name(player.username)
            if player_data is None:
                log.warning(
                    "Skipping missing leaderboard player %s in %s print_leaderboard",
                    player.username,
                    self.id,
                )
                continue
            log.info(
                "%15s (%8s) %4s %30s %2s perf=%s berger=%s"
                % (
                    player.username,
                    player_data.id,
                    player_data.rating,
                    player_data.points,
                    full_score,
                    player_data.performance,
                    berger_to_float(player_data.berger),
                )
            )

    @property
    def create_discord_msg(self) -> str:
        tc = time_control_str(self.base, self.inc, self.byoyomi_period)
        tail960 = "960" if self.chess960 else ""
        duration_text = "duration" if self.system == ARENA else "estimated duration"
        return "%s: **%s%s** %s tournament starts at UTC %s, %s will be **%s** minutes" % (
            self.created_by,
            self.variant,
            tail960,
            tc,
            self.starts_at.strftime("%Y.%m.%d %H:%M"),
            duration_text,
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

    def automatic_round_interval_seconds(self) -> int:
        # Approximate per-side time budget to derive a short between-round pause.
        side_budget_seconds = (self.base * 60.0) + (self.inc * 40)
        if self.byoyomi_period > 0 and self.inc > 0:
            side_budget_seconds += self.byoyomi_period * self.inc

        automatic = int(side_budget_seconds / 24)
        return max(
            MIN_AUTO_ROUND_INTERVAL_SECONDS,
            min(MAX_AUTO_ROUND_INTERVAL_SECONDS, automatic),
        )

    def effective_round_interval_seconds(self) -> int:
        if self.system == ARENA:
            return 0
        if self.round_interval == MANUAL_ROUND_INTERVAL:
            return 0
        if self.round_interval == AUTO_ROUND_INTERVAL:
            return self.automatic_round_interval_seconds()
        return max(0, self.round_interval)

    def rr_join_limit(self) -> int:
        if self.rr_max_players > 0:
            return self.rr_max_players
        if self.rounds > 0:
            return min(RR_MAX_SUPPORTED_PLAYERS, max(3, self.rounds + 1))
        return RR_DEFAULT_MAX_PLAYERS

    def rr_pairing_players(self) -> list[User]:
        players: list[User] = []
        for player in self.players.keys():
            player_data = self.player_data_by_name(player.username)
            if player_data is None or player_data.withdrawn:
                continue
            players.append(player)
        return players

    def rr_rounds_for_start(self) -> int:
        player_count = len(self.rr_pairing_players())
        if player_count > RR_MAX_SUPPORTED_PLAYERS:
            raise ValueError(
                "Round-robin supports at most %s players with the current Berger tables."
                % RR_MAX_SUPPORTED_PLAYERS
            )
        if player_count <= 0:
            return 0
        return player_count if player_count % 2 == 1 else player_count - 1


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
        "rrMaxPlayers": tournament.rr_join_limit() if tournament.system == RR else 0,
        "rrRequiresApproval": tournament.rr_requires_approval if tournament.system == RR else False,
        "rrJoiningClosed": tournament.rr_joining_closed if tournament.system == RR else False,
        "rrPendingPlayers": sorted(tournament.rr_pending_players),
        "rrDeniedPlayers": sorted(tournament.rr_denied_players),
        "ri": tournament.round_interval,
        "entryMinRating": tournament.entry_min_rating,
        "entryMaxRating": tournament.entry_max_rating,
        "entryMinRatedGames": tournament.entry_min_rated_games,
        "entryMinAccountAgeDays": tournament.entry_min_account_age_days,
        "entryTitledOnly": tournament.entry_titled_only,
        "forbiddenPairings": tournament.forbidden_pairings,
        "manualPairings": tournament.manual_pairings,
        "nbPlayers": 0,
        "cr": tournament.current_round,
        "createdBy": tournament.created_by,
        "createdAt": tournament.created_at,
        "beforeStart": tournament.before_start,
        "startsAt": tournament.starts_at,
        "status": tournament.status,
    }
    if tournament.finish_reason is not None:
        new_data["finishReason"] = tournament.finish_reason
    if tournament.pairing_in_progress_round is not None:
        new_data["pairingInProgressRound"] = tournament.pairing_in_progress_round

    try:
        await app_state.db.tournament.find_one_and_update(
            {"_id": tournament.id}, {"$set": new_data}, upsert=True
        )
    except Exception:
        log.error(
            "upsert_tournament_to_db() Failed to save tournament %s data to mongodb!", tournament.id
        )
