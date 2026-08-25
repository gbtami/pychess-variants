from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import UTC, datetime
from urllib.parse import urlparse

from const import ANON_PREFIX

UBLOG_MAX_TITLE_LEN = 80
UBLOG_MAX_INTRO_LEN = 1_000
UBLOG_MAX_MARKDOWN_LEN = 100_000
UBLOG_MAX_IMAGE_TEXT_LEN = 200
UBLOG_MAX_TOPICS = 5

UBLOG_STEP_CONTENT = "content"
UBLOG_STEP_MEDIA = "media"
UBLOG_STEP_PUBLISH = "publish"
UBLOG_STEPS = {UBLOG_STEP_CONTENT, UBLOG_STEP_MEDIA, UBLOG_STEP_PUBLISH}


# Deferred translations for stable topic identifiers rendered through Jinja gettext.
def _(message: str) -> str:
    return message


UBLOG_TOPIC_WHITELIST = (
    _("chess"),
    _("analysis"),
    _("puzzle"),
    _("opening"),
    _("endgame"),
    _("tactics"),
    _("strategy"),
    _("engine"),
    _("BOT"),
    _("over the board"),
    _("tournament"),
    _("chess variant"),
    _("software development"),
    _("off topic"),
    _("lichess"),
    _("lishogi"),
    _("playstrategy"),
    _("announcement"),
    _("fairy"),
    _("army"),
    _("makruk"),
    _("shogi"),
    _("xiangqi"),
    _("other"),
    _("all"),
)
UBLOG_TOPIC_LOOKUP = {topic.casefold(): topic for topic in UBLOG_TOPIC_WHITELIST}
del _


def slugify_title(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.strip().lower()).strip("-")
    return slug[:80] or "post"


def normalize_step(value: str | None) -> str:
    if value in UBLOG_STEPS:
        return value
    return UBLOG_STEP_CONTENT


def normalize_topics(raw: str) -> list[str]:
    deduped: list[str] = []
    for part in raw.split(","):
        candidate = part.strip()
        if candidate == "":
            continue
        topic = UBLOG_TOPIC_LOOKUP.get(candidate.casefold())
        if topic is None or topic in deduped:
            continue
        deduped.append(topic)
        if len(deduped) >= UBLOG_MAX_TOPICS:
            break
    return deduped


def sanitize_image_url(raw: str) -> str | None:
    value = raw.strip()
    if value == "":
        return None
    if len(value) > 400:
        return None
    if value.startswith("/"):
        return value

    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https"):
        return None
    if not parsed.netloc:
        return None
    return value


def safe_trim(raw: str, max_len: int) -> str:
    return raw.strip()[:max_len]


def is_owner(username: str, profile_id: str, anon: bool) -> bool:
    return (not anon) and (not username.startswith(ANON_PREFIX)) and username == profile_id


def post_url(post: Mapping[str, object]) -> str:
    author = str(post.get("author") or "")
    slug = str(post.get("slug") or "")
    post_id = str(post.get("_id") or "")
    return f"/blogs/@/{author}/{slug}/{post_id}"


def image_src(post: Mapping[str, object]) -> str:
    image = str(post.get("image") or "")
    if image.startswith(("http://", "https://")):
        post_id = str(post.get("_id") or "")
        if post_id:
            return f"/blogs/image/{post_id}"
    if image.startswith(("/images/", "/icons/")):
        return f"/static{image}"
    return image


def summary_from_markdown(markdown: str, max_len: int = 140) -> str:
    text = re.sub(r"[#>*`_~\[\]()!-]+", " ", markdown)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def display_date(post: Mapping[str, object]) -> str:
    dt = post.get("publishedAt") or post.get("updatedAt") or post.get("createdAt")
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC).strftime("%Y-%m-%d")
    return ""


def to_bool(raw: object) -> bool:
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return False
    return str(raw).strip().lower() in ("1", "true", "yes", "on")
