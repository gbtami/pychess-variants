from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import aiohttp_jinja2
from aiohttp import web
from aiohttp import ClientSession, ClientTimeout

from forum.storage import recompute_categ_summary, topic_by_tree
from newid import new_id
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from settings import ADMINS
from typing_defs import ViewContext
from ublog import (
    UBLOG_MAX_IMAGE_TEXT_LEN,
    UBLOG_MAX_INTRO_LEN,
    UBLOG_MAX_MARKDOWN_LEN,
    UBLOG_MAX_TITLE_LEN,
    display_date,
    image_src,
    is_owner,
    normalize_topics,
    post_url,
    safe_trim,
    sanitize_image_url,
    slugify_title,
    summary_from_markdown,
    to_bool,
)
from views import get_user_context


UBLOG_IMAGE_PROXY_MAX_BYTES = 5 * 1024 * 1024
UBLOG_IMAGE_PROXY_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)
UBLOG_DISCUSS_CATEG_ID = "community-blog-discussions"
UBLOG_DISCUSS_CATEG_NAME = "Community Blog Discussions"
UBLOG_DISCUSS_CATEG_DESC = "Discuss community blog posts."
UBLOG_DISCUSS_CATEG_ORDER = 25


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


def _likes_from_doc(post: dict[str, Any]) -> set[str]:
    likes_raw = post.get("likes")
    if not isinstance(likes_raw, list):
        return set()
    return {str(username) for username in likes_raw if isinstance(username, str)}


def _ublog_discuss_slug(post_id: str) -> str:
    return f"ublog-{post_id.lower()}"


async def _ensure_ublog_discuss_categ(app_state: Any) -> None:
    if app_state.db is None:
        return
    await app_state.db.forum_categ.update_one(
        {"_id": UBLOG_DISCUSS_CATEG_ID},
        {
            "$set": {
                "name": UBLOG_DISCUSS_CATEG_NAME,
                "desc": UBLOG_DISCUSS_CATEG_DESC,
                "order": UBLOG_DISCUSS_CATEG_ORDER,
            },
            "$setOnInsert": {
                "nbTopics": 0,
                "nbPosts": 0,
                "lastPostId": None,
                "lastPostAt": None,
                "lastPostUser": "",
                "lastTopicSlug": "",
                "lastTopicName": "",
                "lastTopicPage": 1,
            },
        },
        upsert=True,
    )


async def _discuss_topic_url(app_state: Any, post: dict[str, Any]) -> str:
    if app_state.db is None:
        return "/forum"

    await _ensure_ublog_discuss_categ(app_state)
    post_id = str(post.get("_id") or "")
    slug = _ublog_discuss_slug(post_id)
    topic = await topic_by_tree(app_state, UBLOG_DISCUSS_CATEG_ID, slug)
    if topic is None:
        now = datetime.now(timezone.utc)
        topic_id = await new_id(app_state.db.forum_topic)
        discuss_post_id = await new_id(app_state.db.forum_post)
        author = str(post.get("author") or "")
        topic_doc = {
            "_id": topic_id,
            "categId": UBLOG_DISCUSS_CATEG_ID,
            "slug": slug,
            "name": str(post.get("title") or "Blog discussion"),
            "user": author,
            "createdAt": now,
            "updatedAt": now,
            "nbPosts": 1,
            "lastPostId": discuss_post_id,
            "lastPostAt": now,
            "lastPostUser": author,
            "closed": False,
            "sticky": False,
        }
        discuss_post_doc = {
            "_id": discuss_post_id,
            "topicId": topic_id,
            "categId": UBLOG_DISCUSS_CATEG_ID,
            "user": author,
            "text": f"Comments on {post_url(post)}",
            "createdAt": now,
            "updatedAt": None,
            "editCount": 0,
        }
        await app_state.db.forum_topic.insert_one(topic_doc)
        await app_state.db.forum_post.insert_one(discuss_post_doc)
        await recompute_categ_summary(app_state, UBLOG_DISCUSS_CATEG_ID)

    safe_categ = quote(UBLOG_DISCUSS_CATEG_ID, safe="")
    safe_slug = quote(slug, safe="")
    return f"/forum/{safe_categ}/{safe_slug}"


