from __future__ import annotations
from typing import Collection, Protocol
from itertools import chain

from const import MAX_NAMED_SPECTATORS


class Spectator(Protocol):
    username: str
    anon: bool


class Spectated(Protocol):
    spectators: Collection[Spectator]


def spectators(spectated: Spectated) -> dict[str, str]:
    named_spectators = (
        spectator.username for spectator in spectated.spectators if not spectator.anon
    )
    anons: tuple[str, ...] = ()
    anon = sum(1 for user in spectated.spectators if user.anon)

    cnt = len(spectated.spectators)
    if cnt > MAX_NAMED_SPECTATORS:
        spectators_value = str(cnt)
    else:
        if anon > 0:
            anons = ("Anonymous(%s)" % anon,)
        spectators_value = ", ".join(chain(named_spectators, anons))
    return {"type": "spectators", "spectators": spectators_value}
