# -*- coding: utf-8 -*-
#
# This file is part of the python-chess library.
# Copyright (C) 2012-2019 Niklas Fiekas <niklas.fiekas@backscattering.de>
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <http://www.gnu.org/licenses/>.

import enum
import itertools
import logging
import re
import weakref
from typing import (
    Callable,
    # Dict,
    Generic,
    Iterable,
    Iterator,
    # List,
    Mapping,
    MutableMapping,
    # Set,
    TextIO,
    Tuple,
    Type,
    TypeVar,
    Optional,
    Union,
)

import bugchess
from bugchess.variant import BughouseBoards

LOGGER = logging.getLogger(__name__)

# Reference of Numeric Annotation Glyphs (NAGs):
# https://en.wikipedia.org/wiki/Numeric_Annotation_Glyphs

NAG_NULL = 0

NAG_GOOD_MOVE = 1
"""A good move. Can also be indicated by ``!`` in PGN notation."""

NAG_MISTAKE = 2
"""A mistake. Can also be indicated by ``?`` in PGN notation."""

NAG_BRILLIANT_MOVE = 3
"""A brilliant move. Can also be indicated by ``!!`` in PGN notation."""

NAG_BLUNDER = 4
"""A blunder. Can also be indicated by ``??`` in PGN notation."""

NAG_SPECULATIVE_MOVE = 5
"""A speculative move. Can also be indicated by ``!?`` in PGN notation."""

NAG_DUBIOUS_MOVE = 6
"""A dubious move. Can also be indicated by ``?!`` in PGN notation."""

NAG_FORCED_MOVE = 7
NAG_SINGULAR_MOVE = 8
NAG_WORST_MOVE = 9
NAG_DRAWISH_POSITION = 10
NAG_QUIET_POSITION = 11
NAG_ACTIVE_POSITION = 12
NAG_UNCLEAR_POSITION = 13
NAG_WHITE_SLIGHT_ADVANTAGE = 14
NAG_BLACK_SLIGHT_ADVANTAGE = 15
NAG_WHITE_MODERATE_ADVANTAGE = 16
NAG_BLACK_MODERATE_ADVANTAGE = 17
NAG_WHITE_DECISIVE_ADVANTAGE = 18
NAG_BLACK_DECISIVE_ADVANTAGE = 19

NAG_WHITE_ZUGZWANG = 22
NAG_BLACK_ZUGZWANG = 23

NAG_WHITE_MODERATE_COUNTERPLAY = 132
NAG_BLACK_MODERATE_COUNTERPLAY = 133
NAG_WHITE_DECISIVE_COUNTERPLAY = 134
NAG_BLACK_DECISIVE_COUNTERPLAY = 135
NAG_WHITE_MODERATE_TIME_PRESSURE = 136
NAG_BLACK_MODERATE_TIME_PRESSURE = 137
NAG_WHITE_SEVERE_TIME_PRESSURE = 138
NAG_BLACK_SEVERE_TIME_PRESSURE = 139

NAG_NOVELTY = 146

TAG_REGEX = re.compile(r"^\[([A-Za-z0-9_]+)\s+\"(.*)\"\]\s*$")

TAG_NAME_REGEX = re.compile(r"^[A-Za-z0-9_]+\Z")

CARRIED_OVER_MOVE_REGEX = re.compile(r"([ABab]\.\s)$")

MOVETEXT_REGEX = re.compile(
    r"""
        (([ABab]\.\s)?[NBKRQ]?[a-h]?[1-8]?[\-x]?[a-h][1-8](?:=?[nbrqkNBRQK])?
        |([ABab]\.\s)?[PNBRQK]?@[a-h][1-8]
        |([ABab]\.\s)?--
        |([ABab]\.\s)?Z0
        |([ABab]\.\s)?O-O(?:-O)?
        |([ABab]\.\s)?0-0(?:-0)?
        |([ABab]\.\s)$
    )
    |(\{.*)
    |(;.*)
    |(\$[0-9]+)
    |(\()
    |(\))
    |(\*|1-0|0-1|1/2-1/2)
    |([\?!]{1,2})
    """,
    re.DOTALL | re.VERBOSE,
)

SKIP_MOVETEXT_REGEX = re.compile(r""";|\{|\}""")

TAG_ROSTER = ["Event", "Site", "Date", "Round", "White", "Black", "Result"]


class SkipType(enum.Enum):
    SKIP = None


SKIP = SkipType.SKIP

ResultT = TypeVar("ResultT")
GameBuilderResultT = TypeVar("GameBuilderResultT", bound="Game")


