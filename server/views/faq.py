import os

import aiohttp_jinja2
from aiohttp import web

from lang import get_locale_ext
from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("FAQ.html")
async def faq(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    # try translated faq file first
    item = "docs/faq%s.html" % get_locale_ext(context)
    item_path = os.path.abspath(os.path.join("templates", item))

    # if there is no translated use the untranslated one
    if not os.path.exists(item_path):
        item = "docs/faq.html"
        item_path = os.path.abspath(os.path.join("templates", item))

    if not os.path.exists(item_path):
        raise web.HTTPNotFound()

    context["view"] = "faq"
    context["faq"] = item

    return context
