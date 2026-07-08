from types import SimpleNamespace
import unittest

from const import ABORTED, STARTED
from catalogued_variants import (
    _has_active_catalogued_games,
    catalogued_variant_games_are_persisted,
)


class CataloguedVariantPersistencePolicyTest(unittest.TestCase):
    def test_only_public_catalogued_variants_persist_new_games(self) -> None:
        app_state = SimpleNamespace(
            catalogued_variants={
                "private_test": {"visibility": "private"},
                "unlisted_test": {"visibility": "unlisted"},
                "public_test": {"visibility": "public"},
            }
        )

        self.assertFalse(catalogued_variant_games_are_persisted(app_state, "private_test"))
        self.assertFalse(catalogued_variant_games_are_persisted(app_state, "unlisted_test"))
        self.assertTrue(catalogued_variant_games_are_persisted(app_state, "public_test"))

    def test_unknown_catalogued_variant_preserves_old_persistence_behaviour(self) -> None:
        app_state = SimpleNamespace(catalogued_variants={})

        self.assertTrue(catalogued_variant_games_are_persisted(app_state, "missing_variant"))

    def test_active_game_guard_ignores_finished_games(self) -> None:
        app_state = SimpleNamespace(
            games={
                "active": SimpleNamespace(variant="sandbox", status=STARTED),
                "finished": SimpleNamespace(variant="sandbox", status=ABORTED),
                "other": SimpleNamespace(variant="other", status=STARTED),
            }
        )

        self.assertTrue(_has_active_catalogued_games(app_state, "sandbox"))
        app_state.games["active"].status = ABORTED
        self.assertFalse(_has_active_catalogued_games(app_state, "sandbox"))


if __name__ == "__main__":
    unittest.main()
