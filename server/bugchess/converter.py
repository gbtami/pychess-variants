import itertools
from bug import chess

from pgn import BaseVisitor, SkipType
from typing import Optional, Union

SKIP = SkipType.SKIP


class StringExporter(BaseVisitor[str]):
    """
    Allows exporting a game as a string.

    >>> from bug import chess
    >>>
    >>> game = chess.pgn.Game()
    >>>
    >>> exporter = chess.pgn.StringExporter(headers=True, variations=True, comments=True)
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
        self, board: Union[chess.Board, chess.variant.BughouseBoards], move: chess.Move
    ) -> None:
        if self.variations or not self.variation_depth:
            # Write the move number.
            if isinstance(board, chess.variant.BughouseBoards):
                board = board.boards[move.board_id]
                if board.board_id == chess.variant.BOARD_A:
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
                if board.turn == chess.WHITE:
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
