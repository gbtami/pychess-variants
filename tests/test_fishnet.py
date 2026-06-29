import asyncio
import json
import unittest
from collections import defaultdict
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch

import pytest
from aiohttp import web

import fishnet
from fishnet import _read_fishnet_json, _winning_chances
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
            patch(
                "fishnet.monotonic", return_value=fishnet.ANALYSIS_WORK_TIME_OUT + 100.0
            ),
        ):
            response = await fishnet.get_work(app_state, payload)

        self.assertEqual(response.status, 202)
        self.assertIn("work123", response.text)

    def test_drop_stale_analysis_work_removes_only_old_analysis(self):
        app_state = SimpleNamespace(
            fishnet_works={
                "analysis1": {
                    "work": {"type": "analysis", "id": "analysis1"},
                    "time": 0.0,
                },
                "analysis2": {
                    "work": {"type": "analysis", "id": "analysis2"},
                    "time": 100.0,
                },
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
        engine = SimpleNamespace(
            online=True, game_queues={}, event_queue=asyncio.Queue()
        )
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


class TestWinningChances:
    def test_cp_zero_is_neutral(self) -> None:
        assert _winning_chances({"cp": 0}) == pytest.approx(0.0, abs=1e-9)

    def test_positive_cp_is_positive(self) -> None:
        wc = _winning_chances({"cp": 500})
        assert 0.0 < wc < 1.0

    def test_negative_cp_is_negative(self) -> None:
        wc = _winning_chances({"cp": -500})
        assert -1.0 < wc < 0.0

    def test_cp_clipped_at_1000(self) -> None:
        assert _winning_chances({"cp": 1001}) == pytest.approx(
            _winning_chances({"cp": 1000}), abs=1e-9
        )

    def test_positive_mate_approaches_one(self) -> None:
        assert _winning_chances({"mate": 1}) > 0.9

    def test_negative_mate_approaches_minus_one(self) -> None:
        assert _winning_chances({"mate": -1}) < -0.9

    def test_mate_beats_cp(self) -> None:
        assert _winning_chances({"mate": 3}) > _winning_chances({"cp": 1000})

    def test_no_cp_no_mate_defaults_to_zero(self) -> None:
        assert _winning_chances({}) == pytest.approx(0.0, abs=1e-9)  # type: ignore[arg-type]

    def test_antisymmetric(self) -> None:
        for cp in (50, 200, 800):
            assert _winning_chances({"cp": cp}) == pytest.approx(
                -_winning_chances({"cp": -cp}), abs=1e-9
            )


class TestSavePvDirection:
    @staticmethod
    def _compute_drop(
        analysis_score: dict,
        prev_score: dict,
        turn_color: str,
    ) -> float:
        white_delta = _winning_chances(analysis_score) - _winning_chances(prev_score)
        if turn_color == "black":
            return -white_delta
        elif turn_color == "white":
            return white_delta
        else:
            raise ValueError(f"Unexpected turn_color: {turn_color!r}")

    @staticmethod
    def _should_save_pv(
        analysis_score: dict,
        prev_score: dict,
        turn_color: str,
        threshold: float = 0.1,
    ) -> bool:
        return (
            TestSavePvDirection._compute_drop(analysis_score, prev_score, turn_color)
            >= threshold
        )

    def test_white_move_improves_white_no_pv(self) -> None:
        """White plays well: winning chances increase -> no PV saved."""
        assert not self._should_save_pv(
            analysis_score={"cp": 200},
            prev_score={"cp": 0},
            turn_color="black",
        )

    def test_white_move_worsens_white_saves_pv(self) -> None:
        """White blunders: winning chances drop ≥ 10% -> PV saved."""
        assert self._should_save_pv(
            analysis_score={"cp": -400},
            prev_score={"cp": 400},
            turn_color="black",
        )

    def test_black_move_improves_black_no_pv(self) -> None:
        """Black plays well: White's winning chances decrease -> no PV saved."""
        assert not self._should_save_pv(
            analysis_score={"cp": 0},
            prev_score={"cp": 200},
            turn_color="white",
        )

    def test_black_move_worsens_black_saves_pv(self) -> None:
        """Black blunders: White's winning chances rise ≥ 10% -> PV saved."""
        assert self._should_save_pv(
            analysis_score={"cp": 400},
            prev_score={"cp": 0},
            turn_color="white",
        )

    def test_boundary_exactly_at_threshold_saves(self) -> None:
        """drop == 0.1 is exactly the threshold -> save PV (>= not >)."""
        result = self._compute_drop({"cp": 0}, {"cp": 131}, "black")
        assert result > 0.0

    def test_small_drop_below_threshold_no_save(self) -> None:
        """Drop < 0.1 (minor fluctuation) -> do not save PV."""
        assert not self._should_save_pv(
            analysis_score={"cp": -20},
            prev_score={"cp": 0},
            turn_color="black",
        )
