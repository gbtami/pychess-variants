from __future__ import annotations

from typing import TYPE_CHECKING, TypedDict

import asyncio
import json

from aiohttp import web
import aiohttp_session
from aiohttp_sse import sse_response

from const import SSE_GET_TIMEOUT
from misc import time_control_str
from pychess_global_app_state_utils import get_app_state
from seek import (
    ACTIVE_DIRECT_CHALLENGE_STATUSES,
    DIRECT_CHALLENGE_CANCELED,
    DIRECT_CHALLENGE_CREATED,
    DIRECT_CHALLENGE_DECLINED,
    DIRECT_CHALLENGE_OFFLINE,
)
from utils import join_seek, remove_seek

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from seek import Seek


class HeaderChallenge(TypedDict):
    id: str
    challenger: str
    challengerTitle: str
    opponent: str
    incoming: bool
    variant: str
    chess960: bool | None
    rated: bool
    color: str
    tc: str
    expireAt: str
    status: str


class HeaderChallengeEnvelope(TypedDict, total=False):
    challenges: list[HeaderChallenge]
    gameId: str


def challenge_participants(seek: Seek) -> tuple[str, ...]:
    usernames = [seek.creator.username]
    if seek.target:
        usernames.append(seek.target)
    # Preserve order while removing duplicates.
    return tuple(dict.fromkeys(usernames))


def serialize_challenge_for_user(seek: Seek, username: str) -> HeaderChallenge:
    incoming = seek.target == username and seek.creator.username != username
    opponent = seek.creator.username if incoming else seek.target
    expire_at = seek.expire_at.isoformat() if seek.expire_at is not None else ""
    return {
        "id": seek.id,
        "challenger": seek.creator.username,
        "challengerTitle": seek.creator.title,
        "opponent": opponent,
        "incoming": incoming,
        "variant": seek.variant,
        "chess960": seek.chess960,
        "rated": bool(seek.rated),
        "color": seek.color,
        "tc": time_control_str(seek.base, seek.inc, seek.byoyomi_period, seek.day),
        "expireAt": expire_at,
        "status": seek.challenge_status or DIRECT_CHALLENGE_CREATED,
    }


def _remove_seek_from_state(app_state: PychessGlobalAppState, seek: Seek) -> None:
    if seek.game_id is not None:
        app_state.invites.pop(seek.game_id, None)
    remove_seek(app_state.seeks, seek)


def cleanup_expired_direct_challenges(app_state: PychessGlobalAppState) -> set[str]:
    affected_users: set[str] = set()
    for seek in tuple(app_state.seeks.values()):
        if not seek.is_direct_challenge or not seek.is_expired():
            continue
        affected_users.update(challenge_participants(seek))
        _remove_seek_from_state(app_state, seek)
    return affected_users


def direct_challenge_is_visible(seek: Seek) -> bool:
    return (
        seek.is_direct_challenge
        and not seek.pending
        and not seek.is_expired()
        and seek.challenge_status is not None
    )


def set_direct_challenge_status(seek: Seek, status: str) -> bool:
    if not seek.is_direct_challenge or seek.challenge_status == status:
        return False
    seek.set_challenge_status(status)
    return True


async def reactivate_direct_challenges(app_state: PychessGlobalAppState, username: str) -> None:
    user = await app_state.users.get(username)
    changed_users: set[str] = set()
    for seek in tuple(user.seeks.values()):
        if (
            seek.is_direct_challenge
            and seek.creator.username == username
            and seek.challenge_status == DIRECT_CHALLENGE_OFFLINE
            and not seek.is_expired()
        ):
            seek.set_challenge_status(DIRECT_CHALLENGE_CREATED)
            changed_users.update(challenge_participants(seek))
    if changed_users:
        await broadcast_challenge_state(app_state, changed_users)


def schedule_direct_challenge_offline(
    app_state: PychessGlobalAppState, username: str, delay_seconds: int = 20
) -> None:
    user = app_state.users[username]
    task = getattr(user, "challenge_offline_task", None)
    if task is not None and not task.done():
        return

    async def mark_offline() -> None:
        await asyncio.sleep(delay_seconds)
        user.update_online()
        if user.online:
            return
        changed_users: set[str] = set()
        for seek in tuple(user.seeks.values()):
            if (
                seek.is_direct_challenge
                and seek.creator.username == username
                and seek.challenge_status == DIRECT_CHALLENGE_CREATED
                and not seek.is_expired()
            ):
                seek.set_challenge_status(DIRECT_CHALLENGE_OFFLINE)
                changed_users.update(challenge_participants(seek))
        if changed_users:
            await broadcast_challenge_state(app_state, changed_users)

    task = user.create_background_task(
        mark_offline(),
        name="direct-challenge-offline-%s" % username,
    )
    user.challenge_offline_task = task

    def _clear_done(done_task: asyncio.Task[None]) -> None:
        if user.challenge_offline_task is done_task:
            user.challenge_offline_task = None

    task.add_done_callback(_clear_done)


def cancel_direct_challenge_offline(user) -> None:
    task = getattr(user, "challenge_offline_task", None)
    if task is not None and not task.done():
        task.cancel()
    user.challenge_offline_task = None


