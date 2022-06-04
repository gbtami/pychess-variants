from datetime import datetime

from const import (
    T_STARTED,
    T_CREATED,
    TOURNAMENT_SPOTLIGHTS_MAX,
)


def tournament_spotlights(tournaments):
    to_date = datetime.now().date()
    items = []
    for tid, tournament in sorted(tournaments.items(), key=lambda item: item[1].starts_at):
        if tournament.status == T_STARTED or (
            tournament.status == T_CREATED and tournament.starts_at.date() <= to_date
        ):
            items.append(
                {
                    "tid": tournament.id,
                    "name": tournament.name,
                    "variant": tournament.variant,
                    "chess960": tournament.chess960,
                    "nbPlayers": tournament.nb_players,
                    "startsAt": tournament.starts_at.isoformat(),
                }
            )
            if len(items) == TOURNAMENT_SPOTLIGHTS_MAX:
                break
    return items
