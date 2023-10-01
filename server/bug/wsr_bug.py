import logging

from broadcast import round_broadcast
from const import STARTED
from seek import Seek
from utils import join_seek
from utils_bug import play_move

log = logging.getLogger(__name__)

async def handle_reconnect_bughouse(data, game, user, request, session_user):
    log.info("Got USER move %s %s %s" % (user.username, data["gameId"], data["move"]))
    dataA = data["lastMaybeSentMsgMoveA"]
    dataB = data["lastMaybeSentMsgMoveB"]
    async with game.move_lock:
        try:
            await play_move(
                request.app,
                user,
                game,
                dataA["move"],
                dataA["clocks"],
                dataA["board"],
                dataA["partnerFen"],
            )
        except Exception:
            log.exception(
                "ERROR: Exception in play_move() in %s by %s ",
                dataA["gameId"],
                session_user,
            )
        ####
        try:
            await play_move(
                request.app,
                user,
                game,
                dataB["move"],
                dataB["clocks"],
                dataB["board"],
                dataB["partnerFen"],
            )
        except Exception:
            log.exception(
                "ERROR: Exception in play_move() in %s by %s ",
                dataB["gameId"],
                session_user,
            )

async def handle_resign_bughouse(data, game, user):
    if data["type"] == "abort" and (game is not None) and game.board.ply > 2:
        return

    if game.status > STARTED:
        # game was already finished!
        # see  https://github.com/gbtami/pychess-variants/issues/675
        return

    async with game.move_lock:
        response = await game.game_ended(user, data["type"])

    # todo:niki: I have put filter below, because of error in server log when some user doesnt have game_socket for that game BUT... see thought in below similar todo comment
    all_players_ws = map(lambda p: p.game_sockets[data["gameId"]], filter(lambda u: data["gameId"] in u.game_sockets, game.all_players))
    for ws in all_players_ws:
        await ws.send_json(response)

    await round_broadcast(game, response)

async def handle_rematch_bughouse(data, game, user, users, ws, request, seeks):
    log.info( "rematch request by %s.", user )
    rematch_id = None
    other_players = filter(lambda p: p.username != user.username, game.all_players)
    other_players = set(other_players)
    # opp_name = (
    #     game.wplayer.username
    #     if user.username == game.bplayer.username
    #     else game.bplayer.username
    # )
    # opp_player = users[opp_name]

    try:
        # todo:niki: I have put filter below, because of error in server log when some user doesnt have game_socket for that game BUT...:
        #            - first figure out in what cases does a user lose this socket (relevant to other places where similar error happens)
        #            - think what rematch logic should look like in such cases, because it doesnt make much sense the way it is now... what if he reconnects, will he receive the rematch requests in bulk on reconnect, maybe he shuld
        others_ws = map(lambda u: users[u.username].game_sockets[data["gameId"]], filter(lambda u: data["gameId"] in users[u.username].game_sockets, other_players))
        # opp_ws = users[opp_name].game_sockets[data["gameId"]]
    except KeyError:
        # opp disconnected
        return

    log.info("other_plauers %s.", other_players)
    if all(elem in game.rematch_offers for elem in map(lambda u: users[u.username].username, other_players)):
        color = "w" # if game.wplayer.username == opp_name else "b"
        fen = game.initial_fen
        seek = Seek(
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
        )
        seeks[seek.id] = seek

        response = await join_seek(request.app, None, seek.id, None, "all-joined-players-set-generate-response")
        rematch_id = response["gameId"]
        for ws1 in others_ws:
            await ws1.send_json(response)
        await ws.send_json(response)
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
        for ws1 in others_ws:
            await ws1.send_json(response)
        await ws.send_json(response)
    if rematch_id:
        await round_broadcast(
            game, {"type": "view_rematch", "gameId": rematch_id}
        )