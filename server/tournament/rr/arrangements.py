from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from typing_defs import TournamentArrangementDoc, TournamentArrangementUpdate


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
