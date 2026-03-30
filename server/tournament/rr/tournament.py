from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from const import ABORTED, RR, T_ABORTED, T_ARCHIVED, T_CREATED, T_FINISHED, T_STARTED
from notify import notify
from seek import SeekCreateData, create_seek
from tournament.tournament import ByeGame, PlayerData, RR_MAX_SUPPORTED_PLAYERS, Tournament
from typing_defs import (
    NotificationContent,
    TournamentArrangementDoc,
    TournamentManagePlayerJson,
    TournamentRRManagementResponse,
    TournamentRRSettingsResponse,
)
from utils import join_seek
from websocket_utils import ws_send_json_many

from .arrangements import (
    ARR_REMINDER_COOLDOWN_AFTER_AGREEMENT,
    ARR_REMINDER_REPEAT,
    ARR_REMINDER_WINDOW_END,
    ARR_REMINDER_WINDOW_START,
    ARR_SCHEDULE_TOLERANCE,
    ARR_STATUS_CHALLENGED,
    ARR_STATUS_FINISHED,
    ARR_STATUS_PENDING,
    ARR_STATUS_STARTED,
    RRArrangement,
)

if TYPE_CHECKING:
    from game import Game
    from user import User


class RRTournament(Tournament):
    system = RR

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.arrangements: dict[str, RRArrangement] = {}

    def create_pairing(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        return []

    def extra_user_status(self, user: User) -> str | None:
        if user.username in self.rr_pending_players:
            return "pending"
        if user.username in self.rr_denied_players:
            return "denied"
        return None

    async def join_precheck(self, user: User, player_data: PlayerData | None) -> str | None:
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
        return None

    def rr_management_enabled(self) -> bool:
        return self.rr_requires_approval

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
        sockets_by_username = self.app_state.tourneysockets.get(self.id, {})
        sockets = [
            socket for user_sockets in sockets_by_username.values() for socket in user_sockets
        ]
        if len(sockets) == 0:
            return
        await ws_send_json_many(sockets, self.rr_settings_payload())

    async def send_rr_user_status_update(self, username: str) -> None:
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
        if self.status != T_CREATED:
            return "Joining can only be opened or closed before the round-robin starts."
        if self.rr_joining_closed == closed:
            return None
        self.rr_joining_closed = closed
        await self.save()
        await self.send_rr_settings_update()
        await self.send_rr_management_update()
        return None

    def arrangement_list(self) -> list[RRArrangement]:
        if self.status == T_CREATED:
            self.sync_projected_arrangements()
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
        if self.status == T_CREATED:
            self.sync_projected_arrangements()
        matrix: dict[str, dict[str, dict[str, Any]]] = {
            player.username: {} for player in self.players
        }
        for arrangement in self.arrangement_list():
            result = ""
            white_points: int | str | None = None
            black_points: int | str | None = None
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
                white_points = self.arrangement_point_value(arrangement.white, arrangement.game_id)
                black_points = self.arrangement_point_value(arrangement.black, arrangement.game_id)
            matrix.setdefault(arrangement.white, {})
            matrix.setdefault(arrangement.black, {})
            white_cell = arrangement.cell_json(arrangement.white)
            black_cell = arrangement.cell_json(arrangement.black)
            white_cell["result"] = result
            black_cell["result"] = result
            white_cell["points"] = "" if white_points is None else white_points
            black_cell["points"] = "" if black_points is None else black_points
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

    def arrangement_point_value(self, username: str, game_id: str) -> int | str | None:
        player_data = self.player_data_by_name(username)
        if player_data is None:
            return None

        for index, game in enumerate(player_data.games):
            if getattr(game, "id", None) != game_id:
                continue
            if index >= len(player_data.points):
                return None
            point = player_data.points[index]
            if isinstance(point, tuple):
                return point[0]
            if point == "-":
                return point
            return None

        return None

    async def broadcast_arrangements(self) -> None:
        await self.broadcast(self.arrangement_payload())

    def rr_arrangement_player_names(self) -> list[str]:
        return [player.username for player in self.rr_pairing_players()]

    def _round_robin_rounds(self, players: list[str]) -> list[tuple[int, int, int]]:
        size = len(players)
        if size == 2:
            return [(1, 1, 2)]

        odd = size % 2 == 1
        effective_size = size + 1 if odd else size
        rotation = list(range(1, effective_size + 1))
        pairings: list[tuple[int, int, int]] = []

        for round_no in range(1, effective_size):
            half = effective_size // 2
            for pair_index in range(half):
                left = rotation[pair_index]
                right = rotation[effective_size - 1 - pair_index]
                if odd and effective_size in (left, right):
                    continue

                # Keep a deterministic color pattern while avoiding long color streaks
                # for the fixed seat in the standard circle-method rotation.
                if pair_index == 0:
                    white_idx, black_idx = (left, right) if round_no % 2 == 1 else (right, left)
                elif pair_index % 2 == 1:
                    white_idx, black_idx = right, left
                else:
                    white_idx, black_idx = left, right

                pairings.append((round_no, white_idx, black_idx))

            rotation = [rotation[0], rotation[-1], *rotation[1:-1]]

        return pairings

    def sync_projected_arrangements(self) -> set[str]:
        players = self.rr_arrangement_player_names()
        if len(players) > RR_MAX_SUPPORTED_PLAYERS:
            raise ValueError("Round-robin supports at most %s players." % RR_MAX_SUPPORTED_PLAYERS)

        existing = self.arrangements
        projected: dict[str, RRArrangement] = {}
        if len(players) < 2:
            self.arrangements = {}
            return set(existing)

        for round_no, white_idx, black_idx in self._round_robin_rounds(players):
            white = players[white_idx - 1]
            black = players[black_idx - 1]
            arrangement_id = f"{self.id}:{white}:{black}"
            arrangement = existing.get(arrangement_id)
            if arrangement is None:
                arrangement = RRArrangement(
                    arrangement_id,
                    white,
                    black,
                    round_no,
                )
            else:
                arrangement.white = white
                arrangement.black = black
                arrangement.round_no = round_no
            projected[arrangement_id] = arrangement

        stale_ids = set(existing).difference(projected)
        for arrangement_id in stale_ids:
            arrangement = existing[arrangement_id]
            if arrangement.invite_id is not None:
                self.app_state.invites.pop(arrangement.invite_id, None)

        self.arrangements = projected
        return stale_ids

    async def create_arrangements(self) -> None:
        stale_ids = self.sync_projected_arrangements()

        if self.app_state.db is not None:
            arrangement_table = self.app_state.db.tournament_arrangement
            if stale_ids:
                await arrangement_table.delete_many(
                    {"tid": self.id, "_id": {"$in": list(stale_ids)}}
                )
            if not self.arrangements:
                await arrangement_table.delete_many({"tid": self.id})
            else:
                for arrangement in self.arrangement_list():
                    await arrangement_table.update_one(
                        {"_id": arrangement.id},
                        {"$set": arrangement.update_doc(self.id)},
                        upsert=True,
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
                white_date=doc.get("d1"),
                black_date=doc.get("d2"),
                scheduled_at=doc.get("sa"),
                last_reminded_at=doc.get("ln"),
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
        if self.status == T_CREATED:
            self.sync_projected_arrangements()
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
                        if len(self.players) < 2:
                            await self.abort()
                            break
                        await self.start(now)
                        continue
                elif self.status == T_STARTED:
                    await self.send_arrangement_reminders(now)
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
        if self.nb_games_finished == 0:
            await self.destroy_empty_finished_rr()

    async def destroy_empty_finished_rr(self) -> None:
        if self.app_state.db is not None:
            await self.app_state.db.tournament.delete_one({"_id": self.id})
            await self.app_state.db.tournament_arrangement.delete_many({"tid": self.id})
            await self.app_state.db.tournament_player.delete_many({"tid": self.id})
            await self.app_state.db.tournament_chat.delete_many({"tid": self.id})
        self.app_state.tournaments.pop(self.id, None)
        self.app_state.tourneysockets.pop(self.id, None)

    @staticmethod
    def _normalize_arrangement_date(date: datetime | None) -> datetime | None:
        return None if date is None else date.astimezone(timezone.utc).replace(microsecond=0)

    @staticmethod
    def _dates_within_tolerance(left: datetime, right: datetime) -> bool:
        return abs(left - right) <= ARR_SCHEDULE_TOLERANCE

    async def set_arrangement_time(
        self, user: User, arrangement_id: str, date: datetime | None
    ) -> str | None:
        if self.status not in (T_CREATED, T_STARTED):
            return "Round-robin scheduling is not available for this tournament."

        arrangement = self.arrangement_by_id(arrangement_id)
        if arrangement is None:
            return "Unknown round-robin pairing."
        if not arrangement.involves(user.username):
            return "You are not part of this round-robin pairing."
        if arrangement.game_id is not None or arrangement.status in (
            ARR_STATUS_STARTED,
            ARR_STATUS_FINISHED,
        ):
            return "This round-robin pairing can no longer be rescheduled."

        player_data = self.player_data_by_name(user.username)
        if player_data is None or player_data.paused:
            return "Paused players cannot schedule round-robin games."

        previous_scheduled_at = arrangement.scheduled_at
        date = self._normalize_arrangement_date(date)
        arrangement.set_suggested_time(user.username, date)
        arrangement.scheduled_at = None

        opponent_date = arrangement.opponent_suggested_time(user.username)
        if (
            date is not None
            and opponent_date is not None
            and self._dates_within_tolerance(date, opponent_date)
        ):
            arrangement.scheduled_at = opponent_date

        arrangement.date = datetime.now(timezone.utc)
        if previous_scheduled_at != arrangement.scheduled_at:
            arrangement.last_reminded_at = None
        await self.db_update_arrangement(arrangement)

        if (
            arrangement.scheduled_at is not None
            and previous_scheduled_at != arrangement.scheduled_at
        ):
            opponent = arrangement.opponent(user.username)
            if opponent is not None:
                opponent_user = await self.app_state.users.get(opponent)
                if opponent_user.username == opponent:
                    content: NotificationContent = {
                        "tid": self.id,
                        "arr": arrangement.id,
                        "opp": user.username,
                        "date": arrangement.scheduled_at.isoformat(),
                    }
                    await notify(self.app_state.db, opponent_user, "rrArrangementTime", content)

        await self.broadcast_arrangements()
        return None

    async def send_arrangement_reminders(self, now: datetime) -> None:
        for arrangement in self.arrangements.values():
            if arrangement.scheduled_at is None:
                continue
            if arrangement.game_id is not None or arrangement.status in (
                ARR_STATUS_STARTED,
                ARR_STATUS_FINISHED,
            ):
                continue

            time_until_game = arrangement.scheduled_at - now
            if not (ARR_REMINDER_WINDOW_START <= time_until_game <= ARR_REMINDER_WINDOW_END):
                continue
            if arrangement.date >= now - ARR_REMINDER_COOLDOWN_AFTER_AGREEMENT:
                continue
            if (
                arrangement.last_reminded_at is not None
                and arrangement.last_reminded_at >= now - ARR_REMINDER_REPEAT
            ):
                continue

            for username in arrangement.players():
                opponent = arrangement.opponent(username)
                if opponent is None:
                    continue
                target_user = await self.app_state.users.get(username)
                if target_user.username != username:
                    continue
                content: NotificationContent = {
                    "tid": self.id,
                    "arr": arrangement.id,
                    "opp": opponent,
                    "date": arrangement.scheduled_at.isoformat(),
                }
                await notify(self.app_state.db, target_user, "rrArrangementReminder", content)

            arrangement.last_reminded_at = now
            await self.db_update_arrangement(arrangement)

    async def create_arrangement_challenge(self, user: User, arrangement_id: str) -> str | None:
        if self.status not in (T_CREATED, T_STARTED):
            return "Round-robin challenges are not available for this tournament."

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
        arrangement.white_date = None
        arrangement.black_date = None
        arrangement.scheduled_at = None
        arrangement.last_reminded_at = None
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

        if game.status == ABORTED:
            arrangement.status = ARR_STATUS_PENDING
            arrangement.game_id = None
        else:
            arrangement.status = ARR_STATUS_FINISHED
            arrangement.game_id = game.id
        arrangement.invite_id = None
        arrangement.challenger = None
        arrangement.white_date = None
        arrangement.black_date = None
        arrangement.scheduled_at = None
        arrangement.last_reminded_at = None
        arrangement.date = datetime.now(timezone.utc)
        await self.db_update_arrangement(arrangement)
        await self.broadcast_arrangements()

        if self.status == T_STARTED and self.all_arrangements_finished():
            await self.finish()
