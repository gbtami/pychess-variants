from __future__ import annotations

from typing import TYPE_CHECKING

from const import (
    LANGUAGES,
    LOBBY_SPOTLIGHTS_MAX,
    T_CREATED,
    T_STARTED,
)
from typing_defs import TournamentSpotlightItem

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState


def tournament_spotlights(
    app_state: PychessGlobalAppState, *, limit: int = LOBBY_SPOTLIGHTS_MAX
) -> list[TournamentSpotlightItem]:
    if limit <= 0:
        return []

    items: list[TournamentSpotlightItem] = []
    for tid, tournament in sorted(
        app_state.tournaments.items(), key=lambda item: item[1].starts_at
    ):
        if tournament.status == T_STARTED or tournament.status == T_CREATED:
            if tournament.frequency:
                name_key = (
                    tournament.variant + ("960" if tournament.chess960 else ""),
                    tournament.frequency,
                    tournament.system,
                )
                names = {
                    lang: app_state.tourneynames[lang].get(name_key, tournament.name)
                    for lang in LANGUAGES
                }
            else:
                names = {"en": tournament.name}

            items.append(
                {
                    "kind": "tournament",
                    "tid": tournament.id,
                    "names": names,
                    "variant": tournament.variant,
                    "chess960": tournament.chess960,
                    "nbPlayers": tournament.nb_players,
                    "startsAt": tournament.starts_at.isoformat(),
                }
            )
            if len(items) == limit:
                break
    return items
