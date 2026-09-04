from __future__ import annotations

import json
from typing import Any

import aiohttp_jinja2
from aiohttp import web
from catalogued_variants import catalogued_variant_client_doc_for_name
from fairy import BLACK, FairyBoard
from json_utils import json_dumps
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from study.models import Study, StudyChapter
from study.storage import (
    StudyStorageError,
    add_chapter,
    chapter_previews,
    create_study_with_chapter,
    delete_chapter,
    delete_study,
    load_owned_chapter,
    load_owned_study,
    rename_chapter,
    rename_study,
    select_chapter,
    studies_for_owner,
)
from typing_defs import ViewContext
from variants import ALL_VARIANTS, is_catalogued_variant

from views import get_user_context


def _require_owner_user(user: Any) -> None:
    if user.anon:
        raise web.HTTPFound("/login")
    if user.bot:
        raise web.HTTPForbidden(text="BOT accounts cannot use Studies.")


def _study_context(context: ViewContext) -> None:
    context["view_css"] = "study.css"
    context["title"] = "Studies • PyChess"


async def _owned_study_and_chapter(
    request: web.Request,
) -> tuple[Any, ViewContext, Study, StudyChapter]:
    user, context = await get_user_context(request)
    _require_owner_user(user)
    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Studies require database access.")

    study_id = request.match_info["studyId"]
    study = await load_owned_study(app_state, study_id, user.username)
    if study is None:
        raise web.HTTPNotFound()

    chapter_id = request.match_info.get("chapterId") or study.current_chapter
    chapter = None
    if chapter_id:
        chapter = await load_owned_chapter(app_state, study.id, chapter_id, user.username)
    if chapter is None:
        doc = await app_state.db.study_chapter.find_one(
            {"studyId": study.id, "owner": user.username}, sort=[("order", 1)]
        )
        if doc is None:
            raise web.HTTPNotFound(text="Study has no chapters")
        chapter = StudyChapter.from_document(doc)
    return user, context, study, chapter


def _study_board(chapter: StudyChapter) -> dict[str, object]:
    board = FairyBoard(chapter.variant, chapter.initial_fen, chapter.chess960)
    turn_color = "black" if board.color == BLACK else "white"
    return {
        "gameId": "",
        "fen": chapter.initial_fen,
        "ply": 0,
        "lastMove": "",
        "bikjang": False,
        "check": False,
        "by": "",
        "status": 0,
        "pgn": "",
        "tp": "",
        "uci_usi": "",
        "result": "*",
        "steps": [
            {
                "fen": chapter.initial_fen,
                "check": False,
                "turnColor": turn_color,
            }
        ],
        "berserk": {"w": False, "b": False},
    }


@aiohttp_jinja2.template("studies.html")
async def studies(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    _require_owner_user(user)
    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Studies require database access.")
    _study_context(context)
    context["studies"] = await studies_for_owner(app_state, user.username)
    return context


async def study_create(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_owner_user(user)
    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Studies require database access.")
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    study, chapter = await create_study_with_chapter(
        app_state, user.username, name=data.get("name")
    )
    raise web.HTTPFound(f"/study/{study.id}/{chapter.id}")


@aiohttp_jinja2.template("analysis.html")
async def study_show(request: web.Request) -> ViewContext:
    user, context, study, chapter = await _owned_study_and_chapter(request)
    if request.match_info.get("chapterId") is None:
        raise web.HTTPFound(f"/study/{study.id}/{chapter.id}")
    app_state = get_app_state(request.app)
    await select_chapter(app_state, study, chapter)
    _study_context(context)
    context["view"] = "study"
    context["title"] = f"{study.name} • PyChess"
    context["variant"] = chapter.variant
    context["chess960"] = chapter.chess960
    context["fen"] = chapter.initial_fen
    context["initialFen"] = chapter.initial_fen
    context["status"] = 0
    context["ply"] = 0
    context["board"] = json_dumps(_study_board(chapter))

    # Study page data contains only the current full tree plus lightweight chapter
    # previews. Switching chapters is a normal navigation in the owner-only MVP.
    context["study_data"] = json_dumps(
        {
            "id": study.id,
            "name": study.name,
            "chapter": {
                "id": chapter.id,
                "name": chapter.name,
                "revision": chapter.revision,
                "orientation": chapter.orientation,
                "tree": chapter.root.to_payload(),
            },
            "chapters": await chapter_previews(app_state, study.id),
        }
    )

    if is_catalogued_variant(chapter.variant):
        catalogued_doc = catalogued_variant_client_doc_for_name(
            app_state, chapter.variant, user.username
        )
        if catalogued_doc is not None:
            variants = json.loads(str(context.get("catalogued_variants") or "[]"))
            if not any(item.get("name") == chapter.variant for item in variants):
                variants.append(catalogued_doc)
                context["catalogued_variants"] = json_dumps(variants)
    elif chapter.variant not in ALL_VARIANTS:
        raise web.HTTPNotFound(text="Study variant is unavailable")

    return context


async def study_edit(request: web.Request) -> web.StreamResponse:
    _, _, study, _ = await _owned_study_and_chapter(request)
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    await rename_study(get_app_state(request.app), study, data.get("name"))
    raise web.HTTPFound(f"/study/{study.id}")


async def study_delete(request: web.Request) -> web.StreamResponse:
    _, _, study, _ = await _owned_study_and_chapter(request)
    await delete_study(get_app_state(request.app), study)
    raise web.HTTPFound("/study")


async def study_chapter_create(request: web.Request) -> web.StreamResponse:
    _, _, study, chapter = await _owned_study_and_chapter(request)
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    try:
        created = await add_chapter(
            get_app_state(request.app), study, chapter, name=data.get("name")
        )
    except StudyStorageError as exc:
        raise web.HTTPBadRequest(text=str(exc)) from exc
    raise web.HTTPFound(f"/study/{study.id}/{created.id}")


async def study_chapter_edit(request: web.Request) -> web.StreamResponse:
    _, _, study, chapter = await _owned_study_and_chapter(request)
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    await rename_chapter(get_app_state(request.app), chapter, data.get("name"))
    raise web.HTTPFound(f"/study/{study.id}/{chapter.id}")


async def study_chapter_delete(request: web.Request) -> web.StreamResponse:
    _, _, study, chapter = await _owned_study_and_chapter(request)
    try:
        next_chapter = await delete_chapter(get_app_state(request.app), study, chapter)
    except StudyStorageError as exc:
        raise web.HTTPBadRequest(text=str(exc)) from exc
    raise web.HTTPFound(f"/study/{study.id}/{next_chapter}")
