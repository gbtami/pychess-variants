from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from const import LOBBY_SPOTLIGHTS_MAX, T_CREATED
from tournament.tournament_spotlights import tournament_spotlights
from typing_defs import SimulSpotlightItem, SpotlightItem
from ws_types import SpotlightsMessage

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from simul.simul import Simul


# Lichess only keeps created simuls eligible for its homepage spotlight during
# their first hour. It also requires the host to have pinged the simul recently.
# PyChess can use the live simul websocket directly instead of adding a second
# host-ping endpoint: while the host has this simul open, a socket is present.
SIMUL_SPOTLIGHT_MAX_AGE = timedelta(hours=1)


def _simul_host_is_around(simul: Simul) -> bool:
    host = simul.players.get(simul.created_by)
    if host is None:
        return False
    return bool(host.simul_sockets.get(simul.id))


def simul_spotlight(app_state: PychessGlobalAppState) -> SimulSpotlightItem | None:
    cutoff = datetime.now(UTC) - SIMUL_SPOTLIGHT_MAX_AGE
    candidates = sorted(
        app_state.simuls.values(),
        key=lambda simul: simul.created_at,
        reverse=True,
    )
    for simul in candidates:
        if (
            simul.status != T_CREATED
            or not simul.featurable
            or simul.created_at < cutoff
            or not _simul_host_is_around(simul)
        ):
            continue

        return {
            "kind": "simul",
            "sid": simul.id,
            "name": simul.name,
            "variants": list(simul.variants),
            # Lichess shows the number of applicants, not the host. PyChess
            # stores accepted and pending applicants separately.
            "nbPlayers": simul.opponent_count + len(simul.pending_players),
        }
    return None


def lobby_spotlights(app_state: PychessGlobalAppState) -> list[SpotlightItem]:
    """Build the homepage spotlight list using the same slot policy as Lichess.

    At most one live, featurable created simul takes one of the three ordinary
    tournament spotlight slots. The simul is rendered after the tournaments.
    """
    simul = simul_spotlight(app_state)
    tournament_limit = LOBBY_SPOTLIGHTS_MAX - (1 if simul is not None else 0)
    items: list[SpotlightItem] = list(tournament_spotlights(app_state, limit=tournament_limit))
    if simul is not None:
        items.append(simul)
    return items


async def broadcast_lobby_spotlights(app_state: PychessGlobalAppState) -> None:
    response: SpotlightsMessage = {"type": "spotlights", "items": lobby_spotlights(app_state)}
    await app_state.lobby.lobby_broadcast(response)
