import logging

from broadcast import round_broadcast
from const import STARTED
from seek import Seek
from utils import join_seek

log = logging.getLogger(__name__)

async def handle_resign_bughouse(data, game, user):
    if data["type"] == "abort" and (game is not None) and game.board.ply > 2:
        return

    if game.status > STARTED:
        # game was already finished!
        # see  https://github.com/gbtami/pychess-variants/issues/675
        return

    async with game.move_lock:
        response = await game.game_ended(user, data["type"])

    all_players_ws = map(lambda p: p.game_sockets[data["gameId"]], game.all_players)
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
        others_ws = map(lambda u: users[u.username].game_sockets[data["gameId"]], other_players)
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