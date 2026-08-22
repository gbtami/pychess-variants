from __future__ import annotations

import hashlib
import hmac
from typing import TYPE_CHECKING, Any, cast

from const import T_ABORTED, T_CREATED
from settings import SECRET_KEY
from user import User

from tournament.rr import RRTournament
from tournament.rr.arrangements import (
    ARR_STATUS_CHALLENGED,
    ARR_STATUS_FINISHED,
    ARR_STATUS_PENDING,
    ARR_STATUS_STARTED,
)
from tournament.tournament import ByeGame, GameData, Tournament, player_json

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState


TOURNAMENT_ERASED_USER_PREFIX = "!erased-"


def tournament_erased_user(tournament_id: str, username: str) -> str:
    """Return a stable, non-loginable ghost unique to this user/tournament pair."""
    message = f"tournament-gdpr:{tournament_id}:{username}".encode()
    digest = hmac.new(SECRET_KEY, message, hashlib.sha256).hexdigest()[:12]
    return f"{TOURNAMENT_ERASED_USER_PREFIX}{digest}"


def _rr_arrangement_id(tournament_id: str, white: str, black: str) -> str:
    return f"{tournament_id}:{white}:{black}"


def _replace_game_data_username(game: GameData, username: str, ghost: str) -> None:
    if game.wname == username:
        game.wname = ghost
        game._wplayer.username = ghost
        game._wplayer.title = ""
    if game.bname == username:
        game.bname = ghost
        game._bplayer.username = ghost
        game._bplayer.title = ""


def _scrub_loaded_game_history(tournament: Tournament, username: str, ghost: str) -> None:
    seen: set[int] = set()
    for player_data in tournament.players.values():
        for game in player_data.games:
            if isinstance(game, ByeGame) or not isinstance(game, GameData):
                continue
            game_identity = id(game)
            if game_identity in seen:
                continue
            seen.add(game_identity)
            _replace_game_data_username(game, username, ghost)


def _remove_loaded_created_player(tournament: Tournament, username: str) -> None:
    player = tournament.get_player_by_name(username)
    player_data = tournament.player_data_by_name(username)

    if tournament.pop_leaderboard_player_by_username(username) is not None:
        tournament.nb_players = max(0, tournament.nb_players - 1)

    if player is not None:
        tournament.players.pop(player, None)
    if player_data is not None:
        for key, value in tuple(tournament.players.items()):
            if value is player_data:
                tournament.players.pop(key, None)

    tournament.players_by_name.pop(username, None)
    tournament.player_keys_by_name.pop(username, None)
    tournament.bye_players = [
        player for player in tournament.bye_players if player.username != username
    ]
    tournament.spectators = {
        spectator for spectator in tournament.spectators if spectator.username != username
    }

    sockets = tournament.app_state.tourneysockets.get(tournament.id)
    if sockets is not None:
        sockets.pop(username, None)

    tournament.rr_pending_players.discard(username)
    tournament.rr_denied_players.discard(username)

    if isinstance(tournament, RRTournament):
        removed_arrangement_ids = {
            arrangement_id
            for arrangement_id, arrangement in tournament.arrangements.items()
            if arrangement.involves(username)
        }
        for arrangement_id in removed_arrangement_ids:
            _remove_loaded_rr_seeks(tournament.app_state, arrangement_id)
        _remove_loaded_rr_notifications(tournament.app_state, removed_arrangement_ids)
        tournament.arrangements = {
            arrangement_id: arrangement
            for arrangement_id, arrangement in tournament.arrangements.items()
            if arrangement_id not in removed_arrangement_ids
        }
        if tournament.status == T_CREATED:
            tournament.sync_projected_arrangements()


def _anonymize_loaded_player(tournament: Tournament, username: str, ghost: str) -> None:
    player = tournament.get_player_by_name(username)
    player_data = tournament.player_data_by_name(username)
    if player_data is None:
        _scrub_loaded_game_history(tournament, username, ghost)
        return

    leaderboard_player = tournament.leaderboard_player_by_username(username)
    leaderboard_score = (
        tournament.leaderboard.get(leaderboard_player, 0)
        if leaderboard_player is not None
        else None
    )

    if player is not None:
        tournament.players.pop(player, None)
    if leaderboard_player is not None:
        tournament.leaderboard.pop(leaderboard_player, None)

    tournament.players_by_name.pop(username, None)
    tournament.player_keys_by_name.pop(username, None)

    ghost_user = User(tournament.app_state, username=ghost, enabled=False)
    tournament.app_state.users[ghost] = ghost_user
    player_data.username = ghost
    player_data.title = ""
    tournament.register_player(ghost_user, player_data)
    if leaderboard_score is not None:
        tournament.leaderboard.update({ghost_user: leaderboard_score})

    # An already-running game may still complete using the original Game user object.
    # Keep an internal lookup alias until the tournament object is evicted/reloaded so
    # its result can still be applied to the anonymized PlayerData. Public tournament
    # payloads use the ghost leaderboard/player identity above.
    if any(username in tournament.game_player_usernames(game) for game in tournament.ongoing_games):
        tournament.players_by_name[username] = player_data
        tournament.player_keys_by_name[username] = ghost_user

    _scrub_loaded_game_history(tournament, username, ghost)


