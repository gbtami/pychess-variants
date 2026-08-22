import asyncio
import unittest
from typing import Any, cast
from unittest.mock import AsyncMock, patch

from broadcast import round_broadcast


class DummyGame:
    def __init__(self) -> None:
        self.id = "game-id"
        self.spectators: set[Any] = set()
        self.non_bot_players: list[Any] = []


class DummyUser:
    def __init__(self, *sockets: Any) -> None:
        self.game_sockets = {"game-id": set(sockets)}


class MutatingSocket:
    def __init__(self, game: DummyGame) -> None:
        self.game = game
        self.other: DummyUser | None = None
        self.calls = 0

    async def send_str(self, payload: str) -> None:
        self.calls += 1
        if self.other is not None:
            self.game.spectators.discard(self.other)


class CoordinatedSocket:
    def __init__(
        self,
        started: asyncio.Event,
        release: asyncio.Event,
        *,
        waits_for_release: bool,
    ) -> None:
        self.started = started
        self.release = release
        self.waits_for_release = waits_for_release
        self.calls = 0

    async def send_str(self, payload: str) -> None:
        self.calls += 1
        if self.waits_for_release:
            self.started.set()
            await self.release.wait()
        else:
            await self.started.wait()
            self.release.set()


class MutatingQueue(asyncio.Queue[str]):
    def __init__(self, channels: set[asyncio.Queue[str]]) -> None:
        super().__init__()
        self.channels = channels
        self.calls = 0

    def put_nowait(self, item: str) -> None:
        self.calls += 1
        self.channels.add(asyncio.Queue[str]())
        super().put_nowait(item)


class RecordingQueue(asyncio.Queue[str]):
    def __init__(self) -> None:
        super().__init__()
        self.calls = 0

    def put_nowait(self, item: str) -> None:
        self.calls += 1
        super().put_nowait(item)


class RoundBroadcastTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_round_broadcast_fans_out_all_user_sockets_in_one_call(self) -> None:
        game = DummyGame()
        spectator_ws_1 = AsyncMock()
        spectator_ws_2 = AsyncMock()
        player_ws = AsyncMock()
        game.spectators = {DummyUser(spectator_ws_1, spectator_ws_2)}
        game.non_bot_players = [DummyUser(player_ws)]

        with patch("broadcast.ws_send_str_many", new=AsyncMock()) as send_many:
            await round_broadcast(cast(Any, game), {"type": "board"}, full=True)

        send_many.assert_awaited_once()
        sockets, payload = send_many.await_args.args
        self.assertCountEqual(sockets, [spectator_ws_1, spectator_ws_2, player_ws])
        self.assertEqual(payload, '{"type":"board"}')

    async def test_round_broadcast_slow_user_does_not_serialize_other_users(self) -> None:
        game = DummyGame()
        started = asyncio.Event()
        release = asyncio.Event()
        slow = CoordinatedSocket(started, release, waits_for_release=True)
        fast = CoordinatedSocket(started, release, waits_for_release=False)
        game.spectators = {DummyUser(slow), DummyUser(fast)}

        await asyncio.wait_for(round_broadcast(cast(Any, game), {"type": "board"}), timeout=0.25)

        self.assertEqual(slow.calls, 1)
        self.assertEqual(fast.calls, 1)

    async def test_round_broadcast_handles_spectator_set_mutation(self) -> None:
        game = DummyGame()
        socket_a = MutatingSocket(game)
        socket_b = MutatingSocket(game)
        spectator_a = DummyUser(socket_a)
        spectator_b = DummyUser(socket_b)
        socket_a.other = spectator_b
        socket_b.other = spectator_a
        game.spectators = {spectator_a, spectator_b}

        await round_broadcast(cast(Any, game), {"type": "spectators"})

        self.assertEqual(socket_a.calls, 1)
        self.assertEqual(socket_b.calls, 1)

    async def test_round_broadcast_handles_channel_set_mutation(self) -> None:
        game = DummyGame()
        channels: set[asyncio.Queue[str]] = set()
        mutating = MutatingQueue(channels)
        passive = RecordingQueue()
        channels.update((mutating, passive))

        await round_broadcast(cast(Any, game), {"type": "board"}, channels=channels)

        self.assertEqual(mutating.calls, 1)
        self.assertEqual(passive.calls, 1)

    async def test_round_broadcast_drops_and_drains_full_channel(self) -> None:
        game = DummyGame()
        full = asyncio.Queue[str](maxsize=1)
        full.put_nowait("stale")
        healthy = asyncio.Queue[str](maxsize=1)
        channels = {full, healthy}

        await round_broadcast(cast(Any, game), {"type": "board"}, channels=channels)

        self.assertNotIn(full, channels)
        self.assertEqual(full.qsize(), 0)
        with self.assertRaises(asyncio.QueueShutDown):
            full.get_nowait()
        self.assertEqual(healthy.qsize(), 1)

    async def test_round_broadcast_discards_shutdown_channel(self) -> None:
        game = DummyGame()
        shutdown = asyncio.Queue[str](maxsize=1)
        shutdown.shutdown(immediate=True)
        channels = {shutdown}

        await round_broadcast(cast(Any, game), {"type": "board"}, channels=channels)

        self.assertNotIn(shutdown, channels)


if __name__ == "__main__":
    unittest.main(verbosity=2)
