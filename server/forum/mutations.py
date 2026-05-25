from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aiohttp import web

from link_filter import sanitize_user_message
from newid import new_id
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data

from forum.captcha import forum_captcha_is_valid
from forum.constants import (
    EDIT_WINDOW_HOURS,
    ERASED_POST_TEXT,
    ERASED_POST_USER,
    FORUM_CAPTCHA_FAIL_MESSAGE,
    FORUM_POST_PER_PAGE,
    MAX_POST_LEN,
    MAX_TOPIC_NAME_LEN,
    REACTION_TO_KEY,
    SLUG_RE,
)
from forum.permissions import can_moderate, can_write
from forum.storage import (
    notify_mentions,
    recompute_categ_summary,
    recompute_topic_summary,
    serialize_reactions,
    topic_by_tree,
)
from forum.utils import (
    json_response,
    page_count,
    parse_bool,
    session_username,
    slugify,
    to_utc,
)


async def forum_topic_create(request: web.Request) -> web.Response:
    """Create a new forum topic with its initial post and mention notifications."""
    app_state = get_app_state(request.app)
    username = await session_username(request)
    categ_id = request.match_info.get("categ", "")

    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"})
    if not SLUG_RE.match(categ_id):
        return json_response({"type": "error", "message": "Invalid category"})

    me = await app_state.users.get(username)
    if not can_write(me):
        return json_response({"type": "error", "message": "You cannot post yet"})

    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is None:
        return json_response({"type": "error", "message": "Category not found"})

    data = await read_post_data(request)
    if data is None:
        return json_response({"type": "error", "message": "Invalid request"})

    name = str(data.get("name") or "").strip()
    text = str(data.get("text") or "").strip()
    captcha_game_id = str(data.get("gameId") or "").strip()
    captcha_move = str(data.get("move") or "").strip()

    if len(name) < 3:
        return json_response({"type": "error", "message": "Topic title is too short"})
    if len(name) > MAX_TOPIC_NAME_LEN:
        return json_response({"type": "error", "message": "Topic title is too long"})
    if len(text) < 3:
        return json_response({"type": "error", "message": "Message is too short"})
    if len(text) > MAX_POST_LEN:
        return json_response({"type": "error", "message": f"Message too long (max {MAX_POST_LEN})"})
    if not forum_captcha_is_valid(captcha_game_id, captcha_move):
        return json_response({"type": "error", "message": FORUM_CAPTCHA_FAIL_MESSAGE})

    text = sanitize_user_message(text)
    if not app_state.chat_flood.allow_message(f"forum:{username}:{categ_id}:topic", text):
        return json_response(
            {"type": "error", "message": "Too many similar messages. Please wait and retry."}
        )

    base_slug = slugify(name)
    slug = base_slug
    i = 2
    while await topic_by_tree(app_state, categ_id, slug) is not None:
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
    await recompute_categ_summary(app_state, categ_id)
    await notify_mentions(
        app_state,
        text=text,
        mentioner=username,
        topic=topic_doc,
        post_id=post_id,
    )

    return json_response({"ok": True, "topic": topic_doc, "redirect": f"/forum/{categ_id}/{slug}"})


