from __future__ import annotations

import asyncio
import re
from datetime import datetime

from const import GAME_CATEGORY_ALL, MATE

FORUM_TOPIC_PER_PAGE = 30
FORUM_POST_PER_PAGE = 10
FORUM_SEARCH_PER_PAGE = 20
MAX_TOPIC_NAME_LEN = 100
MAX_POST_LEN = 5000
EDIT_WINDOW_HOURS = 4
ERASED_POST_USER = "<erased>"
ERASED_POST_TEXT = "<Comment deleted by user>"

SLUG_RE = re.compile(r"^[a-z0-9-]{3,80}$")
MENTION_RE = re.compile(r"(^|[^\\w@#/])@([a-zA-Z0-9_-]{3,20})")

# Forum reaction token mapping used by API endpoints and stored Mongo keys.
REACTION_TO_KEY = {
    "+1": "plusOne",
    "-1": "minusOne",
    "laugh": "laugh",
    "thinking": "thinking",
    "heart": "heart",
    "elephant": "elephant",
}
KEY_TO_REACTION = {value: key for key, value in REACTION_TO_KEY.items()}

# Default top-level forum categories seeded at startup/API access time.
DEFAULT_FORUM_CATEGS: tuple[dict[str, object], ...] = (
    {
        "_id": "general-chess-discussion",
        "name": "General Variant Discussion",
        "desc": "Discuss variants, and strategy.",
        "order": 10,
        "nbTopics": 0,
        "nbPosts": 0,
    },
    {
        "_id": "pychess-feedback",
        "name": "Pychess Feedback",
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
        "desc": "Everything that isn't related to Pychess.",
        "order": 40,
        "nbTopics": 0,
        "nbPosts": 0,
    },
)

# Keep captcha refreshes cheap; stale challenges are acceptable because fallbacks exist.
FORUM_CAPTCHA_REFRESH_SECONDS = 300
FORUM_CAPTCHA_POOL_CAPACITY = 24
FORUM_CAPTCHA_SAMPLE_SIZE = 48
FORUM_CAPTCHA_TARGET_PER_REFRESH = 4

FORUM_CAPTCHA_FAIL_MESSAGE = "Please solve the captcha."
FORUM_CAPTCHA_GAME_BASE_QUERY = {
    "s": MATE,
    "m.0": {"$exists": True},
}

# Prefer one beginner-friendlier representative variant per category.
FORUM_CAPTCHA_VARIANT_BY_CATEGORY: dict[str, str] = {
    GAME_CATEGORY_ALL: "chess",
    "chess": "chess",
    "shogi": "minishogi",
    "xiangqi": "minixiangqi",
    "makruk": "makruk",
    "fairy": "seirawan",
    "army": "orda",
    "other": "chess",
}

