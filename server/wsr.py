from __future__ import annotations
from typing import TYPE_CHECKING, Mapping
import asyncio
import random
import string

import aiohttp_session
from aiohttp import web
from aiohttp.web_ws import WebSocketResponse

from bug.wsr_bug import handle_resign_bughouse, handle_rematch_bughouse, handle_reconnect_bughouse
import game
from broadcast import round_broadcast
from chat import chat_response
from const import ANON_PREFIX, ANALYSIS, STARTED
from draw import draw, reject_draw
from fairy import WHITE, BLACK, FairyBoard
from newid import new_id

if TYPE_CHECKING:
    from clock import Clock
    from bug.game_bug import GameBug
    from game import Game
    from pychess_global_app_state import PychessGlobalAppState
    from pymongo.asynchronous.database import AsyncDatabase
    from user import User
    from users import Users
    from ws_types import (
        AbortResignMessage,
        AnalysisMessage,
        AnalysisMoveMessage,
        ByoyomiMessage,
        BerserkMessage,
        BugRoundChatMessage,
        ChatMessage,
        CountResponse,
        CountMessage,
        DeletedMessage,
        DeleteMessage,
        DrawMessage,
        EmbedUserConnectedMessage,
        FullChatMessage,
        GameStartMessage,
        GameUserConnectedMessage,
        LeaveMessage,
        MoveMessage,
        MoreTimeMessage,
        MoreTimeRequest,
        RematchOfferMessage,
        RematchRejectedMessage,
        ReadyMessage,
        RematchMessage,
        RequestAnalysisMessage,
        RoundChatMessage,
        RoundInboundMessage,
        SetupMessage,
        SetupResponse,
        UpdateTVMessage,
        UserPresenceMessage,
        ViewRematchMessage,
    )
from pychess_global_app_state_utils import get_app_state
from seek import challenge, Seek
from ws_types import BughouseMoveMessage, MoveMessage, RoundInboundMessage
from utils import (
    analysis_move,
    play_move,
    join_seek,
    load_game,
    tv_game,
    tv_game_user,
)
from bug.utils_bug import play_move as play_move_bug
from websocket_utils import process_ws, get_user, ws_send_json
import logging
import logger

log = logging.getLogger(__name__)

MORE_TIME = 15 * 1000


async def round_socket_handler(request: web.Request) -> web.StreamResponse:
    gameId = request.match_info["gameId"]
    app_state = get_app_state(request.app)
    game = await load_game(app_state, gameId)
    if game is None:
        log.error("Game is None")
        return web.HTTPFound("/")
    if TYPE_CHECKING:
        assert isinstance(game, Game)

    session = await aiohttp_session.get_session(request)
    user = await get_user(session, request)
    logger.set_log_context("username", user.username)
    logger.set_log_context("gameId", game.id)

    async def process_message_wrapper(
        app_state: PychessGlobalAppState,
        user: User,
        ws: WebSocketResponse,
        data: RoundInboundMessage,
    ) -> None:
        await process_message(app_state, user, ws, data, game)

    ws = await process_ws(
        session,
        request,
        user,
        lambda app_state, ws, user: init_ws(app_state, ws, user, game),
        process_message_wrapper,
    )
    if ws is None:
        return web.HTTPFound("/")
    await finally_logic(app_state, ws, user, game)
    return ws


async def init_ws(
    app_state: PychessGlobalAppState,
    ws: WebSocketResponse,
    user: User,
    game: game.Game,
) -> None:
    for p in game.non_bot_players:
        if p.username != user.username:
            await handle_is_user_present(ws, app_state.users, p.username, game)
    await handle_game_user_connected(app_state, ws, user, game)
    await handle_board(ws, user, game)


