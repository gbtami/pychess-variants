from __future__ import annotations

import json
from typing import Any

import aiohttp_jinja2
import practice as practice_data
import settings
from aiohttp import web
from practice_progress import (
    EMPTY_PRACTICE_PROGRESS,
    PracticeProgress,
    load_practice_progress,
    practice_progress_key,
    record_practice_completion,
    reset_practice_chapters,
)
from pychess_global_app_state_utils import get_app_state
from study.storage import load_chapter
from typing_defs import ViewContext

from views import get_user_context
from views.study import _populate_study_chapter_context, _study_context


def _progress_username(user: Any) -> str | None:
    if user.anon or user.bot:
        return None
    return user.username


async def _user_practice_progress(app_state: Any, user: Any) -> PracticeProgress:
    username = _progress_username(user)
    if username is None:
        return EMPTY_PRACTICE_PROGRESS
    return await load_practice_progress(app_state, username)


def _practice_progress_context(
    curriculum: tuple[practice_data.PracticeSectionValidation, ...],
    progress: PracticeProgress,
) -> tuple[dict[str, object], dict[str, int]]:
    by_study: dict[str, object] = {}
    done = 0
    total = 0
    seen: set[str] = set()
    for section in curriculum:
        for resolved in section.valid_studies:
            if resolved.study is None:
                continue
            chapter_ids = tuple(chapter.id for chapter in resolved.chapters)
            summary = progress.for_study(resolved.study.id, chapter_ids)
            by_study[resolved.study.id] = summary
            if resolved.study.id in seen:
                continue
            seen.add(resolved.study.id)
            done += summary.done
            total += summary.total
    return by_study, {"done": done, "total": total}


@aiohttp_jinja2.template("practice.html")
async def practice(request: web.Request) -> ViewContext:
    if not settings.DEV:
        raise web.HTTPNotFound()

    user, context = await get_user_context(request)
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

    progress = await _user_practice_progress(app_state, user)
    progress_by_study, variant_progress = _practice_progress_context(visible_curriculum, progress)

    context["title"] = "Practice • PyChess"
    context["view_css"] = "practice.css"
    context["practice_sections"] = visible_curriculum
    context["practice_variant"] = selected_variant
    context["practice_variants"] = available_variants
    context["practice_has_content"] = selected_variant in available_variants
    context["practice_progress_authenticated"] = _progress_username(user) is not None
    context["practice_progress_by_study"] = progress_by_study
    context["practice_variant_progress"] = variant_progress
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

    user, context = await get_user_context(request)
    progress = await _user_practice_progress(app_state, user)
    chapter_ids = tuple(chapter.id for chapter in resolved.chapters)
    requested_chapter_id = request.match_info.get("chapterId")
    if requested_chapter_id is None:
        resume_chapter_id = progress.first_unfinished(resolved.study.id, chapter_ids)
        if resume_chapter_id is None:
            resume_chapter_id = resolved.chapters[0].id
        raise web.HTTPFound(f"/practice/{variant_key}/{resolved.study.id}/{resume_chapter_id}")

    chapter_metadata = next(
        (item for item in resolved.chapters if item.id == requested_chapter_id), None
    )
    if chapter_metadata is None:
        raise web.HTTPNotFound()

    try:
        chapter = await load_chapter(app_state, resolved.study.id, requested_chapter_id)
    except (TypeError, ValueError) as exc:
        raise web.HTTPNotFound(text="Practice chapter is unavailable") from exc
    if chapter is None or chapter.mode not in practice_data.PRACTICE_ELIGIBLE_CHAPTER_MODES:
        raise web.HTTPNotFound()

    study_progress = progress.for_study(resolved.study.id, chapter_ids)
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
            "completedChapterIds": list(study_progress.completed_chapter_ids),
            "persistProgress": _progress_username(user) is not None,
            **(
                {"goal": chapter_metadata.goal.to_payload()}
                if chapter_metadata.goal is not None
                else {}
            ),
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


async def practice_complete(request: web.Request) -> web.Response:
    """Persist completion of a curated Interactive Lesson for a signed-in learner."""

    if not settings.DEV:
        raise web.HTTPNotFound()

    user, _context = await get_user_context(request)
    username = _progress_username(user)
    if username is None:
        raise web.HTTPUnauthorized(text="Sign in to save Practice progress.")

    variant_key = request.match_info["variant"]
    study_id = request.match_info["studyId"]
    chapter_id = request.match_info["chapterId"]
    location = practice_data.find_practice_study(variant_key, study_id)
    if location is None:
        raise web.HTTPNotFound()

    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Practice requires database access.")
    resolved = await practice_data.validate_practice_study(app_state, location.ref)
    if not resolved.valid or resolved.study is None:
        raise web.HTTPNotFound()

    chapter = next((item for item in resolved.chapters if item.id == chapter_id), None)
    if chapter is None:
        raise web.HTTPNotFound()
    # P5 can prove success only for authored Interactive Lessons. P8 will extend this
    # endpoint to computer-practice chapters after their goal evaluator exists.
    if chapter.mode != "gamebook":
        raise web.HTTPBadRequest(text="This Practice chapter has no completion evaluator yet.")

    await record_practice_completion(app_state, username, resolved.study.id, chapter.id)
    return web.json_response({"completed": True})


async def practice_reset(request: web.Request) -> web.StreamResponse:
    """Reset the signed-in learner's progress for the selected Practice variant."""

    if not settings.DEV:
        raise web.HTTPNotFound()

    user, _context = await get_user_context(request)
    username = _progress_username(user)
    if username is None:
        raise web.HTTPUnauthorized(text="Sign in to reset Practice progress.")

    variant_key = request.match_info["variant"]
    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Practice requires database access.")

    curriculum = await practice_data.build_practice_curriculum(
        app_state,
        sections=practice_data.PRACTICE_SECTIONS,
    )
    visible = practice_data.filter_practice_curriculum(curriculum, variant_key)
    keys = tuple(
        sorted(
            {
                practice_progress_key(resolved.study.id, chapter.id)
                for section in visible
                for resolved in section.valid_studies
                if resolved.study is not None
                for chapter in resolved.chapters
            }
        )
    )
    await reset_practice_chapters(app_state, username, keys)
    raise web.HTTPFound(f"/practice/{variant_key}")
