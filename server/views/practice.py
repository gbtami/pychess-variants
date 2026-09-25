from __future__ import annotations

import aiohttp_jinja2
import practice as practice_data
import settings
from aiohttp import web
from pychess_global_app_state_utils import get_app_state
from typing_defs import ViewContext

from views import get_user_context


@aiohttp_jinja2.template("practice.html")
async def practice(request: web.Request) -> ViewContext:
    if not settings.DEV:
        raise web.HTTPNotFound()

    _user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    curriculum = await practice_data.build_practice_curriculum(
        app_state,
        sections=practice_data.PRACTICE_SECTIONS,
    )

    context["title"] = "Practice • PyChess"
    # Reuse the Study index shell for P2. Practice gets its own styling when the
    # variant selector/card UX is introduced in P3/P10.
    context["view_css"] = "study.css"
    context["practice_sections"] = curriculum
    context["practice_variant"] = request.match_info.get("variant")
    return context