async def process_message(
    app_state: PychessGlobalAppState,
    user: User,
    ws: WebSocketResponse,
    data: RoundInboundMessage,
    game: game.Game,
) -> None:
    if data["type"] == "move":
        await handle_move(app_state, user, data, game)
    elif data["type"] == "reconnect":
        if TYPE_CHECKING:
            assert isinstance(game, GameBug)
        await handle_reconnect_bughouse(app_state, user, data, game)
    elif data["type"] == "berserk":
        await handle_berserk(data, game)
    elif data["type"] == "analysis_move":
        await handle_analysis_move(user, data, game)
    elif data["type"] == "ready":
        await handle_ready(ws, app_state.users, user, data, game)
    elif data["type"] == "board":
        await handle_board(ws, user, game)
    elif data["type"] == "setup":
        await handle_setup(ws, app_state.users, user, data, game)
    elif data["type"] == "analysis":
        await handle_analysis(app_state, ws, data, game)
    elif data["type"] == "rematch":
        await handle_rematch(app_state, ws, user, data, game)
    elif data["type"] == "reject_rematch":
        await handle_reject_rematch(user, game)
    elif data["type"] == "draw":
        await handle_draw(ws, app_state.users, user, data, game)
    elif data["type"] == "reject_draw":
        await handle_reject_draw(user, game)
    elif data["type"] == "byoyomi":
        await handle_byoyomi(data, game)
    elif data["type"] == "takeback":
        await handle_takeback(ws, game)
    elif (
        data["type"] == "abort"
        or data["type"] == "resign"
        or data["type"] == "abandon"
        or data["type"] == "flag"
    ):
        if game.server_variant.two_boards:
            if TYPE_CHECKING:
                assert isinstance(game, GameBug)
            await handle_resign_bughouse(data, game, user)
        else:
            await handle_abort_resign_abandon_flag(ws, app_state.users, user, data, game)
    elif data["type"] == "embed_user_connected":
        await handle_embed_user_connected(ws)
    elif data["type"] == "is_user_present":
        await handle_is_user_present(ws, app_state.users, data["username"], game)
    elif data["type"] == "moretime":
        await handle_moretime(app_state.users, user, data, game)
    elif data["type"] == "bugroundchat":
        if TYPE_CHECKING:
            assert isinstance(game, GameBug)
        await handle_bugroundchat(app_state.users, user, data, game)
    elif data["type"] == "roundchat":
        await handle_roundchat(app_state, ws, user, data, game)
    elif data["type"] == "leave":
        await handle_leave(user, data, game)
    elif data["type"] == "updateTV":
        await handle_updateTV(app_state, ws, data)
    elif data["type"] == "count":
        await handle_count(ws, user, data, game)
    elif data["type"] == "delete":
        await handle_delete(app_state.db, ws, data)


async def finally_logic(
    app_state: PychessGlobalAppState,
    ws: WebSocketResponse,
    user: User,
    game: game.Game,
) -> None:
    if game is not None and user is not None and not user.bot:
        if user.remove_ws_for_game(game.id, ws):
            user.update_online()

        if user in (game.wplayer, game.bplayer) and (not game.corr):
            task = asyncio.create_task(
                user.abandon_game(game), name="abandone-game-%s-%s" % (user.username, game.id)
            )
            user.abandon_game_tasks[game.id] = task
            task.add_done_callback(lambda task: user.abandon_task_done(task, game.id))
        else:
            game.spectators.discard(user)
            await round_broadcast(game, game.spectator_list, full=True)

        # not connected to any other game socket after we closed this one. maybe we havae a change of online users count
        if not user.is_user_active_in_game() and not user.is_user_active_in_lobby():
            await app_state.lobby.lobby_broadcast_u_cnt()

    if game is not None and user is not None:
        response: UserPresenceMessage = {"type": "user_disconnected", "username": user.username}
        await round_broadcast(game, response, full=True)


async def handle_move(
    app_state: PychessGlobalAppState,
    user: User,
    data: MoveMessage | BughouseMoveMessage,
    game: game.Game,
) -> None:
    log.debug("Got USER move %s %s %s" % (user.username, data["gameId"], data["move"]))
    async with game.move_lock:
        if game.server_variant.two_boards:
            try:
                if TYPE_CHECKING:
                    assert "board" in data
                    assert "clocksB" in data
                bug_data: BughouseMoveMessage = data  # type: ignore[assignment]
                await play_move_bug(
                    app_state,
                    user,
                    game,
                    bug_data["move"],
                    bug_data["clocks"],
                    bug_data["clocksB"],
                    # data["ply"],todo:dont even send it maybe
                    bug_data["board"],
                )
            except Exception:
                log.exception(
                    "ERROR: Exception in play_move() in %s by %s. data %r ",
                    data["gameId"],
                    user.username,
                    data,
                )
        else:
            try:
                await play_move(
                    app_state,
                    user,
                    game,
                    data["move"],
                    data["clocks"],
                    data["ply"],
                )
            except Exception:
                log.exception(
                    "ERROR: Exception in play_move() in %s by %s ",
                    data["gameId"],
                    user.username,
                )


