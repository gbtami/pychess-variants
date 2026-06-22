from __future__ import annotations
from typing import TYPE_CHECKING, Iterable, Mapping
import asyncio

from json_utils import json_dumps

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
    # Snapshot live collections because awaits below let other tasks add/remove
    # spectators/channels while we're broadcasting.
    spectators = tuple(game.spectators)
    players = tuple(game.non_bot_players) if full else ()
    has_channels = channels is not None

    if not spectators and not players and not has_channels:
        return

    # Encode the response ONCE and fan it out as a raw string. Previously each
    # recipient (potentially hundreds of spectators on a popular game) caused
    # its own independent msgspec encode of the identical payload, which is
    # pure wasted CPU on the single-threaded event loop. One encode here turns
    # an O(spectators) cost into O(1).
    payload = json_dumps(response)

    for spectator in spectators:
        await spectator.send_game_message_str(game.id, payload)
    for player in players:
        await player.send_game_message_str(game.id, payload)
    # Put response data to sse subscribers queue
    if has_channels:
        assert channels is not None
        for queue in tuple(channels):
            await queue.put(payload)