class GameNode:
    def __init__(self) -> None:
        self.parent = None  # type: Optional[GameNode]
        self.variations = []  # type: List[GameNode]

        self.move = None  # type: Optional[bugchess.Move]
        self.nags = set()  # type: Set[int]
        self.starting_comment = ""
        self.comment = ""
        self.board_cached = None  # type: Optional[weakref.ref[bugchess.Board]]

    @classmethod
    def dangling_node(cls) -> "GameNode":
        return GameNode()

    def board(self, *, _cache: bool = True) -> bugchess.Board:
        """
        Gets a board with the position of the node.

        It's a copy, so modifying the board will not alter the game.
        """
        if self.board_cached is not None:
            board = self.board_cached()
            if board is not None:
                return board.copy()

        board = self.parent.board(_cache=False)
        board.push(self.move)

        if _cache:
            self.board_cached = weakref.ref(board)
            return board.copy()
        else:
            return board

    def san(self) -> str:
        """
        Gets the standard algebraic notation of the move leading to this node.
        See :func:`bugchess.Board.san()`.

        Do not call this on the root node.
        """
        return self.parent.board().san(self.move)

    def uci(self, *, chess960: Optional[bool] = None) -> str:
        """
        Gets the UCI notation of the move leading to this node.
        See :func:`bugchess.Board.uci()`.

        Do not call this on the root node.
        """
        return self.parent.board().uci(self.move, chess960=chess960)

    def root(self) -> "GameNode":
        """Gets the root node, i.e., the game."""
        node = self

        while node.parent:
            node = node.parent

        return node

    def end(self) -> "GameNode":
        """Follows the main variation to the end and returns the last node."""
        node = self

        while node.variations:
            node = node.variations[0]

        return node

    def is_end(self) -> bool:
        """Checks if this node is the last node in the current variation."""
        return not self.variations

    def starts_variation(self) -> bool:
        """
        Checks if this node starts a variation (and can thus have a starting
        comment). The root node does not start a variation and can have no
        starting comment.

        For example, in ``1. e4 e5 (1... c5 2. Nf3) 2. Nf3``, the node holding
        1... c5 starts a variation.
        """
        if not self.parent or not self.parent.variations:
            return False

        return self.parent.variations[0] != self

    def is_mainline(self) -> bool:
        """Checks if the node is in the mainline of the game."""
        node = self

        while node.parent:
            parent = node.parent

            if not parent.variations or parent.variations[0] != node:
                return False

            node = parent

        return True

    def is_main_variation(self) -> bool:
        """
        Checks if this node is the first variation from the point of view of its
        parent. The root node is also in the main variation.
        """
        if not self.parent:
            return True

        return not self.parent.variations or self.parent.variations[0] == self

    def __getitem__(self, move: Union[int, bugchess.Move]) -> "GameNode":
        try:
            return self.variations[move]
        except TypeError:
            for variation in self.variations:
                if variation.move == move or variation == move:
                    return variation

        raise KeyError(move)

    def variation(self, move: Union[int, bugchess.Move]) -> "GameNode":
        """
        Gets a child node by either the move or the variation index.
        """
        return self[move]

    def has_variation(self, move: bugchess.Move) -> bool:
        """Checks if the given *move* appears as a variation."""
        return move in (variation.move for variation in self.variations)

    def promote_to_main(self, move: bugchess.Move) -> None:
        """Promotes the given *move* to the main variation."""
        variation = self[move]
        self.variations.remove(variation)
        self.variations.insert(0, variation)

    def promote(self, move: bugchess.Move) -> None:
        """Moves a variation one up in the list of variations."""
        variation = self[move]
        i = self.variations.index(variation)
        if i > 0:
            self.variations[i - 1], self.variations[i] = self.variations[i], self.variations[i - 1]

    def demote(self, move: bugchess.Move) -> None:
        """Moves a variation one down in the list of variations."""
        variation = self[move]
        i = self.variations.index(variation)
        if i < len(self.variations) - 1:
            self.variations[i + 1], self.variations[i] = self.variations[i], self.variations[i + 1]

    def remove_variation(self, move: bugchess.Move) -> None:
        """Removes a variation."""
        self.variations.remove(self.variation(move))

    def add_variation(
        self,
        move: bugchess.Move,
        *,
        comment: str = "",
        starting_comment: str = "",
        nags: Iterable[int] = (),
    ) -> "GameNode":
        """Creates a child node with the given attributes."""
        node = type(self).dangling_node()
        node.move = move
        node.nags = set(nags)
        node.comment = comment
        node.starting_comment = starting_comment

        node.parent = self
        self.variations.append(node)
        return node

    def add_main_variation(self, move: bugchess.Move, *, comment: str = "") -> "GameNode":
        """
        Creates a child node with the given attributes and promotes it to the
        main variation.
        """
        node = self.add_variation(move, comment=comment)
        self.variations.remove(node)
        self.variations.insert(0, node)
        return node

    def mainline(self) -> "Mainline[GameNode]":
        """Returns an iterator over the mainline starting after this node."""
        return Mainline(self, lambda node: node)

    def mainline_moves(self) -> "Mainline[bugchess.Move]":
        """Returns an iterator over the main moves after this node."""
        return Mainline(self, lambda node: node.move)

    def add_line(
        self,
        moves: Iterable[bugchess.Move],
        *,
        comment: str = "",
        starting_comment: str = "",
        nags: Iterable[int] = (),
    ) -> "GameNode":
        """
        Creates a sequence of child nodes for the given list of moves.
        Adds *comment* and *nags* to the last node of the line and returns it.
        """
        node = self

        # Add line.
        for move in moves:
            node = node.add_variation(move, starting_comment=starting_comment)
            starting_comment = ""

        # Merge comment and NAGs.
        if node.comment:
            node.comment += " " + comment
        else:
            node.comment = comment

        node.nags.update(nags)

        return node

    def _accept_node(self, parent_board: bugchess.Board, visitor: "BaseVisitor[ResultT]") -> None:
        if self.starting_comment:
            visitor.visit_comment(self.starting_comment)

        visitor.visit_move(parent_board, self.move)

        parent_board.push(self.move)
        visitor.visit_board(parent_board)
        parent_board.pop()

        for nag in sorted(self.nags):
            visitor.visit_nag(nag)

        if self.comment:
            visitor.visit_comment(self.comment)

    def accept(
        self, visitor: "BaseVisitor[ResultT]", *, _parent_board: Optional[bugchess.Board] = None
    ) -> ResultT:
        """
        Traverses game nodes in PGN order using the given *visitor*. Starts with
        the move leading to this node. Returns the *visitor* result.
        """
        board = self.parent.board() if _parent_board is None else _parent_board

        # First, visit the move that leads to this node.
        self._accept_node(board, visitor)

        # Then visit sidelines.
        if _parent_board is not None and self == self.parent.variations[0]:
            for variation in itertools.islice(self.parent.variations, 1, None):
                if visitor.begin_variation() is not SKIP:
                    variation.accept(visitor, _parent_board=board)
                visitor.end_variation()

        # The mainline is continued last.
        if self.variations:
            board.push(self.move)
            self.variations[0].accept(visitor, _parent_board=board)
            board.pop()

        # Get the result if not called recursively.
        return visitor.result() if _parent_board is None else None

    def accept_subgame(self, visitor: "BaseVisitor[ResultT]") -> ResultT:
        """
        Traverses headers and game nodes in PGN order, as if the game was
        starting after this node. Returns the *visitor* result.
        """
        if visitor.begin_game() is not SKIP:
            game = self.root()
            board = self.board()

            dummy_game = Game.without_tag_roster()
            dummy_game.setup(board)

            visitor.begin_headers()

            for tagname, tagvalue in game.headers.items():
                if tagname not in dummy_game.headers:
                    visitor.visit_header(tagname, tagvalue)
            for tagname, tagvalue in dummy_game.headers.items():
                visitor.visit_header(tagname, tagvalue)

            if visitor.end_headers() is not SKIP:
                visitor.visit_board(board)

                if self.variations:
                    self.variations[0].accept(visitor, _parent_board=board)

                visitor.visit_result(game.headers.get("Result", "*"))

        visitor.end_game()
        return visitor.result()

    def __str__(self) -> str:
        return self.accept(StringExporter(columns=None))

    def __repr__(self) -> str:
        return "<{} at {:#x} ({}{} {} ...)>".format(
            type(self).__name__,
            id(self),
            self.parent.board().fullmove_number,
            "." if self.parent.board().turn == bugchess.WHITE else "...",
            self.san(),
        )