async def handle_berserk(data: BerserkMessage, game: game.Game) -> None:
    game.berserk(data["color"])
    response: BerserkMessage = {"type": "berserk", "color": data["color"]}
    await round_broadcast(game, response, full=True)
    await game.save_berserk()


async def handle_analysis_move(user: User, data: AnalysisMoveMessage, game: game.Game) -> None:
    await analysis_move(
        user,
        game,
        data["move"],
        data["fen"],
        data["ply"],
    )


async def handle_ready(
    ws: WebSocketResponse,
    users: Users,
    user: User,
    data: ReadyMessage,
    game: game.Game,
) -> None:
    opp_name = (
        game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
    )
    opp_player = await users.get(opp_name)
    response: GameStartMessage = {"type": "gameStart", "gameId": data["gameId"]}
    if opp_player is not None and opp_player.bot:
        # Janggi game start have to wait for human player setup!
        if game.variant != "janggi" or not (game.bsetup or game.wsetup):
            await opp_player.event_queue.put(game.game_start)

        await ws_send_json(ws, response)
    else:
        await ws_send_json(ws, response)

        await round_broadcast(game, game.spectator_list, full=True)


async def handle_board(ws: WebSocketResponse, user: User, game: game.Game) -> None:
    if game.variant == "janggi":
        # print("JANGGI", ws, game.bsetup, game.wsetup, game.status)
        if (game.bsetup or game.wsetup) and game.status <= STARTED:
            setup_response: SetupResponse
            if game.bsetup:
                setup_response = {
                    "type": "setup",
                    "color": "black",
                    "fen": game.board.initial_fen,
                }
                await ws_send_json(
                    ws,
                    setup_response,
                )
            elif game.wsetup:
                setup_response = {
                    "type": "setup",
                    "color": "white",
                    "fen": game.board.initial_fen,
                }
                await ws_send_json(
                    ws,
                    setup_response,
                )
        else:
            board_response = game.get_board(full=True)
            await ws_send_json(ws, board_response)
    else:
        user_color = WHITE if user == game.wplayer else BLACK if user == game.bplayer else None
        board_response = game.get_board(full=True, persp_color=user_color)
        await ws_send_json(ws, board_response)

    if game.corr and game.status <= STARTED and len(game.draw_offers) > 0:
        offerer = game.wplayer if game.wplayer.username in game.draw_offers else game.bplayer
        response = await draw(game, offerer)
        await ws_send_json(ws, response)


async def handle_setup(
    ws: WebSocketResponse,
    users: Users,
    user: User,
    data: SetupMessage,
    game: game.Game,
) -> None:
    # Janggi game starts with a prelude phase to set up horses and elephants
    # First the second player (Red) chooses his setup! Then the first player (Blue)

    game.board.initial_fen = data["fen"]
    game.initial_fen = game.board.initial_fen
    game.board.fen = game.board.initial_fen
    # print("--- Got FEN from %s %s" % (data["color"], data["fen"]))

    opp_name = (
        game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
    )
    opp_player = users[opp_name] if opp_name in users else None

    game.steps[0]["fen"] = data["fen"]

    if data["color"] == "black":
        game.bsetup = False
        setup_response: SetupResponse = {
            "type": "setup",
            "color": "white",
            "fen": data["fen"],
        }
        await ws_send_json(ws, setup_response)

        if opp_player is not None:
            if opp_player.bot:
                game.board.janggi_setup("w")
                game.steps[0]["fen"] = game.board.initial_fen
            else:
                await opp_player.send_game_message(game.id, setup_response)
    else:
        game.wsetup = False
        game.status = STARTED

        board_response = game.get_board(full=True)
        # log.info("User %s asked board. Server sent: %s" % (user.username, board_response["fen"]))
        await ws_send_json(ws, board_response)

        if (opp_player is not None) and (not opp_player.bot):
            await opp_player.send_game_message(data["gameId"], board_response)

    await game.save_setup()

    if opp_player is not None and opp_player.bot:
        await opp_player.event_queue.put(game.game_start)

    # restart expiration time after setup phase
    if TYPE_CHECKING:
        assert isinstance(game.stopwatch, Clock)
    game.stopwatch.restart(game.stopwatch.time_for_first_move)


