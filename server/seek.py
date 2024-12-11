from __future__ import annotations
from datetime import datetime, timezone
import logging

from const import CORR_SEEK_EXPIRE_WEEKS
from misc import time_control_str
from newid import new_id

log = logging.getLogger(__name__)

MAX_USER_SEEKS = 10


class Seek:
    def __init__(
        self,
        seek_id,
        creator,
        variant,
        fen="",
        color="r",
        base=5,
        inc=3,
        byoyomi_period=0,
        day=0,
        level=6,
        rated=False,
        rrmin=None,
        rrmax=None,
        chess960=False,
        target="",
        player1=None,
        player2=None,
        bugPlayer1=None,
        bugPlayer2=None,
        ws=None,
        game_id=None,
        expire_at=None,
    ):
        self.id = seek_id
        self.creator = creator
        self.variant = variant
        self.color = color
        self.fen = "" if fen is None else fen
        self.rated = rated
        self.rating = creator.get_rating(variant, chess960).rating_prov[0]
        self.rrmin = rrmin if (rrmin is not None and rrmin != -500) else -10000
        self.rrmax = rrmax if (rrmax is not None and rrmax != 500) else 10000
        self.base = base
        self.inc = inc
        self.byoyomi_period = byoyomi_period
        self.day = day
        self.level = 0 if creator.username == "Random-Mover" else level
        self.chess960 = chess960
        self.target = target
        self.player1 = player1
        self.player2 = player2
        self.bugPlayer1 = bugPlayer1
        self.bugPlayer2 = bugPlayer2
        self.ws = ws

        self.game_id = game_id

        self.expire_at = (
            datetime.now(timezone.utc) + CORR_SEEK_EXPIRE_WEEKS if expire_at is None else expire_at
        )

        # Seek is pending when it is not corr, and user has no live lobby websocket
        self.pending = False

    def __str__(self):
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
            + "day='%d'>" % self.day
        )

    @property
    def seek_json(self):
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
    def corr_json(self):
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
    def discord_msg(self):
        tc = time_control_str(self.base, self.inc, self.byoyomi_period, self.day)
        tail960 = "960" if self.chess960 else ""
        return "%s: **%s%s** %s" % (self.creator.username, self.variant, tail960, tc)


async def create_seek(db, invites, seeks, user, data, ws, empty=False):
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
        return

    target = data.get("target")
    if target == "Invite-friend":
        game_id = await new_id(db.game)
    else:
        game_id = None

    seek_id = await new_id(None if db is None else db.seek)
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
        rated=data.get("rated"),
        rrmin=data.get("rrmin"),
        rrmax=data.get("rrmax"),
        chess960=data.get("chess960"),
        target=target,
        player1=None if empty else user,
        player2=None,
        ws=ws,  # todo: dont see the need for this - instead the list of user's lobby websockets can be used
        game_id=game_id,
    )

    log.debug("adding seek: %s" % seek)
    seeks[seek.id] = seek
    user.seeks[seek.id] = seek

    if target == "Invite-friend":
        invites[game_id] = seek

    return seek


def get_seeks(user, seeks):
    return [seek.seek_json for seek in seeks if not seek.pending and user.compatible_with_seek(seek)]


def challenge(seek, gameId):
    return (
        '{"type":"challenge", "challenge": {"id":"%s", "challenger":{"name":"%s", "rating":1500,"title":""},"variant":{"key":"%s"},"rated":"true","timeControl":{"type":"clock","limit":300,"increment":0},"color":"random","speed":"rapid","perf":{"name":"Rapid"}, "level":%s, "chess960":%s}}\n'
        % (
            gameId,
            seek.creator.username,
            seek.variant,
            seek.level,
            str(seek.chess960).lower(),
        )
    )
