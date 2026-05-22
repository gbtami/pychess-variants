import os

import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("legal.html")
async def contact(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    item = "docs/contact.html"
    item_path = os.path.abspath(os.path.join("templates", item))
    if not os.path.exists(item_path):
        raise web.HTTPNotFound()

    context["view_css"] = "faq.css"
    context["legal_doc"] = item
    return context