def _remove_loaded_rr_notifications(
    app_state: PychessGlobalAppState, arrangement_ids: set[str]
) -> None:
    if not arrangement_ids:
        return
    for user in app_state.users.data.values():
        if user.notifications is None:
            continue
        user.notifications[:] = [
            notification
            for notification in user.notifications
            if notification.get("content", {}).get("arr") not in arrangement_ids
        ]


def _remove_loaded_rr_seeks(app_state: PychessGlobalAppState, arrangement_id: str) -> None:
    removed_seek_ids: set[str] = set()
    for seek_id, seek in tuple(app_state.seeks.items()):
        if seek.rr_arrangement_id != arrangement_id:
            continue
        removed_seek_ids.add(seek_id)
        app_state.seeks.pop(seek_id, None)
        seek.creator.seeks.pop(seek_id, None)
        if seek.game_id is not None:
            app_state.invites.pop(seek.game_id, None)

    for invite_id, seek in tuple(app_state.invites.items()):
        if seek.rr_arrangement_id != arrangement_id:
            continue
        app_state.invites.pop(invite_id, None)
        if seek.id not in removed_seek_ids:
            app_state.seeks.pop(seek.id, None)
            seek.creator.seeks.pop(seek.id, None)


def _rewrite_loaded_notifications(
    app_state: PychessGlobalAppState,
    old_arrangement_id: str,
    new_arrangement_id: str,
    username: str,
    ghost: str,
) -> None:
    for user in app_state.users.data.values():
        if user.notifications is None:
            continue
        for notification in user.notifications:
            content = notification.get("content")
            if not isinstance(content, dict) or content.get("arr") != old_arrangement_id:
                continue
            content["arr"] = new_arrangement_id
            if content.get("opp") == username:
                content["opp"] = ghost


def _scrub_loaded_rr_arrangements(tournament: RRTournament, username: str, ghost: str) -> None:
    rewritten: dict[str, Any] = {}
    for old_arrangement_id, arrangement in tuple(tournament.arrangements.items()):
        participant_erased = arrangement.involves(username)
        challenger_erased = arrangement.challenger == username
        if not participant_erased and not challenger_erased:
            rewritten[old_arrangement_id] = arrangement
            continue

        if arrangement.white == username:
            arrangement.white = ghost
        if arrangement.black == username:
            arrangement.black = ghost

        if arrangement.status in (ARR_STATUS_STARTED, ARR_STATUS_FINISHED):
            if challenger_erased:
                arrangement.challenger = ghost
        else:
            arrangement.challenger = None
            arrangement.invite_id = None
            if arrangement.status == ARR_STATUS_CHALLENGED:
                arrangement.status = ARR_STATUS_PENDING
            _remove_loaded_rr_seeks(tournament.app_state, old_arrangement_id)

        new_arrangement_id = old_arrangement_id
        if participant_erased:
            new_arrangement_id = _rr_arrangement_id(
                tournament.id, arrangement.white, arrangement.black
            )
            arrangement.id = new_arrangement_id
            for game in tournament.app_state.games.values():
                if getattr(game, "tournamentArrangementId", None) == old_arrangement_id:
                    cast(Any, game).tournamentArrangementId = new_arrangement_id

        _rewrite_loaded_notifications(
            tournament.app_state,
            old_arrangement_id,
            new_arrangement_id,
            username,
            ghost,
        )
        rewritten[new_arrangement_id] = arrangement

    tournament.arrangements = rewritten


def _scrub_loaded_tournament(
    tournament: Tournament,
    username: str,
    ghost: str,
    *,
    remove_unstarted_player: bool,
) -> None:
    if tournament.created_by == username:
        tournament.created_by = ghost
    if tournament.winner == username:
        tournament.winner = ghost

    tournament.rr_pending_players.discard(username)
    tournament.rr_denied_players.discard(username)

    if remove_unstarted_player:
        _remove_loaded_created_player(tournament, username)
    else:
        _anonymize_loaded_player(tournament, username, ghost)

    if isinstance(tournament, RRTournament):
        _scrub_loaded_rr_arrangements(tournament, username, ghost)

    player_json.cache_clear()


