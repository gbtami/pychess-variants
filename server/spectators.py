from __future__ import annotations
from typing import Collection, Protocol
from itertools import chain

from const import MAX_NAMED_SPECTATORS


class Spectator(Protocol):
    username: str
    anon: bool


def spectators(spectators_list: Collection[Spectator]) -> dict[str, str]:
    named_spectators = (spectator.username for spectator in spectators_list if not spectator.anon)
    anons: tuple[str, ...] = ()
    anon = sum(1 for user in spectators_list if user.anon)

    cnt = len(spectators_list)
    if cnt > MAX_NAMED_SPECTATORS:
        spectators_value = str(cnt)
    else:
        if anon > 0:
            anons = ("Anonymous(%s)" % anon,)
        spectators_value = ", ".join(chain(named_spectators, anons))
    return {"type": "spectators", "spectators": spectators_value}
