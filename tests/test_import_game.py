import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import test_logger

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from compress import encode_move_standard
from server import make_app
from utils import _encode_import_moves

test_logger.init_test_logger()


class ImportGameMoveEncodingTestCase(unittest.TestCase):
    def test_ignores_extra_whitespace(self):
        moves, error = _encode_import_moves(
            "e2e4   e7e5  ",
            move_encoding=encode_move_standard,
            grand_variant=False,
        )
        self.assertIsNone(error)
        self.assertEqual(len(moves), 2)

    def test_rejects_invalid_standard_move(self):
        moves, error = _encode_import_moves(
            "e2e4 bad",
            move_encoding=encode_move_standard,
            grand_variant=False,
        )
        self.assertEqual(moves, [])
        self.assertEqual(error, "Invalid move 'bad' at ply 2 in imported PGN.")

    def test_rejects_invalid_grand_move(self):
        moves, error = _encode_import_moves(
            "a10a9 a",
            move_encoding=encode_move_standard,
            grand_variant=True,
        )
        self.assertEqual(moves, [])
        self.assertEqual(error, "Invalid move 'a' at ply 2 in imported PGN.")


class ImportGameCleanupTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True))

    async def tearDownAsync(self):
        await self.client.close()

    async def test_import_game_cancels_temporary_clock(self):
        class DummyGame:
            instances = []

            def __init__(
                self,
                app_state,
                game_id,
                variant,
                initial_fen,
                wplayer,
                bplayer,
                rated,
                chess960,
                create,
            ):
                self.server_variant = SimpleNamespace(code="n")
                self.byoyomi_period = 0
                self.level = 0
                self.initial_fen = initial_fen
                self.chess960 = chess960
                self.stopwatch = SimpleNamespace(cancel=AsyncMock())
                DummyGame.instances.append(self)

        with (
            patch("utils.Game", DummyGame),
            patch("utils.new_id", AsyncMock(return_value="import123")),
        ):
            resp = await self.client.post(
                "/import",
                data={
                    "username": "Importer",
                    "White": "Importer",
                    "Black": "Opponent",
                    "Variant": "Chess",
                    "Result": "1-0",
                    "Status": "1",
                    "Date": "2026.04.01",
                    "TimeControl": "60+0",
                    "final_fen": "8/8/8/8/8/8/8/8 w - - 0 1",
                    "moves": "e2e4 e7e5",
                },
            )

        self.assertEqual(resp.status, 200)
        self.assertEqual(len(DummyGame.instances), 1)
        DummyGame.instances[0].stopwatch.cancel.assert_awaited_once()

    async def test_import_game_rejects_missing_username(self):
        resp = await self.client.post("/import", data={"moves": "e2e4"})

        self.assertEqual(resp.status, 200)
        self.assertEqual(await resp.json(), {"error": "Missing username."})

    async def test_import_bpgn_rejects_missing_pgn(self):
        resp = await self.client.post("/import_bpgn", data={})

        self.assertEqual(resp.status, 200)
        self.assertEqual(await resp.json(), {"error": "Missing pgn."})


if __name__ == "__main__":
    unittest.main(verbosity=2)
