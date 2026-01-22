from __future__ import annotations
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Iterable, NotRequired, TypedDict

from const import CORR_SEEK_EXPIRE_WEEKS
from misc import time_control_str
from newid import new_id
import logging
from variants import get_server_variant

log = logging.getLogger(__name__)

MAX_USER_SEEKS = 10

if TYPE_CHECKING:
    from user import User


class SeekJson(TypedDict):
    _id: str
    seekID: str
    user: str
    bot: bool
    title: str
    variant: str
    chess960: bool | None
    target: str
    player1: str
    player2: str
    bugPlayer1: str
    bugPlayer2: str
    fen: str
    color: str
    rated: bool | int | None
    rrmin: int
    rrmax: int
    rating: int
    base: int
    inc: int
    byoyomi: int
    day: int
    gameId: str


class CorrSeekJson(TypedDict):
    _id: str
    user: str
    variant: str
    chess960: bool | None
    fen: str
    color: str
    rated: bool | int | None
    rrmin: int
    rrmax: int
    day: int
    expireAt: datetime


class SeekCreateData(TypedDict):
    variant: str
    fen: str
    color: str
    minutes: int
    increment: int
    byoyomiPeriod: int
    day: NotRequired[int]
    rated: NotRequired[bool | None]
    rrmin: NotRequired[int | None]
    rrmax: NotRequired[int | None]
    chess960: NotRequired[bool | None]
    target: NotRequired[str]


class Seek:
    def __init__(
        self,
        seek_id: str,
        creator: User,
        variant: str,
        fen: str = "",
        color: str = "r",
        base: int = 5,
        inc: int = 5,
        byoyomi_period: int = 0,
        day: int = 0,
        level: int = 6,
        rated: bool | int | None = False,
        rrmin: int | None = None,
        rrmax: int | None = None,
        chess960: bool | None = False,
        target: str = "",
        player1: User | None = None,
        player2: User | None = None,
        bugPlayer1: User | None = None,
        bugPlayer2: User | None = None,
        game_id: str | None = None,
        expire_at: datetime | None = None,
        reused_fen: bool = False,
    ) -> None:
        self.id: str = seek_id
        self.creator: User = creator
        self.variant: str = variant
        self.color: str = color
        self.fen: str = "" if fen is None else fen
        self.rated: bool | int | None = rated
        self.rating: int = creator.get_rating_value(variant, chess960)
        self.rrmin: int = rrmin if (rrmin is not None and rrmin != -1000) else -10000
        self.rrmax: int = rrmax if (rrmax is not None and rrmax != 1000) else 10000
        self.base: int = base
        self.inc: int = inc
        self.byoyomi_period: int = byoyomi_period
        server_variant = get_server_variant(variant, chess960)
        self.day: int = 0 if server_variant.two_boards else day
        self.level: int = 0 if creator.username == "Random-Mover" else level
        self.chess960: bool | None = chess960
        self.target: str = target if target is not None else ""
        self.player1: User | None = player1
        self.player2: User | None = player2
        self.bugPlayer1: User | None = bugPlayer1
        self.bugPlayer2: User | None = bugPlayer2

        self.game_id: str | None = game_id

        self.expire_at = (
            datetime.now(timezone.utc) + CORR_SEEK_EXPIRE_WEEKS if expire_at is None else expire_at
        )

        # True if this is 960 variant 1st, 3rd etc. rematch seek
        self.reused_fen: bool = reused_fen

        # Seek is pending when it is not corr, and user has no live lobby websocket
        self.pending: bool = False

    def __str__(self) -> str:
        fen = "fen='%s', " % self.fen if self.fen else ""
        game_id = "game_id='%s', " % self.game_id if self.game_id else ""
        return (
            "\n<Seek: id='%s', " % self.id
            + "user='%s', " % self.creator.username
            + "variant='%s', " % self.variant
            + "color='%s', " % self.color
            + fen
            + "rated='%s', " % self.rated
            + "level='%d', " % self.level
            + "base='%s', " % self.base
            + "inc='%s', " % self.inc
            + "chess960='%s', " % self.chess960
            + "rated='%s', " % self.rated
            + "rrmin='%d', " % self.rrmin
            + "rrmax='%d', " % self.rrmax
            + game_id
            + "pending='%d', " % self.pending
            + "target='%s', " % self.target
            + "day='%d'>" % self.day
        )

    @property
    def seek_json(self) -> SeekJson:
        return {
            "_id": self.id,
            "seekID": self.id,
            "user": self.creator.username,
            "bot": self.creator.bot,
            "title": self.creator.title,
            "variant": self.variant,
            "chess960": self.chess960,
            "target": self.target,
            "player1": self.player1.username if self.player1 is not None else "",
            "player2": self.player2.username if self.player2 is not None else "",
            "bugPlayer1": self.bugPlayer1.username if self.bugPlayer1 is not None else "",
            "bugPlayer2": self.bugPlayer2.username if self.bugPlayer2 is not None else "",
            "fen": self.fen,
            "color": self.color,
            "rated": self.rated,
            "rrmin": self.rrmin,
            "rrmax": self.rrmax,
            "rating": self.rating,
            "base": self.base,
            "inc": self.inc,
            "byoyomi": self.byoyomi_period,
            "day": self.day,
            "gameId": self.game_id if self.game_id is not None else "",
        }

    @property
    def corr_json(self) -> CorrSeekJson:
        return {
            "_id": self.id,
            "user": self.creator.username,
            "variant": self.variant,
            "chess960": self.chess960,
            "fen": self.fen,
            "color": self.color,
            "rated": self.rated,
            "rrmin": self.rrmin,
            "rrmax": self.rrmax,
            "day": self.day,
            "expireAt": self.expire_at,
        }

    @property
    def discord_msg(self) -> str:
        tc = time_control_str(self.base, self.inc, self.byoyomi_period, self.day)
        tail960 = "960" if self.chess960 else ""
        return "%s: **%s%s** %s" % (self.creator.username, self.variant, tail960, tc)


