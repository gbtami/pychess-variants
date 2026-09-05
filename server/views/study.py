from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any, cast

import aiohttp_jinja2
from aiohttp import web
from catalogued_variants import catalogued_variant_client_doc_for_name
from fairy import BLACK, FairyBoard
from json_utils import json_dumps
from pychess_global_app_state_utils import get_app_state
from request_utils import read_json_data, read_post_data
from study.builder import (
    StudyChapterBuilder,
    StudyChapterBuildError,
    StudyChapterDraft,
    StudyOrientation,
)
from study.constants import STUDY_MAX_CHAPTERS
from study.models import Study, StudyChapter
from study.storage import (
    StudyStorageError,
    add_chapter_from_draft,
    add_chapters_from_drafts,
    chapter_previews,
    create_study_from_draft,
    delete_chapter,
    delete_study,
    load_owned_chapter,
    load_owned_study,
    rename_chapter,
    rename_study,
    select_chapter,
    studies_for_owner,
)
from study.variant import study_variant_client_doc, study_variant_context, study_variant_metadata
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


def _form_bool(value: object) -> bool:
    return str(value or "").lower() in {"1", "true", "yes", "on"}


async def _draft_from_form(
    builder: StudyChapterBuilder,
    data: Any,
    *,
    fallback_variant: str = "chess",
    fallback_chess960: bool = False,
) -> StudyChapterDraft:
    game_id = str(data.get("gameId") or "").strip()
    chapter_name = str(data.get("chapterName") or "").strip() or None
    if game_id:
        return await builder.from_game(game_id, name=chapter_name)

    variant = str(data.get("variant") or fallback_variant).strip() or fallback_variant
    fen = str(data.get("fen") or "").strip() or None
    chess960 = (
        _form_bool(data.get("chess960")) if data.get("chess960") is not None else fallback_chess960
    )
    orientation = "black" if str(data.get("orientation") or "").lower() == "black" else "white"
    return await builder.blank_or_fen(
        variant=variant,
        fen=fen,
        chess960=chess960,
        name=chapter_name,
        orientation=orientation,
    )


def _study_board(chapter: StudyChapter, *, runtime_variant: str | None = None) -> dict[str, object]:
    board = FairyBoard(runtime_variant or chapter.variant, chapter.initial_fen, chapter.chess960)
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


def _chapter_export_payload(chapter: StudyChapter) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": chapter.id,
        "name": chapter.name,
        "order": chapter.order,
        "variant": chapter.variant,
        "chess960": chapter.chess960,
        "initialFen": chapter.initial_fen,
        "orientation": chapter.orientation,
        "description": chapter.description,
        "tags": dict(chapter.tags),
        "createdAt": chapter.created_at.isoformat(),
        "tree": chapter.root.to_payload(),
    }
    if chapter.variant_ini is not None:
        payload["variantIni"] = chapter.variant_ini
    return payload


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
    try:
        draft = await _draft_from_form(StudyChapterBuilder(app_state, user.username), data)
        study, chapter = await create_study_from_draft(
            app_state, user.username, draft, name=data.get("name")
        )
    except StudyChapterBuildError as exc:
        raise web.HTTPBadRequest(text=str(exc)) from exc
    raise web.HTTPFound(f"/study/{study.id}/{chapter.id}")


