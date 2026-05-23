from __future__ import annotations

import asyncio
import json
import logging
import math
import random
import re
from datetime import datetime, timedelta, timezone
from functools import partial

import aiohttp_session
from aiohttp import web

from const import CATEGORY_VARIANT_SETS, GAME_CATEGORY_ALL, normalize_game_category
from fairy.fairy_board import FairyBoard
from link_filter import sanitize_user_message
from newid import new_id
from notify import notify
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from settings import ADMINS

FORUM_TOPIC_PER_PAGE = 30
FORUM_POST_PER_PAGE = 10
FORUM_SEARCH_PER_PAGE = 20
MAX_TOPIC_NAME_LEN = 100
MAX_POST_LEN = 5000
EDIT_WINDOW_HOURS = 4

SLUG_RE = re.compile(r"^[a-z0-9-]{3,80}$")
MENTION_RE = re.compile(r"(^|[^\w@#/])@([a-zA-Z0-9_-]{3,20})")

# Forum reaction token mapping used by API endpoints and stored Mongo keys.
REACTION_TO_KEY = {
    "+1": "plusOne",
    "-1": "minusOne",
    "laugh": "laugh",
    "thinking": "thinking",
    "heart": "heart",
    "horsey": "horsey",
}
KEY_TO_REACTION = {value: key for key, value in REACTION_TO_KEY.items()}

# Default top-level forum categories seeded at startup/API access time.
DEFAULT_FORUM_CATEGS: tuple[dict[str, object], ...] = (
    {
        "_id": "general-chess-discussion",
        "name": "General Chess Discussion",
        "desc": "Discuss chess, variants, and strategy.",
        "order": 10,
        "nbTopics": 0,
        "nbPosts": 0,
    },
    {
        "_id": "pychess-feedback",
        "name": "PyChess Feedback",
        "desc": "Feedback and feature requests about the site.",
        "order": 20,
        "nbTopics": 0,
        "nbPosts": 0,
    },
    {
        "_id": "game-analysis",
        "name": "Game Analysis",
        "desc": "Share and discuss your games.",
        "order": 30,
        "nbTopics": 0,
        "nbPosts": 0,
    },
    {
        "_id": "off-topic-discussion",
        "name": "Off-Topic Discussion",
        "desc": "Everything else.",
        "order": 40,
        "nbTopics": 0,
        "nbPosts": 0,
    },
)

# Lila-inspired mate-in-1 fallback from modules/game/src/main/CaptchaApi.scala.
FORUM_CAPTCHA_FALLBACK: dict[str, object] = {
    "gameId": "00000000",
    "variant": "chess",
    "fen": "1k3b1r/r5pp/pNQppq2/2p5/4P3/P3B3/1P3PPP/n4RK1",
    "color": "white",
    "moves": {"c6": "c8"},
    "solutions": ("c6 c8",),
}

# Intentionally rarer refresh and smaller cache than lila.
FORUM_CAPTCHA_REFRESH_SECONDS = 120
FORUM_CAPTCHA_POOL_CAPACITY = 40
FORUM_CAPTCHA_SAMPLE_SIZE = 120
FORUM_CAPTCHA_TARGET_PER_REFRESH = 10

FORUM_CAPTCHA_FAIL_MESSAGE = "Please solve the captcha."
FORUM_CAPTCHA_PUZZLE_BASE_QUERY = {
    "e": "#1",
    "c": {"$ne": True},
    "r": {"$ne": False},
    "f": {"$type": "string"},
    "m": {"$type": "string"},
    "v": {"$type": "string"},
}

_forum_captcha_pool_by_category: dict[str, list[dict[str, object]]] = {
    GAME_CATEGORY_ALL: [FORUM_CAPTCHA_FALLBACK]
}
_forum_captcha_by_game_id: dict[str, dict[str, object]] = {
    str(FORUM_CAPTCHA_FALLBACK["gameId"]): FORUM_CAPTCHA_FALLBACK
}
_forum_captcha_last_refresh: dict[str, datetime] = {}
_forum_captcha_locks: dict[str, asyncio.Lock] = {}

log = logging.getLogger(__name__)


def _is_admin(username: str) -> bool:
    """Return whether the provided username matches a configured forum admin."""
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


async def _session_username(request: web.Request) -> str | None:
    """Extract the logged-in username from the current aiohttp session."""
    session = await aiohttp_session.get_session(request)
    return session.get("user_name")


def _to_utc(value: object) -> datetime | None:
    """Normalize a datetime-like value to UTC, returning None for non-datetime inputs."""
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _slugify(value: str) -> str:
    """Create a forum-safe slug from user text using lila-compatible constraints."""
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if len(slug) < 3:
        slug = f"topic-{datetime.now(timezone.utc).strftime('%H%M%S')}"
    return slug[:80]


def _escape_regex(value: str) -> str:
    """Escape free-form search input before placing it into a regex query."""
    return re.escape(value)


def _page_count(total: int, per_page: int) -> int:
    """Compute a one-based page count and always return at least one page."""
    return max(1, math.ceil(total / per_page)) if per_page > 0 else 1


def _normalize_page(raw: str | None, nb_pages: int) -> int:
    """Clamp a user-provided page value into the valid one-based page range."""
    try:
        page = int(raw or "1")
    except ValueError:
        page = 1
    if page < 1:
        return 1
    if page > nb_pages:
        return nb_pages
    return page


