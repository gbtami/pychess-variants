from __future__ import annotations

import unittest

import fishnet


def make_work(work_type: str, aborts: int = 0, crashes: int = 0) -> fishnet.FishnetWork:
    return {
        "work": {"type": work_type, "id": "abc123"},
        "game_id": "game01",
        "position": "startpos",
        "variant": "chess",
        "chess960": False,
        "moves": "",
        "nnue": True,
        "abort_count": aborts,
        "engine_crash_count": crashes,
    }


class FishnetAbortPolicyTestCase(unittest.TestCase):
    def test_abort_reason_defaults_unknown(self) -> None:
        payload: fishnet.FishnetAbortPayload = {"fishnet": {"apikey": "k"}}
        self.assertEqual(fishnet._abort_reason(payload), "unknown")

    def test_abort_reason_from_payload(self) -> None:
        payload: fishnet.FishnetAbortPayload = {
            "fishnet": {"apikey": "k"},
            "error": {"reason": fishnet.ENGINE_CRASH_REASON},
        }
        self.assertEqual(fishnet._abort_reason(payload), fishnet.ENGINE_CRASH_REASON)

    def test_move_job_terminal_on_engine_crash_limit(self) -> None:
        work = make_work("move", aborts=2, crashes=fishnet.MOVE_ENGINE_CRASH_LIMIT)
        self.assertTrue(fishnet._is_terminal_abort(work, fishnet.ENGINE_CRASH_REASON))

    def test_move_job_terminal_on_generic_abort_limit(self) -> None:
        work = make_work("move", aborts=fishnet.MOVE_ABORT_LIMIT, crashes=0)
        self.assertTrue(fishnet._is_terminal_abort(work, "unknown"))

    def test_analysis_job_terminal_on_engine_crash_limit(self) -> None:
        work = make_work("analysis", aborts=2, crashes=fishnet.ANALYSIS_ENGINE_CRASH_LIMIT)
        self.assertTrue(fishnet._is_terminal_abort(work, fishnet.ENGINE_CRASH_REASON))

    def test_analysis_job_terminal_on_generic_abort_limit(self) -> None:
        work = make_work("analysis", aborts=fishnet.ANALYSIS_ABORT_LIMIT, crashes=0)
        self.assertTrue(fishnet._is_terminal_abort(work, "unknown"))


if __name__ == "__main__":
    unittest.main()
