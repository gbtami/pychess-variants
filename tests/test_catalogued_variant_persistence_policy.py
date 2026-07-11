import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from const import ABORTED, STARTED
from catalogued_variants import (
    _has_active_catalogued_games,
    archive_catalogued_variant,
    catalogued_variant_client_doc_for_game,
    catalogued_variant_games_are_persisted,
    ensure_catalogued_variant_from_game_doc,
    find_catalogued_variant_doc,
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


class CataloguedVariantGameClientDocumentTest(unittest.IsolatedAsyncioTestCase):
    def make_game(self, name: str):
        server_variant = register_catalogued_server_variant(name, name, "V")
        self.addCleanup(unregister_catalogued_server_variant, name)
        return SimpleNamespace(
            id="game-id",
            variant=name,
            server_variant=server_variant,
            wplayer=SimpleNamespace(username="author"),
            bplayer=SimpleNamespace(username="participant"),
        )

    async def test_participant_receives_non_public_variant_from_memory(self) -> None:
        name = "participant_private_test"
        game = self.make_game(name)
        doc = {"name": name, "visibility": "private"}
        app_state = SimpleNamespace(catalogued_variants={name: doc}, db=None)

        with patch("catalogued_variants._client_doc", return_value={"name": name}) as client_doc:
            result = await catalogued_variant_client_doc_for_game(app_state, game, "participant")

        self.assertEqual(result, {"name": name})
        client_doc.assert_called_once_with(doc)

    async def test_participant_receives_archived_variant_from_database(self) -> None:
        name = "participant_archived_test"
        game = self.make_game(name)
        doc = {"name": name, "archived": True, "enabled": False}
        collection = SimpleNamespace(find_one=AsyncMock(return_value=doc))
        app_state = SimpleNamespace(
            catalogued_variants={},
            db={"catalogued_variant": collection},
        )

        with patch("catalogued_variants._client_doc", return_value={"name": name}):
            result = await catalogued_variant_client_doc_for_game(app_state, game, "participant")

        self.assertEqual(result, {"name": name})
        collection.find_one.assert_awaited_once_with({"_id": name})

    async def test_non_participant_cannot_receive_game_variant_metadata(self) -> None:
        name = "non_participant_test"
        game = self.make_game(name)
        collection = SimpleNamespace(find_one=AsyncMock())
        app_state = SimpleNamespace(
            catalogued_variants={},
            db={"catalogued_variant": collection},
        )

        result = await catalogued_variant_client_doc_for_game(app_state, game, "stranger")

        self.assertIsNone(result)
        collection.find_one.assert_not_awaited()

    async def test_active_game_participant_can_open_archived_assets_and_rules(self) -> None:
        name = "participant_archived_assets_test"
        game = self.make_game(name)
        game.status = STARTED
        doc = {"name": name, "archived": True, "enabled": False}
        collection = SimpleNamespace(find_one=AsyncMock(return_value=doc))
        app_state = SimpleNamespace(
            games={game.id: game},
            catalogued_variants={},
            db={"catalogued_variant": collection},
        )

        result = await find_catalogued_variant_doc(app_state, name, "participant")

        self.assertIs(result, doc)
        collection.find_one.assert_awaited_once_with({"_id": name})

    async def test_archived_assets_remain_hidden_from_non_participants(self) -> None:
        name = "non_participant_archived_assets_test"
        game = self.make_game(name)
        game.status = STARTED
        doc = {"name": name, "archived": True, "enabled": False}
        collection = SimpleNamespace(find_one=AsyncMock(return_value=doc))
        app_state = SimpleNamespace(
            games={game.id: game},
            catalogued_variants={},
            db={"catalogued_variant": collection},
        )

        result = await find_catalogued_variant_doc(app_state, name, "stranger")

        self.assertIsNone(result)


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

        validation = SimpleNamespace(
            name=name,
            base_variant="chess",
            start_fen="8/8/8/8/8/8/8/K6k w - - 0 1",
            width=8,
            height=8,
            pieces=["k"],
            king_roles=["k"],
            pocket_roles=[],
            capture_to_hand=False,
            promotion_type="",
            promotion_roles=[],
            promotion_order=[],
            show_promoted=False,
            rules_gate=False,
            rules_pass=False,
            legal_moves_need_history=False,
            n_fold_is_draw=False,
            show_check_counters=False,
        )

        with patch(
            "catalogued_variants.validate_catalogued_ini", return_value=validation
        ) as validate_catalogued_ini:
            ensure_catalogued_variant_from_game_doc(app_state, game_doc)

        validate_catalogued_ini.assert_called_once_with(game_doc["vini"])
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
