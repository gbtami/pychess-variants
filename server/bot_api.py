from __future__ import annotations
import asyncio
from typing import Any, Awaitable, Callable, TYPE_CHECKING, TypeAlias, cast

from aiohttp import web

from bot_accounts import (
    BOT_TOKEN_SCOPE,
    BOT_TOKEN_TEST_EXPIRES_MS,
    get_db_token_owner,
    upgrade_user_to_bot_account,
)
from broadcast import round_broadcast
from const import STARTED, RESIGN
from json_utils import json_dumps, json_response
from settings import BOT_TOKENS
from user import User
from utils import load_game, new_game, play_move, send_bot_game_start_unless_streaming
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data, read_text_data
from typing_defs import UserDocument
import logging

log = logging.getLogger(__name__)
Handler: TypeAlias = Callable[[web.Request], Awaitable[web.StreamResponse]]

if TYPE_CHECKING:
    from game import Game
    from ws_types import ErrorMessage, NewGameMessage


def _request_username(request: web.Request) -> str:
    auth_info = cast(dict[str, Any], request["bot_auth"])
    return str(auth_info["username"])


def _request_title(request: web.Request) -> str:
    auth_info = cast(dict[str, Any], request["bot_auth"])
    return str(auth_info.get("title") or "")


async def _authorize_token(request: web.Request, *, require_bot: bool) -> None:
    auth = request.headers.get("Authorization")
    if auth is None or not auth.startswith("Bearer "):
        log.error("BOT request without valid Authorization header!")
        raise web.HTTPForbidden()

    raw_token = auth[7:].strip()
    if raw_token == "":
        raise web.HTTPForbidden()

    app_state = get_app_state(request.app)
    auth_info: dict[str, Any] | None = None

    if raw_token in BOT_TOKENS:
        username = BOT_TOKENS[raw_token]
        title = "BOT"
        if app_state.db is not None:
            user_doc: UserDocument | None = await app_state.db.user.find_one({"_id": username})
            if user_doc is not None:
                if not user_doc.get("enabled", True):
                    raise web.HTTPForbidden()
                title = str(user_doc.get("title") or title)
        auth_info = {"username": username, "title": title}
    else:
        user_doc = await get_db_token_owner(app_state, raw_token, mark_used=True)
        if user_doc is not None:
            auth_info = {
                "username": str(user_doc.get("_id") or ""),
                "title": str(user_doc.get("title") or ""),
            }

    if auth_info is None or auth_info["username"] == "":
        log.error("BOT account token authentication failed")
        raise web.HTTPForbidden()

    if require_bot and auth_info["title"] != "BOT":
        log.error("Non-BOT account %s tried to use BOT endpoint", auth_info["username"])
        raise web.HTTPForbidden()

    username = str(auth_info["username"])
    if (
        auth_info["title"] == "BOT"
        and username in app_state.users
        and not app_state.users[username].bot
    ):
        app_state.users[username].enable_bot_account()

    request["bot_auth"] = auth_info


def authorized(*, require_bot: bool = True) -> Callable[[Handler], Handler]:
    def decorator(func: Handler) -> Handler:
        async def inner(request: web.Request) -> web.StreamResponse:
            await _authorize_token(request, require_bot=require_bot)
            return await func(request)

        return inner

    return decorator


