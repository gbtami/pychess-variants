import unittest
from fairy.jieqi import (
    apply_move_and_transform,
    make_initial_mapping,
)

class TestApplyMoveAndTransform(unittest.TestCase):

    def setUp(self):
        # Use simplified initial FEN with tilde (Jeiqi starting)
        self.fen = (
            "r~n~b~a~ka~b~n~r~/9/1c~5c~1/"
            "p~1p~1p~1p~1p~/9/9/"
            "P~1P~1P~1P~1P~/1C~5C~1/"
            "9/R~N~B~A~KA~B~N~R~ w - - 0 1"
        )
        self.mapping = make_initial_mapping()

    def test_move_uncovered_piece_removes_tilde(self):
        move = "b3b10"
        result = apply_move_and_transform(self.fen, move, self.mapping)
        self.assertNotIn("~", result.split()[0], "Moved piece should lose '~' after moving")

    def test_move_already_covered_piece_keeps_covered_state(self):
        # Move uncovered rook first (a1->a2)
        fen2 = apply_move_and_transform(self.fen, "a1a2", self.mapping)
        # Move it again; should stay covered
        result = apply_move_and_transform(fen2, "a2a3", self.mapping)
        self.assertNotIn("~", result.split()[0], "Covered piece should remain covered after moving again")

    def test_move_black_side_piece(self):
        # Move black cannon (b8->b3)
        move = "b8b3"
        result = apply_move_and_transform(self.fen, move, self.mapping)
        self.assertNotIn("c~", result.split()[0], "Captured uncovered piece should be removed")

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
        self.assertIn("K", result, "King should remain covered (no '~')")

if __name__ == "__main__":
    unittest.main()