GameT = TypeVar("GameT", bound="Game")


class Game(GameNode):
    """
    The root node of a game with extra information such as headers and the
    starting position. Also has all the other properties and methods of
    :class:`~bugchess.pgn.GameNode`.
    """

    def __init__(
        self, headers: Optional[Union[Mapping[str, str], Iterable[Tuple[str, str]]]] = None
    ) -> None:
        super().__init__()
        self.headers = Headers(headers)
        self.errors = []  # type: List[Exception]

    def board(self, *, _cache: bool = False) -> bugchess.Board:
        """
        Gets the starting position of the game.

        Unless the ``FEN`` header tag is set, this is the default starting
        position (for the ``Variant``).
        """
        return self.headers.board()

    def setup(self, board: Union[bugchess.Board, bugchess.variant.BughouseBoards, str]) -> None:
        """
        Sets up a specific starting position. This sets (or resets) the
        ``FEN``, ``SetUp``, and ``Variant`` header tags.
        """
        try:
            fen = board.fen()
        except AttributeError:
            board = bugchess.Board(board)
            board.chess960 = board.has_chess960_castling_rights()
            fen = board.fen()

        if fen == type(board).starting_fen:
            self.headers.pop("SetUp", None)
            self.headers.pop("FEN", None)
        else:
            self.headers["SetUp"] = "1"
            self.headers["FEN"] = fen

        if type(board).aliases[0] == "Standard" and board.chess960:
            self.headers["Variant"] = "Chess960"
        elif type(board).aliases[0] != "Standard":
            self.headers["Variant"] = type(board).aliases[0]
            self.headers["FEN"] = board.fen()
        else:
            self.headers.pop("Variant", None)

    def accept(self, visitor: "BaseVisitor[ResultT]") -> ResultT:
        """
        Traverses the game in PGN order using the given *visitor*. Returns
        the *visitor* result.
        """
        if visitor.begin_game() is not SKIP:
            for tagname, tagvalue in self.headers.items():
                visitor.visit_header(tagname, tagvalue)
            if visitor.end_headers() is not SKIP:
                board = self.board()
                visitor.visit_board(board)

                if self.comment:
                    visitor.visit_comment(self.comment)

                if self.variations:
                    self.variations[0].accept(visitor, _parent_board=board)

                visitor.visit_result(self.headers.get("Result", "*"))

        visitor.end_game()
        return visitor.result()

    @classmethod
    def from_bughouse_boards(cls, boards: bugchess.variant.BughouseBoards) -> GameT:
        game = cls()
        del game.headers["Black"]
        del game.headers["White"]
        game.headers["WhiteA"] = "?"
        game.headers["WhiteB"] = "?"
        game.headers["BlackA"] = "?"
        game.headers["BlackB"] = "?"
        game.setup(boards.root())
        node = game
        for move in boards.move_stack:
            node = node.add_variation(move)
        game.headers["Result"] = boards.result()
        return game

    @classmethod
    def from_board(cls: Type[GameT], board: bugchess.Board) -> GameT:
        """Creates a game from the move stack of a :class:`~bugchess.Board()`."""
        # Setup the initial position.
        game = cls()
        game.setup(board.root())
        node = game  # type: GameNode

        # Replay all moves.
        for move in board.move_stack:
            node = node.add_variation(move)

        game.headers["Result"] = board.result()
        return game

    @classmethod
    def without_tag_roster(cls: Type[GameT]) -> GameT:
        """Creates an empty game without the default 7 tag roster."""
        return cls(headers={})

    @classmethod
    def builder(cls) -> "GameBuilder":
        return GameBuilder(Game=cls)

    def __repr__(self) -> str:
        return "<{} at {:#x} ({!r} vs. {!r}, {!r})>".format(
            type(self).__name__,
            id(self),
            self.headers.get("White", "?"),
            self.headers.get("Black", "?"),
            self.headers.get("Date", "????.??.??"),
        )


HeadersT = TypeVar("HeadersT", bound="Headers")