async def handle_analysis(
    app_state: PychessGlobalAppState,
    ws: WebSocketResponse,
    data: AnalysisMessage,
    game: game.Game,
) -> None:
    # fishnet_analysis() wants to inject analysis data into game.steps
    # Analysis can be requested for older games. While get_board() creates steps
    # load_game() does't put the game into the app_state.games, and when
    # fishnet_analysis() calls load_game(), it will lose game.steps (they are
    # cteated lousely via get_board() only!)
    # We have to prevent this.
    if game.id not in app_state.games:
        app_state.games[data["gameId"]] = game
        # TODO: maybe we have to schedule game.remove() ?

    # If there is any fishnet client, use it.
    if len(app_state.workers) > 0:
        work_id = "".join(random.choice(string.ascii_letters + string.digits) for x in range(6))
        work = {
            "work": {
                "type": "analysis",
                "id": work_id,
            },
            # or:
            # "work": {
            #   "type": "move",
            #   "id": "work_id",
            #   "level": 5 // 1 to 8
            # },
            "username": data["username"],
            "game_id": data["gameId"],  # optional
            "position": game.board.initial_fen,  # start position (X-FEN)
            "variant": game.variant,
            "chess960": game.chess960,
            "moves": " ".join(game.board.move_stack),  # moves of the game (UCI)
            "nnue": game.board.nnue,
            "nodes": 500000,  # optional limit
            #  "skipPositions": [1, 4, 5]  # 0 is the first position
        }
        app_state.fishnet_works[work_id] = work
        app_state.fishnet_queue.put_nowait((ANALYSIS, work_id))
    else:
        engine = app_state.users["Fairy-Stockfish"]

        if (engine is not None) and engine.online:
            engine.game_queues[data["gameId"]] = asyncio.Queue()
            await engine.event_queue.put(game.analysis_start(data["username"]))

    response: ChatMessage = chat_response(
        "roundchat",
        "",
        "Analysis request sent...",
        room="spectator",
    )
    await ws_send_json(ws, response)


async def handle_rematch(
    app_state: PychessGlobalAppState,
    ws: WebSocketResponse,
    user: User,
    data: RematchMessage,
    game: game.Game,
) -> Mapping[str, object] | None:
    if game.server_variant.two_boards:
        if TYPE_CHECKING:
            assert isinstance(game, GameBug)
        await handle_rematch_bughouse(app_state, game, user)
        return None

    # Use the game's move_lock to ensure atomic operations for rematch functionality
    async with game.move_lock:
        rematch_id = None

        opp_name = (
            game.wplayer.username
            if user.username == game.bplayer.username
            else game.bplayer.username
        )
        opp_player = app_state.users[opp_name]
        handicap = data["handicap"]
        fen = "" if game.variant == "janggi" else game.initial_fen

        chess960 = game.chess960
        if TYPE_CHECKING:
            assert chess960 is not None
        reused_fen = True
        if (chess960 or game.random_only) and game.new_960_fen_needed_for_rematch:
            fen = FairyBoard.start_fen(game.variant, chess960, disabled_fen=game.initial_fen)
            reused_fen = False

        if opp_player.bot:
            if opp_player.username == "Random-Mover":
                engine = app_state.users["Random-Mover"]
            else:
                engine = app_state.users["Fairy-Stockfish"]

            if engine is None or not engine.online:
                # TODO: message that engine is offline, but capture BOT will play instead
                engine = app_state.users["Random-Mover"]

            color = "w" if game.wplayer.username == opp_name else "b"
            if handicap:
                color = "w" if color == "b" else "b"
            seek_id = await new_id(None if app_state.db is None else app_state.db.seek)
            seek = Seek(
                seek_id,
                user,
                game.variant,
                fen=fen,
                color=color,
                base=game.base,
                inc=game.inc,
                byoyomi_period=game.byoyomi_period,
                day=game.base if game.corr else 0,
                level=game.level,
                rated=game.rated,
                player1=user,
                chess960=chess960,
                reused_fen=reused_fen,
            )
            app_state.seeks[seek.id] = seek

            response = await join_seek(app_state, engine, seek)
            await ws_send_json(ws, response)

            await engine.event_queue.put(challenge(seek))
            gameId = response["gameId"]
            rematch_id = gameId
            engine.game_queues[gameId] = asyncio.Queue()
        else:
            if opp_name in game.rematch_offers:
                color = "w" if game.wplayer.username == opp_name else "b"
                if handicap:
                    color = "w" if color == "b" else "b"
                seek_id = await new_id(None if app_state.db is None else app_state.db.seek)
                seek = Seek(
                    seek_id,
                    user,
                    game.variant,
                    fen=fen,
                    color=color,
                    base=game.base,
                    inc=game.inc,
                    byoyomi_period=game.byoyomi_period,
                    day=game.base if game.corr else 0,
                    level=game.level,
                    rated=game.rated,
                    player1=user,
                    chess960=chess960,
                    reused_fen=reused_fen,
                )
                app_state.seeks[seek.id] = seek

                response = await join_seek(app_state, opp_player, seek)
                rematch_id = response["gameId"]
                await ws_send_json(ws, response)
                await app_state.users[opp_name].send_game_message(data["gameId"], response)
            else:
                game.rematch_offers.add(user.username)
                offer_response: RematchOfferMessage = {
                    "type": "rematch_offer",
                    "username": user.username,
                    "message": "Rematch offer sent",
                    "room": "player",
                    "user": "",
                }
                response = offer_response
                game.messages.append(response)
                await ws_send_json(ws, response)
                await app_state.users[opp_name].send_game_message(data["gameId"], response)
        if rematch_id:
            view_response: ViewRematchMessage = {"type": "view_rematch", "gameId": rematch_id}
            await round_broadcast(game, view_response)

    return response


