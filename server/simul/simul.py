from __future__ import annotations
import random
import asyncio
from datetime import datetime, timezone
from typing import Set, Dict, TYPE_CHECKING

from const import T_CREATED, T_STARTED, T_FINISHED, T_ABORTED, CASUAL, STARTED
from game import Game
from newid import new_id
from utils import insert_game_to_db
from websocket_utils import ws_send_json_many

if TYPE_CHECKING:
    from user import User


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
            self.status = T_STARTED
            self.starts_at = datetime.now(timezone.utc)
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
