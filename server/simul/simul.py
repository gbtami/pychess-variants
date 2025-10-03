from __future__ import annotations
import random
import asyncio
from datetime import datetime, timezone
from typing import Set, Dict, TYPE_CHECKING

from const import T_CREATED, T_STARTED, T_FINISHED, T_ABORTED, RATED, CASUAL
from game import Game
from newid import new_id
from utils import insert_game_to_db
from websocket_utils import ws_send_json

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
        rated=True,
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
        self.ongoing_games: Set["Game"] = set()
        self.status = T_CREATED
        self.created_at = datetime.now(timezone.utc)
        self.starts_at = None
        self.ends_at = None
        self.spectators: Set["User"] = set()
        self.tourneychat = []

    @classmethod
    async def create(cls, app_state, simul_id, name, created_by, **kwargs):
        simul = cls(app_state, simul_id, name, created_by, **kwargs)
        host = await app_state.users.get(created_by)
        if host:
            simul.players[created_by] = host
        return simul

    def join(self, user: "User"):
        if (
            user.username != self.created_by
            and user.username not in self.players
            and user.username not in self.pending_players
        ):
            self.pending_players[user.username] = user

    def approve(self, username: str):
        if username in self.pending_players:
            user = self.pending_players[username]
            del self.pending_players[username]
            self.players[username] = user

    def deny(self, username: str):
        if username in self.pending_players:
            del self.pending_players[username]

    def leave(self, user: "User"):
        if user.username in self.players:
            del self.players[user.username]
        if user.username in self.pending_players:
            del self.pending_players[user.username]

    def add_spectator(self, user: "User"):
        self.spectators.add(user)

    def remove_spectator(self, user: "User"):
        self.spectators.discard(user)

    async def broadcast(self, response):
        for spectator in self.spectators:
            if self.id in spectator.simul_sockets:
                for ws in spectator.simul_sockets[self.id]:
                    await ws_send_json(ws, response)

    async def create_games(self):
        host = self.players.get(self.created_by)
        if host is None:
            return

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
                rated=RATED if self.rated else CASUAL,
                chess960=self.chess960,
            )
            self.ongoing_games.add(game)
            self.app_state.games[game_id] = game
            await insert_game_to_db(game, self.app_state)

            response = {
                "type": "new_game",
                "gameId": game.id,
                "wplayer": wp.username,
                "bplayer": bp.username,
                "variant": game.variant,
                "fen": game.fen,
                "rated": game.rated,
                "base": game.base,
                "inc": game.inc,
                "byo": game.byoyomi_period,
            }
            await self.broadcast(response)

    async def start(self):
        if self.status == T_CREATED:
            self.status = T_STARTED
            self.starts_at = datetime.now(timezone.utc)
            await self.create_games()
            self.clock_task = asyncio.create_task(self.clock(), name=f"simul-clock-{self.id}")

    async def finish(self):
        if self.status == T_STARTED:
            self.status = T_FINISHED
            self.ends_at = datetime.now(timezone.utc)
            if hasattr(self, "clock_task"):
                self.clock_task.cancel()

    async def abort(self):
        if self.status == T_CREATED:
            self.status = T_ABORTED
            self.ends_at = datetime.now(timezone.utc)

    async def game_update(self, game):
        response = {
            "type": "game_update",
            "gameId": game.id,
            "fen": game.fen,
            "lastMove": game.lastmove,
            "status": game.status,
            "result": game.result,
        }
        await self.broadcast(response)

    async def clock(self):
        while self.status == T_STARTED:
            if len(self.ongoing_games) == 0:
                await self.finish()
                break

            finished_games = {g for g in self.ongoing_games if g.status > 0}
            self.ongoing_games -= finished_games

            await asyncio.sleep(5)
