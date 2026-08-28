from __future__ import annotations

import aiohttp_session
from aiohttp import web
from json_utils import json_response
from public_chat_moderation import timeout_public_chat_user
from pychess_global_app_state_utils import get_app_state
from report_api import TIMEOUT_REASONS
from settings import ADMINS
from simul.simuls import load_simul
from tournament.tournaments import load_tournament


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


async def _session_username(request: web.Request) -> str | None:
    session = await aiohttp_session.get_session(request)
    return session.get("user_name")


async def public_chat_timeout(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)

    if username is None or app_state.db is None:
        return json_response({"type": "error", "message": "Login required"}, status=401)
    if not _is_admin_username(username):
        return json_response({"type": "error", "message": "Admin only"}, status=403)

    data = await request.post()
    chan = str(data.get("chan") or "").strip().lower()
    room_id = str(data.get("roomId") or "").strip()
    target_user = str(data.get("userId") or "").strip()
    reason = str(data.get("reason") or "").strip().lower()

    if reason not in TIMEOUT_REASONS:
        return json_response({"type": "error", "message": "Invalid timeout reason"}, status=400)
    if not target_user:
        return json_response({"type": "error", "message": "Missing target user"}, status=400)

    reason_text = TIMEOUT_REASONS[reason]
    source_room = None

    if chan == "tournament":
        if not room_id:
            return json_response({"type": "error", "message": "Missing room ID"}, status=400)
        source_room = await load_tournament(app_state, room_id)
        if source_room is None:
            return json_response({"type": "error", "message": "Tournament not found"}, status=404)
    elif chan == "simul":
        if not room_id:
            return json_response({"type": "error", "message": "Missing room ID"}, status=400)
        source_room = await load_simul(app_state, room_id)
        if source_room is None:
            return json_response({"type": "error", "message": "Simul not found"}, status=404)
    elif chan == "round":
        if not room_id:
            return json_response({"type": "error", "message": "Missing room ID"}, status=400)
        source_room = app_state.games.get(room_id)
        if source_room is None:
            return json_response({"type": "error", "message": "Game not found"}, status=404)
    else:
        return json_response({"type": "error", "message": "Unsupported channel"}, status=400)

    timed_out = await timeout_public_chat_user(
        app_state,
        target_user,
        source_chan=chan,
        source_room_id=room_id,
        source_room=source_room,
        reason_text=reason_text,
    )
    if timed_out is None:
        return json_response(
            {"type": "error", "message": "User not found or protected"},
            status=409,
        )

    return json_response({"ok": True, "chan": chan, "reason": reason})