async def handle_reject_rematch(user: User, game: game.Game) -> None:
    opp_name = (
        game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
    )

    if opp_name in game.rematch_offers:
        response: RematchRejectedMessage = {
            "type": "rematch_rejected",
            "message": "Rematch offer rejected",
        }
        await round_broadcast(
            game,
            response,
            full=True,
        )


async def handle_draw(
    ws: WebSocketResponse,
    users: Users,
    user: User,
    data: DrawMessage,
    game: game.Game,
) -> None:
    color = WHITE if user.username == game.wplayer.username else BLACK
    opp_name = game.wplayer.username if color == BLACK else game.bplayer.username

    if opp_name not in game.draw_offers:
        game.draw_offers.add(user.username)

    response = await draw(game, user, agreement=opp_name in game.draw_offers)
    await ws_send_json(ws, response)

    if opp_name in users:
        opp_player = users[opp_name]
        if opp_player.bot:
            if game.status > STARTED and data["gameId"] in opp_player.game_queues:
                await opp_player.game_queues[data["gameId"]].put(game.game_end)
        else:
            try:
                await opp_player.send_game_message(data["gameId"], response)
            except KeyError:
                log.error("handle_draw() KeyError. Opp %s disconnected", opp_name)

    await round_broadcast(game, response)


async def handle_reject_draw(user: User, game: game.Game) -> None:
    color = WHITE if user.username == game.wplayer.username else BLACK
    opp_user = game.wplayer if color == BLACK else game.bplayer

    response = await reject_draw(game, opp_user)
    if response is not None:
        await round_broadcast(game, response, full=True)


async def handle_byoyomi(data: ByoyomiMessage, game: game.Game) -> None:
    game.byo_correction += game.inc * 1000
    color = WHITE if data["color"] == "white" else BLACK
    game.byoyomi_periods[color] = data["period"]
    # print("BYOYOMI:", data)


async def handle_takeback(ws: WebSocketResponse, game: game.Game) -> None:
    await game.takeback()
    board_response = game.get_board(full=True)
    board_response["takeback"] = True
    await ws_send_json(ws, board_response)


async def handle_abort_resign_abandon_flag(
    ws: WebSocketResponse,
    users: Users,
    user: User,
    data: AbortResignMessage,
    game: game.Game,
) -> None:
    if data["type"] == "abort" and (game is not None) and game.board.ply > 2:
        return

    if game.status > STARTED:
        # game was already finished!
        # see  https://github.com/gbtami/pychess-variants/issues/675
        return

    async with game.move_lock:
        response = await game.game_ended(user, data["type"])

    await ws_send_json(ws, response)

    opp_name = (
        game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
    )
    if opp_name in users:
        opp_player = users[opp_name]
        if opp_player.bot:
            if data["gameId"] in opp_player.game_queues:
                await opp_player.game_queues[data["gameId"]].put(game.game_end)
        else:
            await opp_player.send_game_message(data["gameId"], response)

    await round_broadcast(game, response)


