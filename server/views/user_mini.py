from __future__ import annotations

import logging
from datetime import MINYEAR, datetime
from time import monotonic

from aiohttp import web
import aiohttp_session

from const import ANON_PREFIX, DARK_FEN, STARTED
from glicko2.glicko2 import PROVISIONAL_PHI
from pychess_global_app_state_utils import get_app_state
from public_users import PublicProfile
from json_utils import json_response
from typing_defs import PerfEntry
from variants import C2V, TWO_BOARD_VARIANT_CODES, VARIANTS, get_server_variant


log = logging.getLogger(__name__)
SLOW_USER_MINI_MS = 250.0
SLOW_USER_MINI_PLAYING_QUERY_MS = 100.0


def _elapsed_ms(started_at: float) -> float:
    return (monotonic() - started_at) * 1000.0


def _sort_perfs_by_activity(item: tuple[str, PerfEntry]) -> tuple[int, float, str]:
    key, perf = item
    last_activity = perf.get("la")
    if isinstance(last_activity, datetime):
        last_ts = last_activity.timestamp()
    else:
        last_ts = 0.0
    return (-perf.get("nb", 0), -last_ts, key)


def _thread_id(user1: str, user2: str) -> str:
    first, second = sorted((user1, user2), key=lambda x: (x.lower(), x))
    return f"{first}:{second}"


def _joined_at_for_payload(created_at: datetime) -> datetime | None:
    # Year 1 is used internally as a sentinel for "unknown creation time".
    if created_at.year <= MINYEAR:
        return None
    return created_at


def _select_best8_perfs_by_activity(profile: PublicProfile) -> list[dict[str, object]]:
    # PyChess variants are broadly distributed, so use pure activity ranking
    # instead of fixed anchor variants.
    played_perfs = [
        (key, perf)
        for key, perf in profile.perfs.items()
        if key in VARIANTS and perf.get("nb", 0) > 0
    ]
    played_perfs.sort(key=_sort_perfs_by_activity)

    result: list[dict[str, object]] = []
    for key, perf in played_perfs[:8]:
        gl = perf["gl"]
        rating = int(round(gl["r"], 0))
        provisional = bool(gl["d"] > PROVISIONAL_PHI)
        result.append(
            {
                "variant": key,
                "rating": rating,
                "provisional": provisional,
                "nb": perf.get("nb", 0),
            }
        )
    return result


async def _build_vs_score_payload(
    profile_id: str, session_user: str | None, request: web.Request
) -> dict[str, int] | None:
    if session_user is None or session_user == profile_id or session_user.startswith(ANON_PREFIX):
        return None

    app_state = get_app_state(request.app)
    if app_state.db is None:
        return None

    if session_user < profile_id:
        s1_player, s2_player = session_user, profile_id
    else:
        s1_player, s2_player = profile_id, session_user
    ct_id = f"{s1_player}/{s2_player}"

    crosstable = await app_state.db.crosstable.find_one(
        {"_id": ct_id},
        projection={"s1": 1, "s2": 1},
    )
    if crosstable is None:
        return None

    s1_score = int(crosstable.get("s1", 0) or 0)
    s2_score = int(crosstable.get("s2", 0) or 0)
    if session_user == s1_player:
        return {"mineTenths": s1_score, "oppTenths": s2_score}
    return {"mineTenths": s2_score, "oppTenths": s1_score}


async def _build_playing_payload(profile_id: str, request: web.Request) -> dict[str, object] | None:
    app_state = get_app_state(request.app)

    live_user = app_state.users.data.get(profile_id)
    if live_user is not None and live_user.game_in_progress is not None:
        game = app_state.games.get(live_user.game_in_progress)
        if game is not None and game.status == STARTED and not game.server_variant.two_boards:
            if game.server_variant.hidden_info:
                return None
            return {
                "gameId": game.id,
                "url": f"/{game.id}",
                "variant": f"{game.variant}{'960' if game.chess960 else ''}",
                "fen": DARK_FEN if game.variant == "fogofwar" else game.fen,
                "lastMove": "" if game.variant == "fogofwar" else game.lastmove,
                "w": game.wplayer.username,
                "wTitle": game.wplayer.title,
                "b": game.bplayer.username,
                "bTitle": game.bplayer.title,
                "orientation": "white" if profile_id == game.wplayer.username else "black",
            }

    if app_state.db is None:
        return None

    query_started_at = monotonic()
    doc = await app_state.db.game.find_one(
        {
            "us": profile_id,
            "s": STARTED,
            "v": {"$nin": list(TWO_BOARD_VARIANT_CODES)},
        },
        projection={
            "_id": 1,
            "v": 1,
            "z": 1,
            "m": {"$slice": -1},
            "us": 1,
            "f": 1,
        },
        sort=[("d", -1)],
    )
    query_ms = _elapsed_ms(query_started_at)
    if query_ms >= SLOW_USER_MINI_PLAYING_QUERY_MS:
        log.info("slow user mini active-game lookup profile=%s query=%.1fms", profile_id, query_ms)
    if doc is None:
        return None

    variant = C2V.get(doc.get("v", ""))
    if variant is None:
        return None

    chess960 = bool(doc.get("z", 0))
    server_variant = get_server_variant(variant, chess960)
    if server_variant.hidden_info:
        return None

    moves = doc.get("m")
    last_move = ""
    if isinstance(moves, list) and len(moves) > 0:
        try:
            last_move = server_variant.move_decoding(moves[-1])
        except Exception:
            last_move = ""

    users = doc.get("us", [])
    if not isinstance(users, list) or len(users) < 2:
        return None

    titles = await app_state.public_users.get_titles(users[:2])
    white = str(users[0])
    black = str(users[1])

    return {
        "gameId": doc["_id"],
        "url": f"/{doc['_id']}",
        "variant": f"{variant}{'960' if chess960 else ''}",
        "fen": DARK_FEN if variant == "fogofwar" else doc.get("f", ""),
        "lastMove": "" if variant == "fogofwar" else last_move,
        "w": white,
        "wTitle": titles.get(white, ""),
        "b": black,
        "bTitle": titles.get(black, ""),
        "orientation": "white" if profile_id == white else "black",
    }


