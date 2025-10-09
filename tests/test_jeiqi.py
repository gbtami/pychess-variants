import unittest
from unittest.mock import patch
from fairy.jieqi import (
    apply_move_and_transform,
    make_initial_mapping,
    xiangqi_fen_to_pieces,
    pieces_to_fen,
    square_to_index,
    index_to_square,
    parse_move,
    BLACK_SQUARES,
    RED_SQUARES,
    get_uncovered_fen,
)


class TestJieqiUtils(unittest.TestCase):
    def test_square_to_index(self):
        self.assertEqual(square_to_index("a10"), 0)
        self.assertEqual(square_to_index("i1"), 89)
        self.assertEqual(square_to_index("e5"), 49)

    def test_index_to_square(self):
        self.assertEqual(index_to_square(0), "a10")
        self.assertEqual(index_to_square(89), "i1")
        self.assertEqual(index_to_square(49), "e5")

    def test_parse_move(self):
        self.assertEqual(parse_move("a1b2"), ("a1", "b2"))
        self.assertEqual(parse_move("a10i1"), ("a10", "i1"))
        with self.assertRaises(ValueError):
            parse_move("a1k2")
        with self.assertRaises(ValueError):
            parse_move("a1")

    def test_xiangqi_fen_to_pieces(self):
        fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1"
        pieces = xiangqi_fen_to_pieces(fen)
        self.assertEqual(len(pieces), 90)
        self.assertEqual(pieces[0], "r")
        self.assertEqual(pieces[89], "R")
        self.assertEqual(pieces[49], ".")

    def test_pieces_to_fen(self):
        pieces = ["r", "n", "b", "a", "k", "a", "b", "n", "r"] + ["."] * 81
        fen = pieces_to_fen(pieces)
        self.assertEqual(fen, "rnbakabnr/9/9/9/9/9/9/9/9/9")

    @patch("random.shuffle")
    def test_make_initial_mapping(self, mock_shuffle):
        mapping = make_initial_mapping()
        self.assertEqual(len(mapping), len(BLACK_SQUARES) + len(RED_SQUARES))
        self.assertEqual(mapping["e10"], "k")
        self.assertEqual(mapping["e1"], "K")
        self.assertIn("a10", mapping)
        self.assertIn("i1", mapping)

    def test_get_uncovered_fen(self):
        fen = "r~n~b~a~k~a~b~n~r~/9/1c~5c~1/p~1p~1p~1p~1p~/9/9/P~1P~1P~1P~1P~/1C~5C~1/9/R~N~B~A~K~A~B~N~R~ w - - 0 1"
        revealed_squares = {"a1", "b3"}
        uncovered_fen = get_uncovered_fen(fen, revealed_squares)
        pieces = xiangqi_fen_to_pieces(uncovered_fen)
        self.assertEqual(pieces[square_to_index("a1")], "R")
        self.assertEqual(pieces[square_to_index("b3")], "C")
        self.assertEqual(pieces[square_to_index("a10")], "r~")


class TestApplyMoveAndTransform(unittest.TestCase):
    def setUp(self):
        self.fen = (
            "r~n~b~a~k~a~b~n~r~/9/1c~5c~1/"
            "p~1p~1p~1p~1p~/9/9/"
            "P~1P~1P~1P~1P~/1C~5C~1/"
            "9/R~N~B~A~K~A~B~N~R~ w - - 0 1"
        )
        self.mapping = {
            "a10": "r", "b10": "n", "c10": "b", "d10": "a", "f10": "a", "g10": "b", "h10": "n", "i10": "r",
            "b8": "c", "h8": "c",
            "a7": "p", "c7": "p", "e7": "p", "g7": "p", "i7": "p",
            "e10": "k",
            "a1": "R", "b1": "N", "c1": "B", "d1": "A", "f1": "A", "g1": "B", "h1": "N", "i1": "R",
            "b3": "C", "h3": "C",
            "a4": "P", "c4": "P", "e4": "P", "g4": "P", "i4": "P",
            "e1": "K",
        }
        self.revealed_squares = set()

    def get_piece_at(self, fen, square):
        board = xiangqi_fen_to_pieces(fen.split()[0])
        index = square_to_index(square)
        return board[index]

    def test_move_uncovered_piece_removes_tilde(self):
        move = "b3b10"
        result_fen, _ = apply_move_and_transform(self.fen, move, self.mapping, self.revealed_squares)
        piece_at_dst = self.get_piece_at(result_fen, "b10")
        self.assertNotIn("~", piece_at_dst)

    def test_move_already_covered_piece_keeps_covered_state(self):
        fen2, revealed2 = apply_move_and_transform(self.fen, "a1a2", self.mapping, self.revealed_squares)
        result_fen, _ = apply_move_and_transform(fen2, "a2a3", self.mapping, revealed2)
        piece_at_dst = self.get_piece_at(result_fen, "a3")
        self.assertNotIn("~", piece_at_dst)

    def test_move_black_side_piece(self):
        move = "b8b3"
        result_fen, _ = apply_move_and_transform(self.fen, move, self.mapping, self.revealed_squares)
        piece_at_dst = self.get_piece_at(result_fen, "b3")
        self.assertNotIn("~", piece_at_dst)

    def test_king_never_gets_tilde(self):
        move = "e1e2"
        result, _ = apply_move_and_transform(self.fen, move, self.mapping, self.revealed_squares)
        king_piece = self.get_piece_at(result, "e2")
        self.assertEqual("K", king_piece)


if __name__ == "__main__":
    unittest.main()