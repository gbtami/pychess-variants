import asyncio
import json
import unittest
from collections import defaultdict
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch

from aiohttp import web

import fishnet
from fishnet import _read_fishnet_json
import wsr


class FishnetTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_read_fishnet_json_returns_payload(self):
        request = cast(web.Request, AsyncMock())
        request.json = AsyncMock(return_value={"fishnet": {"apikey": "abc"}})
        request.rel_url = SimpleNamespace(path="/fishnet/acquire")
        request.remote = "10.1.1.1"

        data, status = await _read_fishnet_json(request)

        self.assertEqual(data, {"fishnet": {"apikey": "abc"}})
        self.assertIsNone(status)

    async def test_read_fishnet_json_connection_reset_returns_204(self):
        request = cast(web.Request, AsyncMock())
        request.json = AsyncMock(side_effect=ConnectionResetError)
        request.rel_url = SimpleNamespace(path="/fishnet/acquire")
        request.remote = "10.1.1.1"

        data, status = await _read_fishnet_json(request)

        self.assertIsNone(data)
        self.assertEqual(status, 204)

    async def test_read_fishnet_json_invalid_json_returns_400(self):
        request = cast(web.Request, AsyncMock())
        request.json = AsyncMock(side_effect=json.JSONDecodeError("bad", "", 0))
        request.rel_url = SimpleNamespace(path="/fishnet/acquire")
        request.remote = "10.1.1.1"

        data, status = await _read_fishnet_json(request)

        self.assertIsNone(data)
        self.assertEqual(status, 400)

    async def test_get_work_reissues_stale_analysis_job(self):
        app_state = SimpleNamespace(
            fishnet_monitor=defaultdict(list, {"worker1": []}),
            fishnet_queue=asyncio.PriorityQueue(),
            fishnet_works={
                "work123": {
                    "work": {"type": "analysis", "id": "work123"},
                    "game_id": "g1",
                    "position": "startpos",
                    "variant": "chess",
                    "chess960": False,
                    "moves": "",
                    "nnue": True,
                    "time": 0.0,
                }
            },
            workers={"k"},
            fishnet_worker_last_seen={"k": 100.0},
            users={"Fairy-Stockfish": SimpleNamespace(online=True)},
        )
        payload = {"fishnet": {"apikey": "k"}}

        with (
            patch.dict(fishnet.FISHNET_KEYS, {"k": "worker1"}, clear=True),
            patch("fishnet.monotonic", return_value=fishnet.ANALYSIS_WORK_TIME_OUT + 100.0),
        ):
            response = await fishnet.get_work(app_state, payload)

        self.assertEqual(response.status, 202)
        self.assertIn("work123", response.text)

    def test_drop_stale_analysis_work_removes_only_old_analysis(self):
        app_state = SimpleNamespace(
            fishnet_works={
                "analysis1": {"work": {"type": "analysis", "id": "analysis1"}, "time": 0.0},
                "analysis2": {"work": {"type": "analysis", "id": "analysis2"}, "time": 100.0},
                "move1": {"work": {"type": "move", "id": "move1"}, "time": 0.0},
            },
        )

        dropped = fishnet.drop_stale_analysis_work(
            app_state, now=fishnet.ANALYSIS_WORK_TIME_OUT + 1.0
        )

        self.assertEqual(dropped, 1)
        self.assertEqual(set(app_state.fishnet_works), {"analysis2", "move1"})

    def test_has_recent_fishnet_activity_requires_recent_worker_heartbeat(self):
        app_state = SimpleNamespace(
            workers={"k"},
            fishnet_worker_last_seen={"k": 100.0},
        )

        self.assertTrue(
            fishnet.has_recent_fishnet_activity(
                app_state, now=100.0 + fishnet.FISHNET_ACTIVITY_TIMEOUT - 1.0
            )
        )
        self.assertFalse(
            fishnet.has_recent_fishnet_activity(
                app_state, now=100.0 + fishnet.FISHNET_ACTIVITY_TIMEOUT + 1.0
            )
        )

    async def test_handle_analysis_with_stale_worker_keeps_bot_available(self):
        game = SimpleNamespace(
            id="g1",
            steps=[],
            board=SimpleNamespace(initial_fen="startpos", move_stack=[], nnue=True),
            variant="chess",
            chess960=False,
        )
        engine = SimpleNamespace(online=True, game_queues={}, event_queue=asyncio.Queue())
        app_state = SimpleNamespace(
            games={"g1": game},
            users={"Fairy-Stockfish": engine},
            workers={"k"},
            fishnet_worker_last_seen={"k": 0.0},
            fishnet_works={},
            fishnet_queue=asyncio.PriorityQueue(),
        )
        data = {"gameId": "g1", "username": "u"}
        ws = SimpleNamespace()
        ws_send_json = AsyncMock()

        with (
            patch("wsr.ws_send_json", new=ws_send_json),
            patch("wsr.has_recent_fishnet_activity", return_value=False),
            patch("wsr.log"),
        ):
            await wsr.handle_analysis(app_state, ws, data, game)

        self.assertTrue(engine.online)
        self.assertEqual(app_state.workers, {"k"})
        self.assertEqual(app_state.fishnet_works, {})
        self.assertEqual(engine.event_queue.qsize(), 0)
        self.assertEqual(ws_send_json.await_count, 1)
        self.assertEqual(
            ws_send_json.await_args.args[1]["message"],
            "Analysis unavailable right now.",
        )
