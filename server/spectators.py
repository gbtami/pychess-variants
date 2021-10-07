from itertools import chain

from const import MAX_NAMED_SPECTATORS


def spectators(spectated) -> dict:
    spectators: tuple = (
        spectator.username for spectator in spectated.spectators if not spectator.anon
    )
    anons: tuple = ()
    anon: int = sum(1 for user in spectated.spectators if user.anon)

    cnt: int = len(spectated.spectators)
    if cnt > MAX_NAMED_SPECTATORS:
        spectators: str = str(cnt)
    else:
        if anon > 0:
            anons: tuple = ("Anonymous(%s)" % anon,)
        spectators = ", ".join(chain(spectators, anons))
    return {"type": "spectators", "spectators": spectators}
