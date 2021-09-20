from misc import time_control_str
from newid import new_id

MAX_USER_SEEKS = 10


class Seek:
    gen_id = 0

    def __init__(self, user, variant, fen="", color="r", base=5, inc=3, byoyomi_period=0, level=6, rated=False, chess960=False, alternate_start="", target="", ws=None, game_id=None, empty=False):
        self.user = user
        self.variant = variant
        self.color = color
        self.fen = "" if fen is None else fen
        self.rated = rated
        self.rating = user.get_rating(variant, chess960).rating_prov[0]
        self.base = base
        self.inc = inc
        self.byoyomi_period = byoyomi_period
        self.level = 0 if user.username == "Random-Mover" else level
        self.chess960 = chess960
        self.alternate_start = alternate_start
        self.target = target
        self.ws = ws
        self.empty = empty

        Seek.gen_id += 1
        self.id = self.gen_id
        self.game_id = game_id

        self.as_json = {
            "seekID": self.id,
            "user": self.user.username,
            "bot": self.user.bot,
            "title": self.user.title,
            "variant": self.variant,
            "chess960": self.chess960,
            "alternateStart": self.alternate_start,
            "target": self.target,
            "fen": self.fen,
            "color": self.color,
            "rated": self.rated,
            "rating": self.rating,
            "base": self.base,
            "inc": self.inc,
            "byoyomi": self.byoyomi_period,
            "gameId": self.game_id if self.game_id is not None else "",
            "empty": self.empty,
        }

    @property
    def discord_msg(self):
        tc = time_control_str(self.base, self.inc, self.byoyomi_period)
        tail960 = "960" if self.chess960 else ""
        return "%s: **%s%s** %s" % (self.user.username, self.variant, tail960, tc)


async def create_seek(db, invites, seeks, user, data, ws=None, empty=False):
    """ Seek can be
        - invite (has reserved new game id strored in app['invites'], and target is 'Invite-friend')
        - challenge (has another username as target)
        - normal seek (no target)

        Empty seek is a seek where the seeker doesn't play
        Currently there is no limit for them since they're used for tournament organisation purposes
        They can only be created by trusted users
    """
    if len(user.seeks) >= MAX_USER_SEEKS and not empty:
        return

    target = data.get("target")
    if target == "Invite-friend":
        game_id = await new_id(db.game)
    else:
        game_id = None

    seek = Seek(
        user, data["variant"],
        fen=data["fen"],
        color=data["color"],
        base=data["minutes"],
        inc=data["increment"],
        byoyomi_period=data["byoyomiPeriod"],
        rated=data.get("rated"),
        chess960=data.get("chess960"),
        alternate_start=data.get("alternateStart"),
        target=target,
        ws=ws,
        game_id=game_id,
        empty=empty)

    seeks[seek.id] = seek
    user.seeks[seek.id] = seek

    if target == "Invite-friend":
        invites[game_id] = seek

    return seek


def get_seeks(seeks):
    return {"type": "get_seeks", "seeks": [seek.as_json for seek in seeks.values()]}


def challenge(seek, gameId):
    return '{"type":"challenge", "challenge": {"id":"%s", "challenger":{"name":"%s", "rating":1500,"title":""},"variant":{"key":"%s"},"rated":"true","timeControl":{"type":"clock","limit":300,"increment":0},"color":"random","speed":"rapid","perf":{"name":"Rapid"}, "level":%s, "chess960":%s}}\n' % (gameId, seek.user.username, seek.variant, seek.level, str(seek.chess960).lower())
