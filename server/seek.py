from __future__ import annotations
from datetime import datetime, timezone

from const import CORR_SEEK_EXPIRE_WEEKS
from misc import time_control_str
from newid import new_id

MAX_USER_SEEKS = 10


class Seek:
    gen_id = 0

    def __init__(
        self,
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
        chess960=False,
        target="",
        player1=None,
        player2=None,
        ws=None,
        game_id=None,
        expire_at=None,
    ):
        self.creator = creator
        self.variant = variant
        self.color = color
        self.fen = "" if fen is None else fen
        self.rated = rated
        self.rating = creator.get_rating(variant, chess960).rating_prov[0]
        self.base = base
        self.inc = inc
        self.byoyomi_period = byoyomi_period
        self.day = day
        self.level = 0 if creator.username == "Random-Mover" else level
        self.chess960 = chess960
        self.target = target
        self.player1 = player1
        self.player2 = player2
        self.ws = ws

        Seek.gen_id += 1
        self.id = self.gen_id
        self.game_id = game_id

        self.expire_at = (
            datetime.now(timezone.utc) + CORR_SEEK_EXPIRE_WEEKS if expire_at is None else expire_at
        )

        # Seek is pending when it is not corr, and user has no live lobby websocket
        self.pending = False

    @property
    def as_json(self):
        return {
            "seekID": self.id,
            "user": self.creator.username,
            "bot": self.creator.bot,
            "title": self.creator.title,
            "variant": self.variant,
            "chess960": self.chess960,
            "target": self.target,
            "player1": self.player1.username if self.player1 is not None else "",
            "player2": self.player2.username if self.player2 is not None else "",
            "fen": self.fen,
            "color": self.color,
            "rated": self.rated,
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

    seek = Seek(
        user,
        data["variant"],
        fen=data["fen"],
        color=data["color"],
        base=data["minutes"],
        inc=data["increment"],
        byoyomi_period=data["byoyomiPeriod"],
        day=day,
        rated=data.get("rated"),
        chess960=data.get("chess960"),
        target=target,
        player1=None if empty else user,
        player2=None,
        ws=ws,
        game_id=game_id,
    )

    seeks[seek.id] = seek
    user.seeks[seek.id] = seek

    if target == "Invite-friend":
        invites[game_id] = seek

    return seek


def get_seeks(seeks):
    active_seeks = [seek.as_json for seek in seeks.values() if not seek.pending]
    return {
        "type": "get_seeks",
        "seeks": active_seeks,
    }


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
