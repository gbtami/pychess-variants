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
            patch("fishnet.monotonic", return_value=fishnet.ANALYSIS_WORK_TIME_OUT + 100.0),
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


class TestWinningChances(unittest.TestCase):
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


class TestSavePvDirection(unittest.TestCase):
    """Exercises fishnet._should_save_analysis_pv() directly (the real production
    function), so these tests fail if the save/drop logic later regresses."""

    @staticmethod
    def _analysis(cp: int) -> dict:
        # "pv" must be present, otherwise _should_save_analysis_pv short-circuits to False.
        return {"score": {"cp": cp}, "pv": "e2e4"}

    def test_white_move_improves_white_no_pv(self) -> None:
        """White plays well: winning chances increase -> no PV saved."""
        self.assertFalse(
            fishnet._should_save_analysis_pv(self._analysis(200), self._analysis(0), "black", 1)
        )

    def test_white_move_worsens_white_saves_pv(self) -> None:
        """White blunders: winning chances drop >= 10% -> PV saved."""
        self.assertTrue(
            fishnet._should_save_analysis_pv(self._analysis(-400), self._analysis(400), "black", 1)
        )

    def test_black_move_improves_black_no_pv(self) -> None:
        """Black plays well: White's winning chances decrease -> no PV saved."""
        self.assertFalse(
            fishnet._should_save_analysis_pv(self._analysis(0), self._analysis(200), "white", 2)
        )

    def test_black_move_worsens_black_saves_pv(self) -> None:
        """Black blunders: White's winning chances rise >= 10% -> PV saved."""
        self.assertTrue(
            fishnet._should_save_analysis_pv(self._analysis(400), self._analysis(0), "white", 2)
        )

    def test_boundary_white_move_cp_minus_50_does_not_save(self) -> None:
        """White move cp 0 -> -50: drop ~0.0997, just under the 0.1 threshold -> no save."""
        self.assertFalse(
            fishnet._should_save_analysis_pv(self._analysis(-50), self._analysis(0), "black", 1)
        )

    def test_boundary_white_move_cp_minus_51_saves(self) -> None:
        """White move cp 0 -> -51: drop ~0.1016, crosses the 0.1 threshold -> save."""
        self.assertTrue(
            fishnet._should_save_analysis_pv(self._analysis(-51), self._analysis(0), "black", 1)
        )

    def test_small_drop_below_threshold_no_save(self) -> None:
        """Drop well below 0.1 (minor fluctuation) -> do not save PV."""
        self.assertFalse(
            fishnet._should_save_analysis_pv(self._analysis(-20), self._analysis(0), "black", 1)
        )


class FishnetAnalysisPvRegressionTestCase(unittest.IsolatedAsyncioTestCase):
    """Exercises the real fishnet.fishnet_analysis() endpoint across multiple
    calls, reproducing fairyfishnet's partial-progress-report behaviour.

    Regression coverage for the gbtami Tur #2 finding: the old
    `if "analysis" not in game.steps[i]:` gate permanently blocked a step from
    ever receiving its PV once *any* progress report had touched it, even if
    the neighbouring ply needed for the PV decision only became available in a
    later report. See HANDOFF.md section 6.
    """

    @staticmethod
    def _score(cp: int) -> dict:
        return {"cp": cp}

    @staticmethod
    def _make_app_state(game: SimpleNamespace) -> SimpleNamespace:
        return SimpleNamespace(
            fishnet_works={"work1": {"game_id": "g1", "username": "botuser"}},
            fishnet_monitor=defaultdict(list),
            fishnet_worker_last_seen={},
            games={"g1": game},
            users={"botuser": SimpleNamespace(send_game_message=AsyncMock())},
            db=SimpleNamespace(game=SimpleNamespace(find_one_and_update=AsyncMock())),
        )

    @staticmethod
    async def _call(app_state: SimpleNamespace, game: SimpleNamespace, analysis_payload: list):
        """Invoke the real, unmodified fishnet.fishnet_analysis() once."""
        data = {"fishnet": {"apikey": "testkey"}, "analysis": analysis_payload}
        request = cast(web.Request, SimpleNamespace(match_info={"workId": "work1"}, app=None))
        with (
            patch.dict(fishnet.FISHNET_KEYS, {"testkey": "worker1"}, clear=True),
            patch("fishnet.get_app_state", return_value=app_state),
            patch("fishnet._read_fishnet_json", new=AsyncMock(return_value=(data, None))),
            patch("fishnet.load_game", new=AsyncMock(return_value=game)),
        ):
            return await fishnet.fishnet_analysis(request)

    async def test_partial_report_then_full_report_adds_missing_pv(self) -> None:
        # ply 0: White's move (neutral eval). ply 1: Black's move that blunders,
        # swinging White's winning chances from ~0 to strongly positive.
        game = SimpleNamespace(id="g1", steps=[{"turnColor": "black"}, {"turnColor": "white"}])
        app_state = self._make_app_state(game)
        analysis_ply0 = {"score": self._score(0), "pv": "e2e4", "depth": 20}
        analysis_ply1 = {"score": self._score(400), "pv": "Qxf7+", "depth": 18}

        # Call 1: fairyfishnet has only finished ply 1 so far; ply 0 is still
        # None, so prev for ply 1 is unavailable and the PV cannot be decided.
        await self._call(app_state, game, [None, analysis_ply1])

        self.assertNotIn("p", game.steps[1]["analysis"])
        self.assertNotIn("analysis", game.steps[0])
        self.assertEqual(app_state.users["botuser"].send_game_message.await_count, 1)
        self.assertIn("work1", app_state.fishnet_works)  # not complete yet

        # Call 2: ply 0 has now also arrived. Under the old gate, ply 1 already
        # having an "analysis" dict meant it was skipped forever and "p" could
        # never be added even though prev is now known - that must not happen.
        await self._call(app_state, game, [analysis_ply0, analysis_ply1])

        self.assertEqual(game.steps[1]["analysis"]["p"], "Qxf7+")
        self.assertNotIn("p", game.steps[0]["analysis"])  # ply 0 never has a prev
        # 1 message from call 1 (ply1, no PV yet) + 2 from call 2 (ply1 gains
        # PV, ply0 is created for the first time).
        self.assertEqual(app_state.users["botuser"].send_game_message.await_count, 3)
        self.assertNotIn("work1", app_state.fishnet_works)  # all analysed -> cleaned up
        app_state.db.game.find_one_and_update.assert_awaited_once()

    async def test_unchanged_step_does_not_resend_message(self) -> None:
        """A step that already has its final analysis (PV included, where
        applicable) must not trigger another websocket message when the same
        report is redelivered - only newly created or newly-PV'd steps notify.
        """
        game = SimpleNamespace(
            id="g1",
            steps=[
                {"turnColor": "black", "analysis": {"s": {"cp": 0}}},
                {"turnColor": "white", "analysis": {"s": {"cp": 400}, "p": "Qxf7+"}},
            ],
        )
        app_state = self._make_app_state(game)
        analysis_ply0 = {"score": self._score(0), "pv": "e2e4", "depth": 20}
        analysis_ply1 = {"score": self._score(400), "pv": "Qxf7+", "depth": 18}

        await self._call(app_state, game, [analysis_ply0, analysis_ply1])

        app_state.users["botuser"].send_game_message.assert_not_awaited()
        self.assertNotIn("work1", app_state.fishnet_works)
        app_state.db.game.find_one_and_update.assert_awaited_once()