# Deterministic mate-in-1 fallback challenges by representative variant.
FORUM_CAPTCHA_FALLBACK_BY_VARIANT: dict[str, dict[str, object]] = {
    "chess": {
        "gameId": "00000000",
        "variant": "chess",
        "fen": "2k5/1b6/2pQ4/R1P5/3KQ3/1r6/8/8 w - - 9 119",
        "color": "white",
        "moves": {
            "a5": "a1a2a3a4b5a6a7a8",
            "e4": "b1e1h1c2e2g2d3e3f3f4g4h4d5e5f5c6e6g6e7h7e8",
            "d6": "h2g3f4d5e5c6e6f6g6h6c7d7e7b8d8f8",
            "d4": "e5c4",
        },
        "solutions": ("e4 e6", "e4 e8", "e4 f5", "e4 g4"),
    },
    "minishogi": {
        "gameId": "00000001",
        "variant": "minishogi",
        "fen": "4r/1b1k1/P1s2/2g2/KB2+s[gpr] b - - 1 50",
        "color": "black",
        "moves": {
            "b4": "a3a5c5",
            "e5": "e2e3e4a5b5c5d5",
            "c3": "b2d2",
            "e1": "d1e2",
            "c2": "b1c1d1b2d2",
            "d4": "d5c5d3e3c4e4",
        },
        "solutions": ("c2 b2",),
    },
    "minixiangqi": {
        "gameId": "00000002",
        "variant": "minixiangqi",
        "fen": "2P1k2/6P/7/7/2K4/R6/2N4 w - - 8 107",
        "color": "white",
        "moves": {
            "a2": "a1b2c2d2e2f2g2a3a4a5a6a7",
            "g6": "f6g7",
            "c7": "b7d7",
            "c1": "e2b3d3",
            "c3": "c2d3",
        },
        "solutions": ("a2 e2",),
    },
    "makruk": {
        "gameId": "00000003",
        "variant": "makruk",
        "fen": "8/8/2M~1k1p1/r3pnP1/4N3/3rs2m~/4N1R1/5K2 b - - 1 81",
        "color": "black",
        "moves": {
            "f5": "g3d4h4d6h6e7g7",
            "d3": "d1d2a3b3c3d4d5d6d7d8",
            "a5": "a1a2a3a4b5c5d5a6a7a8",
            "h3": "g2g4",
            "e3": "d2e2f2d4f4",
            "e6": "f7e7",
        },
        "solutions": ("d3 d1",),
    },
    "seirawan": {
        "gameId": "00000004",
        "variant": "seirawan",
        "fen": "8/6B1/1NB2B2/HR6/3K1kb1/P3R2p/8/8[] w - - 16 111",
        "color": "white",
        "moves": {
            "a3": "a4",
            "b6": "a4c4d5d7a8c8",
            "c6": "h1g2f3e4d5b7d7a8e8",
            "f6": "h4e5g5e7d8",
            "g7": "h6f8h8",
            "e3": "e1e2b3c3d3f3g3h3e4e5e6e7e8",
            "b5": "b1b2b3b4c5d5e5f5g5h5",
            "a5": "e1d2b3c3b4c4b7",
            "d4": "c3d3c4d5c5",
        },
        "solutions": ("f6 g5", "g7 h6"),
    },
    "orda": {
        "gameId": "00000005",
        "variant": "orda",
        "fen": "y1l3k1/8/2P1lp2/hp1pP2P/2Ra4/K7/2N5/1a5B b - - 0 69",
        "color": "black",
        "moves": {
            "b5": "b4c4",
            "f6": "f5e5",
            "d5": "c4",
            "a8": "a7b7",
            "b1": "c2d2c3",
            "d4": "e2b3f3e5f5",
            "e6": "f4c5e5g5c6c7g7d8f8",
            "c8": "b6c6d6a7e7",
            "a5": "b3a4b4c4a6b6c6b7",
            "g8": "f7g7h7f8h8",
        },
        "solutions": ("a5 c4",),
    },
}

FORUM_CAPTCHA_FALLBACK_BY_CATEGORY: dict[str, dict[str, object]] = {
    category: FORUM_CAPTCHA_FALLBACK_BY_VARIANT.get(
        variant, FORUM_CAPTCHA_FALLBACK_BY_VARIANT["chess"]
    )
    for category, variant in FORUM_CAPTCHA_VARIANT_BY_CATEGORY.items()
}

FORUM_CAPTCHA_POOL_BY_CATEGORY: dict[str, list[dict[str, object]]] = {
    category: [challenge] for category, challenge in FORUM_CAPTCHA_FALLBACK_BY_CATEGORY.items()
}
FORUM_CAPTCHA_BY_GAME_ID: dict[str, dict[str, object]] = {
    str(challenge["gameId"]): challenge for challenge in FORUM_CAPTCHA_FALLBACK_BY_VARIANT.values()
}
FORUM_CAPTCHA_LAST_REFRESH: dict[str, datetime] = {}
FORUM_CAPTCHA_LOCKS: dict[str, asyncio.Lock] = {}
FORUM_CAPTCHA_REFRESH_TASKS: dict[str, asyncio.Task[None]] = {}