class WinningChancesTestCase(unittest.TestCase):
    """Unit tests for the _winning_chances() helper.

    Converts a FishnetScore dict to winning chances in [-1.0, +1.0] from
    White's perspective, using the same sigmoid as winningChances.ts.
    """

    def test_equal_position_is_zero(self):
        from fishnet import _winning_chances

        self.assertAlmostEqual(_winning_chances({"cp": 0}), 0.0, places=5)

    def test_white_advantage_is_positive(self):
        from fishnet import _winning_chances

        self.assertGreater(_winning_chances({"cp": 300}), 0.0)

    def test_black_advantage_is_negative(self):
        from fishnet import _winning_chances

        self.assertLess(_winning_chances({"cp": -300}), 0.0)

    def test_symmetric_around_zero(self):
        from fishnet import _winning_chances

        self.assertAlmostEqual(
            _winning_chances({"cp": 200}), -_winning_chances({"cp": -200}), places=5
        )

    def test_bounded_between_minus_one_and_one(self):
        from fishnet import _winning_chances

        for cp in (-10000, -1000, 0, 1000, 10000):
            result = _winning_chances({"cp": cp})
            self.assertGreaterEqual(result, -1.0)
            self.assertLessEqual(result, 1.0)

    def test_cp_clamped_at_1000(self):
        from fishnet import _winning_chances

        self.assertAlmostEqual(
            _winning_chances({"cp": 1000}), _winning_chances({"cp": 5000}), places=5
        )

    def test_mate_for_white_near_one(self):
        from fishnet import _winning_chances

        self.assertGreater(_winning_chances({"mate": 1}), 0.9)

    def test_mate_for_black_near_minus_one(self):
        from fishnet import _winning_chances

        self.assertLess(_winning_chances({"mate": -1}), -0.9)

    def test_closer_mate_is_more_decisive(self):
        from fishnet import _winning_chances

        self.assertGreater(_winning_chances({"mate": 1}), _winning_chances({"mate": 10}))


