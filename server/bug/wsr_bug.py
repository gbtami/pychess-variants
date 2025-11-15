from broadcast import round_broadcast
from bug.game_bug import GameBug
from fairy import FairyBoard
from const import STARTED
from newid import new_id
from pychess_global_app_state import PychessGlobalAppState
from seek import Seek
from bug.utils_bug import play_move, join_seek_bughouse
from logger import log


async def handle_reconnect_bughouse(app_state: PychessGlobalAppState, user, data, game):
    log.info("Got RECONNECT message %s %r" % (user.username, data))
    moves_queued = data.get("movesQueued")
    # on reconnect use server time. Might be good to log the difference here to see how long a player was disconnected
    game_clocks = game.gameClocks.get_clocks_for_board_msg(full=True)
    # dataA = data.get("lastMaybeSentMsgMoveA")
    # dataB = data.get("lastMaybeSentMsgMoveB")
    async with game.move_lock:
        if moves_queued is not None and len(moves_queued) > 0 and moves_queued[0] is not None:
            try:
                await play_move(
                    app_state,
                    user,
                    game,
                    moves_queued[0]["move"],
                    game_clocks[0],  # moves_queued[0]["clocks"],
                    game_clocks[1],  # moves_queued[0]["clocksB"],
                    moves_queued[0]["board"],
                )
            except Exception:
                log.exception(
                    "ERROR: Exception in play_move() in %s by %s ",
                    moves_queued[0]["gameId"],
                    user.username,
                )
        ####
        if moves_queued is not None and len(moves_queued) > 1 and moves_queued[1] is not None:
            try:
                await play_move(
                    app_state,
                    user,
                    game,
                    moves_queued[1]["move"],
                    game_clocks[0],  # moves_queued[1]["clocks"],
                    game_clocks[1],  # moves_queued[1]["clocksB"],
                    moves_queued[1]["board"],
                )
            except Exception:
                log.exception(
                    "ERROR: Exception in play_move() in %s by %s ",
                    moves_queued[1]["gameId"],
                    user.username,
                )


async def handle_resign_bughouse(data, game: GameBug, user):
    if data["type"] == "abort" and (game is not None) and game.board.ply > 2:
        return

    if game.status > STARTED:
        # game was already finished!
        # see  https://github.com/gbtami/pychess-variants/issues/675
        return

    async with game.move_lock:
        response = await game.game_ended(user, data["type"])

    await round_broadcast(game, response, full=True)


async def handle_rematch_bughouse(app_state: PychessGlobalAppState, game, user):
    # Use the game's move_lock to ensure atomic operations for rematch functionality
    async with game.move_lock:
        log.info("rematch request by %s.", user)
        rematch_id = None
        other_players = filter(lambda p: p.username != user.username, game.non_bot_players)

        log.info("other_plauers %s.", other_players)
        if all(
            elem in game.rematch_offers
            for elem in map(lambda u: app_state.users[u.username].username, other_players)
        ):
            color = "w"  # if game.wplayer.username == opp_name else "b"
            fen = game.initial_fen

            reused_fen = True
            if game.chess960 and game.new_960_fen_needed_for_rematch:
                fen = FairyBoard.start_fen(
                    game.variant, game.chess960, disabled_fen=game.initial_fen
                )
                reused_fen = False

            seek_id = await new_id(None if app_state.db is None else app_state.db.seek)
            seek = Seek(
                seek_id,
                game.bplayer,
                game.variant,
                fen=fen,
                color=color,
                base=game.base,
                inc=game.inc,
                byoyomi_period=game.byoyomi_period,
                level=game.level,
                rated=game.rated,
                player1=game.bplayer,
                player2=game.wplayer,
                bugPlayer1=game.wplayerB,
                bugPlayer2=game.bplayerB,
                chess960=game.chess960,
                reused_fen=reused_fen,
            )
            app_state.seeks[seek.id] = seek

            response = await join_seek_bughouse(
                app_state, None, seek.id, None, "all-joined-players-set-generate-response"
            )
            rematch_id = response["gameId"]
            for u in set(game.non_bot_players):
                await u.send_game_message(game.id, response)
        else:
            game.rematch_offers.add(user.username)
            response = {
                "type": "rematch_offer",
                "username": user.username,
                "message": "Rematch offer sent by %s" % user.username,
                "room": "player",
                "user": "",
            }
            game.messages.append(response)
            for u in set(game.non_bot_players):
                await u.send_game_message(game.id, response)
        if rematch_id:
            await round_broadcast(game, {"type": "view_rematch", "gameId": rematch_id})

    return response
