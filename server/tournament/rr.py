from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from const import RR, T_ABORTED, T_ARCHIVED, T_CREATED, T_FINISHED, T_STARTED
from notify import notify
from seek import SeekCreateData, create_seek
from tournament.tournament import ByeGame, RR_MAX_SUPPORTED_PLAYERS, Tournament
from typing_defs import NotificationContent, TournamentArrangementDoc, TournamentArrangementUpdate
from utils import join_seek

if TYPE_CHECKING:
    from game import Game
    from user import User


BERGER_TABLES = (
    (
        ((1, 4), (2, 3)),
        ((4, 3), (1, 2)),
        ((2, 4), (3, 1)),
    ),
    (
        ((1, 6), (2, 5), (3, 4)),
        ((6, 4), (5, 3), (1, 2)),
        ((2, 6), (3, 1), (4, 5)),
        ((6, 5), (1, 4), (2, 3)),
        ((3, 6), (4, 2), (5, 1)),
    ),
    (
        ((1, 8), (2, 7), (3, 6), (4, 5)),
        ((8, 5), (6, 4), (7, 3), (1, 2)),
        ((2, 8), (3, 1), (4, 7), (5, 6)),
        ((8, 6), (7, 5), (1, 4), (2, 3)),
        ((3, 8), (4, 2), (5, 1), (6, 7)),
        ((8, 7), (1, 6), (2, 5), (3, 4)),
        ((4, 8), (5, 3), (6, 2), (7, 1)),
    ),
    (
        ((1, 10), (2, 9), (3, 8), (4, 7), (5, 6)),
        ((10, 6), (7, 5), (8, 4), (9, 3), (1, 2)),
        ((2, 10), (3, 1), (4, 9), (5, 8), (6, 7)),
        ((10, 7), (8, 6), (9, 5), (1, 4), (2, 3)),
        ((3, 10), (4, 2), (5, 1), (6, 9), (7, 8)),
        ((10, 8), (9, 7), (1, 6), (2, 5), (3, 4)),
        ((4, 10), (5, 3), (6, 2), (7, 1), (8, 9)),
        ((10, 9), (1, 8), (2, 7), (3, 6), (4, 5)),
        ((5, 10), (6, 4), (7, 3), (8, 2), (9, 1)),
    ),
    (
        ((1, 12), (2, 11), (3, 10), (4, 9), (5, 8), (6, 7)),
        ((12, 7), (8, 6), (9, 5), (10, 4), (11, 3), (1, 2)),
        ((2, 12), (3, 1), (4, 11), (5, 10), (6, 9), (7, 8)),
        ((12, 8), (9, 7), (10, 6), (11, 5), (1, 4), (2, 3)),
        ((3, 12), (4, 2), (5, 1), (6, 11), (7, 10), (8, 9)),
        ((12, 9), (10, 8), (11, 7), (1, 6), (2, 5), (3, 4)),
        ((4, 12), (5, 3), (6, 2), (7, 1), (8, 11), (9, 10)),
        ((12, 10), (11, 9), (1, 8), (2, 7), (3, 6), (4, 5)),
        ((5, 12), (6, 4), (7, 3), (8, 2), (9, 1), (10, 11)),
        ((12, 11), (1, 10), (2, 9), (3, 8), (4, 7), (5, 6)),
        ((6, 12), (7, 5), (8, 4), (9, 3), (10, 2), (11, 1)),
    ),
    (
        ((1, 14), (2, 13), (3, 12), (4, 11), (5, 10), (6, 9), (7, 8)),
        ((14, 8), (9, 7), (10, 6), (11, 5), (12, 4), (13, 3), (1, 2)),
        ((2, 14), (3, 1), (4, 13), (5, 12), (6, 11), (7, 10), (8, 9)),
        ((14, 9), (10, 8), (11, 7), (12, 6), (13, 5), (1, 4), (2, 3)),
        ((3, 14), (4, 2), (5, 1), (6, 13), (7, 12), (8, 11), (9, 10)),
        ((14, 10), (11, 9), (12, 8), (13, 7), (1, 6), (2, 5), (3, 4)),
        ((4, 14), (5, 3), (6, 2), (7, 1), (8, 13), (9, 12), (10, 11)),
        ((14, 11), (12, 10), (13, 9), (1, 8), (2, 7), (3, 6), (4, 5)),
        ((5, 14), (6, 4), (7, 3), (8, 2), (9, 1), (10, 13), (11, 12)),
        ((14, 12), (13, 11), (1, 10), (2, 9), (3, 8), (4, 7), (5, 6)),
        ((6, 14), (7, 5), (8, 4), (9, 3), (10, 2), (11, 1), (12, 13)),
        ((14, 13), (1, 12), (2, 11), (3, 10), (4, 9), (5, 8), (6, 7)),
        ((7, 14), (8, 6), (9, 5), (10, 4), (11, 3), (12, 2), (13, 1)),
    ),
    (
        ((1, 16), (2, 15), (3, 14), (4, 13), (5, 12), (6, 11), (7, 10), (8, 9)),
        ((16, 9), (10, 8), (11, 7), (12, 6), (13, 5), (14, 4), (15, 3), (1, 2)),
        ((2, 16), (3, 1), (4, 15), (5, 14), (6, 13), (7, 12), (8, 11), (9, 10)),
        ((16, 10), (11, 9), (12, 8), (13, 7), (14, 6), (15, 5), (1, 4), (2, 3)),
        ((3, 16), (4, 2), (5, 1), (6, 15), (7, 14), (8, 13), (9, 12), (10, 11)),
        ((16, 11), (12, 10), (13, 9), (14, 8), (15, 7), (1, 6), (2, 5), (3, 4)),
        ((4, 16), (5, 3), (6, 2), (7, 1), (8, 15), (9, 14), (10, 13), (11, 12)),
        ((16, 12), (13, 11), (14, 10), (15, 9), (1, 8), (2, 7), (3, 6), (4, 5)),
        ((5, 16), (6, 4), (7, 3), (8, 2), (9, 1), (10, 15), (11, 14), (12, 13)),
        ((16, 13), (14, 12), (15, 11), (1, 10), (2, 9), (3, 8), (4, 7), (5, 6)),
        ((6, 16), (7, 5), (8, 4), (9, 3), (10, 2), (11, 1), (12, 15), (13, 14)),
        ((16, 14), (15, 13), (1, 12), (2, 11), (3, 10), (4, 9), (5, 8), (6, 7)),
        ((7, 16), (8, 6), (9, 5), (10, 4), (11, 3), (12, 2), (13, 1), (14, 15)),
        ((16, 15), (1, 14), (2, 13), (3, 12), (4, 11), (5, 10), (6, 9), (7, 8)),
        ((8, 16), (9, 7), (10, 6), (11, 5), (12, 4), (13, 3), (14, 2), (15, 1)),
    ),
)

