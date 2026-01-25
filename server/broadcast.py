from __future__ import annotations
from typing import TYPE_CHECKING, Iterable, Mapping
import asyncio
import json


if TYPE_CHECKING:
    from game import Game
    from bug.game_bug import GameBug
    from pychess_global_app_state import PychessGlobalAppState
import logging

log = logging.getLogger(__name__)


async def broadcast_streams(app_state: PychessGlobalAppState) -> None:
    """Send live_streams to lobby"""
    live_streams = app_state.twitch.live_streams + app_state.youtube.live_streams
    response = {"type": "streams", "items": live_streams}
    log.debug("broadcasting streams to lobby: %s", response)
    await app_state.lobby.lobby_broadcast(response)


async def round_broadcast(
    game: Game | GameBug,
    response: Mapping[str, object],
    full: bool = False,
    channels: Iterable[asyncio.Queue[str]] | None = None,
) -> None:
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
