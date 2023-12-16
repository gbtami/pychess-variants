import json
import logging

from typedefs import lobbysockets_key, twitch_key, youtube_key

log = logging.getLogger(__name__)


async def broadcast_streams(app):
    """Send live_streams to lobby"""
    lobby_sockets = app[lobbysockets_key]
    live_streams = app[twitch_key].live_streams + app[youtube_key].live_streams
    response = {"type": "streams", "items": live_streams}
    print(response)
    await lobby_broadcast(lobby_sockets, response)


async def lobby_broadcast(sockets, response):
    for ws_set in sockets.values():
        for ws in ws_set:
            try:
                await ws.send_json(response)
            except ConnectionResetError as e:
                log.error(e, stack_info=True, exc_info=True)


async def round_broadcast(game, response, full=False, channels=None):
    log.info("round_broadcast %s %s", response, full )
    log.info(game.spectators)
    if game.spectators:
        for spectator in game.spectators:
            await spectator.send_game_message(game.id, response)
    if full:
        for player in set(game.non_bot_players):
            await player.send_game_message(game.id, response)
    # Put response data to sse subscribers queue
    if channels is not None:
        for queue in channels:
            await queue.put(json.dumps(response))