async def _can_message_profile(
    profile: PublicProfile,
    profile_id: str,
    session_user: str | None,
    request: web.Request,
) -> bool:
    if session_user is None or session_user == profile_id:
        return False
    if session_user.startswith(ANON_PREFIX) or profile.username.startswith(ANON_PREFIX):
        return False
    if session_user in profile.blocked:
        return False

    app_state = get_app_state(request.app)
    me = await app_state.users.get(session_user)
    if profile_id in me.blocked:
        return False
    if not profile.pm_friends_only:
        return True
    if profile_id in me.following:
        return True
    if app_state.db is None:
        return False

    existing = await app_state.db.inbox_thread.find_one(
        {"_id": _thread_id(session_user, profile_id), "deletedBy": {"$ne": profile_id}},
        projection={"_id": 1},
    )
    return existing is not None


async def _follow_state_for_profile(
    profile: PublicProfile,
    profile_id: str,
    session_user: str | None,
    request: web.Request,
) -> tuple[bool, bool]:
    if session_user is None or session_user == profile_id:
        return (False, False)
    if session_user.startswith(ANON_PREFIX) or profile.username.startswith(ANON_PREFIX):
        return (False, False)
    if profile.bot:
        return (False, False)
    if session_user in profile.blocked:
        return (False, False)

    app_state = get_app_state(request.app)
    me = await app_state.users.get(session_user)
    if profile_id in me.blocked:
        return (False, False)
    return (True, profile_id in me.following)


async def user_mini(request: web.Request) -> web.StreamResponse:
    request_started_at = monotonic()
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]

    # ensure request has a session user for parity with other site requests
    session = await aiohttp_session.get_session(request)
    session_user_value = session.get("user_name")
    session_user = session_user_value if isinstance(session_user_value, str) else None

    profile_started_at = monotonic()
    profile = await app_state.public_users.get_profile(profile_id)
    profile_ms = _elapsed_ms(profile_started_at)
    if profile is None or not profile.enabled:
        raise web.HTTPNotFound()

    live_user = app_state.users.data.get(profile_id)
    online = bool(live_user.online) if live_user is not None else False

    can_message_started_at = monotonic()
    can_message = await _can_message_profile(profile, profile_id, session_user, request)
    can_message_ms = _elapsed_ms(can_message_started_at)

    vs_score_started_at = monotonic()
    vs_score = await _build_vs_score_payload(profile_id, session_user, request)
    vs_score_ms = _elapsed_ms(vs_score_started_at)

    perfs_started_at = monotonic()
    perfs = _select_best8_perfs_by_activity(profile)
    perfs_ms = _elapsed_ms(perfs_started_at)

    playing_started_at = monotonic()
    playing = await _build_playing_payload(profile_id, request)
    playing_ms = _elapsed_ms(playing_started_at)

    can_follow_started_at = monotonic()
    can_follow, following = await _follow_state_for_profile(
        profile, profile_id, session_user, request
    )
    can_follow_ms = _elapsed_ms(can_follow_started_at)

    payload: dict[str, object] = {
        "username": profile.username,
        "title": profile.title,
        "online": online,
        "canMessage": can_message,
        "joinedAt": _joined_at_for_payload(profile.created_at),
        "count": profile.count,
        "vsScore": vs_score,
        "perfs": perfs,
        "playing": playing,
        "canFollow": can_follow,
        "following": following,
    }

    total_ms = _elapsed_ms(request_started_at)
    if total_ms >= SLOW_USER_MINI_MS:
        log.info(
            "slow user mini profile=%s total=%.1fms profile=%.1fms "
            "can_message=%.1fms vs_score=%.1fms perfs=%.1fms playing=%.1fms "
            "can_follow=%.1fms",
            profile_id,
            total_ms,
            profile_ms,
            can_message_ms,
            vs_score_ms,
            perfs_ms,
            playing_ms,
            can_follow_ms,
        )

    return json_response(payload)
