from __future__ import annotations

import os

MONGO_MAX_DOCUMENT_BYTES = 16 * 1024 * 1024
# Keep a little headroom below MongoDB's hard document limit even if an
# operator configures a larger value.
STUDY_CHAPTER_BSON_HARD_CEILING = 15 * 1024 * 1024


def _positive_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


# Lichess uses 64 chapters and 3,000 nodes per chapter. Keep those as the
# defaults, but make them deployment-configurable because PyChess variants can
# have much larger FEN/tree payloads than orthodox chess.
STUDY_MAX_CHAPTERS = _positive_int_env("STUDY_MAX_CHAPTERS", 64)
STUDY_MAX_NODES_PER_CHAPTER = _positive_int_env("STUDY_MAX_NODES_PER_CHAPTER", 3_000)
STUDY_CHAPTER_MAX_BSON_BYTES = min(
    _positive_int_env("STUDY_CHAPTER_MAX_BSON_BYTES", 8 * 1024 * 1024),
    STUDY_CHAPTER_BSON_HARD_CEILING,
)

STUDY_NAME_MAX_LENGTH = 100
STUDY_CHAPTER_NAME_MAX_LENGTH = 80

# Phase 2A annotation limits. These are deliberately conservative because annotations
# live in the same MongoDB chapter document as the variation tree.
STUDY_MAX_SHAPES_PER_POSITION = 32
STUDY_MAX_COMMENTS_PER_POSITION = 16
STUDY_MAX_NAGS_PER_POSITION = 16
STUDY_COMMENT_MAX_LENGTH = 4_000
STUDY_DESCRIPTION_MAX_LENGTH = 10_000
STUDY_MAX_TAGS = 64
STUDY_TAG_NAME_MAX_LENGTH = 64
STUDY_TAG_VALUE_MAX_LENGTH = 512
