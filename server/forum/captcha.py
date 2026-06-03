from __future__ import annotations

import asyncio
import inspect
import logging
import random
from datetime import datetime, timezone

import aiohttp_session
from aiohttp import web

from const import GAME_CATEGORY_ALL, normalize_game_category
from convert import mirror5, mirror9, zero2grand
from fairy.fairy_board import FairyBoard
from pychess_global_app_state_utils import get_app_state
from variants import C2V, GRANDS, VARIANTS

from forum.constants import (
    FORUM_CAPTCHA_BY_GAME_ID,
    FORUM_CAPTCHA_FALLBACK_BY_CATEGORY,
    FORUM_CAPTCHA_FALLBACK_BY_VARIANT,
    FORUM_CAPTCHA_GAME_BASE_QUERY,
    FORUM_CAPTCHA_LAST_REFRESH,
    FORUM_CAPTCHA_LOCKS,
    FORUM_CAPTCHA_POOL_BY_CATEGORY,
    FORUM_CAPTCHA_POOL_CAPACITY,
    FORUM_CAPTCHA_REFRESH_SECONDS,
    FORUM_CAPTCHA_SAMPLE_SIZE,
    FORUM_CAPTCHA_TARGET_PER_REFRESH,
    FORUM_CAPTCHA_VARIANT_BY_CATEGORY,
)
from forum.utils import (
    captcha_moves_map,
    normalize_captcha_solution,
    json_response,
    uci_orig_dest,
)

log = logging.getLogger(__name__)


def _captcha_lock(game_category: str) -> asyncio.Lock:
    lock = FORUM_CAPTCHA_LOCKS.get(game_category)
    if lock is None:
        lock = asyncio.Lock()
        FORUM_CAPTCHA_LOCKS[game_category] = lock
    return lock


def _captcha_from_fen(*, game_id: str, fen: str, variant: str) -> dict[str, object] | None:
    """Build a mate-in-1 captcha from a FEN using pyffish move legality."""
    board_variant = variant[:-3] if variant.endswith("960") else variant
    try:
        board = FairyBoard(board_variant, initial_fen=fen)
        legal_moves = [str(move) for move in board.legal_moves()]
    except Exception:
        return None
    if len(legal_moves) == 0:
        return None

    solutions: list[str] = []
    for move in legal_moves:
        orig_dest = uci_orig_dest(move)
        if orig_dest is None:
            continue
        if not board.push(move, append=True, raise_on_error=False):
            continue
        # After our move it is the opponent to move.
        is_mate = board.is_checked() and len(board.legal_moves()) == 0
        board.pop(remove=True)
        if is_mate:
            orig, dest = orig_dest
            solutions.append(f"{orig} {dest}")

    if len(solutions) == 0:
        return None

    color = "white" if fen.split()[1] == "w" else "black"
    moves = captcha_moves_map(legal_moves)
    if len(moves) == 0:
        return None
    return {
        "gameId": game_id,
        "variant": variant,
        "fen": fen,
        "color": color,
        "moves": moves,
        "solutions": tuple(sorted(set(solutions))),
    }


def forum_captcha_variant_for_category(game_category: str) -> str:
    """Return configured primary captcha variant for a normalized category."""
    normalized_category = normalize_game_category(game_category)
    variant = FORUM_CAPTCHA_VARIANT_BY_CATEGORY.get(
        normalized_category, FORUM_CAPTCHA_VARIANT_BY_CATEGORY[GAME_CATEGORY_ALL]
    )
    if variant in VARIANTS:
        return variant
    fallback = FORUM_CAPTCHA_VARIANT_BY_CATEGORY[GAME_CATEGORY_ALL]
    return fallback if fallback in VARIANTS else "chess"


def _forum_captcha_game_query(game_category: str) -> dict[str, object]:
    """Build Mongo game query for one category's checkmated game sampling."""
    variant = forum_captcha_variant_for_category(game_category)
    query: dict[str, object] = dict(FORUM_CAPTCHA_GAME_BASE_QUERY)
    query["v"] = VARIANTS[variant].code
    return query


def _normalize_legacy_usi_initial_fen(initial_fen: str) -> str:
    """Convert old USI SFEN orientation format to current UCI-like format."""
    parts = initial_fen.split()
    if len(parts) > 3 and parts[1] in "wb":
        pockets = "[%s]" % parts[2] if parts[2] not in "-0" else ""
        return parts[0] + pockets + (" w" if parts[1] == "b" else " b") + " 0 " + parts[3]
    if len(parts) > 1 and parts[1] in "wb":
        return parts[0] + (" w" if parts[1] == "b" else " b") + " 0"
    return initial_fen