async def forum_post_create(request: web.Request) -> web.Response:
    """Create a reply post in an existing topic and update denormalized summaries."""
    app_state = get_app_state(request.app)
    username = await session_username(request)
    categ_id = request.match_info.get("categ", "")
    slug = request.match_info.get("slug", "")

    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"})
    if not SLUG_RE.match(categ_id) or not SLUG_RE.match(slug):
        return json_response({"type": "error", "message": "Invalid topic"})

    me = await app_state.users.get(username)
    if not can_write(me):
        return json_response({"type": "error", "message": "You cannot post yet"})

    topic = await topic_by_tree(app_state, categ_id, slug)
    if topic is None:
        return json_response({"type": "error", "message": "Topic not found"})
    if bool(topic.get("closed", False)):
        return json_response({"type": "error", "message": "This topic is closed"})

    data = await read_post_data(request)
    if data is None:
        return json_response({"type": "error", "message": "Invalid request"})

    text = str(data.get("text") or "").strip()
    captcha_game_id = str(data.get("gameId") or "").strip()
    captcha_move = str(data.get("move") or "").strip()
    if len(text) < 3:
        return json_response({"type": "error", "message": "Message is too short"})
    if len(text) > MAX_POST_LEN:
        return json_response({"type": "error", "message": f"Message too long (max {MAX_POST_LEN})"})
    if not forum_captcha_is_valid(captcha_game_id, captcha_move):
        return json_response({"type": "error", "message": FORUM_CAPTCHA_FAIL_MESSAGE})
    text = sanitize_user_message(text)

    if not app_state.chat_flood.allow_message(f"forum:{username}:{topic['_id']}", text):
        return json_response(
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
    await recompute_categ_summary(app_state, categ_id)
    topic_doc = await app_state.db.forum_topic.find_one({"_id": topic["_id"]})
    if topic_doc is not None:
        await notify_mentions(
            app_state,
            text=text,
            mentioner=username,
            topic=topic_doc,
            post_id=post_id,
        )
    topic_nb_posts = int((topic_doc or {}).get("nbPosts", 1))
    page = page_count(topic_nb_posts, FORUM_POST_PER_PAGE)
    return json_response(
        {
            "ok": True,
            "post": post_doc,
            "redirect": f"/forum/{categ_id}/{slug}?page={page}#{post_id}",
        }
    )


async def forum_post_edit(request: web.Request) -> web.Response:
    """Edit an existing post when ownership/time-window or moderator rights allow it."""
    app_state = get_app_state(request.app)
    username = await session_username(request)
    post_id = request.match_info.get("postId", "")

    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"})

    post = await app_state.db.forum_post.find_one({"_id": post_id})
    if post is None:
        return json_response({"type": "error", "message": "Post not found"})

    me = await app_state.users.get(username)
    is_owner = post.get("user") == username
    is_mod = can_moderate(me)
    if not is_owner and not is_mod:
        return json_response({"type": "error", "message": "Not allowed"})

    created_at = to_utc(post.get("createdAt"))
    if not is_mod and (
        created_at is None
        or (datetime.now(timezone.utc) - created_at) > timedelta(hours=EDIT_WINDOW_HOURS)
    ):
        return json_response({"type": "error", "message": "Post can no longer be edited"})

    data = await read_post_data(request)
    if data is None:
        return json_response({"type": "error", "message": "Invalid request"})

    text = str(data.get("text") or "").strip()
    if len(text) < 3:
        return json_response({"type": "error", "message": "Message is too short"})
    if len(text) > MAX_POST_LEN:
        return json_response({"type": "error", "message": f"Message too long (max {MAX_POST_LEN})"})
    text = sanitize_user_message(text)

    await app_state.db.forum_post.update_one(
        {"_id": post_id},
        {
            "$set": {"text": text, "updatedAt": datetime.now(timezone.utc)},
            "$inc": {"editCount": 1},
        },
    )
    return json_response({"ok": True})


async def forum_post_delete(request: web.Request) -> web.Response:
    """Delete a post; owners erase their own posts while moderators can hard-delete."""
    app_state = get_app_state(request.app)
    username = await session_username(request)
    post_id = request.match_info.get("postId", "")

    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"})

    post = await app_state.db.forum_post.find_one({"_id": post_id})
    if post is None:
        return json_response({"type": "error", "message": "Post not found"})

    me = await app_state.users.get(username)
    is_owner = post.get("user") == username
    if not (can_moderate(me) or is_owner):
        return json_response({"type": "error", "message": "Not allowed"})

    topic = await app_state.db.forum_topic.find_one({"_id": post.get("topicId")})
    if topic is None:
        await app_state.db.forum_post.delete_one({"_id": post_id})
        await recompute_categ_summary(app_state, str(post.get("categId")))
        return json_response({"ok": True})

    if is_owner:
        topic_posts = await app_state.db.forum_post.count_documents({"topicId": topic["_id"]})
        if topic_posts <= 1:
            await app_state.db.forum_post.delete_many({"topicId": topic["_id"]})
            await app_state.db.forum_topic.delete_one({"_id": topic["_id"]})
            await recompute_categ_summary(app_state, str(topic.get("categId")))
            return json_response({"ok": True, "deletedTopic": True})

        await app_state.db.forum_post.update_one(
            {"_id": post_id},
            {
                "$set": {
                    "user": ERASED_POST_USER,
                    "text": ERASED_POST_TEXT,
                    "erasedAt": datetime.now(timezone.utc),
                },
                "$unset": {"reactions": "", "updatedAt": ""},
            },
        )
        await recompute_topic_summary(app_state, str(topic["_id"]))
        await recompute_categ_summary(app_state, str(topic.get("categId")))
        return json_response({"ok": True, "erased": True})

    first_post = await app_state.db.forum_post.find_one(
        {"topicId": topic["_id"]},
        sort=[("createdAt", 1)],
        projection={"_id": 1},
    )
    if first_post and first_post.get("_id") == post_id:
        await app_state.db.forum_post.delete_many({"topicId": topic["_id"]})
        await app_state.db.forum_topic.delete_one({"_id": topic["_id"]})
        await recompute_categ_summary(app_state, str(topic.get("categId")))
        return json_response({"ok": True, "deletedTopic": True})

    await app_state.db.forum_post.delete_one({"_id": post_id})
    await recompute_topic_summary(app_state, str(topic["_id"]))
    await recompute_categ_summary(app_state, str(topic.get("categId")))
    return json_response({"ok": True})


async def forum_topic_close(request: web.Request) -> web.Response:
    """Toggle topic closed/open state for owners and moderators."""
    app_state = get_app_state(request.app)
    username = await session_username(request)
    categ_id = request.match_info.get("categ", "")
    slug = request.match_info.get("slug", "")

    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"})

    topic = await topic_by_tree(app_state, categ_id, slug)
    if topic is None:
        return json_response({"type": "error", "message": "Topic not found"})

    me = await app_state.users.get(username)
    if not (can_moderate(me) or topic.get("user") == username):
        return json_response({"type": "error", "message": "Not allowed"})

    next_closed = not bool(topic.get("closed", False))
    await app_state.db.forum_topic.update_one(
        {"_id": topic["_id"]}, {"$set": {"closed": next_closed}}
    )
    return json_response({"ok": True, "closed": next_closed})


async def forum_topic_sticky(request: web.Request) -> web.Response:
    """Toggle topic sticky state for moderators."""
    app_state = get_app_state(request.app)
    username = await session_username(request)
    categ_id = request.match_info.get("categ", "")
    slug = request.match_info.get("slug", "")

    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"})

    me = await app_state.users.get(username)
    if not can_moderate(me):
        return json_response({"type": "error", "message": "Not allowed"})

    topic = await topic_by_tree(app_state, categ_id, slug)
    if topic is None:
        return json_response({"type": "error", "message": "Topic not found"})

    next_sticky = not bool(topic.get("sticky", False))
    await app_state.db.forum_topic.update_one(
        {"_id": topic["_id"]}, {"$set": {"sticky": next_sticky}}
    )
    return json_response({"ok": True, "sticky": next_sticky})


async def forum_post_react(request: web.Request) -> web.Response:
    """Add or remove a reaction on a post and return updated reaction state."""
    app_state = get_app_state(request.app)
    username = await session_username(request)
    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"})

    categ_id = request.match_info.get("categ", "")
    post_id = request.match_info.get("postId", "")
    reaction = request.match_info.get("reaction", "")
    v_raw = request.match_info.get("v", "")
    if not SLUG_RE.match(categ_id):
        return json_response({"type": "error", "message": "Invalid category"})
    reaction_key = REACTION_TO_KEY.get(reaction)
    if reaction_key is None:
        return json_response({"type": "error", "message": "Invalid reaction"})

    me = await app_state.users.get(username)
    if not can_write(me):
        return json_response({"type": "error", "message": "Not allowed"})

    post = await app_state.db.forum_post.find_one({"_id": post_id, "categId": categ_id})
    if post is None:
        return json_response({"type": "error", "message": "Post not found"})
    if post.get("erasedAt") is not None:
        return json_response({"type": "error", "message": "Cannot react to deleted posts"})
    if post.get("user") == username:
        return json_response({"type": "error", "message": "Cannot react to your own post"})

    value = parse_bool(v_raw)
    update = (
        {"$addToSet": {f"reactions.{reaction_key}": username}}
        if value
        else {"$pull": {f"reactions.{reaction_key}": username}}
    )
    await app_state.db.forum_post.update_one({"_id": post_id}, update)
    updated = await app_state.db.forum_post.find_one({"_id": post_id})
    counts, mine = serialize_reactions((updated or {}).get("reactions"), viewer=username)
    return json_response(
        {
            "ok": True,
            "reactionCounts": counts,
            "myReactions": sorted(mine),
            "postId": post_id,
        }
    )


async def forum_post_relocate(request: web.Request) -> web.Response:
    """Move a full thread to another category using its first post as relocation target."""
    app_state = get_app_state(request.app)
    username = await session_username(request)
    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"})

    me = await app_state.users.get(username)
    if not can_moderate(me):
        return json_response({"type": "error", "message": "Not allowed"})

    post_id = request.match_info.get("postId", "")
    post = await app_state.db.forum_post.find_one({"_id": post_id})
    if post is None:
        return json_response({"type": "error", "message": "Post not found"})
    topic = await app_state.db.forum_topic.find_one({"_id": post.get("topicId")})
    if topic is None:
        return json_response({"type": "error", "message": "Topic not found"})

    first_post = await app_state.db.forum_post.find_one(
        {"topicId": topic["_id"]},
        sort=[("createdAt", 1)],
        projection={"_id": 1},
    )
    if first_post is None or first_post.get("_id") != post_id:
        return json_response(
            {"type": "error", "message": "Only the first post can relocate a thread"}
        )

    data = await read_post_data(request)
    if data is None:
        return json_response({"type": "error", "message": "Invalid request"})
    to_categ = str(data.get("categ") or "").strip()
    if not SLUG_RE.match(to_categ):
        return json_response({"type": "error", "message": "Invalid target category"})
    if to_categ == topic.get("categId"):
        return json_response({"type": "error", "message": "Already in that category"})
    target = await app_state.db.forum_categ.find_one({"_id": to_categ})
    if target is None:
        return json_response({"type": "error", "message": "Target category not found"})

    new_slug = str(topic.get("slug") or "")
    if await topic_by_tree(app_state, to_categ, new_slug) is not None:
        new_slug = f"{new_slug}-{datetime.now(timezone.utc).strftime('%H%M%S')[-4:]}"
        i = 2
        while await topic_by_tree(app_state, to_categ, new_slug) is not None:
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
    await recompute_categ_summary(app_state, str(topic.get("categId")))
    await recompute_categ_summary(app_state, to_categ)
    return json_response(
        {
            "ok": True,
            "redirect": f"/forum/{to_categ}/{new_slug}",
        }
    )
