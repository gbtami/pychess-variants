import json


async def lobby_broadcast(sockets, response):
    for ws_set in sockets.values():
        for ws in ws_set:
            await ws.send_json(response)


async def round_broadcast(game, users, response, full=False, channels=None):
    if game.spectators:
        for spectator in game.spectators:
            if game.id in users[spectator.username].game_sockets:
                await users[spectator.username].game_sockets[game.id].send_json(response)
    if full:
        if not game.wplayer.bot:
            try:
                wplayer_ws = users[game.wplayer.username].game_sockets[game.id]
                await wplayer_ws.send_json(response)
            except KeyError:
                print("wplayer %s game socket closed" % game.wplayer.username)

        if not game.bplayer.bot:
            try:
                bplayer_ws = users[game.bplayer.username].game_sockets[game.id]
                await bplayer_ws.send_json(response)
            except KeyError:
                print("bplayer %s game socket closed" % game.bplayer.username)

    # Put response data to sse subscribers queue
    if channels is not None:
        for queue in channels:
            await queue.put(json.dumps(response))
