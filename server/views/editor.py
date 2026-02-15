import aiohttp_jinja2
from aiohttp import web

from fairy import FairyBoard
from variants import VARIANTS
from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("index.html")
async def editor(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    variant_key = request.match_info.get("variant") or "chess"
    if variant_key not in VARIANTS:
        variant_key = "chess"
    chess960 = variant_key.endswith("960")
    variant = variant_key[:-3] if chess960 else variant_key

    fen = request.rel_url.query.get("fen")
    if fen is None:
        fen = FairyBoard.start_fen(variant, chess960)
    else:
        fen = fen.replace(".", "+").replace("_", " ")

    context["variant"] = variant
    context["chess960"] = chess960
    context["fen"] = fen

    return context
