# -*- coding: utf-8 -*-
""" Needs https://github.com/walker8088/moonfish """
import re

import tools
from moonfish import RED, BLACK

FEN_START = tools.FEN_INITIAL


class XiangqiBoard:
    def __init__(self, initial_fen=""):
        self.initial_fen = initial_fen if initial_fen else FEN_START
        self.move_stack = []
        self.pos = self.parseFEN(self.initial_fen)
        self.color = RED if self.initial_fen.split()[1] == "w" else BLACK
        self.fen = self.initial_fen

    def mrender(self, m):
        return tools.mrender(self.pos, m)

    def mparse(self, move):
        return tools.mparse(self.color, move)

    def parseFEN(self, fen):
        return tools.parseFEN(fen)

    def renderFEN(self, half_move_clock=0, full_move_clock=1):
        # return tools.renderFEN(self.pos, half_move_clock, full_move_clock)
        color = 'wb'[self.pos.move_color]
        pos = self.pos.rotate() if self.pos.move_color == BLACK else self.pos
        board = '/'.join(pos.board.split())
        board = re.sub(r'\.+', (lambda m: str(len(m.group(0)))), board)
        castling = '-'
        ep = '-'
        clock = '{} {}'.format(half_move_clock, full_move_clock)
        return ' '.join((board, color, castling, ep, clock))

    def print_pos(self):
        tools.print_pos(self.pos)

    def push(self, move):
        print("push move", move)
        self.move_stack.append(move)
        self.pos = self.pos.move(self.mparse(move))
        self.color = RED if self.color == BLACK else BLACK
        self.fen = self.get_fen()

    def start_fen(self, variant):
        return FEN_START

    def get_fen(self):
        return tools.renderFEN(self.pos)

    def legal_moves(self):
        moves = []
        for move, pos in tools.gen_legal_moves(self.pos):
            moves.append(self.mrender(move))
        return moves

    def is_checked(self):
        return self.pos.is_checked()

    def insufficient_material(self):
        # TODO
        return False

    def is_claimable_draw(self):
        # TODO
        return False


if __name__ == '__main__':
    board = XiangqiBoard(tools.FEN_INITIAL)
    board.print_pos()
    print(board.renderFEN())
    print(board.legal_moves())

    board.push("b2e2")
    board.print_pos()
    print(board.renderFEN())
    print(board.legal_moves())

    board.push("a9a8")
    board.print_pos()
    print(board.renderFEN())
    print(board.legal_moves())
