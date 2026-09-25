from __future__ import annotations

import json

import aiohttp_jinja2
import practice as practice_data
import settings
from aiohttp import web
from pychess_global_app_state_utils import get_app_state
from study.storage import load_chapter
from typing_defs import ViewContext

from views import get_user_context
from views.study import _populate_study_chapter_context, _study_context


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


@aiohttp_jinja2.template("analysis.html")
async def practice_study(request: web.Request) -> ViewContext | web.Response:
    """Render one curated Study in the learner-only Practice shell."""

    if not settings.DEV:
        raise web.HTTPNotFound()

    variant_key = request.match_info["variant"]
    study_id = request.match_info["studyId"]
    location = practice_data.find_practice_study(variant_key, study_id)
    if location is None:
        raise web.HTTPNotFound()

    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Practice requires database access.")

    resolved = await practice_data.validate_practice_study(app_state, location.ref)
    if not resolved.valid or resolved.study is None:
        reason = "; ".join(issue.message for issue in resolved.issues) or "Invalid Practice Study"
        raise web.HTTPNotFound(text=reason)

    requested_chapter_id = request.match_info.get("chapterId")
    if requested_chapter_id is None:
        raise web.HTTPFound(
            f"/practice/{variant_key}/{resolved.study.id}/{resolved.chapters[0].id}"
        )

    if requested_chapter_id not in {chapter.id for chapter in resolved.chapters}:
        raise web.HTTPNotFound()

    try:
        chapter = await load_chapter(app_state, resolved.study.id, requested_chapter_id)
    except (TypeError, ValueError) as exc:
        raise web.HTTPNotFound(text="Practice chapter is unavailable") from exc
    if chapter is None or chapter.mode not in practice_data.PRACTICE_ELIGIBLE_CHAPTER_MODES:
        raise web.HTTPNotFound()

    user, context = await get_user_context(request)
    _study_context(context)
    context["view"] = "study"
    context["title"] = f"{resolved.study.name} • Practice • PyChess"
    await _populate_study_chapter_context(
        app_state,
        user,
        context,
        resolved.study,
        chapter,
        writable=False,
        practice_context={
            "variant": variant_key,
            "sectionId": location.section.id,
            "sectionName": location.section.name,
            "indexUrl": f"/practice/{variant_key}",
            "studyUrl": f"/practice/{variant_key}/{resolved.study.id}",
        },
    )

    if request.headers.get("Accept") == "application/json":
        return web.json_response(
            {
                "study": json.loads(str(context["study_data"])),
                "board": json.loads(str(context["board"])),
                "cataloguedVariants": json.loads(str(context.get("catalogued_variants") or "[]")),
            }
        )
    return context