class Headers(MutableMapping[str, str]):
    def __init__(
        self,
        data: Optional[Union[Mapping[str, str], Iterable[Tuple[str, str]]]] = None,
        **kwargs: str,
    ) -> None:
        self._tag_roster = {}  # type: Dict[str, str]
        self._others = {}  # type: Dict[str, str]

        if data is None:
            data = {
                "Event": "?",
                "Site": "?",
                "Date": "????.??.??",
                "Round": "?",
                "White": "?",
                "Black": "?",
                "Result": "*",
            }

        self.update(data, **kwargs)

    def is_chess960(self) -> bool:
        return self.get("Variant", "").lower() in [
            "chess960",
            "chess 960",
            "fischerandom",  # Cute Chess
            "fischerrandom",
            "fischer random",
        ]

    def is_wild(self) -> bool:
        # http://www.freechess.org/Help/HelpFiles/wild.html
        return self.get("Variant", "").lower() in [
            "wild/0",
            "wild/1",
            "wild/2",
            "wild/3",
            "wild/4",
            "wild/5",
            "wild/6",
            "wild/7",
            "wild/8",
            "wild/8a",
        ]

    def variant(self) -> Type[Union[bugchess.Board, BughouseBoards]]:
        if "Variant" not in self or self.is_chess960() or self.is_wild():
            return bugchess.Board
        else:
            from bugchess.variant import find_variant

            return find_variant(self["Variant"])

    def board(self) -> Union[bugchess.Board, BughouseBoards]:
        VariantBoard = self.variant()
        fen = self.get("FEN", VariantBoard.starting_fen)
        board = VariantBoard(fen, chess960=self.is_chess960())
        board.chess960 = board.chess960 or board.has_chess960_castling_rights()
        return board

    def __setitem__(self, key: str, value: str) -> None:
        if key in TAG_ROSTER:
            self._tag_roster[key] = value
        elif not TAG_NAME_REGEX.match(key):
            raise ValueError("non-alphanumeric pgn header tag: {!r}".format(key))
        elif "\n" in value or "\r" in value:
            raise ValueError("line break in pgn header {}: {!r}".format(key, value))
        else:
            self._others[key] = value

    def __getitem__(self, key: str) -> str:
        if key in TAG_ROSTER:
            return self._tag_roster[key]
        else:
            return self._others[key]

    def __delitem__(self, key: str) -> None:
        if key in TAG_ROSTER:
            del self._tag_roster[key]
        else:
            del self._others[key]

    def __iter__(self) -> Iterator[str]:
        for key in TAG_ROSTER:
            if key in self._tag_roster:
                yield key

        yield from sorted(self._others)

    def __len__(self) -> int:
        return len(self._tag_roster) + len(self._others)

    def copy(self: HeadersT) -> HeadersT:
        return type(self)(self)

    def __copy__(self: HeadersT) -> HeadersT:
        return self.copy()

    def __repr__(self) -> str:
        return "{}({})".format(
            type(self).__name__,
            ", ".join("{}={!r}".format(key, value) for key, value in self.items()),
        )

    @classmethod
    def builder(cls) -> "HeadersBuilder":
        return HeadersBuilder(Headers=lambda: cls({}))


MainlineMapT = TypeVar("MainlineMapT")


class Mainline(Generic[MainlineMapT]):
    def __init__(self, start: GameNode, f: Callable[[GameNode], MainlineMapT]) -> None:
        self.start = start
        self.f = f

    def __bool__(self) -> bool:
        return bool(self.start.variations)

    def __iter__(self) -> Iterator[MainlineMapT]:
        node = self.start
        while node.variations:
            node = node.variations[0]
            yield self.f(node)

    def __reversed__(self) -> "ReverseMainline[MainlineMapT]":
        return ReverseMainline(self.start, self.f)

    def accept(self, visitor: "BaseVisitor[ResultT]") -> ResultT:
        node = self.start
        board = self.start.board()
        while node.variations:
            node = node.variations[0]
            node._accept_node(board, visitor)
            board.push(node.move)
        return visitor.result()

    def __str__(self) -> str:
        return self.accept(StringExporter(columns=None))

    def __repr__(self) -> str:
        return "<Mainline at {:#x} ({})>".format(
            id(self), self.accept(StringExporter(columns=None, comments=False))
        )


class ReverseMainline(Generic[MainlineMapT]):
    def __init__(self, stop: GameNode, f: Callable[[GameNode], MainlineMapT]) -> None:
        self.stop = stop
        self.f = f

        self.length = 0
        node = stop
        while node.variations:
            node = node.variations[0]
            self.length += 1
        self.end = node

    def __len__(self) -> int:
        return self.length

    def __iter__(self) -> Iterator[MainlineMapT]:
        node = self.end
        while node.parent and node != self.stop:
            yield self.f(node)
            node = node.parent

    def __reversed__(self) -> Mainline[MainlineMapT]:
        return Mainline(self.stop, self.f)

    def __repr__(self) -> str:
        return "<ReverseMainline at {:#x} ({})>".format(
            id(self), " ".join(ReverseMainline(self.stop, lambda node: node.move.uci()))
        )


class BaseVisitor(Generic[ResultT]):
    """
    Base class for visitors.

    Use with :func:`bugchess.pgn.Game.accept()` or
    :func:`bugchess.pgn.GameNode.accept()` or :func:`bugchess.pgn.read_game()`.

    The methods are called in PGN order.
    """

    def begin_game(self) -> Optional[SkipType]:
        """Called at the start of a game."""
        pass

    def begin_headers(self) -> Optional[Headers]:
        """Called before visiting game headers."""
        pass

    def visit_header(self, tagname: str, tagvalue: str) -> None:
        """Called for each game header."""
        pass

    def end_headers(self) -> Optional[SkipType]:
        """Called after visiting game headers."""
        pass

    def parse_san(self, board: Union[bugchess.Board, BughouseBoards], san: str) -> bugchess.Move:
        """
        When the visitor is used by a parser, this is called to parse a move
        in standard algebraic notation.

        You can override the default implementation to work around specific
        quirks of your input format.
        """
        # Replace zeros with correct castling notation.
        if san == "0-0":
            san = "O-O"
        elif san == "0-0-0":
            san = "O-O-O"
        return board.parse_san(san)

    def visit_move(self, board: bugchess.Board, move: bugchess.Move) -> None:
        """
        Called for each move.

        *board* is the board state before the move. The board state must be
        restored before the traversal continues.
        """
        pass

    def visit_board(self, board: bugchess.Board) -> None:
        """
        Called for the starting position of the game and after each move.

        The board state must be restored before the traversal continues.
        """
        pass

    def visit_comment(self, comment: str) -> None:
        """Called for each comment."""
        pass

    def visit_nag(self, nag: int) -> None:
        """Called for each NAG."""
        pass

    def begin_variation(self) -> Optional[SkipType]:
        """
        Called at the start of a new variation. It is not called for the
        mainline of the game.
        """
        pass

    def end_variation(self) -> None:
        """Concludes a variation."""
        pass

    def visit_result(self, result: str) -> None:
        """
        Called at the end of a game with the value from the ``Result`` header.
        """
        pass

    def end_game(self) -> None:
        """Called at the end of a game."""
        pass

    def result(self) -> ResultT:
        """Called to get the result of the visitor. Defaults to ``True``."""
        return True

    def handle_error(self, error: Exception) -> None:
        """Called for encountered errors. Defaults to raising an exception."""
        raise error


