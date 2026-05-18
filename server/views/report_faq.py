from __future__ import annotations

import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("report_faq.html")
async def report_faq(request: web.Request) -> ViewContext:
    _user, context = await get_user_context(request)
    context["title"] = "Report FAQ • PyChess"
    context["view"] = "report_faq"
    context["view_css"] = "faq.css"
    return context
