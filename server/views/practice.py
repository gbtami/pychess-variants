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
    available_variants = practice_data.practice_variant_keys(curriculum)
    requested_variant = request.match_info.get("variant")

    if requested_variant is None and available_variants:
        menu_variant = context["menu_variant"]
        selected_variant = (
            menu_variant if menu_variant in available_variants else available_variants[0]
        )
        raise web.HTTPFound(f"/practice/{selected_variant}")

    selected_variant = requested_variant
    if selected_variant is None:
        # With no valid curated Study there is no selector target. Keep invalid DEV
        # entries visible so maintainers can see why the registry is unusable.
        visible_curriculum = curriculum
    else:
        visible_curriculum = practice_data.filter_practice_curriculum(curriculum, selected_variant)

    context["title"] = "Practice • PyChess"
    context["view_css"] = "practice.css"
    context["practice_sections"] = visible_curriculum
    context["practice_variant"] = selected_variant
    context["practice_variants"] = available_variants
    context["practice_has_content"] = selected_variant in available_variants
    return context
