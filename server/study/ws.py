from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from typing import TYPE_CHECKING, cast

import aiohttp_session
from aiohttp import web
from aiohttp.web_ws import WebSocketResponse
from pychess_global_app_state_utils import get_app_state
from websocket_utils import get_user, process_ws, ws_send_json, ws_send_json_many
from ws_structs import STUDY_TYPED_DECODERS, WsInboundStruct

from study.models import Study
from study.mutations import StudyMutationResult, StudyMutationService

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from user import User

log = logging.getLogger(__name__)

_CLIENT_OP_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_MAX_PATH_LENGTH = 40_000
_MAX_MOVE_LENGTH = 256
_MAX_ANNOTATION_PATH_LENGTH = _MAX_PATH_LENGTH


def _as_mapping(data: object) -> Mapping[str, object] | None:
    # msgspec.Struct deliberately exposes the mapping methods used by the shared
    # websocket decoder, but it is not registered as collections.abc.Mapping.
    if isinstance(data, Mapping):
        return data
    if isinstance(data, WsInboundStruct):
        keys = data.keys()
        return {key: cast(object, data[key]) for key in keys}
    return None


def _valid_common_message(data: Mapping[str, object], study_id: str) -> bool:
    if data.get("studyId") != study_id:
        return False
    chapter_id = data.get("chapterId")
    client_op_id = data.get("clientOpId")
    expected_revision = data.get("expectedRevision")
    return (
        isinstance(chapter_id, str)
        and bool(chapter_id)
        and isinstance(client_op_id, str)
        and _CLIENT_OP_ID_RE.fullmatch(client_op_id) is not None
        and isinstance(expected_revision, int)
        and not isinstance(expected_revision, bool)
        and expected_revision >= 0
    )


def _response_base(data: Mapping[str, object]) -> dict[str, object]:
    return {
        "type": data["type"],
        "studyId": data["studyId"],
        "chapterId": data["chapterId"],
        "clientOpId": data["clientOpId"],
    }


async def _send_invalid_message(ws: WebSocketResponse, data: Mapping[str, object]) -> None:
    payload: dict[str, object] = {
        "type": "study_error",
        "reason": "invalid_message",
    }
    for key in ("studyId", "chapterId", "clientOpId"):
        value = data.get(key)
        if isinstance(value, str):
            payload[key] = value
    await ws_send_json(ws, payload)


async def _finish_mutation(
    app_state: PychessGlobalAppState,
    ws: WebSocketResponse,
    study_id: str,
    data: Mapping[str, object],
    result: StudyMutationResult,
    extra: Mapping[str, object] | None = None,
) -> None:
    if result.status == "reload":
        await ws_send_json(
            ws,
            {
                "type": "study_reload",
                "studyId": study_id,
                "chapterId": data["chapterId"],
                "clientOpId": data["clientOpId"],
                "revision": result.revision,
                "reason": result.reason,
            },
        )
        return
    if result.status == "error":
        await ws_send_json(
            ws,
            {
                "type": "study_error",
                "studyId": study_id,
                "chapterId": data["chapterId"],
                "clientOpId": data["clientOpId"],
                "revision": result.revision,
                "reason": result.reason,
            },
        )
        return

    payload = _response_base(data)
    payload["revision"] = result.revision
    payload["changed"] = result.changed
    if result.path is not None:
        payload["path"] = result.path
    if result.node is not None:
        payload["node"] = result.node.to_payload()
    if result.annotations is not None:
        payload["annotations"] = result.annotations.to_payload()
    if result.description is not None:
        payload["description"] = result.description
    if result.tags is not None:
        payload["tags"] = dict(result.tags)
    if extra:
        payload.update(extra)

    # Idempotent/no-op mutations are acknowledgements, not shared changes.
    if not result.changed:
        await ws_send_json(ws, payload)
        return

    room = app_state.study_sockets.get(study_id)
    if room:
        await ws_send_json_many(tuple(room), payload)
    else:
        await ws_send_json(ws, payload)