class GameBuilder(BaseVisitor[Game]):
    """
    Creates a game model. Default visitor for :func:`~bugchess.pgn.read_game()`.
    """

    def __init__(self, *, Game: Callable[[], Game] = Game) -> None:
        self.Game = Game

    def begin_game(self) -> None:
        self.game = self.Game()

        self.variation_stack = [self.game]  # type: List[GameNode]
        self.starting_comment = ""
        self.in_variation = False

    def begin_headers(self) -> Headers:
        return self.game.headers

    def visit_header(self, tagname: str, tagvalue: str) -> None:
        self.game.headers[tagname] = tagvalue

    def visit_nag(self, nag: int) -> None:
        self.variation_stack[-1].nags.add(nag)

    def begin_variation(self) -> None:
        self.variation_stack.append(self.variation_stack[-1].parent)
        self.in_variation = False

    def end_variation(self) -> None:
        self.variation_stack.pop()

    def visit_result(self, result: str) -> None:
        if self.game.headers.get("Result", "*") == "*":
            self.game.headers["Result"] = result

    @staticmethod
    def hms_to_seconds_only(st: str) -> float:
        p = st.split(":")
        s = 0
        m = 1
        while len(p) > 0:
            s += m * float((p.pop()).replace(",", "."))
            m *= 60
        return s

    @staticmethod
    def time_format_to_bpgn_replace_clk_by_secs(fs_bpgn_game: str) -> str:
        ls_body = fs_bpgn_game
        li1 = 0
        try:
            li1 = ls_body.index("[%clk", li1)
        except ValueError:
            return ls_body
        while 1:
            li2 = (ls_body + "}").index("}", li1)
            numb_tmp1 = GameBuilder.hms_to_seconds_only(ls_body[li1 + 6 : li2 - 1])
            ls_body = ls_body[1 : li1 + 1] + str(numb_tmp1) + ls_body[li2:]
            try:
                li1 = ls_body.index("[%clk", li1 + 1)
            except ValueError:
                return ls_body
        return ls_body

    def visit_comment(self, comment: str) -> None:
        if self.in_variation or (
            self.variation_stack[-1].parent is None and self.variation_stack[-1].is_end()
        ):
            # Add as a comment for the current node if in the middle of
            # a variation. Add as a comment for the game if the comment
            # starts before any move.
            new_comment = [self.variation_stack[-1].comment, comment]
            self.variation_stack[-1].comment = "\n".join(new_comment).strip()

            if (
                self.game.headers.variant() == BughouseBoards
                and self.variation_stack[-1].move is not None
            ):
                self.variation_stack[-1].move.move_time = float(
                    GameBuilder.time_format_to_bpgn_replace_clk_by_secs(
                        [c for c in new_comment if len(c) > 0][0]
                    )
                    .strip()
                    .split()[0]
                )
        else:
            # Otherwise, it is a starting comment.
            new_comment = [self.starting_comment, comment]
            self.starting_comment = "\n".join(new_comment).strip()

    def visit_move(self, board: bugchess.Board, move: bugchess.Move) -> None:
        self.variation_stack[-1] = self.variation_stack[-1].add_variation(move)
        self.variation_stack[-1].starting_comment = self.starting_comment
        self.starting_comment = ""
        self.in_variation = True

    def handle_error(self, error: Exception) -> None:
        """
        Populates :data:`bugchess.pgn.Game.errors` with encountered errors and
        logs them.
        """
        LOGGER.exception("error during pgn parsing")
        self.game.errors.append(error)

    def result(self) -> Game:
        """
        Returns the visited :class:`~bugchess.pgn.Game()`.
        """
        return self.game


class HeadersBuilder(BaseVisitor[Headers]):
    """Collects headers into a dictionary."""

    def __init__(self, *, Headers: Callable[[], Headers] = lambda: Headers({})) -> None:
        self.Headers = Headers

    def begin_headers(self) -> Headers:
        self.headers = self.Headers()
        return self.headers

    def visit_header(self, tagname: str, tagvalue: str) -> None:
        self.headers[tagname] = tagvalue

    def end_headers(self) -> SkipType:
        return SKIP

    def result(self) -> Headers:
        return self.headers


class BoardBuilder(BaseVisitor[bugchess.Board]):
    """
    Returns the final position of the game. The mainline of the game is
    on the move stack.
    """

    def begin_game(self) -> None:
        self.skip_variation_depth = 0

    def begin_variation(self) -> SkipType:
        self.skip_variation_depth += 1
        return SKIP

    def end_variation(self) -> None:
        self.skip_variation_depth = max(self.skip_variation_depth - 1, 0)

    def visit_board(self, board: bugchess.Board) -> None:
        if not self.skip_variation_depth:
            self.board = board

    def result(self) -> bugchess.Board:
        return self.board


class SkipVisitor(BaseVisitor[bool]):
    """Skips a game."""

    def begin_game(self) -> SkipType:
        return SKIP

    def end_headers(self) -> SkipType:
        return SKIP

    def begin_variation(self) -> SkipType:
        return SKIP


