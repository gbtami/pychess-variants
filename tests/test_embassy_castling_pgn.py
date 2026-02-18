from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
import unittest

import test_logger

from compress import R2C
from game import Game
from utils import pgn as export_pgn
from variants import get_server_variant

test_logger.init_test_logger()


CAPA_CASTLING_FEN = "r3k4r/10/10/10/10/10/10/R3K4R b KQkq - 0 1"


def make_export_doc(move: str) -> dict:
    encode = get_server_variant("capablanca", False).move_encoding
    return {
        "_id": "embassy-test",
        "v": "c",
        "m": [encode(move)],
        "if": CAPA_CASTLING_FEN,
        "d": datetime(2026, 2, 18, tzinfo=timezone.utc),
        "us": ["White", "Black"],
        "r": R2C["*"],
        "b": 10,
        "i": 0,
        "p0": {"e": "1500?"},
        "p1": {"e": "1500?"},
    }


def make_game_for_pgn(move: str) -> Game:
    game = Game.__new__(Game)
    game.jieqi = False
    game.variant = "capablanca"
    game.initial_fen = CAPA_CASTLING_FEN
    game.board = SimpleNamespace(initial_fen=CAPA_CASTLING_FEN, move_stack=[move])
    game.chess960 = False
    game.id = "embassy-game"
    game.rated = 0
    game.date = datetime(2026, 2, 18, tzinfo=timezone.utc)
    game.wplayer = SimpleNamespace(username="White")
    game.bplayer = SimpleNamespace(username="Black")
    game.result = "*"
    game.wrating = "1500?"
    game.brating = "1500?"
    game.base = 10
    game.inc = 0
    return game


class EmbassyCastlingPgnTestCase(unittest.TestCase):
    def test_export_pgn_fallback_accepts_modern_embassy_castling(self) -> None:
        # In current games the move can be embassy-style (e8b8) even if stored variant is capablanca.
        pgn_text = export_pgn(make_export_doc("e8b8"))
        self.assertIsNotNone(pgn_text)
        assert pgn_text is not None
        self.assertIn("O-O-O", pgn_text)
        self.assertNotIn("e8b8", pgn_text)

    def test_export_pgn_keeps_legacy_capablanca_castling(self) -> None:
        # Older games can still contain historical capablanca castling coordinate e8c8.
        pgn_text = export_pgn(make_export_doc("e8c8"))
        self.assertIsNotNone(pgn_text)
        assert pgn_text is not None
        self.assertIn("O-O-O", pgn_text)
        self.assertNotIn("e8c8", pgn_text)

    def test_game_pgn_fallback_accepts_modern_embassy_castling(self) -> None:
        pgn_text = make_game_for_pgn("e8b8").pgn
        self.assertIn("O-O-O", pgn_text)
        self.assertNotIn("e8b8", pgn_text)

    def test_game_pgn_falls_back_to_raw_move_when_castling_is_invalid(self) -> None:
        # Invalid in both capablanca and embassy; PGN should still be generated from raw move list.
        pgn_text = make_game_for_pgn("e8a8").pgn
        self.assertIn("e8a8", pgn_text)
        self.assertNotIn("O-O-O", pgn_text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
