import json
import unittest
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, patch

from views import add_corr_games_context


class CorrespondenceCataloguedVariantPreloadTest(unittest.IsolatedAsyncioTestCase):
    async def test_adds_missing_variant_metadata_for_ongoing_game(self) -> None:
        game = SimpleNamespace(id="game-id", variant="archived-variant")
        user = SimpleNamespace(username="participant", correspondence_games=[game])
        context = {"catalogued_variants": "[]"}
        client_doc = {"name": "archived-variant", "archived": True, "enabled": False}

        with (
            patch("views.corr_games", return_value=[{"gameId": "game-id"}]),
            patch(
                "views.catalogued_variant_client_doc_for_game",
                AsyncMock(return_value=client_doc),
            ) as lookup,
        ):
            await add_corr_games_context(SimpleNamespace(), user, context)

        self.assertEqual(json.loads(context["corr_games"]), [{"gameId": "game-id"}])
        self.assertEqual(json.loads(context["catalogued_variants"]), [client_doc])
        lookup.assert_awaited_once_with(ANY, game, "participant")

    async def test_does_not_reload_variant_already_in_context(self) -> None:
        game = SimpleNamespace(id="game-id", variant="already-loaded")
        user = SimpleNamespace(username="participant", correspondence_games=[game])
        context = {"catalogued_variants": '[{"name":"already-loaded"}]'}

        with (
            patch("views.corr_games", return_value=[]),
            patch(
                "views.catalogued_variant_client_doc_for_game",
                AsyncMock(),
            ) as lookup,
        ):
            await add_corr_games_context(SimpleNamespace(), user, context)

        lookup.assert_not_awaited()
        self.assertEqual(
            json.loads(context["catalogued_variants"]),
            [{"name": "already-loaded"}],
        )


if __name__ == "__main__":
    unittest.main()
