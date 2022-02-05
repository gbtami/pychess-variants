import json
import logging

log = logging.getLogger(__name__)


async def discord_message(app, msg_type, msg):
    """ Send msg to discord-relay BOT """
    try:
        lobby_sockets = app["lobbysockets"]
        for dr_ws in lobby_sockets["Discord-Relay"]:
            await dr_ws.send_json({"type": msg_type, "message": msg})
            break
    except (KeyError, ConnectionResetError):
        # BOT disconnected
        log.error("--- Discord-Relay disconnected!")


async def broadcast_streams(app):
    lobby_sockets = app["lobbysockets"]
    live_streams = app["twitch"].live_streams + app["youtube"].live_streams
    response = {"type": "streams", "items": live_streams}
    print(response)
    await lobby_broadcast(lobby_sockets, response)


async def lobby_broadcast(sockets, response):
    for ws_set in sockets.values():
        for ws in ws_set:
            try:
                await ws.send_json(response)
            except ConnectionResetError:
                pass


async def round_broadcast(game, response, full=False, channels=None):
    if game.spectators:
        for spectator in game.spectators:
            try:
                if game.id in spectator.game_sockets:
                    await spectator.game_sockets[game.id].send_json(response)
            except (KeyError, ConnectionResetError):
                # spectator was removed from users
                pass

    if full:
        if not game.wplayer.bot:
            try:
                wplayer_ws = game.wplayer.game_sockets[game.id]
                await wplayer_ws.send_json(response)
            except (KeyError, AttributeError, ConnectionResetError):
                pass

        if not game.bplayer.bot:
            try:
                bplayer_ws = game.bplayer.game_sockets[game.id]
                await bplayer_ws.send_json(response)
            except (KeyError, AttributeError, ConnectionResetError):
                pass

    # Put response data to sse subscribers queue
    if channels is not None:
        for queue in channels:
            await queue.put(json.dumps(response))