class StringExporter(BaseVisitor[str]):
    """
    Allows exporting a game as a string.

    >>> from bug import chess
    >>>
    >>> game = bugchess.pgn.Game()
    >>>
    >>> exporter = bugchess.pgn.StringExporter(headers=True, variations=True, comments=True)
    >>> pgn_string = game.accept(exporter)

    Only *columns* characters are written per line. If *columns* is ``None``,
    then the entire movetext will be on a single line. This does not affect
    header tags and comments.

    There will be no newline characters at the end of the string.
    """

    def __init__(
        self,
        *,
        columns: Optional[int] = 80,
        headers: bool = True,
        comments: bool = True,
        variations: bool = True,
    ):
        self.columns = columns
        self.headers = headers
        self.comments = comments
        self.variations = variations

        self.found_headers = False

        self.force_movenumber = True

        self.lines = []  # type: List[str]
        self.current_line = ""
        self.variation_depth = 0

    def flush_current_line(self) -> None:
        if self.current_line:
            self.lines.append(self.current_line.rstrip())
        self.current_line = ""

    def write_token(self, token: str) -> None:
        if self.columns is not None and self.columns - len(self.current_line) < len(token):
            self.flush_current_line()
        self.current_line += token

    def write_line(self, line: str = "") -> None:
        self.flush_current_line()
        self.lines.append(line.rstrip())

    def end_game(self) -> None:
        self.write_line()

    def begin_headers(self) -> None:
        self.found_headers = False

    def visit_header(self, tagname: str, tagvalue: str) -> None:
        if self.headers:
            self.found_headers = True
            self.write_line('[{} "{}"]'.format(tagname, tagvalue))

    def end_headers(self) -> None:
        if self.found_headers:
            self.write_line()

    def begin_variation(self) -> Optional[SkipType]:
        self.variation_depth += 1

        if self.variations:
            self.write_token("( ")
            self.force_movenumber = True
            return None
        else:
            return SKIP

    def end_variation(self) -> None:
        self.variation_depth -= 1

        if self.variations:
            self.write_token(") ")
            self.force_movenumber = True

    def visit_comment(self, comment: str) -> None:
        if self.comments and (self.variations or not self.variation_depth):
            self.write_token("{ " + comment.replace("}", "").strip() + " } ")
            self.force_movenumber = True

    def visit_nag(self, nag: int) -> None:
        if self.comments and (self.variations or not self.variation_depth):
            self.write_token("$" + str(nag) + " ")

    def visit_move(
        self, board: Union[bugchess.Board, bugchess.variant.BughouseBoards], move: bugchess.Move
    ) -> None:
        if self.variations or not self.variation_depth:
            # Write the move number.
            if isinstance(board, bugchess.variant.BughouseBoards):
                board = board.boards[move.board_id]
                if board.board_id == bugchess.variant.BOARD_A:
                    if board.turn == 0:
                        player = "a"
                    else:
                        player = "A"
                else:
                    if board.turn == 0:
                        player = "b"
                    else:
                        player = "B"
                self.write_token(
                    str(board.fullmove_number)
                    + player
                    + ". "
                    + board.san(move)
                    + "{"
                    + str(move.move_time)
                    + "} "
                )

            else:
                if board.turn == bugchess.WHITE:
                    self.write_token(str(board.fullmove_number) + ". ")
                elif self.force_movenumber:
                    self.write_token(str(board.fullmove_number) + "... ")
                # Write the SAN.
                self.write_token(board.san(move) + " ")

            self.force_movenumber = False

    def visit_result(self, result: str) -> None:
        self.write_token(result + " ")

    def result(self) -> str:
        if self.current_line:
            return "\n".join(itertools.chain(self.lines, [self.current_line.rstrip()])).rstrip()
        else:
            return "\n".join(self.lines).rstrip()

    def __str__(self) -> str:
        return self.result()


class FileExporter(StringExporter):
    """
    Acts like a :class:`~bugchess.pgn.StringExporter`, but games are written
    directly into a text file.

    There will always be a blank line after each game. Handling encodings is up
    to the caller.

    >>> from bug import chess
    >>>
    >>> game = bugchess.pgn.Game()
    >>>
    >>> new_pgn = open("/dev/null", "w", encoding="utf-8")
    >>> exporter = bugchess.pgn.FileExporter(new_pgn)
    >>> game.accept(exporter)
    """

    def __init__(
        self,
        handle: TextIO,
        *,
        columns: Optional[int] = 80,
        headers: bool = True,
        comments: bool = True,
        variations: bool = True,
    ):
        super().__init__(columns=columns, headers=headers, comments=comments, variations=variations)
        self.handle = handle

    def flush_current_line(self) -> None:
        if self.current_line:
            self.handle.write(self.current_line.rstrip())
            self.handle.write("\n")
        self.current_line = ""

    def write_line(self, line: str = "") -> None:
        self.flush_current_line()
        self.handle.write(line.rstrip())
        self.handle.write("\n")

    def result(self) -> None:
        return None

    def __repr__(self) -> str:
        return "<FileExporter at {:#x}>".format(id(self))

    def __str__(self) -> str:
        return self.__repr__()