async def process_message(
    app_state: PychessGlobalAppState,
    user: User,
    ws: WebSocketResponse,
    raw_data: object,
    *,
    study_id: str,
    service: StudyMutationService,
) -> None:
    data = _as_mapping(raw_data)
    if data is None or not _valid_common_message(data, study_id):
        await _send_invalid_message(ws, data or {})
        return

    message_type = data.get("type")
    chapter_id = cast(str, data["chapterId"])
    expected_revision = cast(int, data["expectedRevision"])

    if message_type == "study_add_node":
        parent_path = data.get("parentPath")
        move = data.get("move")
        node_id = data.get("nodeId")
        if (
            not isinstance(parent_path, str)
            or len(parent_path) > _MAX_PATH_LENGTH
            or not isinstance(move, str)
            or not move
            or len(move) > _MAX_MOVE_LENGTH
            or not isinstance(node_id, str)
        ):
            await _send_invalid_message(ws, data)
            return
        result = await service.add_node(
            study_id=study_id,
            chapter_id=chapter_id,
            username=user.username,
            parent_path=parent_path,
            move=move,
            expected_revision=expected_revision,
            node_id=node_id,
        )
        await _finish_mutation(
            app_state,
            ws,
            study_id,
            data,
            result,
            {"parentPath": parent_path, "move": move},
        )
        return

    if message_type in {
        "study_set_shapes",
        "study_set_comment",
        "study_set_nags",
        "study_clear_annotations",
    }:
        path = data.get("path")
        if not isinstance(path, str) or len(path) > _MAX_ANNOTATION_PATH_LENGTH:
            await _send_invalid_message(ws, data)
            return
        if message_type == "study_set_shapes":
            result = await service.set_shapes(
                study_id=study_id,
                chapter_id=chapter_id,
                username=user.username,
                path=path,
                shapes=data.get("shapes"),
                expected_revision=expected_revision,
            )
        elif message_type == "study_set_comment":
            comment_id = data.get("commentId")
            text = data.get("text")
            if not isinstance(comment_id, str) or not isinstance(text, str):
                await _send_invalid_message(ws, data)
                return
            result = await service.set_comment(
                study_id=study_id,
                chapter_id=chapter_id,
                username=user.username,
                path=path,
                comment_id=comment_id,
                text=text,
                expected_revision=expected_revision,
            )
        elif message_type == "study_set_nags":
            result = await service.set_nags(
                study_id=study_id,
                chapter_id=chapter_id,
                username=user.username,
                path=path,
                nags=data.get("nags"),
                expected_revision=expected_revision,
            )
        else:
            result = await service.clear_annotations(
                study_id=study_id,
                chapter_id=chapter_id,
                username=user.username,
                path=path,
                expected_revision=expected_revision,
            )
        await _finish_mutation(app_state, ws, study_id, data, result, {"path": path})
        return

    if message_type == "study_set_description":
        description = data.get("description")
        if not isinstance(description, str):
            await _send_invalid_message(ws, data)
            return
        result = await service.set_description(
            study_id=study_id,
            chapter_id=chapter_id,
            username=user.username,
            description=description,
            expected_revision=expected_revision,
        )
        await _finish_mutation(app_state, ws, study_id, data, result)
        return

    if message_type == "study_set_tags":
        tags = data.get("tags")
        if not isinstance(tags, Mapping):
            await _send_invalid_message(ws, data)
            return
        result = await service.set_tags(
            study_id=study_id,
            chapter_id=chapter_id,
            username=user.username,
            tags=tags,
            expected_revision=expected_revision,
        )
        await _finish_mutation(app_state, ws, study_id, data, result)
        return

    path = data.get("path")
    if not isinstance(path, str) or not path or len(path) > _MAX_PATH_LENGTH:
        await _send_invalid_message(ws, data)
        return

    if message_type == "study_delete_node":
        result = await service.delete_node(
            study_id=study_id,
            chapter_id=chapter_id,
            username=user.username,
            path=path,
            expected_revision=expected_revision,
        )
        await _finish_mutation(app_state, ws, study_id, data, result, {"path": path})
    elif message_type == "study_promote_variation":
        to_mainline = data.get("toMainline")
        if not isinstance(to_mainline, bool):
            await _send_invalid_message(ws, data)
            return
        result = await service.promote_variation(
            study_id=study_id,
            chapter_id=chapter_id,
            username=user.username,
            path=path,
            to_mainline=to_mainline,
            expected_revision=expected_revision,
        )
        await _finish_mutation(
            app_state,
            ws,
            study_id,
            data,
            result,
            {"path": path, "toMainline": to_mainline},
        )
    elif message_type == "study_force_variation":
        force = data.get("force")
        if not isinstance(force, bool):
            await _send_invalid_message(ws, data)
            return
        result = await service.force_variation(
            study_id=study_id,
            chapter_id=chapter_id,
            username=user.username,
            path=path,
            force=force,
            expected_revision=expected_revision,
        )
        await _finish_mutation(
            app_state,
            ws,
            study_id,
            data,
            result,
            {"path": path, "force": force},
        )
    else:
        await _send_invalid_message(ws, data)


