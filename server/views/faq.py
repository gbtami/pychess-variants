import aiohttp_jinja2

from views import get_user_context


@aiohttp_jinja2.template("FAQ.html")
async def faq(request):
    user, context = await get_user_context(request)

    if context["lang"] in ("es", "hu", "it", "pt", "fr", "zh_CN", "zh_TW"):
        locale = ".%s" % context["lang"]
    else:
        locale = ""

    context["view"] = "faq"
    context["faq"] = "docs/faq%s.html" % locale

    return context
