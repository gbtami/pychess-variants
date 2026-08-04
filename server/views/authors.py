import aiohttp_jinja2
from aiohttp import web
from typing_defs import ViewContext
from variant_authors import public_variant_authors

from views import get_user_context


@aiohttp_jinja2.template("authors.html")
async def authors(request: web.Request) -> ViewContext:
    _user, context = await get_user_context(request)
    context["authors"] = public_variant_authors()
    context["title"] = "Chess variant authors • PyChess"
    return context