class FishnetAnalysisPvTestCase(unittest.IsolatedAsyncioTestCase):
    """Tests for the PV-save condition in fishnet_analysis().

    PV is stored only when the mover's winning chances drop >= 10%:
        drop = -white_delta  (i even, white's move)
             =  white_delta  (i odd,  black's move)
    Thresholds mirror lila's Advice.scala (inaccuracy >= 0.10).
    """

    def _make_request(self, data, work_id="work1"):
        request = cast(web.Request, AsyncMock())
        request.match_info = {"workId": work_id}
        return request

    def _make_app_state(self, game, send_msg=None):
        if send_msg is None:
            send_msg = AsyncMock()
        return SimpleNamespace(
            fishnet_works={
                "work1": {
                    "game_id": game.id,
                    "username": "worker",
                    "work": {"type": "analysis"},
                }
            },
            fishnet_monitor=defaultdict(list),
            fishnet_worker_last_seen={},
            users={"worker": SimpleNamespace(send_game_message=send_msg)},
            db=SimpleNamespace(game=SimpleNamespace(find_one_and_update=AsyncMock())),
        )

    async def _run(self, game, analysis_items, send_msg=None):
        app_state = self._make_app_state(game, send_msg)
        data = {"fishnet": {"apikey": "key"}, "analysis": analysis_items}
        request = self._make_request(data)
        with (
            patch("fishnet._read_fishnet_json", new=AsyncMock(return_value=(data, None))),
            patch("fishnet.get_app_state", return_value=app_state),
            patch("fishnet.load_game", new=AsyncMock(return_value=game)),
            patch.dict(fishnet.FISHNET_KEYS, {"key": "worker"}, clear=True),
            patch("fishnet.monotonic", return_value=0.0),
        ):
            await fishnet.fishnet_analysis(request)

    async def test_saves_pv_for_blunder(self):
        """i=1 (odd, black's move): white_delta=0.64 >= 0.1 → PV saved.

        prev={cp:-50} → wc≈-0.10, curr={cp:300} → wc≈+0.54.
        """
        game = SimpleNamespace(id="g1", steps=[{}, {}])
        await self._run(
            game,
            [
                {"score": {"cp": -50}, "depth": 20, "pv": "e2e4"},
                {"score": {"cp": 300}, "depth": 20, "pv": "best_reply"},
            ],
        )
        self.assertIn("p", game.steps[1]["analysis"])
        self.assertEqual(game.steps[1]["analysis"]["p"], "best_reply")

    async def test_does_not_save_pv_for_good_move(self):
        """i=1 (odd): white_delta=0.04 < 0.1 → PV not saved.

        prev={cp:0} → wc=0.0, curr={cp:20} → wc≈0.04.
        """
        game = SimpleNamespace(id="g1", steps=[{}, {}])
        await self._run(
            game,
            [
                {"score": {"cp": 0}, "depth": 20, "pv": "e2e4"},
                {"score": {"cp": 20}, "depth": 20, "pv": "e7e5"},
            ],
        )
        self.assertNotIn("p", game.steps[1]["analysis"])

    async def test_initial_position_never_saves_pv(self):
        """i=0 has no previous position — PV must not be saved."""
        game = SimpleNamespace(id="g1", steps=[{}])
        await self._run(game, [{"score": {"cp": 0}, "depth": 20, "pv": "e2e4"}])
        self.assertNotIn("p", game.steps[0]["analysis"])

    async def test_missing_pv_key_does_not_crash(self):
        """Fishnet workers may omit 'pv' — analysis stored without 'p' key."""
        game = SimpleNamespace(id="g1", steps=[{}, {}])
        await self._run(
            game,
            [
                {"score": {"cp": -50}, "depth": 20},
                {"score": {"cp": 300}, "depth": 20},
            ],
        )
        self.assertNotIn("p", game.steps[1]["analysis"])
        self.assertIn("s", game.steps[1]["analysis"])

    async def test_existing_analysis_not_overwritten(self):
        """A step already carrying 'analysis' must not be touched."""
        existing = {"s": {"cp": 100}, "d": 15, "p": "old_pv"}
        send_msg = AsyncMock()
        game = SimpleNamespace(id="g1", steps=[{}, {"analysis": existing}])
        await self._run(
            game,
            [
                {"score": {"cp": -50}, "depth": 20, "pv": "e2e4"},
                {"score": {"cp": 300}, "depth": 20, "pv": "new_pv"},
            ],
            send_msg=send_msg,
        )
        self.assertIs(game.steps[1]["analysis"], existing)
        sent_plies = {call.args[1]["ply"] for call in send_msg.call_args_list}
        self.assertNotIn("1", sent_plies)
