import asyncio
import unittest
from typing import Any, Mapping

from broadcast import round_broadcast


class DummyGame:
    def __init__(self) -> None:
        self.id = "game-id"
        self.spectators: set[Any] = set()
        self.non_bot_players: list[Any] = []


class MutatingSpectator:
    def __init__(self, game: DummyGame) -> None:
        self.game = game
        self.other: MutatingSpectator | None = None
        self.calls = 0

    async def send_game_message(self, game_id: str, message: Mapping[str, object]) -> None:
        self.calls += 1
        if self.other is not None:
            self.game.spectators.discard(self.other)


class MutatingQueue(asyncio.Queue[str]):
    def __init__(self, channels: set[asyncio.Queue[str]]) -> None:
        super().__init__()
        self.channels = channels
        self.calls = 0

    async def put(self, item: str) -> None:
        self.calls += 1
        self.channels.add(asyncio.Queue[str]())
        await super().put(item)


class RecordingQueue(asyncio.Queue[str]):
    def __init__(self) -> None:
        super().__init__()
        self.calls = 0

    async def put(self, item: str) -> None:
        self.calls += 1
        await super().put(item)


class RoundBroadcastTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_round_broadcast_handles_spectator_set_mutation(self) -> None:
        game = DummyGame()
        spectator_a = MutatingSpectator(game)
        spectator_b = MutatingSpectator(game)
        spectator_a.other = spectator_b
        spectator_b.other = spectator_a
        game.spectators = {spectator_a, spectator_b}

        await round_broadcast(game, {"type": "spectators"})

        self.assertEqual(spectator_a.calls, 1)
        self.assertEqual(spectator_b.calls, 1)

    async def test_round_broadcast_handles_channel_set_mutation(self) -> None:
        game = DummyGame()
        channels: set[asyncio.Queue[str]] = set()
        mutating = MutatingQueue(channels)
        passive = RecordingQueue()
        channels.update((mutating, passive))

        await round_broadcast(game, {"type": "board"}, channels=channels)

        self.assertEqual(mutating.calls, 1)
        self.assertEqual(passive.calls, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
