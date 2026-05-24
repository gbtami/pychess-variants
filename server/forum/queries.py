from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode

from aiohttp import web

from const import GAME_CATEGORY_ALL, normalize_game_category
from pychess_global_app_state_utils import get_app_state

from forum.captcha import maybe_refresh_forum_captcha_pool, forum_captcha_public_payload
from forum.constants import (
    EDIT_WINDOW_HOURS,
    ERASED_POST_USER,
    FORUM_POST_PER_PAGE,
    FORUM_SEARCH_PER_PAGE,
    FORUM_TOPIC_PER_PAGE,
    SLUG_RE,
)
from forum.permissions import can_moderate, can_write
from forum.storage import ensure_categs, serialize_reactions, topic_by_tree
from forum.utils import (
    escape_regex,
    json_response,
    normalize_page,
    page_count,
    post_page_for_index,
    session_username,
    to_utc,
)


async def forum_categs(request: web.Request) -> web.Response:
    """Return forum categories with summary counters for the forum index view."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return json_response({"categs": []})

    await ensure_categs(app_state)
    cursor = app_state.db.forum_categ.find()
    cursor.sort("order", 1)
    categs = await cursor.to_list(length=50)
    return json_response({"categs": categs})


async def forum_topics(request: web.Request) -> web.Response:
    """Return paginated topics for a category, including write/mod capability flags."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return json_response({"type": "error", "message": "Forum unavailable"})
    await ensure_categs(app_state)

    categ_id = request.match_info.get("categ", "")
    if not SLUG_RE.match(categ_id):
        return json_response({"type": "error", "message": "Invalid category"})

    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is None:
        return json_response({"type": "error", "message": "Category not found"})

    total = await app_state.db.forum_topic.count_documents({"categId": categ_id})
    nb_pages = page_count(total, FORUM_TOPIC_PER_PAGE)
    page = normalize_page(request.rel_url.query.get("page"), nb_pages)
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
                "lastPage": page_count(nb_posts, FORUM_POST_PER_PAGE),
            }
        )

    username = await session_username(request)
    can_write_forum = False
    can_moderate_forum = False
    game_category = GAME_CATEGORY_ALL
    if username is not None:
        user = await app_state.users.get(username)
        if user is not None:
            can_write_forum = can_write(user)
            can_moderate_forum = can_moderate(user)
            game_category = normalize_game_category(user.game_category)
    if can_write_forum:
        await maybe_refresh_forum_captcha_pool(app_state, game_category)

    return json_response(
        {
            "categ": categ,
            "topics": topic_items,
            "page": page,
            "nbPages": nb_pages,
            "total": total,
            "canWrite": can_write_forum,
            "canModerate": can_moderate_forum,
            "captcha": forum_captcha_public_payload(game_category) if can_write_forum else None,
        }
    )