def _decoded_game_moves_and_fen(
    doc: dict[str, object], variant: str
) -> tuple[list[str], str] | None:
    """Decode one stored game move list and return UCI/USI moves and initial FEN."""
    encoded_moves = doc.get("m")
    if not isinstance(encoded_moves, list) or len(encoded_moves) == 0:
        return None

    decode_method = VARIANTS[variant].move_decoding
    moves: list[str] = []
    for move in encoded_moves:
        if not isinstance(move, str):
            return None
        try:
            decoded = decode_method(move)
        except Exception:
            return None
        moves.append(decoded)

    initial_fen_value = doc.get("if")
    initial_fen = (
        str(initial_fen_value).strip()
        if isinstance(initial_fen_value, str) and len(initial_fen_value.strip()) > 0
        else FairyBoard.start_fen(variant)
    )

    usi_format = variant.endswith("shogi") and doc.get("uci") is None
    if usi_format:
        initial_fen = _normalize_legacy_usi_initial_fen(initial_fen)
        if variant in ("shogi", "shoshogi"):
            moves = [mirror9(move) for move in moves]
        elif variant in ("minishogi", "kyotoshogi"):
            moves = [mirror5(move) for move in moves]
    elif variant in GRANDS:
        moves = [zero2grand(move) for move in moves]

    return moves, initial_fen


def _captcha_from_game_doc(doc: dict[str, object]) -> dict[str, object] | None:
    """Convert one checkmated game document to a pre-mate mate-in-1 captcha."""
    game_id = str(doc.get("_id") or "").strip()
    code = str(doc.get("v") or "").strip()
    variant = C2V.get(code)
    if len(game_id) == 0 or variant is None or variant not in VARIANTS:
        return None

    decoded = _decoded_game_moves_and_fen(doc, variant)
    if decoded is None:
        return None
    moves, initial_fen = decoded
    if len(moves) == 0:
        return None

    board_variant = variant[:-3] if variant.endswith("960") else variant
    try:
        board = FairyBoard(board_variant, initial_fen=initial_fen)
    except Exception:
        return None

    for move in moves[:-1]:
        if not board.push(move, append=True, raise_on_error=False):
            return None

    challenge = _captcha_from_fen(game_id=game_id, fen=board.fen, variant=variant)
    if challenge is None:
        return None

    challenge["helpUrl"] = f"/{game_id}"
    return challenge


async def _refresh_forum_captcha_pool(app_state, game_category: str) -> None:
    """Refresh one category's in-memory captcha pool from checkmated game positions."""
    normalized_category = normalize_game_category(game_category)
    if app_state.db is None:
        FORUM_CAPTCHA_LAST_REFRESH[normalized_category] = datetime.now(timezone.utc)
        return

    previous_pool = FORUM_CAPTCHA_POOL_BY_CATEGORY.get(normalized_category, [])
    maybe_cursor = app_state.db.game.aggregate(
        [
            {"$match": _forum_captcha_game_query(normalized_category)},
            {"$sample": {"size": FORUM_CAPTCHA_SAMPLE_SIZE}},
            {"$project": {"_id": 1, "v": 1, "if": 1, "uci": 1, "m": 1}},
        ]
    )
    cursor = await maybe_cursor if inspect.isawaitable(maybe_cursor) else maybe_cursor

    additions: list[dict[str, object]] = []
    processed = 0
    async for doc in cursor:
        processed += 1
        challenge = _captcha_from_game_doc(doc)
        if challenge is None:
            if processed % 8 == 0:
                await asyncio.sleep(0)
            continue

        additions.append(challenge)

        if len(additions) >= FORUM_CAPTCHA_TARGET_PER_REFRESH:
            break

        # Yield periodically while decoding/replaying game move lists.
        if processed % 8 == 0:
            await asyncio.sleep(0)

    if len(additions) > 0:
        merged = list(additions)
        seen = {str(challenge["gameId"]) for challenge in merged}
        for challenge in previous_pool:
            challenge_id = str(challenge["gameId"])
            if challenge_id in seen:
                continue
            merged.append(challenge)
            seen.add(challenge_id)
            if len(merged) >= FORUM_CAPTCHA_POOL_CAPACITY:
                break

        FORUM_CAPTCHA_POOL_BY_CATEGORY[normalized_category] = merged[:FORUM_CAPTCHA_POOL_CAPACITY]
        for challenge in additions:
            FORUM_CAPTCHA_BY_GAME_ID[str(challenge["gameId"])] = challenge
        log.debug(
            "Forum captcha pool refreshed (%s/%s) with %s new challenge(s).",
            normalized_category,
            forum_captcha_variant_for_category(normalized_category),
            len(additions),
        )
    else:
        log.debug(
            "Forum captcha refresh found no new mate-in-1 candidates for category %s (%s).",
            normalized_category,
            forum_captcha_variant_for_category(normalized_category),
        )

    FORUM_CAPTCHA_LAST_REFRESH[normalized_category] = datetime.now(timezone.utc)


