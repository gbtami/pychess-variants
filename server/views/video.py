import aiohttp_jinja2

from videos import VIDEO_TAGS
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("video.html")
async def video(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    videoId = request.match_info.get("videoId")

    lang = context["lang"]

    def video_tag(tag):
        return app_state.translations[lang].gettext(VIDEO_TAGS.get(tag, tag))

    context["videoId"] = videoId
    context["tags"] = VIDEO_TAGS
    context["video_tag"] = video_tag

    return context
