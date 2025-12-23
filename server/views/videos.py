import aiohttp_jinja2

from videos import VIDEO_TAGS, VIDEO_TARGETS, VIDEO_CATEGORIES
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("videos.html")
async def videos(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    tag = request.rel_url.query.get("tags")
    videos = []
    if tag is None:
        cursor = app_state.db.video.find()
    else:
        cursor = app_state.db.video.find({"tags": tag})

    async for doc in cursor:
        category = doc.get("category", VIDEO_CATEGORIES.get(doc["_id"], "all"))
        doc["category"] = category
        if user.game_category != "all" and category != user.game_category:
            continue
        videos.append(doc)

    lang = context["lang"]

    def video_tag(tag):
        return app_state.translations[lang].gettext(VIDEO_TAGS.get(tag, tag))

    def video_target(target):
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