async def bot_token_test(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    text = await read_text_data(request)
    if text is None:
        return json_response({})
    tokens = text.split(",")

    response: dict[str, dict[str, object] | None] = {}
    for token in tokens:
        if token in BOT_TOKENS:
            response[token] = {
                "scopes": BOT_TOKEN_SCOPE,
                "userId": BOT_TOKENS[token],
                "expires": BOT_TOKEN_TEST_EXPIRES_MS,
            }
            continue

        user_doc = await get_db_token_owner(app_state, token, mark_used=False)
        if user_doc is None:
            response[token] = None
            continue

        response[token] = {
            "scopes": BOT_TOKEN_SCOPE,
            "userId": user_doc["_id"],
            "expires": BOT_TOKEN_TEST_EXPIRES_MS,
        }

    return json_response(response)


@authorized(require_bot=False)
async def account(request: web.Request) -> web.StreamResponse:
    username = _request_username(request)
    return json_response({"id": username, "username": username, "title": _request_title(request)})


@authorized(require_bot=False)
async def playing(request: web.Request) -> web.StreamResponse:
    resp: dict[str, list[object]] = {"nowPlaying": []}
    return json_response(resp)


@authorized(require_bot=False)
async def challenge_create(request: web.Request) -> web.StreamResponse:
    raise web.HTTPForbidden(text="BOT accounts cannot create challenges on PyChess.")


@authorized(require_bot=False)
async def upgrade_account(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    try:
        await upgrade_user_to_bot_account(app_state, _request_username(request))
    except ValueError as exc:
        raise web.HTTPBadRequest(text=str(exc)) from exc
    return json_response({"ok": True})


@authorized()
async def challenge_accept(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    username = _request_username(request)

    gameId = request.match_info.get("gameId")
    if TYPE_CHECKING:
        assert gameId is not None
    seek = app_state.invites[gameId]

    result: NewGameMessage | ErrorMessage = await new_game(app_state, seek, gameId)

    if result["type"] == "new_game":
        if gameId not in app_state.invite_channels:
            event = app_state.invite_events.setdefault(gameId, asyncio.Event())
            try:
                await asyncio.wait_for(event.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                log.warning("BOT_API challenge_accept() SSE timeout for %s", gameId)
            finally:
                app_state.invite_events.pop(gameId, None)

        try:
            # Put response data to sse subscriber queue
            channels = app_state.invite_channels.get(gameId)
            if channels is not None:
                for queue in channels:
                    await queue.put(json_dumps({"gameId": gameId, "accept": True}))
        except ConnectionResetError:
            log.error("/api/challenge/{%s}/accept ConnectionResetError", gameId)

        engine = await app_state.users.get(username)

        game = await load_game(app_state, gameId)
        if game is None:
            raise web.HTTPNotFound()

        await send_bot_game_start_unless_streaming(engine, game)

    return json_response({"ok": True})


@authorized()
async def challenge_decline(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)

    gameId = request.match_info.get("gameId")
    if TYPE_CHECKING:
        assert gameId is not None

    if gameId not in app_state.invite_channels:
        event = app_state.invite_events.setdefault(gameId, asyncio.Event())
        try:
            await asyncio.wait_for(event.wait(), timeout=10.0)
        except asyncio.TimeoutError:
            log.warning("BOT_API challenge_decline() SSE timeout for %s", gameId)
        finally:
            app_state.invite_events.pop(gameId, None)

    try:
        # Put response data to sse subscriber queue
        channels = app_state.invite_channels.get(gameId)
        if channels is not None:
            for queue in channels:
                await queue.put(json_dumps({"gameId": gameId, "accept": False}))
    except ConnectionResetError:
        log.error("/api/challenge/{%s}/decline ConnectionResetError", gameId)

    return json_response({"ok": True})


@authorized()
async def event_stream(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    username = _request_username(request)

    resp = web.StreamResponse()
    resp.content_type = "application/x-ndjson"
    await resp.prepare(request)

    if username in app_state.users:
        bot_player = app_state.users[username]
        # After BOT lost connection it may have ongoing games
        # We notify BOT and he can ask to create new game_streams
        # to continue those games
        for gameId in bot_player.game_queues:
            if gameId in app_state.games and app_state.games[gameId].status == STARTED:
                await send_bot_game_start_unless_streaming(bot_player, app_state.games[gameId])
    else:
        bot_player = User(app_state, bot=True, username=username)
        app_state.users[bot_player.username] = bot_player

        doc: UserDocument | None = await app_state.db.user.find_one({"_id": username})
        if doc is None:
            result = await app_state.db.user.insert_one(
                {
                    "_id": username,
                    "username_lower": username.lower(),
                    "title": "BOT",
                }
            )
            log.debug("db insert user result %r", result.inserted_id)

    bot_player.online = True

    log.info("+++ BOT %s connected", bot_player.username)

    async def pinger():
        """To prevent lichess-bot.py sleep by heroku because of no activity."""
        while True:
            await bot_player.event_queue.put('{"type":"ping"}\n')
            await asyncio.sleep(6)

    pinger_task = asyncio.create_task(pinger(), name="BOT-event-stream-pinger")

    # send "challenge" and "gameStart" events from event_queue to the BOT
    while bot_player.online:
        answer: str | None = await bot_player.event_queue.get()
        if answer is None:
            bot_player.event_queue.task_done()
        if TYPE_CHECKING:
            assert answer is not None
        try:
            if request.transport is not None and request.transport.is_closing():
                break
            else:
                await resp.write(answer.encode())
                bot_player.event_queue.task_done()
        except Exception:
            log.error("Writing %s to BOT %s event_stream is broken...", answer, username)
            break

    try:
        await resp.write_eof()
    except Exception:
        log.error("Writing EOF to BOT event_stream failed!")
    finally:
        pinger_task.cancel()
        try:
            await pinger_task
        except asyncio.CancelledError:
            pass

    await bot_player.clear_seeks()
    return resp


@authorized()
async def game_stream(request: web.Request) -> web.StreamResponse:
    gameId = request.match_info["gameId"]

    app_state = get_app_state(request.app)
    username = _request_username(request)

    game = app_state.games[gameId]
    if TYPE_CHECKING:
        assert isinstance(game, Game)

    resp = web.StreamResponse()
    resp.content_type = "application/x-ndjson"
    await resp.prepare(request)

    bot_player = app_state.users[username]

    if gameId in bot_player.active_game_streams:
        log.warning(
            "Duplicate BOT game_stream ignored. bot=%s game=%s",
            bot_player.username,
            gameId,
        )
        raise web.HTTPConflict(text="game stream already active")

    bot_player.active_game_streams.add(gameId)

    log.info("+++ %s connected to %s game stream", bot_player.username, gameId)

    await bot_player.game_queues[gameId].put(game.game_full)

    async def pinger():
        """To help lichess-bot.py abort games showing no activity."""
        while True:
            if gameId in bot_player.game_queues:
                await bot_player.game_queues[gameId].put('{"type":"ping"}\n')
                await asyncio.sleep(6)
            else:
                break

    pinger_task = asyncio.create_task(pinger(), name="BOT-game-stream-pinger")

    while True:
        answer: str | None = await bot_player.game_queues[gameId].get()
        if answer is None:
            bot_player.game_queues[gameId].task_done()
        if TYPE_CHECKING:
            assert answer is not None
        try:
            if request.transport is not None and request.transport.is_closing():
                break
            else:
                await resp.write(answer.encode())
                bot_player.game_queues[gameId].task_done()
        except Exception:
            log.error("Writing %s to BOT %s game_stream failed!", answer, username)
            break

    try:
        await resp.write_eof()
    except Exception:
        log.error("Writing EOF to BOT game_stream failed!")
    finally:
        bot_player.active_game_streams.discard(gameId)
        pinger_task.cancel()
        try:
            await pinger_task
        except asyncio.CancelledError:
            pass

    return resp


@authorized()
async def bot_move(request: web.Request) -> web.StreamResponse:
    gameId = request.match_info["gameId"]
    move = request.match_info["move"]

    app_state = get_app_state(request.app)
    username = _request_username(request)

    user = app_state.users[username]
    game = app_state.games[gameId]
    if TYPE_CHECKING:
        assert isinstance(game, Game)

    await play_move(app_state, user, game, move)

    return json_response({"ok": True})


@authorized()
async def bot_abort(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    username = _request_username(request)

    gameId = request.match_info["gameId"]
    game = app_state.games[gameId]
    if TYPE_CHECKING:
        assert isinstance(game, Game)

    bot_player = app_state.users[username]

    opp_name = game.wplayer.username if username == game.bplayer.username else game.bplayer.username
    opp_player = app_state.users[opp_name]

    response = await game.abort_by_server()
    await bot_player.game_queues[gameId].put(game.game_end)
    if opp_player.bot:
        await opp_player.game_queues[gameId].put(game.game_end)
    else:
        await app_state.users[opp_name].send_game_message(gameId, response)

    await round_broadcast(game, response)

    return json_response({"ok": True})


@authorized()
async def bot_resign(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    username = _request_username(request)

    gameId = request.match_info["gameId"]
    game = app_state.games[gameId]
    game.status = RESIGN
    game.result = "0-1" if username == game.wplayer.username else "1-0"
    return json_response({"ok": True})


@authorized()
async def bot_chat(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    username = _request_username(request)

    data = await read_post_data(request)
    if data is None:
        return json_response({})
    log.debug("BOT-CHAT %s %r", username, data)

    gameId = request.match_info["gameId"]

    game = app_state.games[gameId]

    opp_name = game.wplayer.username if username == game.bplayer.username else game.bplayer.username

    if not app_state.users[opp_name].bot:
        await app_state.users[opp_name].send_game_message(
            gameId,
            {
                "type": "roundchat",
                "user": username,
                "room": data["room"],
                "message": data["text"],
            },
        )

    return json_response({"ok": True})
