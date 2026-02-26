from __future__ import annotations
from typing import TYPE_CHECKING, TypeVar
from collections.abc import Awaitable, Callable, Iterable, Mapping
import asyncio
import json
import logging
import weakref
import aiohttp
import aiohttp_session
from aiohttp import WSMessage, web
from aiohttp.web_ws import WebSocketResponse
from aiohttp.client_exceptions import ClientConnectionResetError

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from user import User

from pychess_global_app_state_utils import get_app_state

log = logging.getLogger(__name__)

_SEND_CONCURRENCY = 200
# Keep one shared send semaphore per event loop.
# A plain module-level asyncio.Semaphore can become bound to the first loop that
# waits on it and then raise "bound to a different event loop" in later tests
# (for example IsolatedAsyncioTestCase creates a fresh loop per test).
# Weak refs let loop entries disappear automatically when loops are closed.
_send_semaphores: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
    weakref.WeakKeyDictionary()
)


def _get_send_semaphore() -> asyncio.Semaphore:
    # Reuse the same semaphore inside a loop to enforce a process-wide send cap
    # in production (single aiohttp loop) without cross-loop binding errors.
    loop = asyncio.get_running_loop()
    sem = _send_semaphores.get(loop)
    if sem is None:
        sem = asyncio.Semaphore(_SEND_CONCURRENCY)
        _send_semaphores[loop] = sem
    return sem


async def get_user(session: aiohttp_session.Session, request: web.Request) -> User:
    session_user = session.get("user_name")
    user = await get_app_state(request.app).users.get(session_user)
    return user


InitMessageHandler = Callable[["PychessGlobalAppState", WebSocketResponse, "User"], Awaitable[None]]
DataT = TypeVar("DataT")
MessageHandler = Callable[
    ["PychessGlobalAppState", "User", WebSocketResponse, DataT], Awaitable[None]
]


async def process_ws(
    session: aiohttp_session.Session,
    request: web.Request,
    user: User,
    init_msg: InitMessageHandler | None,
    custom_msg_processor: MessageHandler[DataT],
) -> WebSocketResponse | None:
    """
    Process websocket messages until socket closed or errored. Returns the closed WebSocketResponse object.
    """
    app_state = get_app_state(request.app)

    if (user is not None) and (not user.enabled):
        session.invalidate()
        return None

    ws = WebSocketResponse(heartbeat=3.0, receive_timeout=10.0)
    ws_ready = ws.can_prepare(request)
    if not ws_ready.ok:
        log.debug("Ignoring non-websocket request on %s: %r", request.rel_url.path, ws_ready)
        return None

    await ws.prepare(request)

    log.info("NEW %s WEBSOCKET by %s from %s", request.rel_url.path, user.username, request.remote)

    try:
        if init_msg is not None:
            await init_msg(app_state, ws, user)
        msg: WSMessage
        async for msg in ws:
            if app_state.shutdown:
                break

            if msg.type == aiohttp.WSMsgType.TEXT:
                if msg.data == "close":
                    log.debug("Got 'close' msg.")
                    break
                elif msg.data == "/n":
                    await ws_send_str(ws, "/n")
                else:
                    data = json.loads(msg.data)
                    if not data["type"] == "pong":
                        log.debug("Websocket (%s) message: %s", id(ws), msg)
                    if data["type"] == "logout":
                        await ws.close()
                    elif data["type"] == "disconnect":
                        # Used only to test socket disconnection...
                        await ws.close(code=1009)
                    else:
                        await custom_msg_processor(app_state, user, ws, data)
            elif msg.type == aiohttp.WSMsgType.CLOSED:
                log.debug(
                    "%s websocket %s msg.type == aiohttp.WSMsgType.CLOSED",
                    request.rel_url.path,
                    id(ws),
                )
                break
            elif msg.type == aiohttp.WSMsgType.ERROR:
                exc = ws.exception()
                if exc is None or isinstance(
                    exc, (ConnectionResetError, ClientConnectionResetError, OSError, TimeoutError)
                ):
                    log.debug(
                        "%s ws %s msg.type == aiohttp.WSMsgType.ERROR: %r",
                        request.rel_url.path,
                        id(ws),
                        exc,
                    )
                else:
                    log.warning(
                        "%s ws %s msg.type == aiohttp.WSMsgType.ERROR: %r",
                        request.rel_url.path,
                        id(ws),
                        exc,
                    )
                break
            else:
                log.debug("%s ws other msg.type %s %s", request.rel_url.path, msg.type, msg)
    except OSError:
        # disconnected
        log.error("process_ws() OSError")
    except Exception:
        log.exception(
            "Exception in % socket handling owned by %s ",
            request.rel_url.path,
            user.username,
        )
    finally:
        log.debug("%s finally: await ws.close() %s", request.rel_url.path, user.username)
        await ws.close()
        return ws


async def ws_send_str(ws: WebSocketResponse, msg: str) -> bool:
    try:
        await ws.send_str(msg)
        return True
    except (ConnectionResetError, ClientConnectionResetError):
        # Peer disconnected between scheduling and actual send.
        return False


async def ws_send_str_many(ws_set: Iterable[WebSocketResponse | None], msg: str) -> int:
    sockets: list[WebSocketResponse] = []
    for ws in list(ws_set):
        if ws is None:
            log.error("ws_send_str_many: ws is None")
            continue
        sockets.append(ws)

    if len(sockets) == 0:
        return 0

    sem = _get_send_semaphore()

    async def one(ws: WebSocketResponse) -> bool:
        async with sem:
            try:
                await ws.send_str(msg)
                return True
            except (ConnectionResetError, ClientConnectionResetError):
                return False
            except Exception:
                return False

    results = await asyncio.gather(*(one(ws) for ws in sockets))
    return sum(results)


async def ws_send_json(ws: WebSocketResponse | None, msg: Mapping[str, object] | None) -> bool:
    if ws is None:
        log.error("ws_send_json: ws is None")
        return False
    try:
        await ws.send_json(msg)
        return True
    except (ConnectionResetError, ClientConnectionResetError):
        # Peer disconnected between scheduling and actual send.
        return False
    except Exception:
        log.exception("Exception in ws_send_json()")
        return False


async def ws_send_json_many(
    ws_set: Iterable[WebSocketResponse | None], msg: Mapping[str, object] | None
) -> int:
    try:
        payload = json.dumps(msg)
    except Exception:
        log.exception("Exception in ws_send_json_many()")
        return 0

    return await ws_send_str_many(ws_set, payload)
