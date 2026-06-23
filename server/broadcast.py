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
    ch = tuple(channels) if channels is not None else ()

    if not spectators and not players and not ch:
        return

    # Encode the response ONCE and fan it out as a raw string. Previously each
    # recipient (potentially hundreds of spectators on a popular game) caused
    # its own independent msgspec encode of the identical payload, which is
    # pure wasted CPU on the single-threaded event loop. One encode here turns
    # an O(spectators) cost into O(1).
    # Guard against bad payloads: preserve the non-raising behaviour that
    # ws_send_json_many() had (it catches serialization errors internally).
    try:
        payload = json_dumps(response)
    except Exception:
        log.exception(
            "round_broadcast: failed to serialize response for game %s: %r", game.id, response
        )
        return

    for spectator in spectators:
        await spectator.send_game_message_str(game.id, payload)
    for player in players:
        await player.send_game_message_str(game.id, payload)
    for queue in ch:
        await queue.put(payload)
