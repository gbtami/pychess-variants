import unittest
from fairy import JIEQI_FEN
from fairy.jieqi import (
    apply_move_and_transform,
    make_initial_mapping,
    xiangqi_fen_to_pieces,
    square_to_index,
    BLACK_PIECES,
    RED_PIECES,
)


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

    def test_move_on_two_digit_rank_top(self):
        move = "a10a9"
        result = apply_move_and_transform(self.fen, move, self.mapping)
        self.assertIn("/", result, "FEN formatting should remain valid for rank 10 move")

    def test_move_on_two_digit_rank_bottom(self):
        move = "a1a10"
        result = apply_move_and_transform(self.fen, move, self.mapping)
        self.assertIn("/", result, "FEN should remain valid after bottom-to-top move")

    def test_king_never_gets_tilde(self):
        move = "e1e2"
        result = apply_move_and_transform(self.fen, move, self.mapping)
        king_piece = self.get_piece_at(result, "e2")
        self.assertEqual("K", king_piece)


if __name__ == "__main__":
    unittest.main()