async def handle_embed_user_connected(ws: WebSocketResponse) -> None:
    response: EmbedUserConnectedMessage = {"type": "embed_user_connected"}
    await ws_send_json(ws, response)


async def handle_game_user_connected(
    app_state: PychessGlobalAppState,
    ws: WebSocketResponse,
    user: User,
    game: game.Game,
) -> None:
    # update websocket
    log.debug("Addings ws %r to user %r for game%s", id(ws), user, game)

    was_user_playing_another_game_before_connect = user.is_user_active_in_game()
    user.add_ws_for_game(game.id, ws)
    user.update_online()

    # remove user seeks
    if len(user.lobby_sockets) == 0 or (
        game.status <= STARTED and user.username in (game.wplayer.username, game.bplayer.username)
    ):
        await game.wplayer.clear_seeks()
        await game.bplayer.clear_seeks()

    if not game.is_player(user):
        game.spectators.add(user)
        await round_broadcast(game, game.spectator_list, full=True)

    stopwatch_secs = 0
    if not game.corr and not game.server_variant.two_boards:
        if TYPE_CHECKING:
            assert isinstance(game.stopwatch, Clock)
        stopwatch_secs = game.stopwatch.secs
    response: GameUserConnectedMessage = {
        "type": "game_user_connected",
        "username": user.username,
        "gameId": game.id,
        "ply": game.ply,
        "firstmovetime": stopwatch_secs,
    }
    await ws_send_json(ws, response)

    if game.id in user.abandon_game_tasks:
        task = user.abandon_game_tasks[game.id]
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        user.abandon_task_done(task, game.id)

    fullchat_response: FullChatMessage = {"type": "fullchat", "lines": list(game.messages)}
    await ws_send_json(ws, fullchat_response)

    presence_response: UserPresenceMessage = {
        "type": "user_present",
        "username": user.username,
    }
    await round_broadcast(game, presence_response, full=True)

    # if this is the first game socket for this user, and they not in lobby maybe we have a change in what
    # we considered online user count. todo: also tournament sockets maybe should be checked here
    if not was_user_playing_another_game_before_connect and not user.is_user_active_in_lobby():
        await app_state.lobby.lobby_broadcast_u_cnt()


async def handle_is_user_present(
    ws: WebSocketResponse,
    users: Users,
    player_name: str,
    game: game.Game,
) -> None:
    player = await users.get(player_name)
    response: UserPresenceMessage
    if (
        player is not None and (game.id in player.game_queues)
        if player.bot
        else player.is_user_active_in_game(game.id)
    ):
        response = {"type": "user_present", "username": player_name}
    else:
        response = {
            "type": "user_disconnected",
            "username": player_name,
        }
    await ws_send_json(ws, response)


async def handle_moretime(users: Users, user: User, data: MoreTimeRequest, game: game.Game) -> None:
    opp_color = WHITE if user.username == game.bplayer.username else BLACK
    if (not game.corr) and opp_color == game.stopwatch.color:
        if TYPE_CHECKING:
            assert isinstance(game.stopwatch, Clock)
        opp_time = game.stopwatch.stop()
        game.stopwatch.restart(opp_time + MORE_TIME)

    opp_name = (
        game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
    )
    if opp_name in users:
        opp_player = users[opp_name]
        if not opp_player.bot:
            response: MoreTimeMessage = {"type": "moretime", "username": opp_name}
            await users[opp_name].send_game_message(data["gameId"], response)
            await round_broadcast(game, response)


