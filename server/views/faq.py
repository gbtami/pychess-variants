import os

import aiohttp_jinja2

from lang import get_locale_ext
from views import get_user_context


@aiohttp_jinja2.template("FAQ.html")
async def faq(request):
    user, context = await get_user_context(request)

    # try translated faq file first
    item = "docs/faq%s.html" % get_locale_ext(context)

    # if there is no translated use the untranslated one
    if not os.path.exists(os.path.abspath(os.path.join("templates", item))):
        item = "docs/%s.html" % item

    context["view"] = "faq"
    context["faq"] = item

    return context