async def create_seek(
    db: Any,
    invites: dict[str, Seek],
    seeks: dict[str, Seek],
    user: User,
    data: SeekCreateData,
    empty: bool = False,
    engine: User | None = None,
) -> Seek | None:
    """Seek can be
    - invite (has reserved new game id stored in app[invites], and target is 'Invite-friend')
    - challenge (has another username as target)
    - normal seek (no target)

    Empty seek is a seek where the seeker doesn't play
    Currently there is no limit for them since they're used for tournament organisation purposes
    They can only be created by trusted users
    """
    day = data.get("day", 0)
    live_seeks = len([seek for seek in user.seeks.values() if seek.day == 0])
    corr_seeks = len([seek for seek in user.seeks.values() if seek.day != 0])
    if (
        (live_seeks >= MAX_USER_SEEKS and day == 0) or (corr_seeks >= MAX_USER_SEEKS and day != 0)
    ) and not empty:
        return None

    target = data.get("target", "")
    if target in ("BOT_challenge", "Invite-friend"):
        game_id = await new_id(db.game)
    else:
        game_id = None

    seek_id = await new_id(None if db is None else db.seek)
    rated: bool | None = data.get("rated")
    chess960: bool | None = data.get("chess960")
    seek = Seek(
        seek_id,
        user,
        data["variant"],
        fen=data["fen"],
        color=data["color"],
        base=data["minutes"],
        inc=data["increment"],
        byoyomi_period=data["byoyomiPeriod"],
        day=day,
        rated=rated,
        rrmin=data.get("rrmin"),
        rrmax=data.get("rrmax"),
        chess960=chess960,
        target=target,
        player1=None if empty else user,
        player2=engine if target == "BOT_challenge" else None,
        game_id=game_id,
    )

    log.debug("adding seek: %s" % seek)
    seeks[seek.id] = seek
    user.seeks[seek.id] = seek

    if target in ("BOT_challenge", "Invite-friend"):
        invites[game_id] = seek  # type: ignore[index]

    return seek


def get_seeks(user: User, seeks: Iterable[Seek]) -> list[SeekJson]:
    return [
        seek.seek_json for seek in seeks if not seek.pending and user.compatible_with_seek(seek)
    ]


def challenge(seek: Seek) -> str:
    """BOT API stream event response"""
    return (
        '{"type":"challenge", "challenge": {"id":"%s", "challenger":{"name":"%s", "rating":1500,"title":""},"variant":{"key":"%s"},"rated":"true","timeControl":{"type":"clock","limit":300,"increment":0},"color":"random","finalColor":"white","speed":"rapid","perf":{"name":"Rapid"}, "level":%s, "chess960":%s}}\n'
        % (
            seek.game_id,
            seek.creator.username,
            seek.variant,
            seek.level,
            str(seek.chess960).lower(),
        )
    )
