import json


async def lobby_broadcast(sockets, response):
    if response["type"] == "top_game":
        print("... lobby_broadcast()", response)
    for ws_set in sockets.values():
        for ws in ws_set:
            try:
                await ws.send_json(response)
            except ConnectionResetError:
                pass


async def tournament_broadcast(tournament, response):
    if response["type"] == "board":
        print("... tournament_broadcast()", response)
    for spectator in tournament.spectators:
        for ws in spectator.tournament_sockets:
            try:
                await ws.send_json(response)
            except (KeyError, ConnectionResetError):
                # spectator was removed from users
                pass


# TODO: do we really need users parameter here ???
async def round_broadcast(game, users, response, full=False, channels=None):
    if game.spectators:
        for spectator in game.spectators:
            try:
                if game.id in users[spectator.username].game_sockets:
                    await users[spectator.username].game_sockets[game.id].send_json(response)
            except (KeyError, ConnectionResetError):
                # spectator was removed from users
                pass

    if full:
        if not game.wplayer.bot:
            try:
                wplayer_ws = users[game.wplayer.username].game_sockets[game.id]
                await wplayer_ws.send_json(response)
            except (KeyError, AttributeError, ConnectionResetError):
                pass

        if not game.bplayer.bot:
            try:
                bplayer_ws = users[game.bplayer.username].game_sockets[game.id]
                await bplayer_ws.send_json(response)
            except (KeyError, AttributeError, ConnectionResetError):
                pass

    # Put response data to sse subscribers queue
    if channels is not None:
        for queue in channels:
            await queue.put(json.dumps(response))