async def _affected_tournament_ids(db: Any, username: str) -> set[str]:
    tournament_ids: set[str] = set()

    async def collect(collection: Any, query: dict[str, object]) -> None:
        cursor = collection.find(query, projection={"_id": 0, "tid": 1})
        async for doc in cursor:
            tournament_id = doc.get("tid")
            if isinstance(tournament_id, str) and tournament_id:
                tournament_ids.add(tournament_id)

    cursor = db.tournament.find(
        {"$or": [{"createdBy": username}, {"winner": username}]}, projection={"_id": 1}
    )
    async for doc in cursor:
        tournament_id = doc.get("_id")
        if isinstance(tournament_id, str) and tournament_id:
            tournament_ids.add(tournament_id)

    await collect(db.tournament_player, {"uid": username})
    await collect(db.tournament_pairing, {"u": username})
    await collect(
        db.tournament_arrangement,
        {"$or": [{"u": username}, {"ch": username}]},
    )
    return tournament_ids


async def _has_tournament_game_history(db: Any, tournament_id: str, username: str) -> bool:
    pairing = await db.tournament_pairing.find_one(
        {"tid": tournament_id, "u": username}, projection={"_id": 1}
    )
    if pairing is not None:
        return True
    arrangement = await db.tournament_arrangement.find_one(
        {
            "tid": tournament_id,
            "u": username,
            "$or": [
                {"s": {"$in": [ARR_STATUS_STARTED, ARR_STATUS_FINISHED]}},
                {"gid": {"$nin": [None, ""]}},
            ],
        },
        projection={"_id": 1},
    )
    return arrangement is not None


async def _delete_unstarted_arrangements(db: Any, tournament_id: str, username: str) -> None:
    arrangement_ids = [
        doc["_id"]
        async for doc in db.tournament_arrangement.find(
            {
                "tid": tournament_id,
                "$or": [{"u": username}, {"c": username}],
            },
            projection={"_id": 1},
        )
    ]
    if arrangement_ids:
        await db.seek.delete_many({"rrArrangementId": {"$in": arrangement_ids}})
        await db.notify.delete_many({"content.arr": {"$in": arrangement_ids}})
        await db.tournament_arrangement.delete_many({"_id": {"$in": arrangement_ids}})
    await db.tournament_arrangement.update_many(
        {"tid": tournament_id, "ch": username}, {"$set": {"ch": "", "iid": ""}}
    )


async def _rewrite_pairing_users(db: Any, tournament_id: str, username: str, ghost: str) -> None:
    cursor = db.tournament_pairing.find(
        {"tid": tournament_id, "u": username}, projection={"_id": 1, "u": 1}
    )
    async for doc in cursor:
        users = doc.get("u")
        if not isinstance(users, (list, tuple)):
            continue
        rewritten = [ghost if user == username else user for user in users]
        await db.tournament_pairing.update_one({"_id": doc["_id"]}, {"$set": {"u": rewritten}})


async def _rewrite_arrangement_users(
    db: Any, tournament_id: str, username: str, ghost: str
) -> None:
    cursor = db.tournament_arrangement.find(
        {
            "tid": tournament_id,
            "$or": [{"u": username}, {"ch": username}],
        }
    )
    async for doc in cursor:
        old_arrangement_id = str(doc["_id"])
        users = doc.get("u")
        participant_erased = isinstance(users, (list, tuple)) and username in users
        challenger_erased = doc.get("ch") == username

        rewritten_doc = dict(doc)
        if participant_erased:
            rewritten_users = [ghost if user == username else user for user in users]
            rewritten_doc["u"] = rewritten_users
            colors = doc.get("c")
            if isinstance(colors, (list, tuple)):
                rewritten_doc["c"] = [ghost if user == username else user for user in colors]
        else:
            rewritten_users = list(users) if isinstance(users, (list, tuple)) else []

        status = doc.get("s")
        if status in (ARR_STATUS_STARTED, ARR_STATUS_FINISHED):
            if challenger_erased:
                rewritten_doc["ch"] = ghost
        else:
            rewritten_doc["ch"] = ""
            rewritten_doc["iid"] = ""
            if status == ARR_STATUS_CHALLENGED:
                rewritten_doc["s"] = ARR_STATUS_PENDING

        new_arrangement_id = old_arrangement_id
        if participant_erased and len(rewritten_users) == 2:
            new_arrangement_id = _rr_arrangement_id(
                tournament_id, str(rewritten_users[0]), str(rewritten_users[1])
            )
            rewritten_doc["_id"] = new_arrangement_id

        # Create/update the anonymized arrangement before deleting the old key. This
        # ordering plus the deterministic ghost makes retries safe after partial work.
        await db.tournament_arrangement.replace_one(
            {"_id": new_arrangement_id}, rewritten_doc, upsert=True
        )

        if new_arrangement_id != old_arrangement_id:
            await db.game.update_many(
                {"aid": old_arrangement_id}, {"$set": {"aid": new_arrangement_id}}
            )
            await db.seek.delete_many({"rrArrangementId": old_arrangement_id})
            await db.notify.update_many(
                {"content.arr": old_arrangement_id},
                {"$set": {"content.arr": new_arrangement_id}},
            )
            await db.notify.update_many(
                {"content.arr": new_arrangement_id, "content.opp": username},
                {"$set": {"content.opp": ghost}},
            )
            await db.tournament_arrangement.delete_one({"_id": old_arrangement_id})
        elif challenger_erased:
            await db.notify.update_many(
                {"content.arr": old_arrangement_id, "content.opp": username},
                {"$set": {"content.opp": ghost}},
            )


