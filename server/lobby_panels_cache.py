from __future__ import annotations

from typing import TYPE_CHECKING

from const import T_ARCHIVED, T_FINISHED
from variants import C2V, VARIANTS

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from ws_types import LobbyLeaderboardEntry, TournamentWinnerEntry


def rebuild_lobby_leaderboard_cache(app_state: PychessGlobalAppState, limit: int = 12) -> bool:
    leaderboard: list["LobbyLeaderboardEntry"] = []
    for variant_key, scores in app_state.highscore.items():
        if len(scores) == 0:
            continue
        top_entry = scores.peekitem(0)
        identity = str(top_entry[0])
        rating = int(top_entry[1])
        username, sep, title = identity.partition("|")
        leaderboard.append(
            {
                "variant": variant_key.removesuffix("960"),
                "chess960": variant_key.endswith("960"),
                "username": username,
                "title": title if sep else "",
                "rating": rating,
            }
        )

    leaderboard.sort(key=lambda entry: entry["rating"], reverse=True)
    updated_leaderboard = leaderboard[:limit]
    if updated_leaderboard == app_state.lobby_leaderboard:
        return False
    app_state.lobby_leaderboard = updated_leaderboard
    return True


async def refresh_lobby_leaderboard_cache(
    app_state: PychessGlobalAppState, limit: int = 12
) -> bool:
    changed = rebuild_lobby_leaderboard_cache(app_state, limit=limit)
    if changed:
        await app_state.lobby.lobby_broadcast(
            {"type": "leaderboard", "items": app_state.lobby_leaderboard}
        )
    return changed


async def rebuild_lobby_tournament_winners_cache(
    app_state: PychessGlobalAppState, limit: int = 12
) -> bool:
    if app_state.db is None:
        changed = len(app_state.lobby_tournament_winners) > 0
        app_state.lobby_tournament_winners = []
        return changed

    filter_cond = {
        "status": {"$in": [T_FINISHED, T_ARCHIVED]},
        "winner": {"$exists": True},
        "nbGames": {"$gt": 0},
        "nbPlayers": {"$gte": 3},
    }
    projection = {"_id": 1, "winner": 1, "name": 1, "v": 1, "z": 1, "startsAt": 1}
    cursor = app_state.db.tournament.find(
        filter_cond, projection=projection, sort=[("startsAt", -1)]
    )

    rows: list[tuple[str, bool, str, str, str]] = []
    usernames: set[str] = set()
    async for doc in cursor:
        variant_code = doc.get("v")
        if not isinstance(variant_code, str):
            continue
        variant_name = C2V.get(variant_code)
        if variant_name is None:
            continue
        chess960 = bool(doc.get("z", 0))
        variant_key = variant_name + ("960" if chess960 else "")
        if variant_key not in VARIANTS:
            continue

        winner = doc.get("winner")
        if not isinstance(winner, str) or winner == "":
            continue

        tournament_name = doc.get("name", "")
        if not isinstance(tournament_name, str):
            tournament_name = str(tournament_name)

        rows.append((variant_name, chess960, winner, str(doc["_id"]), tournament_name))
        usernames.add(winner)
        if len(rows) >= limit:
            break

    titles = await app_state.public_users.get_titles(usernames)
    winners: list["TournamentWinnerEntry"] = []
    for variant, chess960, username, tid, tournament_name in rows:
        winners.append(
            {
                "variant": variant,
                "chess960": chess960,
                "username": username,
                "title": titles.get(username, ""),
                "tid": tid,
                "tournament": tournament_name,
            }
        )

    if winners == app_state.lobby_tournament_winners:
        return False
    app_state.lobby_tournament_winners = winners
    return True


async def refresh_lobby_tournament_winners_cache(
    app_state: PychessGlobalAppState, limit: int = 12
) -> bool:
    changed = await rebuild_lobby_tournament_winners_cache(app_state, limit=limit)
    if changed:
        await app_state.lobby.lobby_broadcast(
            {"type": "tournament_winners", "items": app_state.lobby_tournament_winners}
        )
    return changed