def _empty_form_values() -> dict[str, Any]:
    return {
        "title": "",
        "intro": "",
        "markdown": "",
        "topics": "",
        "language": "en",
        "image": "",
        "imageAlt": "",
        "imageCredit": "",
        "live": False,
        "discuss": False,
        "sticky": False,
        "siteBlog": False,
    }


def _to_card(post: dict[str, Any], author_title: str) -> dict[str, Any]:
    image = post.get("image") or ""
    summary = summary_from_markdown(str(post.get("markdown") or ""))
    intro = str(post.get("intro") or post.get("subtitle") or summary)
    return {
        "_id": post["_id"],
        "slug": post.get("slug", ""),
        "author": post.get("author", ""),
        "author_title": author_title,
        "title": post.get("title", ""),
        "intro": intro,
        "subtitle": intro,
        "summary": summary,
        "topics": post.get("topics", []),
        "image": image,
        "imageAlt": post.get("imageAlt") or "",
        "date": display_date(post),
        "live": bool(post.get("live")),
        "sticky": bool(post.get("sticky")),
        "url": post_url(post),
        "image_src": image_src(post),
    }


async def _cards_from_posts(app_state: Any, posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(posts) == 0:
        return []
    titles = await app_state.public_users.get_titles(
        str(post.get("author") or "") for post in posts
    )
    return [_to_card(post, titles.get(str(post.get("author") or ""), "")) for post in posts]


def _is_safe_image_content_type(content_type: str | None) -> bool:
    if not content_type:
        return False
    ctype = content_type.split(";", 1)[0].strip().lower()
    return ctype in {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/avif",
        "image/svg+xml",
    }


async def _profile_exists(app_state: Any, profile_id: str) -> bool:
    profile = await app_state.public_users.get_profile(profile_id)
    return profile is not None and profile.enabled


async def _load_post(app_state: Any, post_id: str, profile_id: str) -> dict[str, Any] | None:
    if app_state.db is None:
        return None
    post = await app_state.db.ublog_post.find_one({"_id": post_id, "author": profile_id})
    if post is None:
        return None
    return post


def _form_values_from_doc(doc: dict[str, Any]) -> dict[str, Any]:
    values = _empty_form_values()
    values.update(
        {
            "title": str(doc.get("title") or ""),
            "intro": str(doc.get("intro") or ""),
            "markdown": str(doc.get("markdown") or ""),
            "topics": ", ".join(doc.get("topics", [])),
            "language": str(doc.get("language") or "en"),
            "image": str(doc.get("image") or ""),
            "imageAlt": str(doc.get("imageAlt") or ""),
            "imageCredit": str(doc.get("imageCredit") or ""),
            "live": bool(doc.get("live")),
            "discuss": bool(doc.get("discuss")),
            "sticky": bool(doc.get("sticky")),
            "siteBlog": str(doc.get("blogType") or "") == "site",
        }
    )
    return values


def _build_form_context(
    context: ViewContext,
    profile_id: str,
    values: dict[str, Any],
    errors: list[str],
    post: dict[str, Any] | None = None,
) -> ViewContext:
    context["title"] = "Blog editor • PyChess"
    context["view_css"] = "ublog.css"
    context["profile"] = profile_id
    context["ublog_values"] = values
    context["ublog_errors"] = errors
    context["ublog_post"] = post
    context["ublog_create_mode"] = post is None
    context["ublog_cancel_url"] = f"/blogs/@/{profile_id}" if post is None else post_url(post)
    context["ublog_can_publish_site"] = bool(context.get("admin"))
    return context


def _extract_form_values(data: Any, defaults: dict[str, Any]) -> dict[str, Any]:
    values = dict(defaults)
    values["title"] = safe_trim(str(data.get("title") or values["title"]), UBLOG_MAX_TITLE_LEN)
    values["intro"] = safe_trim(str(data.get("intro") or values["intro"]), UBLOG_MAX_INTRO_LEN)
    values["markdown"] = safe_trim(
        str(data.get("markdown") or values["markdown"]), UBLOG_MAX_MARKDOWN_LEN
    )
    values["topics"] = safe_trim(str(data.get("topics") or values["topics"]), 300)
    values["language"] = safe_trim(str(data.get("language") or values["language"]), 16) or "en"
    values["image"] = safe_trim(str(data.get("image") or values["image"]), 400)
    values["imageAlt"] = safe_trim(
        str(data.get("imageAlt") or values["imageAlt"]), UBLOG_MAX_IMAGE_TEXT_LEN
    )
    values["imageCredit"] = safe_trim(
        str(data.get("imageCredit") or values["imageCredit"]), UBLOG_MAX_IMAGE_TEXT_LEN
    )
    values["live"] = to_bool(data.get("live"))
    values["discuss"] = to_bool(data.get("discuss"))
    values["sticky"] = to_bool(data.get("sticky"))
    values["siteBlog"] = to_bool(data.get("siteBlog"))
    return values


def _validate_content(values: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if len(values["title"]) < 3:
        errors.append("Title must have at least 3 characters.")
    if len(values["intro"]) < 3:
        errors.append("Intro must have at least 3 characters.")
    if len(values["markdown"]) < 3:
        errors.append("Post body must have at least 3 characters.")
    return errors


def _validate_media(values: dict[str, Any]) -> list[str]:
    image = sanitize_image_url(values["image"])
    if values["image"] != "" and image is None:
        return ["Image URL must be absolute http(s) or start with /."]
    return []


def _validate_full(values: dict[str, Any]) -> list[str]:
    errors = _validate_content(values)
    errors.extend(_validate_media(values))
    return errors


@aiohttp_jinja2.template("ublog_community.html")
async def community(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    topic = (request.rel_url.query.get("topic") or "").strip().lower()
    if app_state.db is None:
        context["community_posts"] = []
        context["community_topic"] = topic
        context["community_topics"] = []
        context["title"] = "Community blogs • PyChess"
        context["view_css"] = "ublog.css"
        return context

    query: dict[str, Any] = {
        "live": True,
        "$or": [{"blogType": {"$exists": False}}, {"blogType": {"$ne": "site"}}],
    }
    if topic != "":
        query["topics"] = topic
    cursor = app_state.db.ublog_post.find(query).sort(
        [("sticky", -1), ("publishedAt", -1), ("createdAt", -1)]
    )
    posts = await cursor.limit(60).to_list(60)
    context["community_posts"] = await _cards_from_posts(app_state, posts)
    context["community_topic"] = topic
    context["community_topics"] = sorted(
        t
        for t in await app_state.db.ublog_post.distinct(
            "topics",
            {
                "live": True,
                "$or": [{"blogType": {"$exists": False}}, {"blogType": {"$ne": "site"}}],
            },
        )
        if isinstance(t, str)
    )
    context["title"] = "Community blogs • PyChess"
    context["view_css"] = "ublog.css"
    return context


async def image_proxy(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    post_id = request.match_info["postId"]
    if app_state.db is None:
        return web.Response(status=503)

    post = await app_state.db.ublog_post.find_one({"_id": post_id}, {"image": 1})
    if post is None:
        return web.Response(status=404)
    image = str(post.get("image") or "")
    if not (image.startswith("http://") or image.startswith("https://")):
        return web.Response(status=404)

    return await _proxy_image_from_url(image)


async def image_proxy_external(request: web.Request) -> web.Response:
    # Proxy arbitrary external inline blog images referenced from markdown content.
    raw_url = request.rel_url.query.get("url", "")
    image = raw_url.strip()
    if image == "":
        return web.Response(status=400)
    if not (image.startswith("http://") or image.startswith("https://")):
        return web.Response(status=404)
    return await _proxy_image_from_url(image)


async def _proxy_image_from_url(image: str) -> web.Response:
    timeout = ClientTimeout(total=8)
    try:
        async with ClientSession(
            timeout=timeout,
            headers={
                "User-Agent": UBLOG_IMAGE_PROXY_UA,
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
        ) as session:
            async with session.get(image) as resp:
                if resp.status != 200:
                    return web.Response(status=404)
                content_type = resp.headers.get("Content-Type")
                if not _is_safe_image_content_type(content_type):
                    return web.Response(status=404)
                body = await resp.read()
                if len(body) > UBLOG_IMAGE_PROXY_MAX_BYTES:
                    return web.Response(status=413)
                return web.Response(
                    body=body,
                    content_type=content_type.split(";", 1)[0].strip(),
                    headers={"Cache-Control": "public, max-age=3600"},
                )
    except Exception:
        return web.Response(status=404)


async def discuss(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    post_id = request.match_info["postId"]
    if app_state.db is None:
        raise web.HTTPFound("/forum")

    post = await app_state.db.ublog_post.find_one({"_id": post_id, "live": True})
    if post is None:
        raise web.HTTPFound("/forum")

    discuss_url = await _discuss_topic_url(app_state, post)
    raise web.HTTPFound(discuss_url)


async def like(request: web.Request) -> web.StreamResponse:
    user, _context = await get_user_context(request)
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    post_id = request.match_info["postId"]
    wants_json = (
        "application/json" in request.headers.get("Accept", "")
        or request.headers.get("X-Requested-With") == "XMLHttpRequest"
    )
    doc = await _load_post(app_state, post_id, profile_id)
    if doc is None or not bool(doc.get("live")):
        if wants_json:
            return web.json_response({"ok": False, "error": "not_found"}, status=404)
        raise web.HTTPNotFound()
    if app_state.db is None:
        if wants_json:
            return web.json_response({"ok": False, "error": "db_unavailable"}, status=503)
        raise web.HTTPServiceUnavailable(text="Database unavailable")
    if user.anon or is_owner(user.username, profile_id, user.anon):
        if wants_json:
            return web.json_response({"ok": False, "error": "forbidden"}, status=403)
        raise web.HTTPFound(post_url(doc))

    likes = _likes_from_doc(doc)
    liked = user.username in likes
    if user.username in likes:
        await app_state.db.ublog_post.update_one(
            {"_id": post_id, "author": profile_id},
            {"$pull": {"likes": user.username}},
        )
        liked = False
    else:
        await app_state.db.ublog_post.update_one(
            {"_id": post_id, "author": profile_id},
            {"$addToSet": {"likes": user.username}},
        )
        liked = True

    if wants_json:
        updated = await app_state.db.ublog_post.find_one(
            {"_id": post_id, "author": profile_id}, {"likes": 1}
        )
        updated_likes = _likes_from_doc(updated or {})
        return web.json_response({"ok": True, "liked": liked, "likes": len(updated_likes)})
    raise web.HTTPFound(post_url(doc))


async def like_redirect(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    post_id = request.match_info["postId"]
    doc = await _load_post(app_state, post_id, profile_id)
    if doc is None:
        raise web.HTTPFound("/blogs/community")
    raise web.HTTPFound(post_url(doc))


@aiohttp_jinja2.template("ublog_index.html")
async def user_blog(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    if not await _profile_exists(app_state, profile_id):
        raise web.HTTPNotFound()

    if app_state.db is None:
        context["ublog_posts"] = []
    else:
        posts = await (
            app_state.db.ublog_post.find({"author": profile_id, "live": True})
            .sort([("sticky", -1), ("publishedAt", -1), ("createdAt", -1)])
            .limit(50)
            .to_list(50)
        )
        context["ublog_posts"] = await _cards_from_posts(app_state, posts)

    context["profile"] = profile_id
    context["ublog_is_owner"] = is_owner(user.username, profile_id, user.anon)
    context["ublog_is_drafts"] = False
    context["title"] = f"By {profile_id} • PyChess"
    context["view_css"] = "ublog.css"
    return context


@aiohttp_jinja2.template("ublog_index.html")
async def drafts(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    if not is_owner(user.username, profile_id, user.anon):
        raise web.HTTPForbidden()

    if app_state.db is None:
        context["ublog_posts"] = []
    else:
        posts = await (
            app_state.db.ublog_post.find({"author": profile_id, "live": False})
            .sort([("updatedAt", -1), ("createdAt", -1)])
            .limit(50)
            .to_list(50)
        )
        context["ublog_posts"] = await _cards_from_posts(app_state, posts)

    context["profile"] = profile_id
    context["ublog_is_owner"] = True
    context["ublog_is_drafts"] = True
    context["title"] = f"{profile_id} drafts • PyChess"
    context["view_css"] = "ublog.css"
    return context


@aiohttp_jinja2.template("ublog_post.html")
async def post(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    post_id = request.match_info["postId"]
    slug = request.match_info["slug"]
    doc = await _load_post(app_state, post_id, profile_id)
    if doc is None:
        raise web.HTTPNotFound()

    owner = is_owner(user.username, profile_id, user.anon)
    if not bool(doc.get("live")) and not owner:
        raise web.HTTPNotFound()

    canonical = post_url(doc)
    if not canonical.endswith(f"/{slug}/{post_id}"):
        raise web.HTTPFound(canonical)

    if app_state.db is not None and bool(doc.get("live")):
        await app_state.db.ublog_post.update_one({"_id": post_id}, {"$inc": {"views": 1}})
        doc["views"] = int(doc.get("views", 0)) + 1

    related_docs: list[dict[str, Any]] = []
    if app_state.db is not None:
        related_docs = await (
            app_state.db.ublog_post.find(
                {"author": profile_id, "live": True, "_id": {"$ne": doc["_id"]}},
            )
            .sort([("publishedAt", -1), ("createdAt", -1)])
            .limit(3)
            .to_list(3)
        )

    cards = await _cards_from_posts(app_state, [doc] + related_docs)
    post_card = cards[0]
    related_cards = cards[1:]
    post_card["markdown"] = str(doc.get("markdown") or "")
    post_card["imageCredit"] = str(doc.get("imageCredit") or "")
    post_card["views"] = int(doc.get("views", 0))
    post_card["discuss"] = bool(doc.get("discuss"))
    post_card["language"] = str(doc.get("language") or "en")
    post_card["image_src"] = image_src(doc)
    likes = _likes_from_doc(doc)
    post_card["likes"] = len(likes)
    post_card["liked"] = (not user.anon) and (user.username in likes)

    context["profile"] = profile_id
    context["ublog_is_owner"] = owner
    context["ublog_author_online"] = profile_id in app_state.users
    context["ublog_post"] = post_card
    context["ublog_related"] = related_cards
    context["title"] = f"{post_card['title']} • PyChess"
    context["view_css"] = "ublog.css"
    return context


@aiohttp_jinja2.template("ublog_form.html")
async def new_form(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    if not await _profile_exists(app_state, profile_id):
        raise web.HTTPNotFound()
    if not is_owner(user.username, profile_id, user.anon):
        raise web.HTTPForbidden()

    return _build_form_context(context, profile_id, _empty_form_values(), [])


async def create(request: web.Request) -> web.Response:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database unavailable")
    if not await _profile_exists(app_state, profile_id):
        raise web.HTTPNotFound()
    if not is_owner(user.username, profile_id, user.anon):
        raise web.HTTPForbidden()

    data = await read_post_data(request)
    if data is None:
        raise web.HTTPBadRequest(text="Invalid form data")

    values = _extract_form_values(data, _empty_form_values())
    errors = _validate_content(values)

    if errors:
        ctx = _build_form_context(context, profile_id, values, errors)
        return aiohttp_jinja2.render_template("ublog_form.html", request, ctx, status=400)

    now = datetime.now(timezone.utc)
    post_id = await new_id(app_state.db.ublog_post)
    topics = normalize_topics(values["topics"])
    image = sanitize_image_url(values["image"])
    doc = {
        "_id": post_id,
        "author": profile_id,
        "slug": slugify_title(values["title"]),
        "title": values["title"],
        "intro": values["intro"],
        "markdown": values["markdown"],
        "topics": topics,
        "language": values["language"],
        "image": image or "",
        "imageAlt": values["imageAlt"],
        "imageCredit": values["imageCredit"],
        "live": False,
        "discuss": False,
        "sticky": False,
        "views": 0,
        "likes": [],
        "createdAt": now,
        "updatedAt": now,
        "publishedAt": None,
    }
    await app_state.db.ublog_post.insert_one(doc)
    raise web.HTTPFound(f"/blogs/@/{profile_id}/{post_id}/edit")


@aiohttp_jinja2.template("ublog_form.html")
async def edit_form(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    post_id = request.match_info["postId"]
    if not is_owner(user.username, profile_id, user.anon):
        raise web.HTTPForbidden()
    doc = await _load_post(app_state, post_id, profile_id)
    if doc is None:
        raise web.HTTPNotFound()
    values = _form_values_from_doc(doc)
    return _build_form_context(context, profile_id, values, [], post=doc)


async def update(request: web.Request) -> web.Response:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    post_id = request.match_info["postId"]
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database unavailable")
    if not is_owner(user.username, profile_id, user.anon):
        raise web.HTTPForbidden()

    doc = await _load_post(app_state, post_id, profile_id)
    if doc is None:
        raise web.HTTPNotFound()

    data = await read_post_data(request)
    if data is None:
        raise web.HTTPBadRequest(text="Invalid form data")

    action = str(data.get("action") or "apply")
    values = _extract_form_values(data, _form_values_from_doc(doc))
    errors = _validate_full(values)

    if errors:
        ctx = _build_form_context(context, profile_id, values, errors, post=doc)
        return aiohttp_jinja2.render_template("ublog_form.html", request, ctx, status=400)

    image = sanitize_image_url(values["image"])
    next_live = values["live"]
    can_publish_site = _is_admin_username(user.username)
    update_fields: dict[str, Any] = {
        "updatedAt": datetime.now(timezone.utc),
        "title": values["title"],
        "intro": values["intro"],
        "markdown": values["markdown"],
        "topics": normalize_topics(values["topics"]),
        "language": values["language"],
        "slug": slugify_title(values["title"]),
        "image": image or "",
        "imageAlt": values["imageAlt"],
        "imageCredit": values["imageCredit"],
        "live": next_live,
        "discuss": values["discuss"],
        "sticky": values["sticky"],
    }
    if can_publish_site:
        # Admins can publish posts into the official "By PyChess" stream.
        if bool(values.get("siteBlog")):
            update_fields["blogType"] = "site"
            update_fields["isOfficial"] = True
        else:
            update_fields["blogType"] = "community"
            update_fields["isOfficial"] = False
    if next_live and not bool(doc.get("live")):
        update_fields["publishedAt"] = datetime.now(timezone.utc)
    elif not next_live:
        update_fields["publishedAt"] = None

    await app_state.db.ublog_post.update_one({"_id": post_id}, {"$set": update_fields})
    updated = await _load_post(app_state, post_id, profile_id)
    if updated is None:
        raise web.HTTPNotFound()

    if action == "view-post" and bool(updated.get("live")):
        raise web.HTTPFound(post_url(updated))
    raise web.HTTPFound(f"/blogs/@/{profile_id}/{post_id}/edit")


async def delete(request: web.Request) -> web.Response:
    user, _context = await get_user_context(request)
    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    post_id = request.match_info["postId"]
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database unavailable")
    if not is_owner(user.username, profile_id, user.anon):
        raise web.HTTPForbidden()
    await app_state.db.ublog_post.delete_one({"_id": post_id, "author": profile_id})
    raise web.HTTPFound(f"/blogs/@/{profile_id}/drafts")