async def erase_user_from_tournaments(app_state: PychessGlobalAppState, username: str) -> None:
    """Erase tournament-specific identity while preserving played history.

    Each started/finished tournament gets a pseudonymous ghost derived from the
    tournament/user pair with the server secret. This preserves player, pairing, and
    RR arrangement relationships without exposing a stable cross-tournament identity,
    and makes interrupted migrations safe to retry. Before start, a participant has no
    game history to preserve and is removed instead. A not-yet-started tournament owned
    by the erased account is aborted and its creator is anonymized.
    """
    db = app_state.db
    if db is None:
        return

    tournament_ids = await _affected_tournament_ids(db, username)
    for tournament_id in tournament_ids:
        tournament_doc = await db.tournament.find_one({"_id": tournament_id})
        if tournament_doc is None:
            continue

        ghost = tournament_erased_user(tournament_id, username)
        status = int(tournament_doc.get("status", T_ABORTED))
        created = status == T_CREATED
        has_game_history = (
            await _has_tournament_game_history(db, tournament_id, username) if created else True
        )
        remove_unstarted_player = created and not has_game_history
        owned_unstarted = created and tournament_doc.get("createdBy") == username

        loaded = app_state.tournaments.get(tournament_id)
        if loaded is not None:
            _scrub_loaded_tournament(
                loaded,
                username,
                ghost,
                remove_unstarted_player=remove_unstarted_player,
            )

        # Clear non-historical roster state first while another durable identity
        # reference still exists, so an interrupted erasure remains discoverable.
        await db.tournament.update_one(
            {"_id": tournament_id},
            {
                "$pull": {
                    "rrPendingPlayers": username,
                    "rrDeniedPlayers": username,
                }
            },
        )

        if remove_unstarted_player:
            active_players = await db.tournament_player.count_documents(
                {
                    "tid": tournament_id,
                    "uid": {"$ne": username},
                    "wd": {"$ne": True},
                }
            )
            await db.tournament.update_one(
                {"_id": tournament_id}, {"$set": {"nbPlayers": active_players}}
            )
            if loaded is not None:
                loaded.nb_players = active_players

            # Remove links before the player row. The player identity is intentionally
            # the last participant reference removed, acting as a retry marker if any
            # earlier cleanup is interrupted.
            await _delete_unstarted_arrangements(db, tournament_id, username)
            await db.tournament_pairing.delete_many({"tid": tournament_id, "u": username})
            await db.tournament_player.delete_many({"tid": tournament_id, "uid": username})
        else:
            # Preserve structural history. Rewrite dependent records before the player
            # row so the original uid remains a retry marker until all links are safe.
            await _rewrite_pairing_users(db, tournament_id, username, ghost)
            await _rewrite_arrangement_users(db, tournament_id, username, ghost)
            await db.tournament_player.update_many(
                {"tid": tournament_id, "uid": username}, {"$set": {"uid": ghost}}
            )

        # Keep createdBy/winner as the final retry markers for organizer/winner-only
        # erasures. For a loaded created event, abort after participant cleanup but
        # before removing the durable creator reference.
        if owned_unstarted and loaded is not None:
            await loaded.abort()

        tournament_set: dict[str, object] = {}
        if tournament_doc.get("createdBy") == username:
            tournament_set["createdBy"] = ghost
        if tournament_doc.get("winner") == username:
            tournament_set["winner"] = ghost
        if owned_unstarted:
            tournament_set["status"] = T_ABORTED
        if tournament_set:
            await db.tournament.update_one({"_id": tournament_id}, {"$set": tournament_set})
