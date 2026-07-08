from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import fishnet
from catalogued_variants import (
    CATALOGUED_AI_FAILURE_LIMIT,
    catalogued_variant_ai_disabled,
    clear_catalogued_variant_ai_failures,
    record_catalogued_variant_ai_failure,
)


def make_work(
    work_type: str,
    aborts: int = 0,
    crashes: int = 0,
    failures: int | None = None,
    stale_reissues: int = 0,
) -> fishnet.FishnetWork:
    work: fishnet.FishnetWork = {
        "work": {"type": work_type, "id": "abc123"},
        "game_id": "game01",
        "position": "startpos",
        "variant": "chess",
        "chess960": False,
        "moves": "",
        "nnue": True,
        "abort_count": aborts,
        "engine_crash_count": crashes,
        "stale_reissue_count": stale_reissues,
    }
    if failures is not None:
        work["engine_failure_count"] = failures
    return work


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
        work = make_work("move", aborts=2, failures=fishnet.MOVE_ENGINE_CRASH_LIMIT)
        self.assertTrue(fishnet._is_terminal_abort(work, fishnet.ENGINE_CRASH_REASON))

    def test_move_job_terminal_on_legacy_engine_crash_count(self) -> None:
        work = make_work("move", aborts=2, crashes=fishnet.MOVE_ENGINE_CRASH_LIMIT)
        self.assertTrue(fishnet._is_terminal_abort(work, fishnet.ENGINE_CRASH_REASON))

    def test_move_job_terminal_on_engine_timeout_limit(self) -> None:
        work = make_work("move", aborts=2, failures=fishnet.MOVE_ENGINE_CRASH_LIMIT)
        self.assertTrue(fishnet._is_terminal_abort(work, fishnet.ENGINE_TIMEOUT_REASON))

    def test_move_job_terminal_on_generic_abort_limit(self) -> None:
        work = make_work("move", aborts=fishnet.MOVE_ABORT_LIMIT, crashes=0)
        self.assertTrue(fishnet._is_terminal_abort(work, "unknown"))

    def test_move_job_terminal_on_stale_reissue_limit(self) -> None:
        work = make_work("move", stale_reissues=fishnet.MOVE_STALE_REISSUE_LIMIT)
        self.assertTrue(fishnet._is_terminal_stale_reissue(work))

    def test_move_job_not_terminal_before_stale_reissue_limit(self) -> None:
        work = make_work("move", stale_reissues=fishnet.MOVE_STALE_REISSUE_LIMIT - 1)
        self.assertFalse(fishnet._is_terminal_stale_reissue(work))

    def test_analysis_job_terminal_on_engine_crash_limit(self) -> None:
        work = make_work("analysis", aborts=2, failures=fishnet.ANALYSIS_ENGINE_CRASH_LIMIT)
        self.assertTrue(fishnet._is_terminal_abort(work, fishnet.ENGINE_CRASH_REASON))

    def test_analysis_job_terminal_on_engine_timeout_limit(self) -> None:
        work = make_work("analysis", aborts=2, failures=fishnet.ANALYSIS_ENGINE_CRASH_LIMIT)
        self.assertTrue(fishnet._is_terminal_abort(work, fishnet.ENGINE_TIMEOUT_REASON))

    def test_analysis_job_terminal_on_generic_abort_limit(self) -> None:
        work = make_work("analysis", aborts=fishnet.ANALYSIS_ABORT_LIMIT, crashes=0)
        self.assertTrue(fishnet._is_terminal_abort(work, "unknown"))

    def test_analysis_job_terminal_on_stale_reissue_limit(self) -> None:
        work = make_work("analysis", stale_reissues=fishnet.ANALYSIS_STALE_REISSUE_LIMIT)
        self.assertTrue(fishnet._is_terminal_stale_reissue(work))

    def test_analysis_job_not_terminal_before_stale_reissue_limit(self) -> None:
        work = make_work("analysis", stale_reissues=fishnet.ANALYSIS_STALE_REISSUE_LIMIT - 1)
        self.assertFalse(fishnet._is_terminal_stale_reissue(work))

    def test_fishnet_variants_ini_omits_ai_disabled_catalogued_docs(self) -> None:
        app_state = SimpleNamespace(
            catalogued_variants={
                "badvariant": {
                    "name": "badvariant",
                    "enabled": True,
                    "ini": "[badvariant]\nstartFen = 8/8/8/8/8/8/8/8 w - - 0 1",
                    "aiDisabledUntil": datetime.now(timezone.utc) + timedelta(hours=1),
                },
                "goodvariant": {
                    "name": "goodvariant",
                    "enabled": True,
                    "ini": "[goodvariant]\nstartFen = 8/8/8/8/8/8/8/8 w - - 0 1",
                },
            }
        )

        ini = fishnet.fishnet_variants_ini(app_state)

        self.assertIn("[goodvariant]", ini)
        self.assertNotIn("[badvariant]", ini)

    def test_fishnet_variants_ini_scopes_catalogued_payload_to_requested_variant(self) -> None:
        app_state = SimpleNamespace(
            catalogued_variants={
                "requested": {
                    "name": "requested",
                    "enabled": True,
                    "ini": "[requested]\nstartFen = 8/8/8/8/8/8/8/8 w - - 0 1",
                },
                "unrelated": {
                    "name": "unrelated",
                    "enabled": True,
                    "ini": "[unrelated]\nstartFen = 8/8/8/8/8/8/8/8 w - - 0 1",
                },
            }
        )

        ini = fishnet.fishnet_variants_ini(app_state, "requested")

        self.assertIn("[requested]", ini)
        self.assertNotIn("[unrelated]", ini)

    def test_fishnet_variants_ini_includes_catalogued_base_chain(self) -> None:
        app_state = SimpleNamespace(
            catalogued_variants={
                "custombase": {
                    "name": "custombase",
                    "enabled": True,
                    "ini": "[custombase]\nstartFen = 8/8/8/8/8/8/8/8 w - - 0 1",
                },
                "child": {
                    "name": "child",
                    "baseVariant": "custombase",
                    "enabled": True,
                    "ini": "[child:custombase]\nstartFen = 8/8/8/8/8/8/8/8 w - - 0 1",
                },
                "unrelated": {
                    "name": "unrelated",
                    "enabled": True,
                    "ini": "[unrelated]\nstartFen = 8/8/8/8/8/8/8/8 w - - 0 1",
                },
            }
        )

        ini = fishnet.fishnet_variants_ini(app_state, "child")

        self.assertLess(ini.index("[custombase]"), ini.index("[child:custombase]"))
        self.assertNotIn("[unrelated]", ini)

    def test_attach_variants_hash_caches_scoped_payload(self) -> None:
        app_state = SimpleNamespace(
            catalogued_variants={
                "requested": {
                    "name": "requested",
                    "enabled": True,
                    "ini": "[requested]\nstartFen = 8/8/8/8/8/8/8/8 w - - 0 1",
                },
                "unrelated": {
                    "name": "unrelated",
                    "enabled": True,
                    "ini": "[unrelated]\nstartFen = 8/8/8/8/8/8/8/8 w - - 0 1",
                },
            }
        )
        work = make_work("move")
        work["variant"] = "requested"

        fishnet._attach_variants_hash(app_state, work)

        self.assertEqual(work["variantsScope"], "requested")
        payload = app_state.fishnet_variant_payloads[work["variantsSha256"]]
        self.assertIn("[requested]", payload["variantsIni"])
        self.assertNotIn("[unrelated]", payload["variantsIni"])


class CataloguedAiFailurePolicyTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_record_catalogued_ai_failure_disables_after_limit(self) -> None:
        doc = {"name": "custom", "enabled": True}
        app_state = SimpleNamespace(catalogued_variants={"custom": doc}, db=None)

        for _ in range(CATALOGUED_AI_FAILURE_LIMIT - 1):
            disabled = await record_catalogued_variant_ai_failure(
                app_state, "custom", fishnet.ENGINE_TIMEOUT_REASON
            )
            self.assertFalse(disabled)
            self.assertFalse(catalogued_variant_ai_disabled(doc))

        disabled = await record_catalogued_variant_ai_failure(
            app_state, "custom", fishnet.ENGINE_TIMEOUT_REASON
        )

        self.assertTrue(disabled)
        self.assertTrue(catalogued_variant_ai_disabled(doc))

    async def test_clear_catalogued_ai_failures_removes_quarantine_fields(self) -> None:
        doc = {
            "name": "custom",
            "enabled": True,
            "aiFailureCount": 3,
            "aiDisabledUntil": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        app_state = SimpleNamespace(catalogued_variants={"custom": doc}, db=None)

        await clear_catalogued_variant_ai_failures(app_state, "custom")

        self.assertNotIn("aiFailureCount", doc)
        self.assertNotIn("aiDisabledUntil", doc)


if __name__ == "__main__":
    unittest.main()
