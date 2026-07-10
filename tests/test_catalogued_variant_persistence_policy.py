from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from const import ABORTED, STARTED
from catalogued_variants import (
    _has_active_catalogued_games,
    archive_catalogued_variant,
    catalogued_variant_games_are_persisted,
    ensure_catalogued_variant_from_game_doc,
)
from variants import (
    is_catalogued_variant,
    register_catalogued_server_variant,
    unregister_catalogued_server_variant,
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


class CataloguedVariantArchiveActiveGameTest(unittest.IsolatedAsyncioTestCase):
    async def test_archive_keeps_active_game_but_unregisters_new_game_entry(self) -> None:
        name = "archive_active_game_test"
        active_game = SimpleNamespace(variant=name, status=STARTED)
        collection = SimpleNamespace(update_one=AsyncMock())
        app_state = SimpleNamespace(
            db={"catalogued_variant": collection},
            games={"game-id": active_game},
            catalogued_variants={name: {"name": name, "visibility": "public"}},
        )
        request = SimpleNamespace()

        register_catalogued_server_variant(name, "Archive active game test", "V")
        self.addCleanup(unregister_catalogued_server_variant, name)

        with patch(
            "catalogued_variants._load_owned_doc",
            AsyncMock(
                return_value=(app_state, "author", name, app_state.catalogued_variants[name])
            ),
        ):
            response = await archive_catalogued_variant(request)

        self.assertEqual(response.status, 200)
        collection.update_one.assert_awaited_once()
        self.assertIs(app_state.games["game-id"], active_game)
        self.assertEqual(active_game.status, STARTED)
        self.assertNotIn(name, app_state.catalogued_variants)
        self.assertFalse(is_catalogued_variant(name))

    def test_saved_game_inline_ini_restores_archived_variant_after_restart(self) -> None:
        name = "archive_reload_test"
        app_state = SimpleNamespace(catalogued_variants={})
        game_doc = {
            "_id": "saved-game-id",
            "v": name,
            "vini": f"[{name}:chess]\n",
            "vd": "Archive reload test",
            "vby": "author",
        }

        unregister_catalogued_server_variant(name)
        self.addCleanup(unregister_catalogued_server_variant, name)

        with patch("catalogued_variants.sf.load_variant_config") as load_variant_config:
            ensure_catalogued_variant_from_game_doc(app_state, game_doc)

        load_variant_config.assert_called_once_with(game_doc["vini"])
        self.assertTrue(is_catalogued_variant(name))
        self.assertIn(name, app_state.catalogued_variants)
        restored = app_state.catalogued_variants[name]
        self.assertEqual(restored["ini"], game_doc["vini"])
        self.assertEqual(restored["displayName"], game_doc["vd"])
        self.assertEqual(restored["author"], game_doc["vby"])
        self.assertFalse(restored["archived"])
        self.assertTrue(restored["enabled"])


if __name__ == "__main__":
    unittest.main()