async def handle_bugroundchat(
    users: Users, user: User, data: BugRoundChatMessage, game: GameBug
) -> None:
    gameId = data["gameId"]
    message = data["message"]
    room = data["room"]

    # response = chat_response(
    #     "bugroundchat",
    #     user.username,
    #     message,
    #     room=room,
    # )
    response = game.handle_chat_message(user, message, room)
    response["type"] = "bugroundchat"

    if room == "spectator":
        recipients = []  # just the spectators. should be equivalent to room="spectator"
    elif game.ply < 4 or game.status > STARTED:
        # Let all 4 players communicate in the beginning of the game and when it is over
        recipients = [
            game.wplayerA.username,
            game.bplayerA.username,
            game.wplayerB.username,
            game.bplayerB.username,
        ]
    elif user.username in [game.wplayerA.username, game.bplayerB.username]:
        recipients = [game.wplayerA.username, game.bplayerB.username]
    elif user.username in [game.bplayerA.username, game.wplayerB.username]:
        recipients = [game.bplayerA.username, game.wplayerB.username]
    else:
        recipients = []  # just the spectators. should be equivalent to room="spectator"
    recipients = list(
        dict.fromkeys(recipients)
    )  # remove duplicates - can have if simuling (not that it makes sense to have this chat in simul mode but anyway)
    for name in recipients:
        player = users[name]
        await player.send_game_message(gameId, response)

    await round_broadcast(game, response)


async def handle_roundchat(
    app_state: PychessGlobalAppState,
    ws: WebSocketResponse,
    user: User,
    data: RoundChatMessage,
    game: game.Game,
) -> None:
    if user.username.startswith(ANON_PREFIX):
        return

    gameId = data["gameId"]
    message = data["message"]
    room = data["room"]

    # Users running a fishnet worker can ask server side analysis with chat message: !analysis
    if data["message"] == "!analysis" and user.username in app_state.fishnet_versions:
        for step in game.steps:
            if "analysis" in step:
                del step["analysis"]
        analysis_response: RequestAnalysisMessage = {"type": "request_analysis"}
        await ws_send_json(ws, analysis_response)
        return

    response: ChatMessage = chat_response(
        "roundchat",
        user.username,
        message,
        room=room,
    )

    game.handle_chat_message(response)

    for name in (game.wplayer.username, game.bplayer.username):
        player = app_state.users[name]
        if player.bot:
            if gameId in player.game_queues:
                await player.game_queues[gameId].put(
                    '{"type": "chatLine", "username": "%s", "room": %s, "text": "%s"}\n'
                    % (user.username, room, message)
                )
        else:
            await player.send_game_message(gameId, response)

    await round_broadcast(game, response)


async def handle_leave(user: User, data: LeaveMessage, game: game.Game) -> None:
    gameId = data["gameId"]

    response_chat = chat_response(
        "roundchat",
        "",
        "%s left the game" % user.username,
        room="player",
    )
    game.messages.append(response_chat)
    response: UserPresenceMessage = {
        "type": "user_disconnected",
        "username": user.username,
    }

    other_players = filter(lambda p: p.username != user.username, game.non_bot_players)
    for p in other_players:
        await p.send_game_message(gameId, response_chat)
        await p.send_game_message(gameId, response)

    await round_broadcast(game, response)


async def handle_updateTV(
    app_state: PychessGlobalAppState, ws: WebSocketResponse, data: UpdateTVMessage
) -> None:
    if "profileId" in data and data["profileId"] != "":
        gameId = await tv_game_user(app_state.db, app_state.users, data["profileId"])
    else:
        gameId = await tv_game(app_state)

    if gameId != data["gameId"] and gameId is not None:
        response: UpdateTVMessage = {"type": "updateTV", "gameId": gameId}
        await ws_send_json(ws, response)


async def handle_count(
    ws: WebSocketResponse, user: User, data: CountMessage, game: game.Game
) -> None:
    cur_player = game.bplayer if game.board.color == BLACK else game.wplayer

    response: CountResponse
    if user.username == cur_player.username:
        if data["mode"] == "start":
            game.start_manual_count()
            response = {
                "type": "count",
                "message": "Board's honor counting started",
                "room": "player",
                "user": "",
            }
        elif data["mode"] == "stop":
            game.stop_manual_count()
            response = {
                "type": "count",
                "message": "Board's honor counting stopped",
                "room": "player",
                "user": "",
            }
        await round_broadcast(game, response, full=True)
    else:
        response = {
            "type": "count",
            "message": "You can only start/stop board's honor counting on your own turn!",
            "room": "player",
            "user": "",
        }
        await ws_send_json(ws, response)


async def handle_delete(db: AsyncDatabase, ws: WebSocketResponse, data: DeleteMessage) -> None:
    await db.game.delete_one({"_id": data["gameId"]})
    response: DeletedMessage = {"type": "deleted"}
    await ws_send_json(ws, response)