async def study_choices(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_owner_user(user)
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return web.json_response({"studies": [], "error": "db_unavailable"}, status=503)
    studies = await studies_for_owner(app_state, user.username)
    return web.json_response(
        {"studies": [{"id": study.id, "name": study.name} for study in studies]}
    )


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

    snapshot_client_doc = None
    if chapter.variant_ini:
        metadata = await study_variant_metadata(app_state, chapter.variant)
        try:
            with study_variant_context(app_state, chapter.variant, chapter.variant_ini) as options:
                context["board"] = json_dumps(
                    _study_board(chapter, runtime_variant=options.runtime_variant)
                )
                snapshot_client_doc = study_variant_client_doc(
                    chapter.variant, chapter.variant_ini, metadata=metadata
                )
        except (ValueError, web.HTTPException) as exc:
            raise web.HTTPNotFound(text="Study variant snapshot is unavailable") from exc
    else:
        context["board"] = json_dumps(_study_board(chapter))

    # Study page data contains only the current full tree plus lightweight chapter
    # previews. Switching chapters is a normal navigation in the owner-only MVP.
    context["study_data"] = json_dumps(
        {
            "id": study.id,
            "name": study.name,
            "owner": study.owner,
            "chapter": {
                "id": chapter.id,
                "name": chapter.name,
                "revision": chapter.revision,
                "order": chapter.order,
                "orientation": chapter.orientation,
                "variant": chapter.variant,
                "chess960": chapter.chess960,
                "initialFen": chapter.initial_fen,
                "variantIni": chapter.variant_ini,
                "createdAt": chapter.created_at.isoformat(),
                "description": chapter.description,
                "tags": dict(chapter.tags),
                "tree": chapter.root.to_payload(),
            },
            "chapters": await chapter_previews(app_state, study.id),
        }
    )

    if snapshot_client_doc is not None:
        variants = json.loads(str(context.get("catalogued_variants") or "[]"))
        variants = [item for item in variants if item.get("name") != chapter.variant]
        variants.append(snapshot_client_doc)
        context["catalogued_variants"] = json_dumps(variants)
    elif is_catalogued_variant(chapter.variant):
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


async def study_chapter_export_data(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_owner_user(user)
    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Studies require database access.")

    study_id = request.match_info["studyId"]
    chapter_id = request.match_info["chapterId"]
    study = await load_owned_study(app_state, study_id, user.username)
    if study is None:
        raise web.HTTPNotFound()
    chapter = await load_owned_chapter(app_state, study.id, chapter_id, user.username)
    if chapter is None:
        raise web.HTTPNotFound()
    return web.json_response(_chapter_export_payload(chapter))


async def study_from_analysis(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    if user.anon:
        return web.json_response({"ok": False, "error": "login_required"}, status=401)
    if user.bot:
        return web.json_response({"ok": False, "error": "forbidden"}, status=403)
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return web.json_response({"ok": False, "error": "db_unavailable"}, status=503)
    data = await read_json_data(request)
    if not isinstance(data, dict):
        raise web.HTTPBadRequest(text="invalid analysis data")
    tree_payload = data.get("tree")
    if not isinstance(tree_payload, dict):
        raise web.HTTPBadRequest(text="invalid analysis tree")
    try:
        raw_tags = data.get("tags")
        if raw_tags is not None and not isinstance(raw_tags, Mapping):
            raise StudyChapterBuildError("Analysis PGN tags are invalid")
        draft = await StudyChapterBuilder(app_state, user.username).from_analysis(
            variant=str(data.get("variant") or "chess"),
            initial_fen=str(data.get("initialFen") or ""),
            tree_payload=tree_payload,
            chess960=bool(data.get("chess960", False)),
            game_id=str(data.get("gameId") or "").strip() or None,
            name=str(data.get("chapterName") or "").strip() or None,
            orientation="black"
            if str(data.get("orientation") or "").lower() == "black"
            else "white",
            tags=cast(Mapping[str, str], raw_tags) if raw_tags is not None else None,
        )
        destination_id = str(data.get("studyId") or "").strip()
        if destination_id:
            study = await load_owned_study(app_state, destination_id, user.username)
            if study is None:
                return web.json_response({"ok": False, "error": "study_not_found"}, status=404)
            chapter = await add_chapter_from_draft(app_state, study, draft)
        else:
            study, chapter = await create_study_from_draft(
                app_state,
                user.username,
                draft,
                name=str(data.get("studyName") or "").strip() or None,
            )
    except (StudyChapterBuildError, StudyStorageError) as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)
    return web.json_response(
        {
            "ok": True,
            "studyId": study.id,
            "chapterId": chapter.id,
            "url": f"/study/{study.id}/{chapter.id}",
        }
    )


async def study_import_pgn(request: web.Request) -> web.StreamResponse:
    user, _, study, _ = await _owned_study_and_chapter(request)
    app_state = get_app_state(request.app)
    data = await read_json_data(request)
    if not isinstance(data, Mapping):
        return web.json_response({"ok": False, "error": "invalid import payload"}, status=400)
    raw_chapters = data.get("chapters")
    if not isinstance(raw_chapters, list) or not raw_chapters:
        return web.json_response(
            {"ok": False, "error": "PGN import contains no chapters"}, status=400
        )

    existing = await app_state.db.study_chapter.count_documents({"studyId": study.id})
    remaining = max(0, STUDY_MAX_CHAPTERS - existing)
    if len(raw_chapters) > remaining:
        return web.json_response(
            {
                "ok": False,
                "error": f"Study has room for {remaining} more chapter{'s' if remaining != 1 else ''}",
            },
            status=400,
        )

    builder = StudyChapterBuilder(app_state, user.username)
    drafts: list[StudyChapterDraft] = []
    for index, raw in enumerate(raw_chapters, start=1):
        if not isinstance(raw, Mapping):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} is invalid"}, status=400
            )
        raw_tree = raw.get("tree")
        if not isinstance(raw_tree, Mapping):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} has no valid tree"}, status=400
            )
        raw_chess960 = raw.get("chess960", False)
        if not isinstance(raw_chess960, bool):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} has invalid Chess960 mode"},
                status=400,
            )
        raw_orientation = raw.get("orientation", "white")
        if raw_orientation not in ("white", "black"):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} has invalid orientation"},
                status=400,
            )
        raw_tags = raw.get("tags", {})
        if not isinstance(raw_tags, Mapping):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} has invalid PGN tags"},
                status=400,
            )
        if not all(
            isinstance(key, str) and isinstance(value, str) for key, value in raw_tags.items()
        ):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} has invalid PGN tags"},
                status=400,
            )
        raw_snapshot = raw.get("variantIni")
        if raw_snapshot is not None and not isinstance(raw_snapshot, str):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} has invalid variant snapshot"},
                status=400,
            )
        raw_variant = raw.get("variant")
        raw_initial_fen = raw.get("initialFen")
        raw_name = raw.get("name")
        raw_description = raw.get("description", "")
        if not isinstance(raw_variant, str) or not isinstance(raw_initial_fen, str):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} has invalid variant/FEN data"},
                status=400,
            )
        if raw_name is not None and not isinstance(raw_name, str):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} has invalid name"}, status=400
            )
        if not isinstance(raw_description, str):
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index} has invalid description"},
                status=400,
            )

        try:
            drafts.append(
                await builder.from_import(
                    variant=raw_variant,
                    initial_fen=raw_initial_fen,
                    tree_payload=cast(Mapping[str, object], raw_tree),
                    chess960=raw_chess960,
                    variant_ini=cast(str | None, raw_snapshot),
                    name=raw_name.strip() or None if raw_name is not None else None,
                    orientation=cast(StudyOrientation, raw_orientation),
                    description=raw_description,
                    tags=cast(Mapping[str, str], raw_tags),
                )
            )
        except StudyChapterBuildError as exc:
            return web.json_response(
                {"ok": False, "error": f"Imported chapter {index}: {exc}"}, status=400
            )

    try:
        chapters = await add_chapters_from_drafts(app_state, study, drafts)
    except StudyStorageError as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)

    last = chapters[-1]
    return web.json_response(
        {
            "ok": True,
            "imported": len(chapters),
            "studyId": study.id,
            "chapterId": last.id,
            "url": f"/study/{study.id}/{last.id}",
        }
    )


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
    app_state = get_app_state(request.app)
    try:
        # A source-aware form creates a fresh chapter. The old one-button request still
        # creates a blank chapter using the current chapter's variant as its default.
        draft = await _draft_from_form(
            StudyChapterBuilder(app_state, study.owner),
            data,
            fallback_variant=chapter.variant,
            fallback_chess960=chapter.chess960,
        )
        created = await add_chapter_from_draft(app_state, study, draft)
    except (StudyStorageError, StudyChapterBuildError) as exc:
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
