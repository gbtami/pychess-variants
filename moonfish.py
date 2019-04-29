#!/usr/bin/env pypy
# -*- coding: utf-8 -*-
from __future__ import print_function
import re, sys, time
from itertools import count
from collections import OrderedDict, namedtuple

###############################################################################
# Python 2 compatability
if sys.version_info[0] == 2:
    input = raw_input
    class NewOrderedDict(OrderedDict):
        def move_to_end(self, key):
            value = self.pop(key)
            self[key] = value
    OrderedDict = NewOrderedDict


###############################################################################
# Piece-Square tables. 
###############################################################################
#pst from http://chinesechess.googlecode.com which is dead now 
pst = {
    'P':[
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  9,  9,  9, 11, 13, 11,  9,  9,  9,  0,  0,
        0,  0, 19, 24, 34, 42, 44, 42, 34, 24, 19,  0,  0,
        0,  0, 19, 24, 32, 37, 37, 37, 32, 24, 19,  0,  0,
        0,  0, 19, 23, 27, 29, 30, 29, 27, 23, 19,  0,  0,
        0,  0, 14, 18, 20, 27, 29, 27, 20, 18, 14,  0,  0,
        0,  0,  7,  0, 13,  0, 18,  0, 13,  0,  7,  0,  0,
        0,  0,  6,  0, 10,  0, 15,  0, 10,  0,  6,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
          
    'K':[
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  1,  1,  1,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  2,  2,  2,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0, 11, 15, 11,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
        
     'A':[
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0, 10,  0, 10,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0, 20,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0, 15,  0, 15,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
        
    'B':[
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0, 13,  0,  0,  0, 13,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0, 10,  0,  0,  0, 20,  0,  0,  0, 10,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0, 15,  0,  0,  0, 15,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
        
    'N':[
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0, 90, 90, 90, 96, 90, 96, 90, 90, 90,  0,  0,
        0,  0, 90, 96,103, 97, 94, 97,103, 96, 90,  0,  0,
        0,  0, 92, 98, 99,103, 99,103, 99, 98, 92,  0,  0,
        0,  0, 93,108,100,107,100,107,100,108, 93,  0,  0,
        0,  0, 90,100, 99,103,104,103, 99,100, 90,  0,  0,
        0,  0, 90, 98,101,102,103,102,101, 98, 90,  0,  0,
        0,  0, 92, 94, 98, 95, 98, 95, 98, 94, 92,  0,  0,
        0,  0, 93, 92, 94, 95, 92, 95, 94, 92, 93,  0,  0,
        0,  0, 85, 90, 92, 93, 85, 93, 92, 90, 85,  0,  0,
        0,  0, 88, 85, 90, 88, 90, 88, 90, 85, 88,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
        
    'R':[
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,206,208,207,213,214,213,207,208,206,  0,  0,
        0,  0,206,212,209,216,233,216,209,212,206,  0,  0,
        0,  0,206,208,207,214,216,214,207,208,206,  0,  0,
        0,  0,206,213,213,216,216,216,213,213,206,  0,  0,
        0,  0,208,211,211,214,215,214,211,211,208,  0,  0,
        0,  0,208,212,212,214,215,214,212,212,208,  0,  0,
        0,  0,204,209,204,212,214,212,204,209,204,  0,  0,
        0,  0,198,208,204,212,212,212,204,208,198,  0,  0,
        0,  0,200,208,206,212,200,212,206,208,200,  0,  0,
        0,  0,194,206,204,212,200,212,204,206,194,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
        
    'C':[
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,100,100, 96, 91, 90, 91, 96,100,100,  0,  0,
        0,  0, 98, 98, 96, 92, 89, 92, 96, 98, 98,  0,  0,
        0,  0, 97, 97, 96, 91, 92, 91, 96, 97, 97,  0,  0,
        0,  0, 96, 99, 99, 98,100, 98, 99, 99, 96,  0,  0,
        0,  0, 96, 96, 96, 96,100, 96, 96, 96, 96,  0,  0,
        0,  0, 95, 96, 99, 96,100, 96, 99, 96, 95,  0,  0,
        0,  0, 96, 96, 96, 96, 96, 96, 96, 96, 96,  0,  0,
        0,  0, 97, 96,100, 99,101, 99,100, 96, 97,  0,  0,
        0,  0, 96, 97, 98, 98, 98, 98, 98, 97, 96,  0,  0,
        0,  0, 96, 96, 97, 99, 99, 99, 97, 96, 96,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
}        

###############################################################################
uni_pieces = {
    'K': u"帅",
    'k': u"将",
    'A': u"仕",
    'a': u"士",
    'B': u"相",
    'b': u"象",
    'N': u"马",
    'n': u"碼",
    'R': u"车",
    'r': u"砗",
    'C': u"炮",
    'c': u"砲",
    'P': u"兵",
    'p': u"卒",
    '.': u' .',
}

h_level_index = \
(
        (u"九",u"八",u"七",u"六",u"五",u"四",u"三",u"二",u"一"),
        (u"９",u"８",u"７",u"６",u"５",u"４",u"３",u"２",u"１")
)

v_change_index = \
(
        (u"错", ""u"一", u"二", u"三", u"四", u"五", u"六", u"七", u"八", u"九"),
        (u"误", ""u"１", u"２", u"３", u"４", u"５", u"６", u"７", u"８", u"９")
)
       
###############################################################################
# Global constants
###############################################################################
RED, BLACK = 0, 1
TOP,LEFT = 2, 2
LINE_WITH, LINE_HEIGHT = 13, 14
BUTTOM, RIGHT = TOP + LINE_HEIGHT, LEFT + LINE_WITH
A0, I0 = 145, 153
        
piece = { 'P': 40, 'C':90, 'N':90, 'R': 200, 'A': 30, 'B':30, 'K': 10000 }

# Our board is represented as a 182 character string. The padding allows for
# fast detection of moves that don't stay within the board.
board_initial = (
    '            \n'  #   0 - 12
    '            \n'  #  13 - 25
    '  rnbakabnr \n'  #  26 - 38
    '  ......... \n'  #  39 - 51
    '  .c.....c. \n'  #  52 - 64
    '  p.p.p.p.p \n'  #  65 - 77
    '  ......... \n'  #  78 - 90 
    '  ......... \n'  #  91 - 103
    '  P.P.P.P.P \n'  # 104 - 116
    '  .C.....C. \n'  # 117 - 129
    '  ......... \n'  # 130 - 142
    '  RNBAKABNR \n'  # 143 - 155
    '            \n'  # 156 - 168
    '            \n'  # 169 - 181
)

# Lists of possible moves for each piece type.
P_PRE_MOVES = (-13, -1, 1)
K_PRE_MOVES = (-13, 13, -1, 1)
A_PRE_MOVES = (-14, -12, 12, 14)
B_PRE_MOVES = ((-24,-12), (-28, -14), (24, 12), (28, 14))
N_PRE_MOVES = ((-27,-13), (-25,-13), (-15, -1), (-11, 1), (11, -1), (15, 1), (25,13), (27, 13))

DIRECTIONS = (13, -13,-1, 1)
KKK_DIRECTION = -13

# When a MATE is detected, we'll set the score to MATE_UPPER - plies to get there
# E.g. Mate in 3 will be MATE_UPPER - 6
MATE_LOWER = piece['K'] - 2 * (piece['R'] + piece['C'] + piece['N'] + piece['A'] + piece['B']) - 5 * piece['P']
MATE_UPPER = piece['K'] + 2 * (piece['R'] + piece['C'] + piece['N'] + piece['A'] + piece['B']) + 5 * piece['P']

# The table size is the maximum number of elements in the transposition table.
TABLE_SIZE = 1e8
# Constants for tuning search
QS_LIMIT = 30 #150
EVAL_ROUGHNESS = 20
#EVAL_ROUGHNESS = 50

###############################################################################

def move_to_zh(board, move):
    piece = board[move[0]]
    i, j = move
    move_from = (i // LINE_WITH - TOP, i % LINE_WITH - LEFT)
    move_to   = (j // LINE_WITH - TOP, j % LINE_WITH - LEFT)
    color = 0 if board[i].isupper() else 1
    #rank, fil = divmod(i - A1, LINE_WITH)
    
    diff = (move_to[0]-move_from[0], move_to[1]-move_from[1])
    base = h_level_index[color][move_from[1]]
    
    if diff[0] == 0:
        change_type = u'平'  
    elif diff[0] < 0:
        change_type = u'进' 
    else:
        change_type = u'退'
    
    if piece in 'NAB': 
        change = h_level_index[color][move_to[1]]
    else:
        change = h_level_index[color][move_to[1]] if (diff[0] == 0) else v_change_index[color][diff[0] if diff[0] > 0 else -diff[0]]
       
    return uni_pieces[piece.lower() if color == BLACK else piece] + base + change_type + change
    
    
###############################################################################

        
def iccs2internal(c):
    fil, rank = ord(c[0]) - ord('a'), int(c[1])
    return A0 + fil - LINE_WITH*rank

def internal2iccs(i):
    rank, fil = divmod(i - A0, LINE_WITH)
    return chr(fil + ord('a')) + str(-rank)

def render2(move, color):
    i,j = rotate_move(move) if color == BLACK else move
    return (internal2iccs(i)+internal2iccs(j))

def rotate_move(move):
    return(181 - move[0], 181 - move[1])

def in_king_house(pos):
    v_index = pos // LINE_WITH - TOP
    h_index = pos % LINE_WITH - LEFT
    if (v_index < 7) or (v_index > 9) : return False 
    if (h_index < 3) or (h_index > 5) : return False 
    return True
        
###############################################################################
# Chess logic
###############################################################################
class RuleChecker():
    def __init__(self):
        self.history = []
    
    def append_move(self, pos, move):
        self.history.append((pos, move))
    
    def check_ban_move(self, pos):
        for it in self.history[::-1]:
            if (it[0].board == pos.board) and it[0].move_color == pos.move_color :
                return it[1]
        return None
        
class Position(namedtuple('Position', 'board move_color score')):
    """ A state of a chess game
    board -- a 256 char representation of the board
    move_color -- RED(0), BLACK(1)
    score -- the board evaluation
    """
    
    def gen_moves(self):
        # For each of our pieces, iterate through each possible 'ray' of moves,
        # as defined in the 'directions' map. The rays are broken e.g. by
        # captures or immediately in case of pieces such as knights.
        if not self.is_king_live():
            return   
        checked = self.is_checked()    
        for move in self.internal_gen_moves():
            if checked:
                pos = self.move(move)
                if pos.rotate().is_checked():
                     continue
            yield move 
            
    def internal_gen_moves(self):
        # For each of our pieces, iterate through each possible 'ray' of moves,
        # as defined in the 'directions' map. The rays are broken e.g. by
        # captures or immediately in case of pieces such as knights.
        
        for i, p in enumerate(self.board):
            if not p.isupper(): continue
            
            if p == 'P':
                for d in P_PRE_MOVES:
                   j = i+d
                   i_line = i // LINE_WITH - TOP
                   j_line = j // LINE_WITH - TOP
                   #兵过河条件
                   if (i_line > 4) and (j_line == i_line): continue
                   q = self.board[j]
                   if q.isspace() or q.isupper(): continue
                   yield(i,j)
                   
            elif p == 'K':
                for d in K_PRE_MOVES:
                   j = i+d
                   q = self.board[j]
                   if q.isspace() or q.isupper(): continue
                   if not in_king_house(j): continue
                   yield(i,j)
                
                #King kill King
                for j in count(i + KKK_DIRECTION, KKK_DIRECTION):
                    q = self.board[j]
                    # Stay inside the board, and off pieces
                    if q.isspace(): continue
                    if q == 'k': #King kill King
                        yield(i,j)
                        break
                    if q.isalpha(): break    
                
            elif p == 'A':
                for d in A_PRE_MOVES:
                   j = i+d
                   q = self.board[j]
                   if q.isspace() or q.isupper(): continue
                   if not in_king_house(j): continue
                   yield(i,j)
                    
            elif p == 'B':
                for d, bd in B_PRE_MOVES:
                   j = i+d
                   j_line = j // LINE_WITH - TOP
                   #象不能过河
                   if (j_line < 5): continue
                   q = self.board[j]
                   if q.isspace() or q.isupper(): continue
                   bq = self.board[i+bd]
                   if bq.isalpha(): continue
                   yield(i,j)
                        
            elif p == 'N':
                for d, bd in N_PRE_MOVES:
                   j = i+d
                   q = self.board[j]
                   if q.isspace() or q.isupper(): continue
                   bq = self.board[i+bd]
                   if bq.isalpha(): continue
                   yield(i,j)
              
            elif p == 'R':
                for d in DIRECTIONS:
                    for j in count(i+d, d):
                        q = self.board[j]
                        # Stay inside the board, and off friendly pieces
                        if q.isspace() or q.isupper(): break
                        yield (i, j)
                        if q.islower(): break
                        
            elif p == 'C':
                for d in DIRECTIONS:
                    passed_count = 0 
                    for j in count(i+d, d):
                        q = self.board[j]
                        # Stay inside the board
                        if q.isspace(): break
                        if (passed_count == 0) and (q == '.'):
                            yield (i, j)
                            continue                                
                        if (passed_count == 1) and q.islower():
                            yield (i, j)
                            break                            
                        if q.isalpha():
                            passed_count += 1
                                        
    def rotate(self):
        ''' Rotates the board, preserving enpassant '''
        return Position(self.board[::-1].swapcase(), 1 - self.move_color, -self.score)
    
    def nullmove(self):
        ''' Like rotate'''
        return Position(self.board[::-1].swapcase(), self.move_color, -self.score)
            
    def rotate_board(self):
        return Position(self.board[::-1].swapcase(), self.move_color, self.score)
        
    def move(self, move):
        i, j = move
        p, q = self.board[i], self.board[j]
        put = lambda board, i, p: board[:i] + p + board[i+1:]
        
        # Copy variables
        board = self.board
        score = self.score + self.value(move)
        
        # Actual move
        board = put(board, j, board[i])
        board = put(board, i, '.')
        # We rotate the returned position, so it's ready for the next player
        return Position(board, self.move_color, score).rotate()

    def value(self, move):
        
        i, j = move
        p, q = self.board[i], self.board[j]
        # Actual move
        score = pst[p][j] - pst[p][i]
        
        # Capture
        if q.islower():
            score += piece[q.upper()]
        return score
    
    def is_checked(self):
        pos = self.rotate()
        for move in pos.internal_gen_moves():
            if pos.board[move[1]] == 'k':
                return True
        return False  
    
    def is_king_live(self):
        for piece in self.board:
            if piece == 'K':
                return True
        return False
         
    def is_checked_dead(self):
        #check king still there
        if not self.is_king_live():
            return (True, True)
            
        #check being checked
        if not self.is_checked():
            return (False, False)
            
        #check all move     
        for move in self.gen_moves():
            pos = self.move(move)
            if not pos.rotate().is_checked():
                return (True, False)
        return (True, True)           
               
###############################################################################
# Search logic
###############################################################################

# lower <= s(pos) <= upper
Entry = namedtuple('Entry', 'lower upper')

# The normal OrderedDict doesn't update the position of a key in the list,
# when the value is changed.
class LRUCache:
    '''Store items in the order the keys were last added'''
    def __init__(self, size):
        self.od = OrderedDict()
        self.size = size

    def get(self, key, default=None):
        try: self.od.move_to_end(key)
        except KeyError: return default
        return self.od[key]

    def __setitem__(self, key, value):
        try: del self.od[key]
        except KeyError:
            if len(self.od) == self.size:
                self.od.popitem(last=False)
        self.od[key] = value

class Searcher:
    def __init__(self):
        self.tp_score = LRUCache(TABLE_SIZE)
        self.tp_move = LRUCache(TABLE_SIZE)
        self.nodes = 0
        self.max_depth = 100
        self.ban_move = None
        self.deep = 0
        
    def bound(self, pos, gamma, depth, root=True):
        """ returns r where
                s(pos) <= r < gamma    if gamma > s(pos)
                gamma <= r <= s(pos)   if gamma <= s(pos)"""
        self.deep += 1
        self.nodes += 1
        #print('    '*self.deep, 'bound depth %d ' % depth, 'BLACK_MOVE' if pos.move_color else 'RED_MOVE  ', 'gamma(%d)' % gamma, 'root' if root else '') 
        # Depth <= 0 is QSearch. Here any position is searched as deeply as is needed for calmness, and so there is no reason to keep different depths in the transposition table.
        depth = max(depth, 0)

        # We should always check if we
        # still have a king. Notice since this is the only termination check,
        # the remaining code has to be comfortable with being mated, stalemated
        # or able to capture the opponent king.
        if pos.score <= -MATE_LOWER:
            self.deep -= 1
            return -MATE_UPPER

        #查表确认已经搜索过这个局面了,并确认已存储的搜索也覆盖了该节点
        entry = self.tp_score.get((pos, depth, root), Entry(-MATE_UPPER, MATE_UPPER))
        if entry.lower >= gamma and (not root or self.tp_move.get(pos) is not None):
            self.deep -= 1
            return entry.lower
        if entry.upper < gamma:
            self.deep -= 1
            return entry.upper

        # Here extensions may be added
        # Such as 'if in_check: depth += 1'

        # Generator of moves to search in order.
        # This allows us to define the moves, but only calculate them if needed.
        def moves():
            # First try not moving at all
            if depth > 0 and not root and any(c in pos.board for c in 'PRNC'):  
                #print('    '*(self.deep), 'yield null move')
                yield None, -self.bound(pos.nullmove(), 1-gamma, depth-3, root=False)
                
            #depth <=0 静态搜索,直接返回该局面的得分
            if depth == 0:
                #yield None, pos.score
                score = pos.score
                
                #将军得分和将死得分
                go_checked, go_dead = pos.is_checked_dead()
                if go_checked:
                   score = score - MATE_UPPER #MATE_LOWER
                if go_dead:
                   score = -MATE_UPPER  
                #print('    '*self.deep, 'yeild score {}'.format(score))
                
                yield None, score
                
            # Then killer move. We search it twice, but the tp will fix things for us. Note, we don't have to check for legality, since we've already done it before. Also note that in QS the killer must be a capture, otherwise we will be non deterministic.
            killer = self.tp_move.get(pos)
            if killer and (depth > 0 or pos.value(killer) >= QS_LIMIT):
                #print('    '*(self.deep), 'yield killer move', move_to_zh(pos.board, killer))
                yield killer, -self.bound(pos.move(killer), 1-gamma, depth-1, root=False)
                
            # Then all the other moves
            for move in sorted(pos.gen_moves(), key=pos.value, reverse=True):
                if (depth == 1) and root and (move == self.ban_move):
                    print('ban_move', move)
                    continue                    
                if depth > 0 or pos.value(move) >= QS_LIMIT:
                    #print('    '*(self.deep), 'yield normal move', move_to_zh(pos.board, move))
                    yield move, -self.bound(pos.move(move), 1-gamma, depth-1, root=False)
                    
        # Run through the moves, shortcutting when possible
        best = -MATE_UPPER
        for move, score in moves():
            move_str = 'null_move' if (move == None) else move_to_zh(pos.board, move)
            #print('    '*(self.deep), 'BLACK_MOVE' if pos.move_color else 'RED_MOVE', 'move for depth %d'%depth, move_str, score)
            best = max(best, score)
            if best >= gamma:
                # Save the move for pv construction and killer heuristic
                self.tp_move[pos] = move
                #print('    '*(self.deep), 'save tp move', 'None' if move == None else move_to_zh(pos.board, move))
                break

        # Stalemate checking is a bit tricky: Say we failed low, because
        # we can't (legally) move and so the (real) score is -infty.
        # At the next depth we are allowed to just return r, -infty <= r < gamma,
        # which is normally fine.
        # However, what if gamma = -10 and we don't have any legal moves?
        # Then the score is actaully a draw and we should fail high!
        # Thus, if best < gamma and best < 0 we need to double check what we are doing.
        # This doesn't prevent moonfish from making a move that results in stalemate,
        # but only if depth == 1, so that's probably fair enough.
        # (Btw, at depth 1 we can also mate without realizing.)
        '''
        if best < gamma and best < 0 and depth > 0:
            is_dead = lambda pos: any(pos.value(m) >= MATE_LOWER for m in pos.gen_moves())
            if all(is_dead(pos.move(m)) for m in pos.gen_moves()):
                in_check = is_dead(pos.nullmove())
                best = -MATE_UPPER if in_check else 0
        '''
        # Table part 2
        if best >= gamma:
            self.tp_score[(pos, depth, root)] = Entry(best, entry.upper)
        if best < gamma:
            self.tp_score[(pos, depth, root)] = Entry(entry.lower, best)

        self.deep -= 1
        return best

    def _search(self, pos):
        """ Iterative deepening MTD-bi search """
        self.nodes = 0
        self.deep = 0
        
        # In finished games, we could potentially go far enough to cause a recursion
        # limit exception. Hence we bound the ply.
        for depth in range(1, self.max_depth + 1):
            self.depth = depth
            # The inner loop is a binary search on the score of the position.
            # Inv: lower <= score <= upper
            # 'while lower != upper' would work, but play tests show a margin of 20 plays better.
            lower, upper = -MATE_UPPER, MATE_UPPER
            while lower < upper - EVAL_ROUGHNESS:
                gamma = (lower+upper+1)//2
                #print('searching depth:{} lower:{} upper:{}  gamma:{}'.format(depth, lower, upper, gamma))    
                score = self.bound(pos, gamma, depth)
                if score >= gamma:
                    lower = score
                if score < gamma:
                    upper = score
                #print('searched depth:{} score:{}'.format(depth, score))    
                    
            # We want to make sure the move to play hasn't been kicked out of the table,
            # So we make another call that must always fail high and thus produce a move.
            score = self.bound(pos, lower, depth)
            #print('%d Got Score %d\n'%(depth, score))
            # Yield so the user may inspect the search
            yield score

    def search(self, pos, secs = 0, max_depth = 12, ban_move = None):
        self.max_depth = max_depth
        self.ban_move = ban_move
        start = time.time()
        for score in self._search(pos):
            #将军死和被将军死 才会出现MATE_UPPER的值,后续深度裁剪
            if (score >= MATE_UPPER) or (score <= -MATE_UPPER): 
                break
            #超时
            if (secs > 0) and (time.time() - start > secs):
                break
                
        # If the game hasn't finished we can retrieve our move from the
        # transposition table.
        return self.tp_move.get(pos), self.tp_score.get((pos, self.depth, True)).lower, self.depth
