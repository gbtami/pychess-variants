import aiohttp_jinja2

from fairy import FairyBoard
from variants import VARIANTS
from views import get_user_context


@aiohttp_jinja2.template("index.html")
async def editor(request):
    user, context = await get_user_context(request)

    variant = request.match_info.get("variant")
    if (variant is not None) and (variant not in VARIANTS):
        variant = "chess"

    fen = request.rel_url.query.get("fen")
    if fen is None:
        fen = FairyBoard.start_fen(variant)
    else:
        fen = fen.replace(".", "+").replace("_", " ")

    context["variant"] = variant
    context["fen"] = fen

    return context