ARR_STATUS_PENDING = "pending"
ARR_STATUS_CHALLENGED = "challenged"
ARR_STATUS_STARTED = "started"
ARR_STATUS_FINISHED = "finished"


class RRArrangement:
    __slots__ = (
        "id",
        "white",
        "black",
        "round_no",
        "status",
        "game_id",
        "invite_id",
        "challenger",
        "date",
    )

    def __init__(
        self,
        arrangement_id: str,
        white: str,
        black: str,
        round_no: int,
        *,
        status: str = ARR_STATUS_PENDING,
        game_id: str | None = None,
        invite_id: str | None = None,
        challenger: str | None = None,
        date: datetime | None = None,
    ) -> None:
        self.id = arrangement_id
        self.white = white
        self.black = black
        self.round_no = round_no
        self.status = status
        self.game_id = game_id
        self.invite_id = invite_id
        self.challenger = challenger
        self.date = datetime.now(timezone.utc) if date is None else date

    def players(self) -> tuple[str, str]:
        return (self.white, self.black)

    def involves(self, username: str) -> bool:
        return username in (self.white, self.black)

    def opponent(self, username: str) -> str | None:
        if username == self.white:
            return self.black
        if username == self.black:
            return self.white
        return None

    def color_of(self, username: str) -> str | None:
        if username == self.white:
            return "white"
        if username == self.black:
            return "black"
        return None

    def doc(self, tournament_id: str) -> TournamentArrangementDoc:
        return {
            "_id": self.id,
            "tid": tournament_id,
            "u": (self.white, self.black),
            "c": (self.white, self.black),
            "rn": self.round_no,
            "s": self.status,
            "d": self.date,
            "gid": self.game_id or "",
            "iid": self.invite_id or "",
            "ch": self.challenger or "",
        }

    def update_doc(self, tournament_id: str) -> TournamentArrangementUpdate:
        return {
            "tid": tournament_id,
            "u": (self.white, self.black),
            "c": (self.white, self.black),
            "rn": self.round_no,
            "s": self.status,
            "gid": self.game_id,
            "iid": self.invite_id,
            "ch": self.challenger,
            "d": self.date,
        }

    def cell_json(self, row_username: str) -> dict[str, Any]:
        return {
            "id": self.id,
            "round": self.round_no,
            "white": self.white,
            "black": self.black,
            "status": self.status,
            "gameId": self.game_id or "",
            "inviteId": self.invite_id or "",
            "challenger": self.challenger or "",
            "color": self.color_of(row_username) or "",
        }


