from __future__ import annotations
from const import (
    LANGUAGES,
    T_STARTED,
    T_CREATED,
    TOURNAMENT_SPOTLIGHTS_MAX,
)
from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState


def tournament_spotlights(app_state: PychessGlobalAppState):
    items = []
    for tid, tournament in sorted(
        app_state.tournaments.items(), key=lambda item: item[1].starts_at
    ):
        if tournament.status == T_STARTED or tournament.status == T_CREATED:
            if tournament.frequency:
                names = {
                    lang: app_state.tourneynames[lang][
                        (
                            tournament.variant + ("960" if tournament.chess960 else ""),
                            tournament.frequency,
                            tournament.system,
                        )
                    ]
                    for lang in LANGUAGES
                }
            else:
                names = {"en": tournament.name}

            items.append(
                {
                    "tid": tournament.id,
                    "names": names,
                    "variant": tournament.variant,
                    "chess960": tournament.chess960,
                    "nbPlayers": tournament.nb_players,
                    "startsAt": tournament.starts_at.isoformat(),
                }
            )
            if len(items) == TOURNAMENT_SPOTLIGHTS_MAX:
                break
    return items
