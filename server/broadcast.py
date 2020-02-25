import json


async def lobby_broadcast(sockets, response):
    for client_ws in sockets.values():
        if client_ws is not None:
            await client_ws.send_json(response)


async def round_broadcast(game, users, response, full=False, channels=None):
    if game.spectators:
        for spectator in game.spectators:
            if game.id in users[spectator.username].game_sockets:
                await users[spectator.username].game_sockets[game.id].send_json(response)
    if full:
        try:
            if not game.wplayer.bot:
                wplayer_ws = users[game.wplayer.username].game_sockets[game.id]
                await wplayer_ws.send_json(response)

            if not game.bplayer.bot:
                bplayer_ws = users[game.bplayer.username].game_sockets[game.id]
                await bplayer_ws.send_json(response)
        except Exception:
            pass

    # Put response data to sse subscribers queue
    if channels is not None:
        for queue in channels:
            await queue.put(json.dumps(response))
