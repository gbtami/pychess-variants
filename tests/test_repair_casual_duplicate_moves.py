from __future__ import annotations

import unittest
from contextlib import redirect_stderr
from io import StringIO

from compress import R2C, encode_move_standard
from const import CASUAL, INVALIDMOVE, RATED
from fairy import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from variants import get_server_variant

from scripts.repair_casual_duplicate_moves import (
    UnsafeRepair,
    apply_repair_plan,
    build_repair_plan,
    parse_args,
)


def duplicate_chess_doc(*, rated: int = int(CASUAL), final_fen: str | None = None):
    board = FairyBoard("chess")
    board.push("e2e4")
    board.push("e7e5")
    return {
        "_id": "duplicate-chess",
        "us": ["white", "black"],
        "v": get_server_variant("chess", False).code,
        "y": rated,
        "z": 0,
        "m": [
            encode_move_standard("e2e4"),
            encode_move_standard("e2e4"),
            encode_move_standard("e7e5"),
        ],
        "f": final_fen or board.fen,
        "p": 2,
        "s": int(INVALIDMOVE),
        "r": R2C["0-1"],
        "c": True,
        "byost": [
            {"p": [3, 3], "o": False, "c": 0},
            {"p": [3, 3], "o": False, "c": 0},
        ],
    }


class RepairCasualDuplicateMovesTestCase(unittest.TestCase):
    def test_builds_safe_plan_only_when_repaired_history_matches_fen(self):
        plan = build_repair_plan(duplicate_chess_doc())

        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual((1,), plan.removed_indexes)
        self.assertEqual(2, len(plan.repaired_moves))
        self.assertEqual(2, plan.set_fields["p"])
        self.assertEqual(2, len(plan.set_fields["byost"]))
        self.assertTrue(plan.can_reopen_correspondence)

    def test_rated_game_is_never_a_repair_candidate(self):
        self.assertIsNone(build_repair_plan(duplicate_chess_doc(rated=int(RATED))))

    def test_refuses_missing_post_duplicate_byoyomi_state_when_tail_changed(self):
        doc = duplicate_chess_doc()
        doc["byost"][1] = {"p": [2, 3], "o": False, "c": 0}

        with self.assertRaisesRegex(UnsafeRepair, "byost"):
            build_repair_plan(doc)

    def test_refuses_duplicate_removal_when_final_fen_does_not_match(self):
        with self.assertRaisesRegex(UnsafeRepair, "final FEN"):
            build_repair_plan(duplicate_chess_doc(final_fen=FairyBoard.start_fen("chess")))

    def test_reopen_option_requires_apply(self):
        with redirect_stderr(StringIO()), self.assertRaises(SystemExit):
            parse_args(["--reopen-correspondence-invalid"])


class ApplyRepairPlanTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_apply_uses_compare_and_set_and_preserves_status_by_default(self):
        client = AsyncMongoMockClient(tz_aware=True)
        collection = client.test.game
        doc = duplicate_chess_doc()
        await collection.insert_one(doc)
        plan = build_repair_plan(doc)
        assert plan is not None

        self.assertTrue(await apply_repair_plan(collection, plan))
        repaired = await collection.find_one({"_id": doc["_id"]})
        self.assertEqual(2, len(repaired["m"]))
        self.assertEqual(int(INVALIDMOVE), repaired["s"])
        self.assertEqual(R2C["0-1"], repaired["r"])
        self.assertFalse(await apply_repair_plan(collection, plan))
        client.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
