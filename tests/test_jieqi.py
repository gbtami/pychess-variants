import unittest

import test_logger
from fairy import JIEQI_FEN, FairyBoard
from fairy.jieqi import (
    BLACK_PIECES,
    RED_PIECES,
    apply_move_and_transform,
    make_initial_mapping,
    square_to_index,
    xiangqi_fen_to_pieces,
)

test_logger.init_test_logger()


class TestApplyMoveAndTransform(unittest.TestCase):
    def setUp(self):
        self.fen = JIEQI_FEN
        # Use a fixed mapping for deterministic tests
        self.mapping = make_initial_mapping(BLACK_PIECES, RED_PIECES)

    def get_piece_at(self, fen, square):
        board = xiangqi_fen_to_pieces(fen.split()[0])
        index = square_to_index(square)
        return board[index]

    def test_move_uncovered_piece_removes_tilde(self):
        move = "b3b10"
        result_fen = apply_move_and_transform(self.fen, move, self.mapping)
        piece_at_dst = self.get_piece_at(result_fen, "b10")
        self.assertNotIn("~", piece_at_dst)

    def test_move_already_covered_piece_keeps_covered_state(self):
        # Move uncovered rook first (a1->a2)
        fen2 = apply_move_and_transform(self.fen, "a1a2", self.mapping)
        # Move it again; should stay covered
        result_fen = apply_move_and_transform(fen2, "a2a3", self.mapping)
        piece_at_dst = self.get_piece_at(result_fen, "a3")
        self.assertNotIn("~", piece_at_dst)

    def test_move_black_side_piece(self):
        # Move black cannon (b8->b3)
        move = "b8b3"
        result_fen = apply_move_and_transform(self.fen, move, self.mapping)
        piece_at_dst = self.get_piece_at(result_fen, "b3")
        self.assertNotIn("~", piece_at_dst)

    def test_moves_to_and_from_two_digit_rank_update_correct_squares(self):
        for move, source, destination in (("a10a9", "a10", "a9"), ("a1a10", "a1", "a10")):
            with self.subTest(move=move):
                result = apply_move_and_transform(self.fen, move, self.mapping)
                self.assertEqual(".", self.get_piece_at(result, source))
                self.assertNotEqual(".", self.get_piece_at(result, destination))

    def test_king_never_gets_tilde(self):
        move = "e1e2"
        result = apply_move_and_transform(self.fen, move, self.mapping)
        king_piece = self.get_piece_at(result, "e2")
        self.assertEqual("K", king_piece)

    def test_checkmate_has_no_legal_move_after_fake_advisor_filter(self):
        # Reproduces game EIZenrcV after 27 plies: the engine's only reply is
        # the covered fake advisor move f10g9, which leaves the palace.
        fen = "2b~a~1a~b~n~r~/2n1k1R2/n1r1bN3/8p~/9/1aB1P4/8P~/1C~N1P2C~1/9/1N~B~1K1B~pR~ b - - 0 1"
        board = FairyBoard("jieqi", fen)
        board.set_jieqi_initial_pieces("nrcapppcbpabnpr", "PBPNAPANRBRPCPC")

        self.assertTrue(board.is_checked())
        self.assertEqual([], board.legal_moves())
        self.assertFalse(board.has_legal_move())


if __name__ == "__main__":
    unittest.main()
