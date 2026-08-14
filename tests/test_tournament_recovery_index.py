import unittest
from unittest.mock import AsyncMock, patch

from pychess_global_app_state import (
    TOURNAMENT_EFFECT_RECOVERY_DELAY,
    ensure_tournament_effect_recovery_index,
)


class TournamentRecoveryIndexTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_existing_index_skips_delay(self) -> None:
        collection = AsyncMock()
        collection.index_information.return_value = {
            "_id_": {"key": [("_id", 1)]},
            "fx_1": {"key": [("fx", 1)], "sparse": True},
        }

        with patch("pychess_global_app_state.asyncio.sleep", new=AsyncMock()) as sleep:
            await ensure_tournament_effect_recovery_index(collection)

        sleep.assert_not_awaited()
        collection.create_index.assert_awaited_once_with("fx", sparse=True)

    async def test_first_index_build_is_delayed(self) -> None:
        collection = AsyncMock()
        collection.index_information.return_value = {"_id_": {"key": [("_id", 1)]}}

        with patch("pychess_global_app_state.asyncio.sleep", new=AsyncMock()) as sleep:
            await ensure_tournament_effect_recovery_index(collection)

        sleep.assert_awaited_once_with(TOURNAMENT_EFFECT_RECOVERY_DELAY)
        collection.create_index.assert_awaited_once_with("fx", sparse=True)


if __name__ == "__main__":
    unittest.main()
