from __future__ import annotations
import json
import logging

import aiohttp
import aiohttp_session
from aiohttp import WSMessage, web
from aiohttp.web_ws import WebSocketResponse

from const import TYPE_CHECKING

if TYPE_CHECKING:
    from user import User

from pychess_global_app_state_utils import get_app_state

log = logging.getLogger(__name__)


async def get_user(session: aiohttp_session.Session, request: web.Request) -> User:
    session_user = session.get("user_name")
    user = await get_app_state(request.app).users.get(session_user)
    return user


# See https://github.com/aio-libs/aiohttp/issues/3122 why this is needed
class MyWebSocketResponse(WebSocketResponse):
    @property
    def closed(self):
        return self._closed or self._req is None or self._req.transport is None


async def process_ws(
    session: aiohttp_session.Session,
    request: web.Request,
    user: User,
    init_msg: callable,
    custom_msg_processor: callable,
) -> MyWebSocketResponse:
    """
    Process websocket messages until socket closed or errored. Returns the closed MyWebSocketResponse object.
    """
    app_state = get_app_state(request.app)

    if (user is not None) and (not user.enabled):
        log.error("User %r is None or not enabled", user.username)
        session.invalidate()
        return None

    ws = MyWebSocketResponse(heartbeat=3.0, receive_timeout=10.0)
    ws_ready = ws.can_prepare(request)
    if not ws_ready.ok:
        log.error("ws_ready not ok: %r", ws_ready)
        return None

    await ws.prepare(request)

    log.info(
        "--- NEW %s WEBSOCKET by %s from %s", request.rel_url.path, user.username, request.remote
    )

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
                    "--- %s websocket %s msg.type == aiohttp.WSMsgType.CLOSED",
                    request.rel_url.path,
                    id(ws),
                )
                break
            elif msg.type == aiohttp.WSMsgType.ERROR:
                log.error(
                    "--- %s ws %s msg.type == aiohttp.WSMsgType.ERROR", request.rel_url.path, id(ws)
                )
                break
            else:
                log.debug("--- %s ws other msg.type %s %s", request.rel_url.path, msg.type, msg)
    except OSError as e:
        # disconnected
        log.error(e, exc_info=True)
    except Exception:
        log.exception(
            "ERROR: Exception in % socket handling owned by %s ",
            request.rel_url.path,
            user.username,
        )
    finally:
        log.debug("--- %s finally: await ws.close() %s", request.rel_url.path, user.username)
        await ws.close()
        return ws


async def ws_send_str(ws, msg) -> bool:
    try:
        await ws.send_str(msg)
        return True
    except ConnectionResetError:
        log.debug("Connection reset ", exc_info=True)
        return False


async def ws_send_json(ws, msg) -> bool:
    if ws is None:
        log.error("ws_send_json: ws is None")
        return False
    try:
        await ws.send_json(msg)
        return True
    except ConnectionResetError:
        log.exception("Connection reset ", exc_info=True)
        return False
    except Exception:
        log.exception("ERROR: Exception in ws_send_json")
        return False
