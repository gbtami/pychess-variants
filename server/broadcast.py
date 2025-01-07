from __future__ import annotations
import json

from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
from logger import log


async def broadcast_streams(app_state: PychessGlobalAppState):
    """Send live_streams to lobby"""
    live_streams = app_state.twitch.live_streams + app_state.youtube.live_streams
    response = {"type": "streams", "items": live_streams}
    log.debug("broadcasting streams to lobby: %s", response)
    await app_state.lobby.lobby_broadcast(response)


async def round_broadcast(game, response, full=False, channels=None):
    log.debug("round_broadcast %s %s %r", response, full, game.spectators)
    if game.spectators:
        for spectator in game.spectators:
            await spectator.send_game_message(game.id, response)
    if full:
        for player in game.non_bot_players:
            await player.send_game_message(game.id, response)
    # Put response data to sse subscribers queue
    if channels is not None:
        for queue in channels:
            await queue.put(json.dumps(response))