def get_user_challenges(app_state: PychessGlobalAppState, username: str) -> list[HeaderChallenge]:
    cleanup_expired_direct_challenges(app_state)
    challenges = [
        serialize_challenge_for_user(seek, username)
        for seek in reversed(tuple(app_state.seeks.values()))
        if direct_challenge_is_visible(seek) and username in challenge_participants(seek)
    ]
    challenges.sort(
        key=lambda challenge: (
            challenge["status"] not in ACTIVE_DIRECT_CHALLENGE_STATUSES,
            not challenge["incoming"],
            challenge["id"],
        ),
        reverse=False,
    )
    return challenges


def challenge_envelope(
    app_state: PychessGlobalAppState, username: str, game_id: str | None = None
) -> HeaderChallengeEnvelope:
    payload: HeaderChallengeEnvelope = {"challenges": get_user_challenges(app_state, username)}
    if game_id is not None:
        payload["gameId"] = game_id
    return payload


async def push_challenge_state(
    app_state: PychessGlobalAppState, username: str, game_id: str | None = None
) -> None:
    user = await app_state.users.get(username)
    payload = json.dumps(challenge_envelope(app_state, username, game_id))
    for queue in tuple(user.challenge_channels):
        try:
            await queue.put(payload)
        except ConnectionResetError:
            continue


async def broadcast_challenge_state(
    app_state: PychessGlobalAppState,
    usernames: tuple[str, ...] | list[str] | set[str],
    *,
    game_ids: dict[str, str] | None = None,
) -> None:
    for username in usernames:
        await push_challenge_state(
            app_state, username, None if game_ids is None else game_ids.get(username)
        )


async def get_header_challenges(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        return web.json_response({"challenges": []})
    return web.json_response(challenge_envelope(app_state, session_user))


async def subscribe_challenges(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        return web.json_response({})

    user = await app_state.users.get(session_user)
    cancel_direct_challenge_offline(user)
    queue: asyncio.Queue[str] = asyncio.Queue()
    user.challenge_channels.add(queue)
    user.update_online()
    await reactivate_direct_challenges(app_state, session_user)
    response: web.StreamResponse = web.Response(status=200)
    try:
        async with sse_response(request) as response:
            await response.send(json.dumps(challenge_envelope(app_state, session_user)))
            while response.is_connected():
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=SSE_GET_TIMEOUT)
                    await response.send(payload)
                    queue.task_done()
                except asyncio.TimeoutError:
                    if not response.is_connected():
                        break
    except Exception:
        pass
    finally:
        user.challenge_channels.discard(queue)
        user.update_online()
        if not user.online:
            schedule_direct_challenge_offline(app_state, session_user)
    return response


async def challenge_seek_accept(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)

    cleanup_expired_direct_challenges(app_state)

    seek_id = request.match_info.get("seekId")
    if seek_id is None or seek_id not in app_state.seeks:
        return web.json_response({"type": "error", "message": "Challenge not found"}, status=404)

    user = await app_state.users.get(session_user)
    seek = app_state.seeks[seek_id]
    if (
        not seek.is_direct_challenge
        or seek.target != user.username
        or seek.challenge_status not in ACTIVE_DIRECT_CHALLENGE_STATUSES
    ):
        return web.json_response(
            {"type": "error", "message": "Challenge not available"}, status=403
        )

    result = await join_seek(app_state, user, seek)
    game_ids: dict[str, str] | None = None
    if result["type"] == "new_game" and len(seek.creator.lobby_sockets) == 0:
        game_ids = {seek.creator.username: result["gameId"]}

    await broadcast_challenge_state(app_state, challenge_participants(seek), game_ids=game_ids)
    await app_state.lobby.lobby_broadcast_seeks()
    return web.json_response(result)


async def challenge_seek_decline(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)

    cleanup_expired_direct_challenges(app_state)

    seek_id = request.match_info.get("seekId")
    if seek_id is None or seek_id not in app_state.seeks:
        return web.json_response({"type": "error", "message": "Challenge not found"}, status=404)

    user = await app_state.users.get(session_user)
    seek = app_state.seeks[seek_id]
    if (
        not seek.is_direct_challenge
        or seek.target != user.username
        or seek.challenge_status not in ACTIVE_DIRECT_CHALLENGE_STATUSES
    ):
        return web.json_response(
            {"type": "error", "message": "Challenge not available"}, status=403
        )

    usernames = challenge_participants(seek)
    set_direct_challenge_status(seek, DIRECT_CHALLENGE_DECLINED)
    await broadcast_challenge_state(app_state, usernames)
    await app_state.lobby.lobby_broadcast_seeks()
    return web.json_response({"ok": True})


async def challenge_seek_cancel(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)

    cleanup_expired_direct_challenges(app_state)

    seek_id = request.match_info.get("seekId")
    if seek_id is None or seek_id not in app_state.seeks:
        return web.json_response({"type": "error", "message": "Challenge not found"}, status=404)

    user = await app_state.users.get(session_user)
    seek = app_state.seeks[seek_id]
    if (
        not seek.is_direct_challenge
        or seek.creator.username != user.username
        or seek.challenge_status not in ACTIVE_DIRECT_CHALLENGE_STATUSES
    ):
        return web.json_response(
            {"type": "error", "message": "Challenge not available"}, status=403
        )

    usernames = challenge_participants(seek)
    set_direct_challenge_status(seek, DIRECT_CHALLENGE_CANCELED)
    await broadcast_challenge_state(app_state, usernames)
    await app_state.lobby.lobby_broadcast_seeks()
    return web.json_response({"ok": True})
