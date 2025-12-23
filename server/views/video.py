import aiohttp_jinja2
from aiohttp import web

from videos import VIDEO_TAGS, VIDEO_CATEGORIES, VIDEOS
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("video.html")
async def video(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    videoId = request.match_info.get("videoId")
    if user.game_category != "all":
        doc = await app_state.db.video.find_one({"_id": videoId})
        if doc is not None:
            category = doc.get("category", VIDEO_CATEGORIES.get(videoId, "all"))
            if category != user.game_category:
                raise web.HTTPNotFound()

    lang = context["lang"]

    def video_tag(tag):
        return app_state.translations[lang].gettext(VIDEO_TAGS.get(tag, tag))

    context["videoId"] = videoId
    if user.game_category != "all":
        available_tags = {
            tag
            for video in VIDEOS
            if video.get("category", "all") == user.game_category
            for tag in video.get("tags", [])
        }
        context["tags"] = [tag for tag in VIDEO_TAGS if tag in available_tags]
    else:
        context["tags"] = VIDEO_TAGS
    context["video_tag"] = video_tag

    return context