async def forum_topic(request: web.Request) -> web.Response:
    """Return a paginated topic view with posts, reaction state, and moderation metadata."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return json_response({"type": "error", "message": "Forum unavailable"})
    await ensure_categs(app_state)

    categ_id = request.match_info.get("categ", "")
    slug = request.match_info.get("slug", "")
    if not SLUG_RE.match(categ_id) or not SLUG_RE.match(slug):
        return json_response({"type": "error", "message": "Invalid topic"})

    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is None:
        return json_response({"type": "error", "message": "Category not found"})

    topic = await topic_by_tree(app_state, categ_id, slug)
    if topic is None:
        return json_response({"type": "error", "message": "Topic not found"})

    total = await app_state.db.forum_post.count_documents({"topicId": topic["_id"]})
    nb_pages = page_count(total, FORUM_POST_PER_PAGE)
    page = normalize_page(request.rel_url.query.get("page"), nb_pages)
    skip = (page - 1) * FORUM_POST_PER_PAGE

    cursor = app_state.db.forum_post.find({"topicId": topic["_id"]})
    cursor.sort("createdAt", 1)
    cursor.skip(skip)
    cursor.limit(FORUM_POST_PER_PAGE)
    posts = await cursor.to_list(length=FORUM_POST_PER_PAGE)

    usernames = [str(post.get("user") or "") for post in posts if post.get("user")]
    titles = await app_state.public_users.get_titles(usernames)

    username = await session_username(request)
    me = None
    can_write_forum = False
    can_moderate_forum = False
    can_reply = False
    game_category = GAME_CATEGORY_ALL
    if username is not None:
        me = await app_state.users.get(username)
        if me is not None:
            can_write_forum = can_write(me)
            can_moderate_forum = can_moderate(me)
            can_reply = can_write_forum and not bool(topic.get("closed", False))
            game_category = normalize_game_category(me.game_category)
    if can_reply:
        await maybe_refresh_forum_captcha_pool(app_state, game_category)

    post_items: list[dict[str, object]] = []
    for post in posts:
        owner = str(post.get("user") or "")
        created_at = to_utc(post.get("createdAt"))
        erased = bool(post.get("erasedAt")) or owner == ERASED_POST_USER
        can_edit = False
        can_delete = False
        can_react = False
        if username is not None and not erased:
            can_delete = can_moderate_forum or owner == username
            can_edit = can_delete
            if owner == username and created_at is not None:
                can_edit = (datetime.now(timezone.utc) - created_at) <= timedelta(
                    hours=EDIT_WINDOW_HOURS
                )
            if me is not None:
                can_react = can_write(me) and owner != username and not me.bot
        reaction_counts, my_reactions = serialize_reactions(post.get("reactions"), viewer=username)
        post_items.append(
            {
                **post,
                "userTitle": titles.get(owner, ""),
                "erased": erased,
                "canEdit": can_edit,
                "canDelete": can_delete,
                "canReact": can_react,
                "reactionCounts": reaction_counts,
                "myReactions": sorted(my_reactions),
            }
        )

    relocate_targets: list[dict[str, object]] = []
    if can_moderate_forum:
        rel_cursor = app_state.db.forum_categ.find({"_id": {"$ne": categ_id}})
        rel_cursor.sort("order", 1)
        relocate_targets = await rel_cursor.to_list(length=50)

    return json_response(
        {
            "categ": categ,
            "topic": topic,
            "posts": post_items,
            "page": page,
            "nbPages": nb_pages,
            "total": total,
            "canWrite": can_write_forum,
            "canModerate": can_moderate_forum,
            "canReply": can_reply,
            "canClose": can_moderate_forum or (username == topic.get("user")),
            "canSticky": can_moderate_forum,
            "relocateTargets": relocate_targets,
            "captcha": forum_captcha_public_payload(game_category) if can_reply else None,
        }
    )


async def forum_search(request: web.Request) -> web.Response:
    """Search forum posts by text and return enriched topic/category context."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return json_response({"posts": [], "page": 1, "nbPages": 1, "total": 0, "text": ""})

    text = str(request.rel_url.query.get("text") or "").strip()
    if text == "":
        return json_response({"posts": [], "page": 1, "nbPages": 1, "total": 0, "text": ""})

    if len(text) > 80:
        return json_response({"type": "error", "message": "Search text too long"})

    query = {"text": {"$regex": escape_regex(text), "$options": "i"}}
    total = await app_state.db.forum_post.count_documents(query)
    nb_pages = page_count(total, FORUM_SEARCH_PER_PAGE)
    page = normalize_page(request.rel_url.query.get("page"), nb_pages)
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

    return json_response(
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

    created_at = to_utc(post.get("createdAt"))
    if created_at is None:
        page = 1
    else:
        rank = await app_state.db.forum_post.count_documents(
            {"topicId": topic["_id"], "createdAt": {"$lte": created_at}}
        )
        page = post_page_for_index(max(rank - 1, 0), FORUM_POST_PER_PAGE)

    categ_id = str(topic.get("categId") or "")
    slug = str(topic.get("slug") or "")
    safe_categ_id = quote(categ_id, safe="")
    safe_slug = quote(slug, safe="")
    safe_post_id = quote(str(post_id), safe="")
    query = urlencode({"page": page})
    raise web.HTTPFound(f"/forum/{safe_categ_id}/{safe_slug}?{query}#{safe_post_id}")


async def forum_topic_participants(request: web.Request) -> web.Response:
    """Return distinct usernames who posted in a topic for mention assistance."""
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return json_response({"participants": []})
    username = await session_username(request)
    if username is None:
        return json_response({"participants": []})

    topic_id = request.match_info.get("topicId", "")
    if len(topic_id) != 8:
        return json_response({"type": "error", "message": "Invalid topic id"})

    users = await app_state.db.forum_post.distinct(
        "user", {"topicId": topic_id, "user": {"$ne": ERASED_POST_USER}}
    )
    participants = sorted({str(user) for user in users if isinstance(user, str)}, key=str.casefold)
    return json_response({"participants": participants})


async def forum_mod_feed(request: web.Request) -> web.Response:
    """Return a moderator-only chronological feed of posts in one category."""
    app_state = get_app_state(request.app)
    username = await session_username(request)
    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"})

    me = await app_state.users.get(username)
    if not can_moderate(me):
        return json_response({"type": "error", "message": "Not allowed"})

    categ_id = request.match_info.get("categ", "")
    if not SLUG_RE.match(categ_id):
        return json_response({"type": "error", "message": "Invalid category"})
    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is None:
        return json_response({"type": "error", "message": "Category not found"})

    total = await app_state.db.forum_post.count_documents({"categId": categ_id})
    nb_pages = page_count(total, FORUM_TOPIC_PER_PAGE)
    page = normalize_page(request.rel_url.query.get("page"), nb_pages)
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

    return json_response(
        {
            "categ": categ,
            "items": items,
            "page": page,
            "nbPages": nb_pages,
            "total": total,
        }
    )
