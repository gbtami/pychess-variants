from __future__ import annotations
from typing import TYPE_CHECKING, TypeVar, cast
from collections.abc import Awaitable, Callable, Iterable, Mapping
import asyncio
import logging
import re
import aiohttp
import aiohttp_session
import msgspec
from aiohttp import WSMessage, web
from aiohttp.web_ws import WebSocketResponse
from aiohttp.client_exceptions import ClientConnectionResetError

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from user import User

from pychess_global_app_state_utils import get_app_state

log = logging.getLogger(__name__)

_SEND_CONCURRENCY = 200
_SEND_TIMEOUT_SECS = 2.0
_WS_JSON_ENCODER = msgspec.json.Encoder()
_WS_JSON_DECODER = msgspec.json.Decoder()
_TYPE_FIELD_RE = re.compile(r'"type"\s*:\s*"([^"\\]+)"')
_TYPE_PREFIX = '{"type":"'


def _ws_json_dumps(msg: Mapping[str, object] | None) -> str:
    return _WS_JSON_ENCODER.encode(msg).decode("utf-8")


def _extract_type_field(message: str) -> str | None:
    # Fast path for canonical compact JSON produced by browsers/aiohttp.
    if message.startswith(_TYPE_PREFIX):
        end = message.find('"', len(_TYPE_PREFIX))
        if end != -1:
            return message[len(_TYPE_PREFIX) : end]

    # Fallback for payloads with whitespace or different key order.
    match = _TYPE_FIELD_RE.search(message)
    return match.group(1) if match is not None else None


def _ws_json_loads(
    message: str, typed_decoders: Mapping[str, msgspec.json.Decoder] | None = None
) -> object:
    if typed_decoders is not None:
        message_type = _extract_type_field(message)
        if message_type is not None:
            decoder = typed_decoders.get(message_type)
            if decoder is not None:
                try:
                    return decoder.decode(message)
                except (msgspec.DecodeError, msgspec.ValidationError):
                    pass
    return _WS_JSON_DECODER.decode(message)


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
    typed_decoders: Mapping[str, msgspec.json.Decoder] | None = None,
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
                    decoded = _ws_json_loads(msg.data, typed_decoders)
                    msg_type = decoded.get("type") if isinstance(decoded, Mapping) else None
                    if not isinstance(msg_type, str):
                        continue

                    data = cast(DataT, decoded)
                    if msg_type != "pong":
                        masked_data = (
                            {**decoded, "password": "***"}
                            if isinstance(decoded, Mapping) and "password" in decoded
                            else decoded
                        )
                        log.debug(
                            "Websocket (%s) message: %s",
                            id(ws),
                            masked_data,
                        )
                    if msg_type == "logout":
                        await ws.close()
                    elif msg_type == "disconnect":
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
        pass
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
        await asyncio.wait_for(ws.send_str(msg), timeout=_SEND_TIMEOUT_SECS)
        return True
    except (ConnectionResetError, ClientConnectionResetError, RuntimeError, asyncio.TimeoutError):
        # Peer disconnected between scheduling and actual send.
        return False


async def ws_send_str_many(ws_set: Iterable[WebSocketResponse | None], msg: str) -> int:
    sockets = [ws for ws in ws_set if ws is not None]
    if len(sockets) == 0:
        return 0

    # Cap fan-out inside one broadcast without coupling unrelated broadcasts.
    sem = asyncio.Semaphore(min(_SEND_CONCURRENCY, len(sockets)))

    async def one(ws: WebSocketResponse) -> bool:
        async with sem:
            try:
                await asyncio.wait_for(ws.send_str(msg), timeout=_SEND_TIMEOUT_SECS)
                return True
            except (
                ConnectionResetError,
                ClientConnectionResetError,
                RuntimeError,
                asyncio.TimeoutError,
            ):
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
        await asyncio.wait_for(ws.send_str(_ws_json_dumps(msg)), timeout=_SEND_TIMEOUT_SECS)
        return True
    except (ConnectionResetError, ClientConnectionResetError, RuntimeError, asyncio.TimeoutError):
        # Peer disconnected between scheduling and actual send.
        return False
    except Exception:
        log.exception("Exception in ws_send_json()")
        return False


async def ws_send_json_many(
    ws_set: Iterable[WebSocketResponse | None], msg: Mapping[str, object] | None
) -> int:
    try:
        payload = _ws_json_dumps(msg)
    except Exception:
        log.exception("Exception in ws_send_json_many()")
        return 0

    return await ws_send_str_many(ws_set, payload)
