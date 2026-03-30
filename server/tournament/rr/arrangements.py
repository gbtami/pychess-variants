from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from typing_defs import TournamentArrangementDoc, TournamentArrangementUpdate

ARR_STATUS_PENDING = "pending"
ARR_STATUS_CHALLENGED = "challenged"
ARR_STATUS_STARTED = "started"
ARR_STATUS_FINISHED = "finished"
ARR_SCHEDULE_TOLERANCE = timedelta(seconds=60)
ARR_REMINDER_WINDOW_START = timedelta(hours=23)
ARR_REMINDER_WINDOW_END = timedelta(hours=24)
ARR_REMINDER_REPEAT = timedelta(hours=2)
ARR_REMINDER_COOLDOWN_AFTER_AGREEMENT = timedelta(hours=3)


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
        "white_date",
        "black_date",
        "scheduled_at",
        "last_reminded_at",
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
        white_date: datetime | None = None,
        black_date: datetime | None = None,
        scheduled_at: datetime | None = None,
        last_reminded_at: datetime | None = None,
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
        self.white_date = white_date
        self.black_date = black_date
        self.scheduled_at = scheduled_at
        self.last_reminded_at = last_reminded_at

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
        doc: TournamentArrangementDoc = {
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
        if self.white_date is not None:
            doc["d1"] = self.white_date
        if self.black_date is not None:
            doc["d2"] = self.black_date
        if self.scheduled_at is not None:
            doc["sa"] = self.scheduled_at
        if self.last_reminded_at is not None:
            doc["ln"] = self.last_reminded_at
        return doc

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
            "d1": self.white_date,
            "d2": self.black_date,
            "sa": self.scheduled_at,
            "ln": self.last_reminded_at,
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
            "date": self.date.isoformat(),
            "whiteSuggestedAt": self.white_date.isoformat() if self.white_date else "",
            "blackSuggestedAt": self.black_date.isoformat() if self.black_date else "",
            "scheduledAt": self.scheduled_at.isoformat() if self.scheduled_at else "",
        }

    def suggested_time(self, username: str) -> datetime | None:
        if username == self.white:
            return self.white_date
        if username == self.black:
            return self.black_date
        return None

    def opponent_suggested_time(self, username: str) -> datetime | None:
        if username == self.white:
            return self.black_date
        if username == self.black:
            return self.white_date
        return None

    def set_suggested_time(self, username: str, date: datetime | None) -> None:
        if username == self.white:
            self.white_date = date
        elif username == self.black:
            self.black_date = date