def _post_page_for_index(post_index: int, per_page: int) -> int:
    """Convert a zero-based post index into its one-based paginated page number."""
    return max(1, (post_index // per_page) + 1)


def _parse_bool(value: str | None) -> bool:
    """Parse common truthy request tokens used by reaction endpoints."""
    if value is None:
        return False
    return value.lower() in ("1", "true", "yes", "on")


def _extract_mentions(text: str) -> set[str]:
    """Extract unique @mentions from sanitized forum markdown/plain text."""
    return {match.group(2) for match in MENTION_RE.finditer(text)}


def _captcha_lock(game_category: str) -> asyncio.Lock:
    lock = _forum_captcha_locks.get(game_category)
    if lock is None:
        lock = asyncio.Lock()
        _forum_captcha_locks[game_category] = lock
    return lock


def _normalize_captcha_solution(value: str) -> str:
    """Normalize captcha move input to lowercase `<orig> <dest>` format."""
    return " ".join(value.strip().lower().split())


def _parse_square(move: str, start: int) -> tuple[str, int] | None:
    """Parse one square token (`file` + one/more digits) from move text."""
    if start >= len(move):
        return None
    if not move[start].isalpha():
        return None
    idx = start + 1
    while idx < len(move) and move[idx].isdigit():
        idx += 1
    if idx == start + 1:
        return None
    return move[start:idx], idx


def _uci_orig_dest(move: str) -> tuple[str, str] | None:
    """Extract origin/destination squares from a UCI-like move string."""
    uci = move.strip().lower()
    if len(uci) < 4 or "," in uci or "@" in uci:
        return None
    orig_token = _parse_square(uci, 0)
    if orig_token is None:
        return None
    orig, idx = orig_token
    dest_token = _parse_square(uci, idx)
    if dest_token is None:
        return None
    dest, idx = dest_token
    suffix = uci[idx:]
    if any((not char.isalnum()) and char != "+" for char in suffix):
        return None
    return orig, dest


def _captcha_moves_map(legal_moves: list[str]) -> dict[str, str]:
    """Encode legal moves into lila-compatible orig->dests compact map."""
    grouped: dict[str, list[str]] = {}
    for move in legal_moves:
        orig_dest = _uci_orig_dest(move)
        if orig_dest is None:
            continue
        orig, dest = orig_dest
        dests = grouped.setdefault(orig, [])
        if dest not in dests:
            dests.append(dest)
    return {orig: "".join(dests) for orig, dests in grouped.items()}


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
        orig_dest = _uci_orig_dest(move)
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
    moves = _captcha_moves_map(legal_moves)
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


def _captcha_from_puzzle_doc(doc: dict[str, object]) -> dict[str, object] | None:
    """Convert one puzzle document into a forum captcha challenge."""
    game_id = str(doc.get("_id") or "").strip()
    fen = str(doc.get("f") or "").strip()
    variant = str(doc.get("v") or "").strip().lower()
    if len(game_id) == 0 or len(fen) == 0 or len(variant) == 0:
        return None
    return _captcha_from_fen(game_id=game_id, fen=fen, variant=variant)


def _forum_captcha_variants_for_category(game_category: str) -> tuple[str, ...]:
    """Return allowed puzzle variant names for one normalized game category."""
    if game_category == GAME_CATEGORY_ALL:
        variants = CATEGORY_VARIANT_SETS[GAME_CATEGORY_ALL]
    else:
        variants = CATEGORY_VARIANT_SETS.get(
            game_category, CATEGORY_VARIANT_SETS[GAME_CATEGORY_ALL]
        )
    return tuple(sorted(variants))


def _forum_captcha_query(game_category: str) -> dict[str, object]:
    """Build Mongo puzzle query for one category's mate-in-1 captcha sampling."""
    query: dict[str, object] = dict(FORUM_CAPTCHA_PUZZLE_BASE_QUERY)
    allowed_variants = _forum_captcha_variants_for_category(game_category)
    query["v"] = {"$in": list(allowed_variants)}
    return query


async def _refresh_forum_captcha_pool(app_state, game_category: str) -> None:
    """Refresh one category's in-memory captcha pool from random mate-in-1 puzzles."""
    normalized_category = normalize_game_category(game_category)
    if app_state.db is None:
        _forum_captcha_last_refresh[normalized_category] = datetime.now(timezone.utc)
        return

    previous_pool = _forum_captcha_pool_by_category.get(normalized_category, [])
    cursor = await app_state.db.puzzle.aggregate(
        [
            {"$match": _forum_captcha_query(normalized_category)},
            {"$sample": {"size": FORUM_CAPTCHA_SAMPLE_SIZE}},
            {"$project": {"_id": 1, "v": 1, "f": 1, "m": 1}},
        ]
    )
    docs = await cursor.to_list(length=FORUM_CAPTCHA_SAMPLE_SIZE)
    random.shuffle(docs)

    additions: list[dict[str, object]] = []
    for doc in docs:
        challenge = _captcha_from_puzzle_doc(doc)
        if challenge is None:
            continue
        additions.append(challenge)
        if len(additions) >= FORUM_CAPTCHA_TARGET_PER_REFRESH:
            break

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

        _forum_captcha_pool_by_category[normalized_category] = merged[:FORUM_CAPTCHA_POOL_CAPACITY]
        for challenge in additions:
            _forum_captcha_by_game_id[str(challenge["gameId"])] = challenge
        log.debug(
            "Forum captcha pool refreshed (%s) with %s new challenge(s).",
            normalized_category,
            len(additions),
        )
    else:
        log.debug(
            "Forum captcha refresh found no new mate-in-1 candidates for category %s.",
            normalized_category,
        )

    _forum_captcha_last_refresh[normalized_category] = datetime.now(timezone.utc)


async def _maybe_refresh_forum_captcha_pool(app_state, game_category: str) -> None:
    """Refresh one category captcha pool only when stale and never concurrently."""
    normalized_category = normalize_game_category(game_category)
    now = datetime.now(timezone.utc)
    last_refresh = _forum_captcha_last_refresh.get(normalized_category)
    if last_refresh and (now - last_refresh).total_seconds() < FORUM_CAPTCHA_REFRESH_SECONDS:
        return

    lock = _captcha_lock(normalized_category)
    async with lock:
        latest = _forum_captcha_last_refresh.get(normalized_category)
        if (
            latest
            and (datetime.now(timezone.utc) - latest).total_seconds()
            < FORUM_CAPTCHA_REFRESH_SECONDS
        ):
            return
        await _refresh_forum_captcha_pool(app_state, normalized_category)


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
        await _maybe_refresh_forum_captcha_pool(app_state, GAME_CATEGORY_ALL)
        while not app_state.shutdown:
            await asyncio.sleep(FORUM_CAPTCHA_REFRESH_SECONDS)
            await _maybe_refresh_forum_captcha_pool(app_state, GAME_CATEGORY_ALL)
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("Forum captcha refresher task crashed.")


def _forum_captcha_challenge(game_id: str) -> dict[str, object]:
    """Get captcha challenge by id, falling back to the default challenge."""
    return _forum_captcha_by_game_id.get(game_id, FORUM_CAPTCHA_FALLBACK)


def _forum_captcha_payload(challenge: dict[str, object]) -> dict[str, object]:
    """Return the public captcha payload without exposing solution strings."""
    return {
        "gameId": str(challenge.get("gameId") or ""),
        "variant": str(challenge.get("variant") or "chess"),
        "fen": str(challenge.get("fen") or ""),
        "color": str(challenge.get("color") or "white"),
        "moves": dict(challenge.get("moves") or {}),
    }


def _forum_captcha_public_payload(game_category: str) -> dict[str, object]:
    """Return one random captcha challenge payload for a preferred category."""
    normalized_category = normalize_game_category(game_category)
    category_pool = _forum_captcha_pool_by_category.get(normalized_category, [])
    if len(category_pool) > 0:
        return _forum_captcha_payload(random.choice(category_pool))
    default_pool = _forum_captcha_pool_by_category.get(GAME_CATEGORY_ALL, [])
    if len(default_pool) > 0:
        return _forum_captcha_payload(random.choice(default_pool))
    return _forum_captcha_payload(FORUM_CAPTCHA_FALLBACK)


def _forum_captcha_is_valid(game_id: str, solution: str) -> bool:
    """Validate a proposed captcha move solution for the provided challenge id."""
    challenge = _forum_captcha_challenge(game_id)
    solutions = challenge.get("solutions")
    if not isinstance(solutions, tuple):
        return False
    normalized = _normalize_captcha_solution(solution)
    return normalized in solutions


def _can_write(user) -> bool:
    """Apply forum write permissions (age/games/title/admin/bot/shadowban checks)."""
    if user.anon or user.bot or bool(getattr(user, "shadowban", False)):
        return False
    if _is_admin(user.username):
        return True
    if user.title:
        return True
    created_at = _to_utc(getattr(user, "created_at", None))
    if created_at is None:
        return False
    account_age = datetime.now(timezone.utc) - created_at
    return user.count.get("game", 0) > 0 and account_age >= timedelta(days=2)


def _can_moderate(user) -> bool:
    """Return whether a user can perform moderator-only forum operations."""
    return _is_admin(user.username)


async def _ensure_categs(app_state) -> None:
    """Ensure default forum categories exist before forum APIs serve content."""
    if app_state.db is None:
        return
    for categ in DEFAULT_FORUM_CATEGS:
        await app_state.db.forum_categ.update_one(
            {"_id": categ["_id"]},
            {"$setOnInsert": categ},
            upsert=True,
        )


async def _topic_by_tree(app_state, categ_id: str, slug: str) -> dict[str, object] | None:
    """Fetch a forum topic by category slug pair."""
    if app_state.db is None:
        return None
    return await app_state.db.forum_topic.find_one({"categId": categ_id, "slug": slug})


async def _recompute_topic_summary(app_state, topic_id: str) -> dict[str, object] | None:
    """Recompute denormalized topic counters/last-post metadata after post mutations."""
    if app_state.db is None:
        return None
    topic = await app_state.db.forum_topic.find_one({"_id": topic_id})
    if topic is None:
        return None

    nb_posts = await app_state.db.forum_post.count_documents({"topicId": topic_id})
    if nb_posts < 1:
        await app_state.db.forum_topic.delete_one({"_id": topic_id})
        return None

    last_post = await app_state.db.forum_post.find_one(
        {"topicId": topic_id},
        sort=[("createdAt", -1)],
        projection={"_id": 1, "createdAt": 1, "user": 1},
    )
    if last_post is None:
        return None

    await app_state.db.forum_topic.update_one(
        {"_id": topic_id},
        {
            "$set": {
                "nbPosts": nb_posts,
                "updatedAt": last_post["createdAt"],
                "lastPostId": last_post["_id"],
                "lastPostAt": last_post["createdAt"],
                "lastPostUser": last_post.get("user", ""),
            }
        },
    )
    return await app_state.db.forum_topic.find_one({"_id": topic_id})


async def _recompute_categ_summary(app_state, categ_id: str) -> None:
    """Recompute denormalized category counters and last-topic/last-post pointers."""
    if app_state.db is None:
        return
    nb_topics = await app_state.db.forum_topic.count_documents({"categId": categ_id})
    nb_posts = await app_state.db.forum_post.count_documents({"categId": categ_id})
    latest = await app_state.db.forum_post.find_one(
        {"categId": categ_id},
        sort=[("createdAt", -1)],
        projection={"_id": 1, "createdAt": 1, "topicId": 1, "user": 1},
    )
    updates: dict[str, object] = {
        "nbTopics": nb_topics,
        "nbPosts": nb_posts,
    }
    if latest is None:
        updates.update(
            {
                "lastPostId": None,
                "lastPostAt": None,
                "lastPostUser": "",
                "lastTopicSlug": "",
                "lastTopicName": "",
                "lastTopicPage": 1,
            }
        )
    else:
        topic = await app_state.db.forum_topic.find_one({"_id": latest["topicId"]})
        topic_nb_posts = int((topic or {}).get("nbPosts", 1))
        updates.update(
            {
                "lastPostId": latest["_id"],
                "lastPostAt": latest.get("createdAt"),
                "lastPostUser": latest.get("user", ""),
                "lastTopicSlug": (topic or {}).get("slug", ""),
                "lastTopicName": (topic or {}).get("name", ""),
                "lastTopicPage": _post_page_for_index(
                    max(topic_nb_posts - 1, 0), FORUM_POST_PER_PAGE
                ),
            }
        )
    await app_state.db.forum_categ.update_one({"_id": categ_id}, {"$set": updates})


def _serialize_reactions(
    reactions_doc: object,
    *,
    viewer: str | None,
) -> tuple[dict[str, int], set[str]]:
    """Convert persisted reaction arrays into API counts and current-user selections."""
    if not isinstance(reactions_doc, dict):
        return {}, set()

    counts: dict[str, int] = {}
    mine: set[str] = set()
    for key, users in reactions_doc.items():
        reaction = KEY_TO_REACTION.get(str(key))
        if reaction is None:
            continue
        if isinstance(users, list):
            usernames = [str(item) for item in users if isinstance(item, str)]
        else:
            usernames = []
        if len(usernames) > 0:
            counts[reaction] = len(usernames)
            if viewer is not None and viewer in usernames:
                mine.add(reaction)
    return counts, mine


async def _notify_mentions(
    app_state,
    *,
    text: str,
    mentioner: str,
    topic: dict[str, object],
    post_id: str,
) -> None:
    """Send forum mention notifications to mentioned users who are eligible to receive them."""
    if app_state.db is None:
        return
    mentions = _extract_mentions(text)
    if len(mentions) == 0:
        return
    mentions.discard(mentioner)
    if len(mentions) == 0:
        return

    topic_name = str(topic.get("name") or "")
    topic_slug = str(topic.get("slug") or "")
    categ_id = str(topic.get("categId") or "")
    topic_id = str(topic.get("_id") or "")

    for username in sorted(mentions):
        profile = await app_state.public_users.get_profile(username)
        if profile is None or not profile.enabled:
            continue
        if mentioner in profile.blocked:
            continue
        user = await app_state.users.get(username)
        await notify(
            app_state.db,
            user,
            "forumMention",
            {
                "id": post_id,
                "opp": mentioner,
                "tid": topic_id,
                "topic": topic_name,
                "slug": topic_slug,
                "categ": categ_id,
            },
        )


def _json_response(payload: dict[str, object]) -> web.Response:
    """Serialize API payloads with datetime ISO formatting."""
    return web.json_response(payload, dumps=partial(json.dumps, default=datetime.isoformat))


async def forum_categs(request: web.Request) -> web.Response:
    """Return forum categories with summary counters for the forum index view."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return _json_response({"categs": []})

    await _ensure_categs(app_state)
    cursor = app_state.db.forum_categ.find()
    cursor.sort("order", 1)
    categs = await cursor.to_list(length=50)
    return _json_response({"categs": categs})


async def forum_captcha(request: web.Request) -> web.Response:
    """Return a mate-in-1 captcha challenge payload for forum forms."""
    app_state = get_app_state(request.app)
    game_category = await _forum_captcha_game_category(request, app_state)
    await _maybe_refresh_forum_captcha_pool(app_state, game_category)
    return _json_response({"captcha": _forum_captcha_public_payload(game_category)})


async def forum_captcha_check(request: web.Request) -> web.Response:
    """Check a candidate captcha move and return text `1` for pass, `0` for fail."""
    game_id = request.match_info.get("gameId", "")
    solution = str(request.rel_url.query.get("solution") or "")
    ok = _forum_captcha_is_valid(game_id, solution)
    return web.Response(text="1" if ok else "0", content_type="text/plain")


async def forum_topics(request: web.Request) -> web.Response:
    """Return paginated topics for a category, including write/mod capability flags."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return _json_response({"type": "error", "message": "Forum unavailable"})
    await _ensure_categs(app_state)

    categ_id = request.match_info.get("categ", "")
    if not SLUG_RE.match(categ_id):
        return _json_response({"type": "error", "message": "Invalid category"})

    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is None:
        return _json_response({"type": "error", "message": "Category not found"})

    total = await app_state.db.forum_topic.count_documents({"categId": categ_id})
    nb_pages = _page_count(total, FORUM_TOPIC_PER_PAGE)
    page = _normalize_page(request.rel_url.query.get("page"), nb_pages)
    skip = (page - 1) * FORUM_TOPIC_PER_PAGE

    cursor = app_state.db.forum_topic.find({"categId": categ_id})
    cursor.sort([("sticky", -1), ("updatedAt", -1)])
    cursor.skip(skip)
    cursor.limit(FORUM_TOPIC_PER_PAGE)
    topics = await cursor.to_list(length=FORUM_TOPIC_PER_PAGE)

    usernames: set[str] = set()
    for topic in topics:
        user = str(topic.get("user") or "")
        if user:
            usernames.add(user)
        last_user = str(topic.get("lastPostUser") or "")
        if last_user:
            usernames.add(last_user)
    titles = await app_state.public_users.get_titles(list(usernames))

    topic_items: list[dict[str, object]] = []
    for topic in topics:
        nb_posts = int(topic.get("nbPosts", 0))
        topic_items.append(
            {
                **topic,
                "nbReplies": max(0, nb_posts - 1),
                "userTitle": titles.get(str(topic.get("user") or ""), ""),
                "lastPostUserTitle": titles.get(str(topic.get("lastPostUser") or ""), ""),
                "lastPage": _page_count(nb_posts, FORUM_POST_PER_PAGE),
            }
        )

    username = await _session_username(request)
    can_write = False
    can_moderate = False
    game_category = GAME_CATEGORY_ALL
    if username is not None:
        user = await app_state.users.get(username)
        if user is not None:
            can_write = _can_write(user)
            can_moderate = _can_moderate(user)
            game_category = normalize_game_category(user.game_category)
    if can_write:
        await _maybe_refresh_forum_captcha_pool(app_state, game_category)

    return _json_response(
        {
            "categ": categ,
            "topics": topic_items,
            "page": page,
            "nbPages": nb_pages,
            "total": total,
            "canWrite": can_write,
            "canModerate": can_moderate,
            "captcha": _forum_captcha_public_payload(game_category) if can_write else None,
        }
    )


async def forum_topic(request: web.Request) -> web.Response:
    """Return a paginated topic view with posts, reaction state, and moderation metadata."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return _json_response({"type": "error", "message": "Forum unavailable"})
    await _ensure_categs(app_state)

    categ_id = request.match_info.get("categ", "")
    slug = request.match_info.get("slug", "")
    if not SLUG_RE.match(categ_id) or not SLUG_RE.match(slug):
        return _json_response({"type": "error", "message": "Invalid topic"})

    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is None:
        return _json_response({"type": "error", "message": "Category not found"})

    topic = await _topic_by_tree(app_state, categ_id, slug)
    if topic is None:
        return _json_response({"type": "error", "message": "Topic not found"})

    total = await app_state.db.forum_post.count_documents({"topicId": topic["_id"]})
    nb_pages = _page_count(total, FORUM_POST_PER_PAGE)
    page = _normalize_page(request.rel_url.query.get("page"), nb_pages)
    skip = (page - 1) * FORUM_POST_PER_PAGE

    cursor = app_state.db.forum_post.find({"topicId": topic["_id"]})
    cursor.sort("createdAt", 1)
    cursor.skip(skip)
    cursor.limit(FORUM_POST_PER_PAGE)
    posts = await cursor.to_list(length=FORUM_POST_PER_PAGE)

    usernames = [str(post.get("user") or "") for post in posts if post.get("user")]
    titles = await app_state.public_users.get_titles(usernames)

    username = await _session_username(request)
    me = None
    can_write = False
    can_moderate = False
    can_reply = False
    game_category = GAME_CATEGORY_ALL
    if username is not None:
        me = await app_state.users.get(username)
        if me is not None:
            can_write = _can_write(me)
            can_moderate = _can_moderate(me)
            can_reply = can_write and not bool(topic.get("closed", False))
            game_category = normalize_game_category(me.game_category)
    if can_reply:
        await _maybe_refresh_forum_captcha_pool(app_state, game_category)

    post_items: list[dict[str, object]] = []
    for post in posts:
        owner = str(post.get("user") or "")
        created_at = _to_utc(post.get("createdAt"))
        can_edit = False
        can_delete = False
        can_react = False
        if username is not None:
            can_delete = can_moderate or owner == username
            can_edit = can_delete
            if owner == username and created_at is not None:
                can_edit = (datetime.now(timezone.utc) - created_at) <= timedelta(
                    hours=EDIT_WINDOW_HOURS
                )
            if me is not None:
                can_react = _can_write(me) and owner != username and not me.bot
        reaction_counts, my_reactions = _serialize_reactions(post.get("reactions"), viewer=username)
        post_items.append(
            {
                **post,
                "userTitle": titles.get(owner, ""),
                "canEdit": can_edit,
                "canDelete": can_delete,
                "canReact": can_react,
                "reactionCounts": reaction_counts,
                "myReactions": sorted(my_reactions),
            }
        )

    relocate_targets: list[dict[str, object]] = []
    if can_moderate:
        rel_cursor = app_state.db.forum_categ.find({"_id": {"$ne": categ_id}})
        rel_cursor.sort("order", 1)
        relocate_targets = await rel_cursor.to_list(length=50)

    return _json_response(
        {
            "categ": categ,
            "topic": topic,
            "posts": post_items,
            "page": page,
            "nbPages": nb_pages,
            "total": total,
            "canWrite": can_write,
            "canModerate": can_moderate,
            "canReply": can_reply,
            "canClose": can_moderate or (username == topic.get("user")),
            "canSticky": can_moderate,
            "relocateTargets": relocate_targets,
            "captcha": _forum_captcha_public_payload(game_category) if can_reply else None,
        }
    )


async def forum_search(request: web.Request) -> web.Response:
    """Search forum posts by text and return enriched topic/category context."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return _json_response({"posts": [], "page": 1, "nbPages": 1, "total": 0, "text": ""})

    text = str(request.rel_url.query.get("text") or "").strip()
    if text == "":
        return _json_response({"posts": [], "page": 1, "nbPages": 1, "total": 0, "text": ""})

    if len(text) > 80:
        return _json_response({"type": "error", "message": "Search text too long"})

    query = {"text": {"$regex": _escape_regex(text), "$options": "i"}}
    total = await app_state.db.forum_post.count_documents(query)
    nb_pages = _page_count(total, FORUM_SEARCH_PER_PAGE)
    page = _normalize_page(request.rel_url.query.get("page"), nb_pages)
    skip = (page - 1) * FORUM_SEARCH_PER_PAGE

    cursor = app_state.db.forum_post.find(query)
    cursor.sort("createdAt", -1)
    cursor.skip(skip)
    cursor.limit(FORUM_SEARCH_PER_PAGE)
    posts = await cursor.to_list(length=FORUM_SEARCH_PER_PAGE)

    topic_ids = list({str(post.get("topicId") or "") for post in posts if post.get("topicId")})
    topics = await app_state.db.forum_topic.find({"_id": {"$in": topic_ids}}).to_list(length=500)
    topic_map = {topic["_id"]: topic for topic in topics}

    categ_ids = list({str(topic.get("categId") or "") for topic in topics if topic.get("categId")})
    categs = await app_state.db.forum_categ.find({"_id": {"$in": categ_ids}}).to_list(length=100)
    categ_map = {categ["_id"]: categ for categ in categs}

    usernames = [str(post.get("user") or "") for post in posts if post.get("user")]
    titles = await app_state.public_users.get_titles(usernames)

    post_items: list[dict[str, object]] = []
    for post in posts:
        topic = topic_map.get(post.get("topicId"))
        categ = categ_map.get((topic or {}).get("categId"))
        post_items.append(
            {
                "post": post,
                "postUserTitle": titles.get(str(post.get("user") or ""), ""),
                "topic": {
                    "_id": (topic or {}).get("_id", ""),
                    "slug": (topic or {}).get("slug", ""),
                    "name": (topic or {}).get("name", ""),
                },
                "categ": {
                    "_id": (categ or {}).get("_id", ""),
                    "name": (categ or {}).get("name", ""),
                },
            }
        )

    return _json_response(
        {
            "posts": post_items,
            "page": page,
            "nbPages": nb_pages,
            "total": total,
            "text": text,
        }
    )


async def forum_post_redirect(request: web.Request) -> web.StreamResponse:
    """Redirect a post id to canonical topic URL with page and post anchor."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPFound("/forum")

    post_id = request.match_info.get("postId", "")
    post = await app_state.db.forum_post.find_one({"_id": post_id})
    if post is None:
        raise web.HTTPFound("/forum")

    topic = await app_state.db.forum_topic.find_one({"_id": post.get("topicId")})
    if topic is None:
        raise web.HTTPFound("/forum")

    created_at = _to_utc(post.get("createdAt"))
    if created_at is None:
        page = 1
    else:
        rank = await app_state.db.forum_post.count_documents(
            {"topicId": topic["_id"], "createdAt": {"$lte": created_at}}
        )
        page = _post_page_for_index(max(rank - 1, 0), FORUM_POST_PER_PAGE)

    categ_id = str(topic.get("categId") or "")
    slug = str(topic.get("slug") or "")
    raise web.HTTPFound(f"/forum/{categ_id}/{slug}?page={page}#{post_id}")


async def forum_topic_create(request: web.Request) -> web.Response:
    """Create a new forum topic with its initial post and mention notifications."""
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    categ_id = request.match_info.get("categ", "")

    if username is None or app_state.db is None:
        return _json_response({"type": "error", "message": "Login required"})
    await _ensure_categs(app_state)
    if not SLUG_RE.match(categ_id):
        return _json_response({"type": "error", "message": "Invalid category"})

    me = await app_state.users.get(username)
    if not _can_write(me):
        return _json_response({"type": "error", "message": "You cannot post yet"})

    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is None:
        return _json_response({"type": "error", "message": "Category not found"})

    data = await read_post_data(request)
    if data is None:
        return _json_response({"type": "error", "message": "Invalid request"})

    name = str(data.get("name") or "").strip()
    text = str(data.get("text") or "").strip()
    captcha_game_id = str(data.get("gameId") or "").strip()
    captcha_move = str(data.get("move") or "").strip()

    if len(name) < 3:
        return _json_response({"type": "error", "message": "Topic title is too short"})
    if len(name) > MAX_TOPIC_NAME_LEN:
        return _json_response({"type": "error", "message": "Topic title is too long"})
    if len(text) < 3:
        return _json_response({"type": "error", "message": "Message is too short"})
    if len(text) > MAX_POST_LEN:
        return _json_response(
            {"type": "error", "message": f"Message too long (max {MAX_POST_LEN})"}
        )
    if not _forum_captcha_is_valid(captcha_game_id, captcha_move):
        return _json_response({"type": "error", "message": FORUM_CAPTCHA_FAIL_MESSAGE})

    text = sanitize_user_message(text)
    if not app_state.chat_flood.allow_message(f"forum:{username}:{categ_id}:topic", text):
        return _json_response(
            {"type": "error", "message": "Too many similar messages. Please wait and retry."}
        )

    base_slug = _slugify(name)
    slug = base_slug
    i = 2
    while await _topic_by_tree(app_state, categ_id, slug) is not None:
        slug = f"{base_slug}-{i}"
        i += 1

    now = datetime.now(timezone.utc)
    topic_id = await new_id(app_state.db.forum_topic)
    post_id = await new_id(app_state.db.forum_post)

    topic_doc = {
        "_id": topic_id,
        "categId": categ_id,
        "slug": slug,
        "name": name,
        "user": username,
        "createdAt": now,
        "updatedAt": now,
        "nbPosts": 1,
        "lastPostId": post_id,
        "lastPostAt": now,
        "lastPostUser": username,
        "closed": False,
        "sticky": False,
    }
    post_doc = {
        "_id": post_id,
        "topicId": topic_id,
        "categId": categ_id,
        "user": username,
        "text": text,
        "createdAt": now,
        "updatedAt": None,
        "editCount": 0,
    }

    await app_state.db.forum_topic.insert_one(topic_doc)
    await app_state.db.forum_post.insert_one(post_doc)
    await _recompute_categ_summary(app_state, categ_id)
    await _notify_mentions(
        app_state,
        text=text,
        mentioner=username,
        topic=topic_doc,
        post_id=post_id,
    )

    return _json_response({"ok": True, "topic": topic_doc, "redirect": f"/forum/{categ_id}/{slug}"})


async def forum_post_create(request: web.Request) -> web.Response:
    """Create a reply post in an existing topic and update denormalized summaries."""
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    categ_id = request.match_info.get("categ", "")
    slug = request.match_info.get("slug", "")

    if username is None or app_state.db is None:
        return _json_response({"type": "error", "message": "Login required"})
    await _ensure_categs(app_state)
    if not SLUG_RE.match(categ_id) or not SLUG_RE.match(slug):
        return _json_response({"type": "error", "message": "Invalid topic"})

    me = await app_state.users.get(username)
    if not _can_write(me):
        return _json_response({"type": "error", "message": "You cannot post yet"})

    topic = await _topic_by_tree(app_state, categ_id, slug)
    if topic is None:
        return _json_response({"type": "error", "message": "Topic not found"})
    if bool(topic.get("closed", False)):
        return _json_response({"type": "error", "message": "This topic is closed"})

    data = await read_post_data(request)
    if data is None:
        return _json_response({"type": "error", "message": "Invalid request"})

    text = str(data.get("text") or "").strip()
    captcha_game_id = str(data.get("gameId") or "").strip()
    captcha_move = str(data.get("move") or "").strip()
    if len(text) < 3:
        return _json_response({"type": "error", "message": "Message is too short"})
    if len(text) > MAX_POST_LEN:
        return _json_response(
            {"type": "error", "message": f"Message too long (max {MAX_POST_LEN})"}
        )
    if not _forum_captcha_is_valid(captcha_game_id, captcha_move):
        return _json_response({"type": "error", "message": FORUM_CAPTCHA_FAIL_MESSAGE})
    text = sanitize_user_message(text)

    if not app_state.chat_flood.allow_message(f"forum:{username}:{topic['_id']}", text):
        return _json_response(
            {"type": "error", "message": "Too many similar messages. Please wait and retry."}
        )

    now = datetime.now(timezone.utc)
    post_id = await new_id(app_state.db.forum_post)
    post_doc = {
        "_id": post_id,
        "topicId": topic["_id"],
        "categId": categ_id,
        "user": username,
        "text": text,
        "createdAt": now,
        "updatedAt": None,
        "editCount": 0,
    }
    await app_state.db.forum_post.insert_one(post_doc)
    await app_state.db.forum_topic.update_one(
        {"_id": topic["_id"]},
        {
            "$inc": {"nbPosts": 1},
            "$set": {
                "updatedAt": now,
                "lastPostId": post_id,
                "lastPostAt": now,
                "lastPostUser": username,
            },
        },
    )
    await _recompute_categ_summary(app_state, categ_id)
    topic_doc = await app_state.db.forum_topic.find_one({"_id": topic["_id"]})
    if topic_doc is not None:
        await _notify_mentions(
            app_state,
            text=text,
            mentioner=username,
            topic=topic_doc,
            post_id=post_id,
        )
    topic_nb_posts = int((topic_doc or {}).get("nbPosts", 1))
    page = _page_count(topic_nb_posts, FORUM_POST_PER_PAGE)
    return _json_response(
        {
            "ok": True,
            "post": post_doc,
            "redirect": f"/forum/{categ_id}/{slug}?page={page}#{post_id}",
        }
    )


async def forum_post_edit(request: web.Request) -> web.Response:
    """Edit an existing post when ownership/time-window or moderator rights allow it."""
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    post_id = request.match_info.get("postId", "")

    if username is None or app_state.db is None:
        return _json_response({"type": "error", "message": "Login required"})

    post = await app_state.db.forum_post.find_one({"_id": post_id})
    if post is None:
        return _json_response({"type": "error", "message": "Post not found"})

    me = await app_state.users.get(username)
    is_owner = post.get("user") == username
    is_mod = _can_moderate(me)
    if not is_owner and not is_mod:
        return _json_response({"type": "error", "message": "Not allowed"})

    created_at = _to_utc(post.get("createdAt"))
    if not is_mod and (
        created_at is None
        or (datetime.now(timezone.utc) - created_at) > timedelta(hours=EDIT_WINDOW_HOURS)
    ):
        return _json_response({"type": "error", "message": "Post can no longer be edited"})

    data = await read_post_data(request)
    if data is None:
        return _json_response({"type": "error", "message": "Invalid request"})

    text = str(data.get("text") or "").strip()
    if len(text) < 3:
        return _json_response({"type": "error", "message": "Message is too short"})
    if len(text) > MAX_POST_LEN:
        return _json_response(
            {"type": "error", "message": f"Message too long (max {MAX_POST_LEN})"}
        )
    text = sanitize_user_message(text)

    await app_state.db.forum_post.update_one(
        {"_id": post_id},
        {
            "$set": {"text": text, "updatedAt": datetime.now(timezone.utc)},
            "$inc": {"editCount": 1},
        },
    )
    return _json_response({"ok": True})


async def forum_post_delete(request: web.Request) -> web.Response:
    """Delete a post; deleting the first post removes the whole topic thread."""
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    post_id = request.match_info.get("postId", "")

    if username is None or app_state.db is None:
        return _json_response({"type": "error", "message": "Login required"})

    post = await app_state.db.forum_post.find_one({"_id": post_id})
    if post is None:
        return _json_response({"type": "error", "message": "Post not found"})

    me = await app_state.users.get(username)
    if not (_can_moderate(me) or post.get("user") == username):
        return _json_response({"type": "error", "message": "Not allowed"})

    topic = await app_state.db.forum_topic.find_one({"_id": post.get("topicId")})
    if topic is None:
        await app_state.db.forum_post.delete_one({"_id": post_id})
        await _recompute_categ_summary(app_state, str(post.get("categId")))
        return _json_response({"ok": True})

    first_post = await app_state.db.forum_post.find_one(
        {"topicId": topic["_id"]},
        sort=[("createdAt", 1)],
        projection={"_id": 1},
    )
    if first_post and first_post.get("_id") == post_id:
        await app_state.db.forum_post.delete_many({"topicId": topic["_id"]})
        await app_state.db.forum_topic.delete_one({"_id": topic["_id"]})
        await _recompute_categ_summary(app_state, str(topic.get("categId")))
        return _json_response({"ok": True, "deletedTopic": True})

    await app_state.db.forum_post.delete_one({"_id": post_id})
    await _recompute_topic_summary(app_state, str(topic["_id"]))
    await _recompute_categ_summary(app_state, str(topic.get("categId")))
    return _json_response({"ok": True})


async def forum_topic_close(request: web.Request) -> web.Response:
    """Toggle topic closed/open state for owners and moderators."""
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    categ_id = request.match_info.get("categ", "")
    slug = request.match_info.get("slug", "")

    if username is None or app_state.db is None:
        return _json_response({"type": "error", "message": "Login required"})

    topic = await _topic_by_tree(app_state, categ_id, slug)
    if topic is None:
        return _json_response({"type": "error", "message": "Topic not found"})

    me = await app_state.users.get(username)
    if not (_can_moderate(me) or topic.get("user") == username):
        return _json_response({"type": "error", "message": "Not allowed"})

    next_closed = not bool(topic.get("closed", False))
    await app_state.db.forum_topic.update_one(
        {"_id": topic["_id"]}, {"$set": {"closed": next_closed}}
    )
    return _json_response({"ok": True, "closed": next_closed})


async def forum_topic_sticky(request: web.Request) -> web.Response:
    """Toggle topic sticky state for moderators."""
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    categ_id = request.match_info.get("categ", "")
    slug = request.match_info.get("slug", "")

    if username is None or app_state.db is None:
        return _json_response({"type": "error", "message": "Login required"})

    me = await app_state.users.get(username)
    if not _can_moderate(me):
        return _json_response({"type": "error", "message": "Not allowed"})

    topic = await _topic_by_tree(app_state, categ_id, slug)
    if topic is None:
        return _json_response({"type": "error", "message": "Topic not found"})

    next_sticky = not bool(topic.get("sticky", False))
    await app_state.db.forum_topic.update_one(
        {"_id": topic["_id"]}, {"$set": {"sticky": next_sticky}}
    )
    return _json_response({"ok": True, "sticky": next_sticky})


async def forum_topic_participants(request: web.Request) -> web.Response:
    """Return distinct usernames who posted in a topic for mention assistance."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return _json_response({"participants": []})
    username = await _session_username(request)
    if username is None:
        return _json_response({"participants": []})

    topic_id = request.match_info.get("topicId", "")
    if len(topic_id) != 8:
        return _json_response({"type": "error", "message": "Invalid topic id"})

    users = await app_state.db.forum_post.distinct("user", {"topicId": topic_id})
    participants = sorted({str(user) for user in users if isinstance(user, str)}, key=str.casefold)
    return _json_response({"participants": participants})


async def forum_post_react(request: web.Request) -> web.Response:
    """Add or remove a reaction on a post and return updated reaction state."""
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    if username is None or app_state.db is None:
        return _json_response({"type": "error", "message": "Login required"})

    categ_id = request.match_info.get("categ", "")
    post_id = request.match_info.get("postId", "")
    reaction = request.match_info.get("reaction", "")
    v_raw = request.match_info.get("v", "")
    if not SLUG_RE.match(categ_id):
        return _json_response({"type": "error", "message": "Invalid category"})
    reaction_key = REACTION_TO_KEY.get(reaction)
    if reaction_key is None:
        return _json_response({"type": "error", "message": "Invalid reaction"})

    me = await app_state.users.get(username)
    if not _can_write(me):
        return _json_response({"type": "error", "message": "Not allowed"})

    post = await app_state.db.forum_post.find_one({"_id": post_id, "categId": categ_id})
    if post is None:
        return _json_response({"type": "error", "message": "Post not found"})
    if post.get("user") == username:
        return _json_response({"type": "error", "message": "Cannot react to your own post"})

    value = _parse_bool(v_raw)
    update = (
        {"$addToSet": {f"reactions.{reaction_key}": username}}
        if value
        else {"$pull": {f"reactions.{reaction_key}": username}}
    )
    await app_state.db.forum_post.update_one({"_id": post_id}, update)
    updated = await app_state.db.forum_post.find_one({"_id": post_id})
    counts, mine = _serialize_reactions((updated or {}).get("reactions"), viewer=username)
    return _json_response(
        {
            "ok": True,
            "reactionCounts": counts,
            "myReactions": sorted(mine),
            "postId": post_id,
        }
    )


async def forum_mod_feed(request: web.Request) -> web.Response:
    """Return a moderator-only chronological feed of posts in one category."""
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    if username is None or app_state.db is None:
        return _json_response({"type": "error", "message": "Login required"})

    me = await app_state.users.get(username)
    if not _can_moderate(me):
        return _json_response({"type": "error", "message": "Not allowed"})

    categ_id = request.match_info.get("categ", "")
    if not SLUG_RE.match(categ_id):
        return _json_response({"type": "error", "message": "Invalid category"})
    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is None:
        return _json_response({"type": "error", "message": "Category not found"})

    total = await app_state.db.forum_post.count_documents({"categId": categ_id})
    nb_pages = _page_count(total, FORUM_TOPIC_PER_PAGE)
    page = _normalize_page(request.rel_url.query.get("page"), nb_pages)
    skip = (page - 1) * FORUM_TOPIC_PER_PAGE

    cursor = app_state.db.forum_post.find({"categId": categ_id})
    cursor.sort("createdAt", -1)
    cursor.skip(skip)
    cursor.limit(FORUM_TOPIC_PER_PAGE)
    posts = await cursor.to_list(length=FORUM_TOPIC_PER_PAGE)

    topic_ids = list({str(post.get("topicId") or "") for post in posts if post.get("topicId")})
    topics = await app_state.db.forum_topic.find({"_id": {"$in": topic_ids}}).to_list(length=500)
    topic_map = {topic["_id"]: topic for topic in topics}

    users = [str(post.get("user") or "") for post in posts if post.get("user")]
    titles = await app_state.public_users.get_titles(users)

    items: list[dict[str, object]] = []
    for post in posts:
        topic = topic_map.get(post.get("topicId"), {})
        items.append(
            {
                "post": {
                    **post,
                    "userTitle": titles.get(str(post.get("user") or ""), ""),
                },
                "topic": {
                    "_id": topic.get("_id", ""),
                    "slug": topic.get("slug", ""),
                    "name": topic.get("name", ""),
                },
            }
        )

    return _json_response(
        {
            "categ": categ,
            "items": items,
            "page": page,
            "nbPages": nb_pages,
            "total": total,
        }
    )


async def forum_post_relocate(request: web.Request) -> web.Response:
    """Move a full thread to another category using its first post as relocation target."""
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    if username is None or app_state.db is None:
        return _json_response({"type": "error", "message": "Login required"})

    me = await app_state.users.get(username)
    if not _can_moderate(me):
        return _json_response({"type": "error", "message": "Not allowed"})

    post_id = request.match_info.get("postId", "")
    post = await app_state.db.forum_post.find_one({"_id": post_id})
    if post is None:
        return _json_response({"type": "error", "message": "Post not found"})
    topic = await app_state.db.forum_topic.find_one({"_id": post.get("topicId")})
    if topic is None:
        return _json_response({"type": "error", "message": "Topic not found"})

    first_post = await app_state.db.forum_post.find_one(
        {"topicId": topic["_id"]},
        sort=[("createdAt", 1)],
        projection={"_id": 1},
    )
    if first_post is None or first_post.get("_id") != post_id:
        return _json_response(
            {"type": "error", "message": "Only the first post can relocate a thread"}
        )

    data = await read_post_data(request)
    if data is None:
        return _json_response({"type": "error", "message": "Invalid request"})
    to_categ = str(data.get("categ") or "").strip()
    if not SLUG_RE.match(to_categ):
        return _json_response({"type": "error", "message": "Invalid target category"})
    if to_categ == topic.get("categId"):
        return _json_response({"type": "error", "message": "Already in that category"})
    target = await app_state.db.forum_categ.find_one({"_id": to_categ})
    if target is None:
        return _json_response({"type": "error", "message": "Target category not found"})

    new_slug = str(topic.get("slug") or "")
    if await _topic_by_tree(app_state, to_categ, new_slug) is not None:
        new_slug = f"{new_slug}-{datetime.now(timezone.utc).strftime('%H%M%S')[-4:]}"
        i = 2
        while await _topic_by_tree(app_state, to_categ, new_slug) is not None:
            new_slug = f"{new_slug}-{i}"
            i += 1

    await app_state.db.forum_topic.update_one(
        {"_id": topic["_id"]},
        {"$set": {"categId": to_categ, "slug": new_slug}},
    )
    await app_state.db.forum_post.update_many(
        {"topicId": topic["_id"]},
        {"$set": {"categId": to_categ}},
    )
    await _recompute_categ_summary(app_state, str(topic.get("categId")))
    await _recompute_categ_summary(app_state, to_categ)
    return _json_response(
        {
            "ok": True,
            "redirect": f"/forum/{to_categ}/{new_slug}",
        }
    )