async def maybe_refresh_forum_captcha_pool(app_state, game_category: str) -> None:
    """Refresh one category captcha pool only when stale and never concurrently."""
    normalized_category = normalize_game_category(game_category)
    now = datetime.now(timezone.utc)
    last_refresh = FORUM_CAPTCHA_LAST_REFRESH.get(normalized_category)
    if last_refresh and (now - last_refresh).total_seconds() < FORUM_CAPTCHA_REFRESH_SECONDS:
        return

    lock = _captcha_lock(normalized_category)
    async with lock:
        latest = FORUM_CAPTCHA_LAST_REFRESH.get(normalized_category)
        if (
            latest
            and (datetime.now(timezone.utc) - latest).total_seconds()
            < FORUM_CAPTCHA_REFRESH_SECONDS
        ):
            return
        try:
            await _refresh_forum_captcha_pool(app_state, normalized_category)
        except Exception:
            # Keep forum/category APIs available even if captcha refresh fails transiently.
            FORUM_CAPTCHA_LAST_REFRESH[normalized_category] = datetime.now(timezone.utc)
            log.exception("Forum captcha refresh failed for category %s.", normalized_category)


async def _forum_captcha_game_category(request: web.Request, app_state) -> str:
    """Resolve request game category from user preference or session override."""
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if isinstance(session_user, str) and session_user in app_state.users:
        return normalize_game_category(app_state.users[session_user].game_category)
    if session_user:
        user = await app_state.users.get(session_user)
        if user is not None:
            return normalize_game_category(user.game_category)
    return normalize_game_category(str(session.get("game_category", GAME_CATEGORY_ALL)))


async def forum_captcha_refresher(app: web.Application) -> None:
    """Background captcha refresh task started by app init."""
    app_state = get_app_state(app)
    try:
        await maybe_refresh_forum_captcha_pool(app_state, GAME_CATEGORY_ALL)
        while not app_state.shutdown:
            await asyncio.sleep(FORUM_CAPTCHA_REFRESH_SECONDS)
            await maybe_refresh_forum_captcha_pool(app_state, GAME_CATEGORY_ALL)
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("Forum captcha refresher task crashed.")


def _forum_captcha_challenge(game_id: str) -> dict[str, object]:
    """Get captcha challenge by id, falling back to the default challenge."""
    return FORUM_CAPTCHA_BY_GAME_ID.get(game_id, FORUM_CAPTCHA_FALLBACK_BY_VARIANT["chess"])


def _forum_captcha_payload(challenge: dict[str, object]) -> dict[str, object]:
    """Return the public captcha payload without exposing solution strings."""
    raw_moves = challenge.get("moves")
    moves = raw_moves if isinstance(raw_moves, dict) else {}
    payload = {
        "gameId": str(challenge.get("gameId") or ""),
        "variant": str(challenge.get("variant") or "chess"),
        "fen": str(challenge.get("fen") or ""),
        "color": str(challenge.get("color") or "white"),
        "moves": moves,
    }
    raw_help_url = challenge.get("helpUrl")
    if isinstance(raw_help_url, str) and raw_help_url:
        payload["helpUrl"] = raw_help_url
    return payload


def forum_captcha_public_payload(game_category: str) -> dict[str, object]:
    """Return one random captcha challenge payload for a preferred category."""
    normalized_category = normalize_game_category(game_category)
    category_pool = FORUM_CAPTCHA_POOL_BY_CATEGORY.get(normalized_category, [])
    if len(category_pool) > 0:
        return _forum_captcha_payload(random.choice(category_pool))
    fallback = FORUM_CAPTCHA_FALLBACK_BY_CATEGORY.get(
        normalized_category, FORUM_CAPTCHA_FALLBACK_BY_VARIANT["chess"]
    )
    return _forum_captcha_payload(fallback)


def forum_captcha_is_valid(game_id: str, solution: str) -> bool:
    """Validate a proposed captcha move solution for the provided challenge id."""
    challenge = _forum_captcha_challenge(game_id)
    solutions = challenge.get("solutions")
    if not isinstance(solutions, tuple):
        return False
    normalized = normalize_captcha_solution(solution)
    return normalized in solutions


async def forum_captcha(request: web.Request) -> web.Response:
    """Return a mate-in-1 captcha challenge payload for forum forms."""
    app_state = get_app_state(request.app)
    game_category = await _forum_captcha_game_category(request, app_state)
    await maybe_refresh_forum_captcha_pool(app_state, game_category)
    return json_response({"captcha": forum_captcha_public_payload(game_category)})


async def forum_captcha_check(request: web.Request) -> web.Response:
    """Check a candidate captcha move and return text `1` for pass, `0` for fail."""
    game_id = request.match_info.get("gameId", "")
    solution = str(request.rel_url.query.get("solution") or "")
    ok = forum_captcha_is_valid(game_id, solution)
    return web.Response(text="1" if ok else "0", content_type="text/plain")