def read_game(
    pgn: str, *, Visitor: Callable[[], BaseVisitor[ResultT]] = GameBuilder
) -> Optional[ResultT]:
    """
    Reads a game from a file opened in text mode.

    >>> from bug import chess
    >>>
    >>> pgn = open("data/pgn/kasparov-deep-blue-1997.pgn")
    >>>
    >>> first_game = bugchess.pgn.read_game(pgn)
    >>> second_game = bugchess.pgn.read_game(pgn)
    >>>
    >>> first_game.headers["Event"]
    'IBM Man-Machine, New York USA'
    >>>
    >>> # Iterate through all moves and play them on a board.
    >>> board = first_game.board()
    >>> for move in first_game.mainline_moves():
    ...     board.push(move)
    ...
    >>> board
    Board('4r3/6P1/2p2P1k/1p6/pP2p1R1/P1B5/2P2K2/3r4 b - - 0 45')

    By using text mode, the parser does not need to handle encodings. It is the
    caller's responsibility to open the file with the correct encoding.
    PGN files are usually ASCII or UTF-8 encoded. So, the following should
    cover most relevant cases (ASCII, UTF-8, UTF-8 with BOM).

    >>> pgn = open("data/pgn/kasparov-deep-blue-1997.pgn", encoding="utf-8-sig")

    Use :class:`~io.StringIO` to parse games from a string.

    >>> import io
    >>>
    >>> pgn = io.StringIO("1. e4 e5 2. Nf3 *")
    >>> game = bugchess.pgn.read_game(pgn)

    The end of a game is determined by a completely blank line or the end of
    the file. (Of course, blank lines in comments are possible).

    According to the PGN standard, at least the usual 7 header tags are
    required for a valid game. This parser also handles games without any
    headers just fine.

    The parser is relatively forgiving when it comes to errors. It skips over
    tokens it can not parse. Any exceptions are logged and collected in
    :data:`Game.errors <bugchess.pgn.Game.errors>`. This behavior can be
    :func:`overriden <bugchess.pgn.GameBuilder.handle_error>`.

    Returns the parsed game or ``None`` if the end of file is reached.
    """
    visitor = Visitor()
    # checks if file is bughouse(.bgpn) file
    is_bughouse = True  # handle.name.endswith(".bpgn")
    found_game = False
    skipping_game = False
    headers = None
    managed_headers = None

    # Ignore leading empty lines and comments.
    lines = pgn.splitlines(True)
    line = readLine(lines).lstrip("\ufeff")
    while line.isspace() or line.startswith("%") or line.startswith(";"):
        line = readLine(lines)  # handle.readline()

    # Parse game headers.
    while line:
        # Ignore comments.
        if line.startswith("%") or line.startswith(";"):
            line = readLine(lines)  # handle.readline()
            continue

        # First token of the game.
        if not found_game:
            found_game = True
            skipping_game = visitor.begin_game() is SKIP
            if not skipping_game:
                managed_headers = visitor.begin_headers()
                if not isinstance(managed_headers, Headers):
                    managed_headers = None
                    headers = Headers({})

        if not line.startswith("["):
            break

        if not skipping_game:
            tag_match = TAG_REGEX.match(line)
            if tag_match:
                visitor.visit_header(tag_match.group(1), tag_match.group(2))
                if headers is not None:
                    headers[tag_match.group(1)] = tag_match.group(2)
            else:
                break

        line = readLine(lines)  # handle.readline()

    if not found_game:
        return None

    if not skipping_game:
        skipping_game = visitor.end_headers() is SKIP

    # Ignore single empty line after headers.
    if line.isspace():
        line = readLine(lines)  # handle.readline()

    if not skipping_game:
        # Chess variant.
        headers = managed_headers if headers is None else headers

        if is_bughouse:
            headers["Variant"] = "Bughouse"
        try:
            VariantBoard = headers.variant()
        except ValueError as error:
            visitor.handle_error(error)
            VariantBoard = bugchess.Board

        # Initial position.
        fen = headers.get("FEN", VariantBoard.starting_fen)
        try:
            board_stack = [VariantBoard(fen, chess960=headers.is_chess960())]
        except ValueError as error:
            visitor.handle_error(error)
            skipping_game = True
        else:
            visitor.visit_board(board_stack[0])

    # Fast path: Skip entire game.
    if skipping_game:
        in_comment = False

        while line:
            if not in_comment:
                if line.isspace():
                    break
                elif line.startswith("%"):
                    line = readLine(lines)  # handle.readline()
                    continue

            for match in SKIP_MOVETEXT_REGEX.finditer(line):
                token = match.group(0)
                if token == "{":
                    in_comment = True
                elif not in_comment and token == ";":
                    break
                elif token == "}":
                    in_comment = False

            line = readLine(lines)  # handle.readline()

        visitor.end_game()
        return visitor.result()

    # Parse movetext.
    skip_variation_depth = 0
    half_san = None
    while line:
        read_next_line = True

        # Ignore comments.
        if line.startswith("%") or line.startswith(";"):
            line = readLine(lines)  # handle.readline()
            continue

        # An empty line means the end of a game.
        if line.isspace():
            visitor.end_game()
            return visitor.result()
        for match in MOVETEXT_REGEX.finditer(line):
            token = match.group(0)
            if half_san:
                token = half_san + " " + token
                half_san = None
            if CARRIED_OVER_MOVE_REGEX.match(token):
                half_san = token[:-1]
            elif token.startswith("{"):
                # Consume until the end of the comment.
                line = token[1:]
                comment_lines = []
                while line and "}" not in line:
                    comment_lines.append(line.rstrip())
                    line = lines.pop(0)  # handle.readline()
                end_index = line.find("}")
                comment_lines.append(line[:end_index])
                if "}" in line:
                    line = line[end_index:]
                else:
                    line = ""

                if not skip_variation_depth:
                    visitor.visit_comment("\n".join(comment_lines).strip())

                # Continue with the current or the next line.
                if line:
                    read_next_line = False
                break
            elif token == "(":
                if skip_variation_depth:
                    skip_variation_depth += 1
                elif board_stack[-1].move_stack:
                    if visitor.begin_variation() is SKIP:
                        skip_variation_depth = 1
                    else:
                        board = board_stack[-1].copy()
                        board.pop()
                        board_stack.append(board)
            elif token == ")":
                if skip_variation_depth:
                    skip_variation_depth -= 1
                if len(board_stack) > 1:
                    visitor.end_variation()
                    board_stack.pop()
            elif skip_variation_depth:
                continue
            elif token.startswith(";"):
                break
            elif token.startswith("$"):
                # Found a NAG.
                visitor.visit_nag(int(token[1:]))
            elif token == "?":
                visitor.visit_nag(NAG_MISTAKE)
            elif token == "??":
                visitor.visit_nag(NAG_BLUNDER)
            elif token == "!":
                visitor.visit_nag(NAG_GOOD_MOVE)
            elif token == "!!":
                visitor.visit_nag(NAG_BRILLIANT_MOVE)
            elif token == "!?":
                visitor.visit_nag(NAG_SPECULATIVE_MOVE)
            elif token == "?!":
                visitor.visit_nag(NAG_DUBIOUS_MOVE)
            elif token in ["1-0", "0-1", "1/2-1/2", "*"] and len(board_stack) == 1:
                visitor.visit_result(token)
            else:
                # Parse SAN tokens.
                try:
                    move = visitor.parse_san(board_stack[-1], token)
                except ValueError as error:
                    visitor.handle_error(error)
                    skip_variation_depth = 1
                else:
                    visitor.visit_move(board_stack[-1], move)
                    board_stack[-1].push(move)
                visitor.visit_board(board_stack[-1])

        if read_next_line:
            line = readLine(lines)  # handle.readline()

    visitor.end_game()
    return visitor.result()


