import unittest
from unittest.mock import patch

from database.startup import ensure_after_startup_indexes
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state import TOURNAMENT_EFFECT_RECOVERY_DELAY


class TournamentRecoveryIndexTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_existing_index_skips_delay(self) -> None:
        client = AsyncMongoMockClient()
        db = client.test
        await db.create_collection("game")
        await db.game.create_index("fx", sparse=True)

        with patch("database.startup.asyncio.sleep") as sleep:
            created = await ensure_after_startup_indexes(
                db, delay_seconds=TOURNAMENT_EFFECT_RECOVERY_DELAY
            )

        sleep.assert_not_called()
        self.assertEqual(created, ())

    async def test_first_index_build_is_delayed(self) -> None:
        client = AsyncMongoMockClient()
        db = client.test
        await db.create_collection("game")

        with patch("database.startup.asyncio.sleep") as sleep:
            created = await ensure_after_startup_indexes(
                db, delay_seconds=TOURNAMENT_EFFECT_RECOVERY_DELAY
            )

        sleep.assert_awaited_once_with(TOURNAMENT_EFFECT_RECOVERY_DELAY)
        self.assertEqual([result.created_name for result in created], ["fx_1"])
        indexes = await db.game.index_information()
        self.assertTrue(indexes["fx_1"]["sparse"])


if __name__ == "__main__":
    unittest.main()
