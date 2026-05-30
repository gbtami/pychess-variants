import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext


@aiohttp_jinja2.template("api.html")
async def api_docs(request: web.Request) -> ViewContext:
    return {"title": "PyChess API Reference"}