def readLine(lines) -> str:
    if lines:
        return lines.pop(0)
    return ""


def read_headers(handle: TextIO) -> Optional[Headers]:
    """
    Reads game headers from a PGN file opened in text mode.

    Since actually parsing many games from a big file is relatively expensive,
    this is a better way to look only for specific games and then seek and
    parse them later.

    This example scans for the first game with Kasparov as the white player.

    >>> from bug import chess
    >>>
    >>> pgn = open("data/pgn/kasparov-deep-blue-1997.pgn")
    >>>
    >>> kasparov_offsets = []
    >>>
    >>> while True:
    ...     offset = pgn.tell()
    ...
    ...     headers = bugchess.pgn.read_headers(pgn)
    ...     if headers is None:
    ...         break
    ...
    ...     if "Kasparov" in headers.get("White", "?"):
    ...         kasparov_offsets.append(offset)

    Then it can later be seeked an parsed.

    >>> for offset in kasparov_offsets:
    ...     pgn.seek(offset)
    ...     bugchess.pgn.read_game(pgn)  # doctest: +ELLIPSIS
    0
    <Game at ... ('Garry Kasparov' vs. 'Deep Blue (Computer)', 1997.??.??)>
    1436
    <Game at ... ('Garry Kasparov' vs. 'Deep Blue (Computer)', 1997.??.??)>
    3067
    <Game at ... ('Garry Kasparov' vs. 'Deep Blue (Computer)', 1997.??.??)>
    """
    return read_game(handle, Visitor=HeadersBuilder)


def skip_game(handle: TextIO) -> bool:
    """
    Skip a game. Returns ``True`` if a game was found and skipped.
    """
    return bool(read_game(handle, Visitor=SkipVisitor))


# TODO: Remove aliases
GameCreator = GameBuilder
HeaderCreator = HeadersBuilder
BoardCreator = BoardBuilder


if __name__ == "__main__":
    import bugchess.pgn

    pgn = """[Event "Live Chess - Bughouse"]
[Site "Chess.com"]
[Date "2022.02.22"]
[Round "?"]
[WhiteA "?"]
[BlackA "?"]
[WhiteB "?"]
[BlackB "?"]
[Result "0-1"]
[Variant "Bughouse"]
[SetUp "1"]
[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR/ w KQkq - 0 1 | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR/ w KQkq - 0 1"]
[ECO "B00"]
[WhiteElo "1911"]
[BlackElo "1887"]
[TimeControl "180"]
[EndTime "8:25:14 PST"]
[Termination "blunderman1 won by checkmate"]

1A. e4 1a. e5 2A. d4 2a. Nc6 3A. dxe5 3a. Nxe5 4A. Nf3 4a. Nxf3+ 5A. gxf3 5a.
Nf6 6A. Rg1 6a. Bc5 7A. Bc4 7a. d5 8A. Bxd5 8a. Nxd5 9A. Qxd5 9a. Bxf2+ 10A.
Kxf2 1B. e4 {[%clk 0:00:01.3]} 1b. e6 {[%clk 0:00:00.1]} 2B. d4 {[%clk
0:00:01.6]} 2b. Be7 {[%clk 0:00:00.1]} 3B. Nc3 {[%clk 0:00:02]} 3b. d6 {[%clk
0:00:00.1]} 4B. Nf3 {[%clk 0:00:02.8]} 4b. Nf6 {[%clk 0:00:00.7]} 5B. Bg5 {[%clk
0:00:04]} 5b. $146@g4 {[%clk 0:00:00.8]} 6B. Qd2 {[%clk 0:00:03.3]} 6b. Nc6 {[%clk
0:00:01]} 7B. Bxf6 {[%clk 0:00:02.2]} 10a. $146@h3+ 11A. Kg2 11a. Qxd5 12A. exd5
7b. Bxf6 {[%clk 0:00:01.1]} 8B. $146@h5 {[%clk 0:00:01.5]} 8b. e5 {[%clk
0:00:05.3]} 9B. Nxf6+ {[%clk 0:00:01.5]} 12a. B@c5 13A. B@a4+ 9b. Qxf6 {[%clk
0:00:01.6]} 10B. B@g5 {[%clk 0:00:01.4]} 10b. B@f4 {[%clk 0:00:08.9]} 11B. Bxf4
{[%clk 0:00:03.4]} 13a. B@d7 11b. exf4 {[%clk 0:00:03.3]} 12B. e5 {[%clk
0:00:01.4]} 12b. @e3 {[%clk 0:00:08.1]} 13B. exf6 {[%clk 0:00:02.6]} 13b. exd2+
{[%clk 0:00:01.3]} 14A. Q@e4+ 14B. Nxd2 {[%clk 0:00:00.4]} 14a. @e7 15A. Bxd7+
15a. Bxd7 16A. B@e3 14b. Nxf6 {[%clk 0:00:04]} 15B. O-O-O {[%clk 0:00:02.7]}
15b. @a3 {[%clk 0:00:08.7]} 16B. bxa3 {[%clk 0:00:01.5]} 16b. Q@a1+ {[%clk
0:00:03]} 17B. Ndb1 {[%clk 0:00:02]} 17b. B@b2+ {[%clk 0:00:04.3]} 18B. Kd2
{[%clk 0:00:00.8]} 18b. Bxc3+ {[%clk 0:00:01.1]} 19B. Nxc3 {[%clk 0:00:00.8]}
19b. $146@e4+ {[%clk 0:00:05.6]} 20B. Nxe4 {[%clk 0:00:02.1]} 16a. $146@f4+ 17A. Qxf4
17a. Nxf4+ 18A. Bxf4 18a. Q@f2+ 19A. Kh1 20b. Nxe4+ {[%clk 0:00:00.9]} 21B. Ke1
{[%clk 0:00:01.8]} 19a. Qxg1# 0-1
    """
    first_game = bugchess.pgn.read_game(pgn)
    print(first_game)