async def init_ws(
    app_state: PychessGlobalAppState,
    ws: WebSocketResponse,
    user: User,
    study: Study,
) -> None:
    room = app_state.study_sockets.setdefault(study.id, set())
    room.add(ws)
    user.study_sockets.setdefault(study.id, set()).add(ws)
    user.update_online()
    await ws_send_json(
        ws,
        {
            "type": "study_user_connected",
            "studyId": study.id,
        },
    )


async def finally_logic(
    app_state: PychessGlobalAppState,
    ws: WebSocketResponse,
    user: User,
    study_id: str,
) -> None:
    room = app_state.study_sockets.get(study_id)
    if room is not None:
        room.discard(ws)
        if not room:
            app_state.study_sockets.pop(study_id, None)

    user_room = user.study_sockets.get(study_id)
    if user_room is not None:
        user_room.discard(ws)
        if not user_room:
            user.study_sockets.pop(study_id, None)
    user.update_online()


async def study_socket_handler(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    study_id = request.match_info["studyId"]
    raw_study = await app_state.db.study.find_one({"_id": study_id})
    if raw_study is None:
        raise web.HTTPNotFound()
    try:
        study = Study.from_document(raw_study)
    except (TypeError, ValueError):
        log.warning("Invalid stored Study document %s", study_id, exc_info=True)
        raise web.HTTPNotFound() from None

    session = await aiohttp_session.get_session(request)
    # Phase 1 is intentionally owner-only. Check the authenticated session before
    # get_user() so an unauthenticated probe cannot materialize a throwaway anon
    # user just by attempting this private websocket.
    session_username = session.get("user_name")
    if not isinstance(session_username, str) or session_username != study.owner:
        raise web.HTTPNotFound()
    user = await get_user(session, request)

    service = StudyMutationService(app_state)

    async def on_init(
        inner_app_state: PychessGlobalAppState,
        ws: WebSocketResponse,
        inner_user: User,
    ) -> None:
        await init_ws(inner_app_state, ws, inner_user, study)

    async def on_message(
        inner_app_state: PychessGlobalAppState,
        inner_user: User,
        ws: WebSocketResponse,
        data: object,
    ) -> None:
        await process_message(
            inner_app_state,
            inner_user,
            ws,
            data,
            study_id=study_id,
            service=service,
        )

    ws = await process_ws(
        session,
        request,
        user,
        on_init,
        on_message,
        typed_decoders=STUDY_TYPED_DECODERS,
    )
    if ws is None:
        return web.HTTPFound("/")
    await finally_logic(app_state, ws, user, study_id)
    return ws
