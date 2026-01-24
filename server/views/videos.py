import aiohttp_jinja2
from aiohttp import web

from const import category_matches
from videos import VIDEO_TAGS, VIDEO_TARGETS, VIDEO_CATEGORIES
from typing_defs import VideoDoc, ViewContext
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("videos.html")
async def videos(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    tag = request.rel_url.query.get("tags")
    videos: list[VideoDoc] = []
    if tag is None:
        cursor = app_state.db.video.find()
    else:
        cursor = app_state.db.video.find({"tags": tag})

    async for doc in cursor:
        category = doc.get("category", VIDEO_CATEGORIES.get(doc["_id"], "all"))
        doc["category"] = category
        if not category_matches(user.game_category, category):
            continue
        videos.append(doc)

    lang = context["lang"]

    def video_tag(tag: str) -> str:
        return app_state.translations[lang].gettext(VIDEO_TAGS.get(tag, tag))

    def video_target(target: str) -> str:
        return app_state.translations[lang].gettext(VIDEO_TARGETS[target])

    context["videos"] = videos
    if user.game_category != "all":
        available_tags = {tag for video in videos for tag in video.get("tags", [])}
        context["tags"] = [tag for tag in VIDEO_TAGS if tag in available_tags]
    else:
        context["tags"] = VIDEO_TAGS
    context["video_tag"] = video_tag
    context["video_target"] = video_target

    return context
