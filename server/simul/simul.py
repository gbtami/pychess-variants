from __future__ import annotations
import random
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Set, Dict, TYPE_CHECKING

from const import T_CREATED, T_STARTED, T_FINISHED, T_ABORTED, CASUAL, STARTED
from game import Game
from newid import new_id
from utils import insert_game_to_db
from websocket_utils import ws_send_json_many

if TYPE_CHECKING:
    from user import User
    from ws_types import ChatLine


class Simul:
    """
    Standalone Simul class
    """

    def __init__(
        self,
        app_state,
        simul_id,
        name,
        created_by,
        variant="chess",
        chess960=False,
        rated=False,
        base=1,
        inc=0,
        host_color="random",
        description="",
        host_extra_time=0,
        host_extra_time_per_player=0,
        estimated_start_at=None,
        entry_min_rating=0,
        entry_max_rating=0,
        entry_min_rated_games=0,
        entry_min_account_age_days=0,
        entry_titled_only=False,
    ):
        self.app_state = app_state
        self.id = simul_id
        self.name = name
        self.created_by = created_by
        self.variant = variant
        self.chess960 = chess960
        self.rated = rated
        self.base = base
        self.inc = inc
        self.host_color = host_color
        self.description = description
        self.host_extra_time = host_extra_time
        self.host_extra_time_per_player = host_extra_time_per_player
        self.estimated_start_at = estimated_start_at
        self.entry_min_rating = entry_min_rating
        self.entry_max_rating = entry_max_rating
        self.entry_min_rated_games = entry_min_rated_games
        self.entry_min_account_age_days = entry_min_account_age_days
        self.entry_titled_only = entry_titled_only

        self.players: Dict[str, "User"] = {}
        self.pending_players: Dict[str, "User"] = {}
        self.games: Dict[str, "Game"] = {}
        self.ongoing_games: Set["Game"] = set()
        self.clock_task: asyncio.Task[None] | None = None
        self.status = T_CREATED
        self.created_at = datetime.now(timezone.utc)
        self.starts_at: datetime | None = None
        self.ends_at: datetime | None = None
        self.spectators: Set["User"] = set()
        self.tourneychat = []

    @classmethod
    async def create(cls, app_state, simul_id, name, created_by, **kwargs):
        simul = cls(app_state, simul_id, name, created_by, **kwargs)
        host = await app_state.users.get(created_by)
        if host:
            simul.players[created_by] = host
        return simul

    def player_json(self, user: "User") -> dict[str, object]:
        return {
            "name": user.username,
            "title": user.title,
            "rating": user.get_rating_value(self.variant, self.chess960),
        }

    def host_clock_initial_ms(self) -> int:
        total_seconds = (self.base * 60) + self.host_extra_time
        return max(total_seconds, 20) * 1000

    def host_extra_time_valid(self) -> bool:
        total_seconds = (self.base * 60) + self.host_extra_time
        if total_seconds == 0:
            return self.inc >= 10
        return total_seconds > 0

    def players_json(self) -> list[dict[str, object]]:
        return [self.player_json(player) for player in self.players.values()]

    def pending_players_json(self) -> list[dict[str, object]]:
        return [self.player_json(player) for player in self.pending_players.values()]

    def game_json(self, game: "Game") -> dict[str, object]:
        return {
            "gameId": game.id,
            "wplayer": game.wplayer.username,
            "bplayer": game.bplayer.username,
            "variant": game.variant,
            "fen": game.fen,
            "lastMove": game.lastmove,
            "rated": bool(game.rated),
            "base": game.base,
            "inc": game.inc,
            "byo": game.byoyomi_period,
            "status": game.status,
            "result": game.result,
        }

    def all_games_json(self) -> list[dict[str, object]]:
        return [self.game_json(game) for game in self.games.values()]

    def join(self, user: "User") -> bool:
        if self.status != T_CREATED:
            return False
        if (
            user.username != self.created_by
            and user.username not in self.players
            and user.username not in self.pending_players
        ):
            self.pending_players[user.username] = user
            return True
        return False

    def entry_condition_error(self, user: "User") -> str | None:
        if user.bot:
            return "BOT accounts cannot join simuls."

        perf_key = self.variant + ("960" if self.chess960 else "")
        perf = user.perfs.get(perf_key, {})
        try:
            rated_games = int(perf.get("nb", 0))
        except TypeError, ValueError:
            rated_games = 0

        if self.entry_min_rated_games > 0 and rated_games < self.entry_min_rated_games:
            return "This simul requires at least %s rated %s games." % (
                self.entry_min_rated_games,
                perf_key.upper() if self.chess960 else self.variant.title(),
            )

        if self.entry_min_account_age_days > 0:
            account_age = datetime.now(timezone.utc) - user.created_at
            if account_age < timedelta(days=self.entry_min_account_age_days):
                return "This simul requires accounts to be at least %s days old." % (
                    self.entry_min_account_age_days,
                )

        rating = user.get_rating_value(self.variant, self.chess960)
        if self.entry_min_rating > 0 and rating < self.entry_min_rating:
            return "Your rating is below the minimum allowed for this simul."
        if self.entry_max_rating > 0 and rating > self.entry_max_rating:
            return "Your rating is above the maximum allowed for this simul."

        return None

    def approve(self, username: str | None) -> bool:
        if self.status != T_CREATED:
            return False
        if username in self.pending_players:
            user = self.pending_players[username]
            del self.pending_players[username]
            self.players[username] = user
            return True
        return False

    def deny(self, username: str | None) -> bool:
        if self.status != T_CREATED:
            return False
        if username is None or username == self.created_by:
            return False
        if username in self.pending_players:
            del self.pending_players[username]
            return True
        if username in self.players:
            del self.players[username]
            return True
        return False

    def leave(self, user: "User"):
        if user.username in self.players:
            del self.players[user.username]
        if user.username in self.pending_players:
            del self.pending_players[user.username]

    def remove_disconnected_player(self, user: "User") -> str | None:
        if self.status != T_CREATED or user.username == self.created_by:
            return None
        if self.id in user.simul_sockets:
            return None
        if user.username in self.pending_players:
            del self.pending_players[user.username]
            return "pending"
        if user.username in self.players:
            del self.players[user.username]
            return "approved"
        return None

    def add_spectator(self, user: "User"):
        self.spectators.add(user)

    def remove_spectator(self, user: "User"):
        self.spectators.discard(user)

    async def broadcast(self, response):
        sockets = []
        for spectator in self.spectators:
            if self.id in spectator.simul_sockets:
                sockets.extend(list(spectator.simul_sockets[self.id]))
        await ws_send_json_many(sockets, response)

    async def simul_chat_save(self, response: "ChatLine") -> None:
        self.tourneychat.append(response)
        if self.app_state.db is None:
            return

        response_db: ChatLine = {
            "type": response["type"],
            "user": response["user"],
            "message": response["message"],
        }
        if "room" in response:
            response_db["room"] = response["room"]
        if "time" in response:
            response_db["time"] = response["time"]
        response_db["sid"] = self.id
        await self.app_state.db.simul_chat.insert_one(response_db)

    async def create_games(self) -> list["Game"]:
        created_games: list[Game] = []
        host = self.players.get(self.created_by)
        if host is None:
            return created_games

        opponents = [p for p in self.players.values() if p.username != self.created_by]
        random.shuffle(opponents)

        game_table = self.app_state.db.game if self.app_state.db else None

        for opponent in opponents:
            game_id = await new_id(game_table)

            if self.host_color == "white":
                wp, bp = host, opponent
            elif self.host_color == "black":
                wp, bp = opponent, host
            else:  # random
                if random.choice([True, False]):
                    wp, bp = host, opponent
                else:
                    wp, bp = opponent, host

            host_initial_ms = self.host_clock_initial_ms()
            opponent_initial_ms = (self.base * 60 * 1000) if self.base > 0 else self.inc * 1000
            if wp.username == self.created_by:
                initial_clocks = (host_initial_ms, opponent_initial_ms)
            else:
                initial_clocks = (opponent_initial_ms, host_initial_ms)

            game = Game(
                self.app_state,
                game_id,
                self.variant,
                "",  # initial_fen
                wp,
                bp,
                base=self.base,
                inc=self.inc,
                rated=CASUAL,
                chess960=self.chess960,
                simulId=self.id,
                initial_clocks=initial_clocks,
            )
            self.games[game.id] = game
            self.ongoing_games.add(game)
            self.app_state.games[game_id] = game
            await insert_game_to_db(game, self.app_state)
            created_games.append(game)

            response = {"type": "new_game", **self.game_json(game)}
            await self.broadcast(response)
        return created_games

    async def start(self) -> bool:
        if self.status == T_CREATED:
            if len(self.players) < 2:
                return False
            if not self.host_extra_time_valid():
                return False
            self.status = T_STARTED
            self.starts_at = datetime.now(timezone.utc)
            self.host_extra_time += (len(self.players) - 1) * self.host_extra_time_per_player
            from simul.simuls import upsert_simul_to_db

            await upsert_simul_to_db(self)
            await self.create_games()
            await upsert_simul_to_db(self)
            await self.broadcast({"type": "simul_started"})
            self.clock_task = asyncio.create_task(self.clock(), name=f"simul-clock-{self.id}")
            return True
        return False

    async def finish(self):
        if self.status == T_STARTED:
            self.status = T_FINISHED
            self.ends_at = datetime.now(timezone.utc)
            if self.clock_task is not None:
                self.clock_task.cancel()
            from simul.simuls import upsert_simul_to_db

            await upsert_simul_to_db(self)
            await self.broadcast({"type": "simul_finished"})

    async def abort(self):
        if self.status == T_CREATED:
            self.status = T_ABORTED
            self.ends_at = datetime.now(timezone.utc)
            from simul.simuls import upsert_simul_to_db

            await upsert_simul_to_db(self)

    async def game_update(self, game):
        response = {
            "type": "game_update",
            "gameId": game.id,
            "fen": game.fen,
            "lastMove": game.lastmove,
            "status": game.status,
            "result": game.result,
        }
        if game.status > STARTED:
            self.ongoing_games.discard(game)
            if len(self.ongoing_games) == 0:
                await self.finish()
        await self.broadcast(response)

    async def clock(self):
        while self.status == T_STARTED:
            if len(self.ongoing_games) == 0:
                await self.finish()
                break

            finished_games = {g for g in self.ongoing_games if g.status > STARTED}
            self.ongoing_games -= finished_games

            await asyncio.sleep(5)