class RRTournament(Tournament):
    system = RR

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.arrangements: dict[str, RRArrangement] = {}

    def create_pairing(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        return []

    def arrangement_list(self) -> list[RRArrangement]:
        return sorted(
            self.arrangements.values(),
            key=lambda arrangement: (arrangement.round_no, arrangement.white, arrangement.black),
        )

    def completed_rounds(self) -> int:
        completed = 0
        for round_no in range(1, self.rounds + 1):
            round_arrangements = [
                arrangement
                for arrangement in self.arrangements.values()
                if arrangement.round_no == round_no
            ]
            if round_arrangements and all(
                arrangement.status == ARR_STATUS_FINISHED for arrangement in round_arrangements
            ):
                completed = round_no
            else:
                break
        return completed

    def live_status(self, now: datetime | None = None):
        response = super().live_status(now)
        if self.status == T_STARTED:
            response["currentRound"] = self.completed_rounds()
        return response

    def arrangement_payload(self, *, user: User | None = None) -> dict[str, object]:
        username = "" if user is None else user.username
        matrix: dict[str, dict[str, dict[str, Any]]] = {
            player.username: {} for player in self.players
        }
        for arrangement in self.arrangement_list():
            result = ""
            if arrangement.game_id:
                game = self.app_state.games.get(arrangement.game_id)
                if game is not None:
                    result = game.result
                else:
                    for player_name in arrangement.players():
                        player_data = self.player_data_by_name(player_name)
                        if player_data is None:
                            continue
                        matched_game = next(
                            (
                                game
                                for game in player_data.games
                                if getattr(game, "id", None) == arrangement.game_id
                            ),
                            None,
                        )
                        if matched_game is not None and not isinstance(matched_game, ByeGame):
                            result = matched_game.result
                            break
            matrix.setdefault(arrangement.white, {})
            matrix.setdefault(arrangement.black, {})
            white_cell = arrangement.cell_json(arrangement.white)
            black_cell = arrangement.cell_json(arrangement.black)
            white_cell["result"] = result
            black_cell["result"] = result
            matrix[arrangement.white][arrangement.black] = white_cell
            matrix[arrangement.black][arrangement.white] = black_cell

        return {
            "type": "rr_arrangements",
            "requestedBy": username,
            "players": [player.username for player in self.leaderboard],
            "matrix": matrix,
            "completedGames": sum(
                1
                for arrangement in self.arrangements.values()
                if arrangement.status == ARR_STATUS_FINISHED
            ),
            "totalGames": len(self.arrangements),
        }

    async def broadcast_arrangements(self) -> None:
        await self.broadcast(self.arrangement_payload())

    def rr_arrangement_player_names(self) -> list[str]:
        return [player.username for player in self.rr_pairing_players()]

    def _berger_rounds(self, players: list[str]) -> list[tuple[int, int, int]]:
        size = len(players)
        odd = size % 2 == 1
        effective_size = size + 1 if odd else size
        berger = BERGER_TABLES[int(effective_size / 2) - 2]
        pairings: list[tuple[int, int, int]] = []
        for round_no, round_pairs in enumerate(berger, start=1):
            for white_idx, black_idx in round_pairs:
                if odd and effective_size in (white_idx, black_idx):
                    continue
                pairings.append((round_no, white_idx, black_idx))
        return pairings

    async def create_arrangements(self) -> None:
        players = self.rr_arrangement_player_names()
        if len(players) > RR_MAX_SUPPORTED_PLAYERS:
            raise ValueError(
                "Round-robin supports at most %s players with the current Berger tables."
                % RR_MAX_SUPPORTED_PLAYERS
            )

        self.arrangements = {}
        if len(players) < 2:
            return

        for round_no, white_idx, black_idx in self._berger_rounds(players):
            white = players[white_idx - 1]
            black = players[black_idx - 1]
            arrangement_id = f"{self.id}:{white}:{black}"
            self.arrangements[arrangement_id] = RRArrangement(
                arrangement_id,
                white,
                black,
                round_no,
            )

        if self.app_state.db is not None:
            await self.app_state.db.tournament_arrangement.delete_many({"tid": self.id})
            if self.arrangements:
                await self.app_state.db.tournament_arrangement.insert_many(
                    [arrangement.doc(self.id) for arrangement in self.arrangement_list()]
                )

    async def load_arrangements(self, docs: list[TournamentArrangementDoc]) -> None:
        self.arrangements = {}
        for doc in docs:
            white, black = doc["u"]
            arrangement = RRArrangement(
                doc["_id"],
                white,
                black,
                int(doc.get("rn", 0)),
                status=doc.get("s", ARR_STATUS_PENDING),
                game_id=doc.get("gid") or None,
                invite_id=doc.get("iid") or None,
                challenger=doc.get("ch") or None,
                date=doc.get("d"),
            )
            self.arrangements[arrangement.id] = arrangement

        self.rounds = max(
            (arrangement.round_no for arrangement in self.arrangements.values()),
            default=self.rounds,
        )

    async def db_update_arrangement(self, arrangement: RRArrangement) -> None:
        if self.app_state.db is None:
            return
        await self.app_state.db.tournament_arrangement.update_one(
            {"_id": arrangement.id},
            {"$set": arrangement.update_doc(self.id)},
            upsert=True,
        )

    def _clear_stale_invite(self, arrangement: RRArrangement) -> None:
        if arrangement.invite_id and arrangement.invite_id not in self.app_state.invites:
            arrangement.status = ARR_STATUS_PENDING
            arrangement.invite_id = None
            arrangement.challenger = None

    def arrangement_by_id(self, arrangement_id: str) -> RRArrangement | None:
        arrangement = self.arrangements.get(arrangement_id)
        if arrangement is not None:
            self._clear_stale_invite(arrangement)
        return arrangement

    async def start(self, now: datetime) -> None:
        self.rounds = self.rr_rounds_for_start()
        await self.create_arrangements()
        await super().start(now)
        await self.broadcast_arrangements()

    def all_arrangements_finished(self) -> bool:
        return bool(self.arrangements) and all(
            arrangement.status == ARR_STATUS_FINISHED for arrangement in self.arrangements.values()
        )

    async def clock(self):
        try:
            while self.status not in (T_ABORTED, T_FINISHED, T_ARCHIVED):
                now = datetime.now(timezone.utc)
                if self.status == T_CREATED:
                    if now >= self.starts_at:
                        if len(self.players) < 3:
                            await self.abort()
                            break
                        await self.start(now)
                        continue
                elif self.status == T_STARTED:
                    if self.all_arrangements_finished() or now >= self.ends_at:
                        await self.finish()
                        break
                await asyncio.sleep(1)
        finally:
            self.clock_task = None

    async def finish(self, reason: str | None = None) -> None:
        for arrangement in self.arrangements.values():
            if arrangement.invite_id is not None:
                self.app_state.invites.pop(arrangement.invite_id, None)
        await super().finish(reason)

    async def create_arrangement_challenge(self, user: User, arrangement_id: str) -> str | None:
        if self.status != T_STARTED:
            return "Round-robin challenges open after the tournament starts."

        arrangement = self.arrangement_by_id(arrangement_id)
        if arrangement is None:
            return "Unknown round-robin pairing."
        if not arrangement.involves(user.username):
            return "You are not part of this round-robin pairing."
        if arrangement.status == ARR_STATUS_FINISHED:
            return "This round-robin game is already finished."
        if arrangement.status == ARR_STATUS_STARTED:
            return "This round-robin game is already in progress."
        if (
            self.player_data_by_name(user.username) is None
            or self.player_data_by_name(user.username).paused
        ):
            return "Paused players cannot create round-robin challenges."

        if arrangement.invite_id and arrangement.invite_id in self.app_state.invites:
            return None

        opponent = arrangement.opponent(user.username)
        if opponent is None:
            return "Unknown round-robin opponent."

        seek_data: SeekCreateData = {
            "variant": self.variant,
            "fen": self.fen,
            "color": "w" if arrangement.white == user.username else "b",
            "minutes": self.base,  # type: ignore[typeddict-item]
            "increment": self.inc,
            "byoyomiPeriod": self.byoyomi_period,
            "rated": bool(self.rated),
            "chess960": self.chess960,
            "target": opponent,
            "reserveGameId": True,
            "tournamentId": self.id,
            "rrArrangementId": arrangement.id,
        }
        seek = await create_seek(
            self.app_state.db,
            self.app_state.invites,
            self.app_state.seeks,
            user,
            seek_data,
        )
        if seek is None or seek.game_id is None:
            return "Could not create a round-robin challenge."

        arrangement.status = ARR_STATUS_CHALLENGED
        arrangement.invite_id = seek.game_id
        arrangement.challenger = user.username
        arrangement.date = datetime.now(timezone.utc)
        await self.db_update_arrangement(arrangement)
        opponent_user = await self.app_state.users.get(opponent)
        if opponent_user.username == opponent:
            content: NotificationContent = {
                "tid": self.id,
                "arr": arrangement.id,
                "opp": user.username,
            }
            await notify(self.app_state.db, opponent_user, "rrChallenge", content)
        await self.broadcast_arrangements()
        return None

    async def accept_arrangement_challenge(self, user: User, arrangement_id: str):
        arrangement = self.arrangement_by_id(arrangement_id)
        if arrangement is None:
            return {"type": "error", "message": "Unknown round-robin pairing."}
        if not arrangement.involves(user.username):
            return {"type": "error", "message": "You are not part of this round-robin pairing."}
        if arrangement.challenger == user.username:
            return {"type": "error", "message": "Waiting for your opponent to accept."}
        if arrangement.invite_id is None:
            return {"type": "error", "message": "There is no active challenge for this pairing."}

        seek = self.app_state.invites.get(arrangement.invite_id)
        if seek is None:
            arrangement.status = ARR_STATUS_PENDING
            arrangement.invite_id = None
            arrangement.challenger = None
            await self.db_update_arrangement(arrangement)
            await self.broadcast_arrangements()
            return {"type": "error", "message": "The challenge is no longer available."}

        result = await join_seek(self.app_state, user, seek, arrangement.invite_id)
        if result["type"] == "new_game":
            game = self.app_state.games.get(result["gameId"])
            if game is not None:
                await self.register_arrangement_game(arrangement, game)
        return result

    async def register_arrangement_game(self, arrangement: RRArrangement, game: Game | Any) -> None:
        game.round = arrangement.round_no  # type: ignore[attr-defined]
        arrangement.status = ARR_STATUS_STARTED
        arrangement.game_id = game.id
        arrangement.invite_id = None
        arrangement.challenger = None
        arrangement.date = datetime.now(timezone.utc)
        self.ongoing_games.add(game)
        self.update_players(game)
        await self.db_update_pairing(game)
        await self.db_update_arrangement(arrangement)
        await self.publish_pairings([game])
        await self.broadcast_arrangements()
        await self.broadcast(self.live_status())

    async def game_update(self, game: Game) -> None:
        await super().game_update(game)

        arrangement_id = getattr(game, "tournamentArrangementId", None)
        if arrangement_id is None:
            return

        arrangement = self.arrangements.get(arrangement_id)
        if arrangement is None:
            return

        arrangement.status = ARR_STATUS_FINISHED
        arrangement.game_id = game.id
        arrangement.invite_id = None
        arrangement.challenger = None
        arrangement.date = datetime.now(timezone.utc)
        await self.db_update_arrangement(arrangement)
        await self.broadcast_arrangements()

        if self.status == T_STARTED and self.all_arrangements_finished():
            await self.finish()
