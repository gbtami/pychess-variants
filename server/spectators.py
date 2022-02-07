from itertools import chain

from const import MAX_NAMED_SPECTATORS


def spectators(spectated):
    spectators = (spectator.username for spectator in spectated.spectators if not spectator.anon)
    anons = ()
    anon = sum(1 for user in spectated.spectators if user.anon)

    cnt = len(spectated.spectators)
    if cnt > MAX_NAMED_SPECTATORS:
        spectators = str(cnt)
    else:
        if anon > 0:
            anons = ("Anonymous(%s)" % anon,)
        spectators = ", ".join(chain(spectators, anons))
    return {"type": "spectators", "spectators": spectators}
