""" Generates EPD positions from PGN games file saved from lichess.org """

import argparse
import functools
import os
import sys

import chess.pgn
from chess.variant import find_variant


class PrintAllFensVisitor(chess.pgn.BaseVisitor):
    def __init__(self, variant=None):
        super(PrintAllFensVisitor, self).__init__()
        self.variant = variant

    def begin_game(self):
        self.uci_variant = ""
        self.fens = []
        self.relevant = True
        self.site = ""

    def visit_header(self, name, value):
        if name == "Variant":
            self.uci_variant = find_variant(value.removesuffix("960")).uci_variant
            if self.variant is not None and self.uci_variant != self.variant:
                self.relevant = False

        if name == "Site":
            self.site = value

    def end_headers(self):
        if not self.relevant:
            print(self.uci_variant, self.site)
            # Optimization hint: Do not even bother parsing the moves.
            return chess.pgn.SKIP

    def visit_board(self, board):
        if self.relevant:
            self.fens.append("{};variant {};site {}".format(board.fen(), self.uci_variant, self.site))

    def result(self):
        return self.fens


def write_fens(pgn_file, stream, variant, count):
    visitor = functools.partial(PrintAllFensVisitor, variant=variant)
    with open(pgn_file) as pgn:
        cnt = 0
        while cnt <= count:
            fens = chess.pgn.read_game(pgn, Visitor=visitor)
            if not fens:
                continue
            else:
                cnt += 1
            for fen in fens:
                stream.write(fen + os.linesep)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input-file", help="pgn file containing lichess games")
    parser.add_argument(
        "-v", "--variant", help="variant to generate positions for"
    )
    parser.add_argument("-c", "--count", type=int, default=1000, help="number of games")

    args = parser.parse_args()
    write_fens(args.input_file, sys.stdout, args.variant, args.count)
