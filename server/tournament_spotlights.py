from const import (
    LANGUAGES,
    T_STARTED,
    T_CREATED,
    TOURNAMENT_SPOTLIGHTS_MAX,
)


def tournament_spotlights(app):
    tournaments = app["tournaments"]
    items = []
    for tid, tournament in sorted(tournaments.items(), key=lambda item: item[1].starts_at):
        if tournament.status == T_STARTED or tournament.status == T_CREATED:
            if tournament.frequency:
                names = {
                    lang: app["tourneynames"][lang][
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
