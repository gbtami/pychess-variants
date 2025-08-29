# -*- coding: utf-8 -*-
#
# This file is part of the python-chess library.
# Copyright (C) 2016-2019 Niklas Fiekas <niklas.fiekas@backscattering.de>
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
import copy
import itertools
from collections import OrderedDict
from typing import (
    Dict,
    Generic,
    Hashable,
    Iterable,
    Iterator,
    List,
    Optional,
    Type,
    TypeVar,
    Union,
    Tuple,
)

import bugchess


class SuicideBoard(bugchess.Board):
    aliases = ["Suicide", "Suicide chess"]
    uci_variant = "suicide"
    xboard_variant = "suicide"

    tbw_suffix = ".stbw"
    tbz_suffix = ".stbz"
    tbw_magic = b"\x7b\xf6\x93\x15"
    tbz_magic = b"\xe4\xcf\xe7\x23"
    pawnless_tbw_suffix = ".gtbw"
    pawnless_tbz_suffix = ".gtbz"
    pawnless_tbw_magic = b"\xbc\x55\xbc\x21"
    pawnless_tbz_magic = b"\xd6\xf5\x1b\x50"
    connected_kings = True
    one_king = False
    captures_compulsory = True

    def pin_mask(self, color: bugchess.Color, square: bugchess.Square) -> bugchess.Bitboard:
        return bugchess.BB_ALL

    def _attacked_for_king(self, path: bugchess.Bitboard, occupied: bugchess.Bitboard) -> bool:
        return False

    def _castling_uncovers_rank_attack(
        self, rook_bb: bugchess.Bitboard, king_to: bugchess.Square
    ) -> bool:
        return False

    def is_check(self) -> bool:
        return False

    def is_into_check(self, move: bugchess.Move) -> bool:
        return False

    def was_into_check(self) -> bool:
        return False

    def _material_balance(self) -> int:
        return bugchess.popcount(self.occupied_co[self.turn]) - bugchess.popcount(
            self.occupied_co[not self.turn]
        )

    def is_variant_end(self) -> bool:
        return not all(has_pieces for has_pieces in self.occupied_co)

    def is_variant_win(self) -> bool:
        if not self.occupied_co[self.turn]:
            return True
        else:
            return self.is_stalemate() and self._material_balance() < 0

    def is_variant_loss(self) -> bool:
        if not self.occupied_co[self.turn]:
            return False
        else:
            return self.is_stalemate() and self._material_balance() > 0

    def is_variant_draw(self) -> bool:
        if not self.occupied_co[self.turn]:
            return False
        else:
            return self.is_stalemate() and self._material_balance() == 0

    def has_insufficient_material(self, color: bugchess.Color) -> bool:
        if self.occupied != self.bishops:
            return False

        # In a position with only bishops, check if all our bishops can be
        # captured.
        we_some_on_light = bool(self.occupied_co[color] & bugchess.BB_LIGHT_SQUARES)
        we_some_on_dark = bool(self.occupied_co[color] & bugchess.BB_DARK_SQUARES)
        they_all_on_dark = not (self.occupied_co[not color] & bugchess.BB_LIGHT_SQUARES)
        they_all_on_light = not (self.occupied_co[not color] & bugchess.BB_DARK_SQUARES)
        return (we_some_on_light and they_all_on_dark) or (we_some_on_dark and they_all_on_light)

    def generate_pseudo_legal_moves(
        self,
        from_mask: bugchess.Bitboard = bugchess.BB_ALL,
        to_mask: bugchess.Bitboard = bugchess.BB_ALL,
    ) -> Iterator[bugchess.Move]:
        for move in super().generate_pseudo_legal_moves(from_mask, to_mask):
            # Add king promotions.
            if move.promotion == bugchess.QUEEN:
                yield bugchess.Move(
                    move.from_square, move.to_square, bugchess.KING, board_id=self._board_id
                )

            yield move

    def generate_legal_moves(
        self,
        from_mask: bugchess.Bitboard = bugchess.BB_ALL,
        to_mask: bugchess.Bitboard = bugchess.BB_ALL,
    ) -> Iterator[bugchess.Move]:
        if self.is_variant_end():
            return

        # Generate captures first.
        found_capture = False
        for move in self.generate_pseudo_legal_captures():
            if (
                bugchess.BB_SQUARES[move.from_square] & from_mask
                and bugchess.BB_SQUARES[move.to_square] & to_mask
            ):
                yield move
            found_capture = True

        # Captures are mandatory. Stop here if any were found.
        if not found_capture:
            not_them = to_mask & ~self.occupied_co[not self.turn]
            for move in self.generate_pseudo_legal_moves(from_mask, not_them):
                if not self.is_en_passant(move):
                    yield move

    def is_legal(self, move: bugchess.Move) -> bool:
        if not super().is_legal(move):
            return False

        if self.is_capture(move):
            return True
        else:
            return not any(self.generate_pseudo_legal_captures())

    def _transposition_key(self) -> Hashable:
        if self.has_chess960_castling_rights():
            return (super()._transposition_key(), self.kings & self.promoted)
        else:
            return super()._transposition_key()

    def board_fen(self, promoted: Optional[bool] = None) -> str:
        if promoted is None:
            promoted = self.has_chess960_castling_rights()
        return super().board_fen(promoted=promoted)

    def status(self) -> bugchess.Status:
        status = super().status()
        status &= ~bugchess.STATUS_NO_WHITE_KING
        status &= ~bugchess.STATUS_NO_BLACK_KING
        status &= ~bugchess.STATUS_TOO_MANY_KINGS
        status &= ~bugchess.STATUS_OPPOSITE_CHECK
        return status


class GiveawayBoard(SuicideBoard):
    aliases = ["Giveaway", "Giveaway chess", "Anti", "Antichess", "Anti chess"]
    uci_variant = "giveaway"
    xboard_variant = "giveaway"
    starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"

    tbw_suffix = ".gtbw"
    tbz_suffix = ".gtbz"
    tbw_magic = b"\xbc\x55\xbc\x21"
    tbz_magic = b"\xd6\xf5\x1b\x50"
    pawnless_tbw_suffix = ".stbw"
    pawnless_tbz_suffix = ".stbz"
    pawnless_tbw_magic = b"\x7b\xf6\x93\x15"
    pawnless_tbz_magic = b"\xe4\xcf\xe7\x23"

    def __init__(self, fen: Optional[str] = starting_fen, chess960: bool = False) -> None:
        super().__init__(fen, chess960=chess960)

    def reset(self) -> None:
        super().reset()
        self.castling_rights = bugchess.BB_EMPTY

    def is_variant_win(self) -> bool:
        return not self.occupied_co[self.turn] or self.is_stalemate()

    def is_variant_loss(self) -> bool:
        return False

    def is_variant_draw(self) -> bool:
        return False


class AtomicBoard(bugchess.Board):
    aliases = ["Atomic", "Atom", "Atomic chess"]
    uci_variant = "atomic"
    xboard_variant = "atomic"

    tbw_suffix = ".atbw"
    tbz_suffix = ".atbz"
    tbw_magic = b"\x55\x8d\xa4\x49"
    tbz_magic = b"\x91\xa9\x5e\xeb"
    connected_kings = True
    one_king = True

    def is_variant_end(self) -> bool:
        return not all(self.kings & side for side in self.occupied_co)

    def is_variant_win(self) -> bool:
        return bool(self.kings and not self.kings & self.occupied_co[not self.turn])

    def is_variant_loss(self) -> bool:
        return bool(self.kings and not self.kings & self.occupied_co[self.turn])

    def has_insufficient_material(self, color: bugchess.Color) -> bool:
        # Remaining material does not matter if opponent's king is already
        # exploded.
        if not (self.occupied_co[not color] & self.kings):
            return False

        # Bare king can not mate.
        if not (self.occupied_co[color] & ~self.kings):
            return True

        # As long as the opponent's king is not alone, there is always a chance
        # their own pieces explode next to it.
        if self.occupied_co[not color] & ~self.kings:
            # Unless there are only bishops that cannot explode each other.
            if self.occupied == self.bishops | self.kings:
                if not (self.bishops & self.occupied_co[bugchess.WHITE] & bugchess.BB_DARK_SQUARES):
                    return not (
                        self.bishops & self.occupied_co[bugchess.BLACK] & bugchess.BB_LIGHT_SQUARES
                    )
                if not (
                    self.bishops & self.occupied_co[bugchess.WHITE] & bugchess.BB_LIGHT_SQUARES
                ):
                    return not (
                        self.bishops & self.occupied_co[bugchess.BLACK] & bugchess.BB_DARK_SQUARES
                    )
            return False

        # Queen or pawn (future queen) can give mate against bare king.
        if self.queens or self.pawns:
            return False

        # Single knight, bishop or rook cannot mate against bare king.
        if bugchess.popcount(self.knights | self.bishops | self.rooks) == 1:
            return True

        # Two knights cannot mate against bare king.
        if self.occupied == self.knights | self.kings:
            return bugchess.popcount(self.knights) <= 2

        return False

    def _attacked_for_king(self, path: bugchess.Bitboard, occupied: bugchess.Bitboard) -> bool:
        # Can castle onto attacked squares if they are connected to the
        # enemy king.
        enemy_kings = self.kings & self.occupied_co[not self.turn]
        for enemy_king in bugchess.scan_forward(enemy_kings):
            path &= ~bugchess.BB_KING_ATTACKS[enemy_king]

        return super()._attacked_for_king(path, occupied)

    def _castling_uncovers_rank_attack(
        self, rook_bb: bugchess.Bitboard, king_to: bugchess.Square
    ) -> bool:
        return bool(
            not bugchess.BB_KING_ATTACKS[king_to] & self.kings & self.occupied_co[not self.turn]
        ) and super()._castling_uncovers_rank_attack(rook_bb, king_to)

    def _kings_connected(self) -> bool:
        white_kings = self.kings & self.occupied_co[bugchess.WHITE]
        black_kings = self.kings & self.occupied_co[bugchess.BLACK]
        return any(
            bugchess.BB_KING_ATTACKS[sq] & black_kings for sq in bugchess.scan_forward(white_kings)
        )

    def _push_capture(
        self,
        move: bugchess.Move,
        capture_square: bugchess.Square,
        piece_type: bugchess.PieceType,
        was_promoted: bool,
    ) -> None:
        # Explode the capturing piece.
        self._remove_piece_at(move.to_square)

        # Explode all non pawns around.
        explosion_radius = bugchess.BB_KING_ATTACKS[move.to_square] & ~self.pawns
        for explosion in bugchess.scan_forward(explosion_radius):
            self._remove_piece_at(explosion)

        # Destroy castling rights.
        self.castling_rights &= ~explosion_radius

    def is_check(self) -> bool:
        return not self._kings_connected() and super().is_check()

    def was_into_check(self) -> bool:
        return not self._kings_connected() and super().was_into_check()

    def is_into_check(self, move: bugchess.Move) -> bool:
        self.push(move)
        was_into_check = self.was_into_check()
        self.pop()
        return was_into_check

    def is_legal(self, move: bugchess.Move) -> bool:
        if self.is_variant_end():
            return False

        if not self.is_pseudo_legal(move):
            return False

        self.push(move)
        legal = (
            bool(self.kings)
            and not self.is_variant_win()
            and (self.is_variant_loss() or not self.was_into_check())
        )
        self.pop()

        return legal

    def is_stalemate(self) -> bool:
        return not self.is_variant_loss() and super().is_stalemate()

    def generate_legal_moves(
        self,
        from_mask: bugchess.Bitboard = bugchess.BB_ALL,
        to_mask: bugchess.Bitboard = bugchess.BB_ALL,
    ) -> Iterator[bugchess.Move]:
        for move in self.generate_pseudo_legal_moves(from_mask, to_mask):
            if self.is_legal(move):
                yield move

    def status(self) -> bugchess.Status:
        status = super().status()
        status &= ~bugchess.STATUS_OPPOSITE_CHECK
        if self.turn == bugchess.WHITE:
            status &= ~bugchess.STATUS_NO_WHITE_KING
        else:
            status &= ~bugchess.STATUS_NO_BLACK_KING
        return status


class KingOfTheHillBoard(bugchess.Board):
    aliases = ["King of the Hill", "KOTH"]
    uci_variant = "kingofthehill"
    xboard_variant = "kingofthehill"  # Unofficial

    tbw_suffix = None
    tbz_suffix = None
    tbw_magic = None
    tbz_magic = None

    def is_variant_end(self) -> bool:
        return bool(self.kings & bugchess.BB_CENTER)

    def is_variant_win(self) -> bool:
        return bool(self.kings & self.occupied_co[self.turn] & bugchess.BB_CENTER)

    def is_variant_loss(self) -> bool:
        return bool(self.kings & self.occupied_co[not self.turn] & bugchess.BB_CENTER)

    def has_insufficient_material(self, color: bugchess.Color) -> bool:
        return False


class RacingKingsBoard(bugchess.Board):
    aliases = ["Racing Kings", "Racing", "Race", "racingkings"]
    uci_variant = "racingkings"
    xboard_variant = "racingkings"  # Unofficial
    starting_fen = "8/8/8/8/8/8/krbnNBRK/qrbnNBRQ w - - 0 1"

    tbw_suffix = None
    tbz_suffix = None
    tbw_magic = None
    tbz_magic = None

    def __init__(self, fen: Optional[str] = starting_fen, chess960: bool = False) -> None:
        super().__init__(fen, chess960=chess960)

    def reset(self) -> None:
        self.set_fen(type(self).starting_fen)

    def _gives_check(self, move: bugchess.Move) -> bool:
        self.push(move)
        gives_check = self.is_check()
        self.pop()
        return gives_check

    def is_legal(self, move: bugchess.Move) -> bool:
        return super().is_legal(move) and not self._gives_check(move)

    def generate_legal_moves(
        self,
        from_mask: bugchess.Bitboard = bugchess.BB_ALL,
        to_mask: bugchess.Bitboard = bugchess.BB_ALL,
    ) -> Iterator[bugchess.Move]:
        for move in super().generate_legal_moves(from_mask, to_mask):
            if not self._gives_check(move):
                yield move

    def is_variant_end(self) -> bool:
        if not self.kings & bugchess.BB_RANK_8:
            return False

        if (
            self.turn == bugchess.WHITE
            or self.kings & self.occupied_co[bugchess.BLACK] & bugchess.BB_RANK_8
        ):
            return True

        black_kings = self.kings & self.occupied_co[bugchess.BLACK]
        if not black_kings:
            return True

        black_king = bugchess.msb(black_kings)

        # White has reached the backrank. The game is over if black can not
        # also reach the backrank on the next move. Check if there are any
        # safe squares for the king.
        targets = bugchess.BB_KING_ATTACKS[black_king] & bugchess.BB_RANK_8
        return all(
            self.attackers_mask(bugchess.WHITE, target) for target in bugchess.scan_forward(targets)
        )

    def is_variant_draw(self) -> bool:
        in_goal = self.kings & bugchess.BB_RANK_8
        return all(in_goal & side for side in self.occupied_co)

    def is_variant_loss(self) -> bool:
        return (
            self.is_variant_end()
            and not self.kings & self.occupied_co[self.turn] & bugchess.BB_RANK_8
        )

    def is_variant_win(self) -> bool:
        return self.is_variant_end() and bool(
            self.kings & self.occupied_co[self.turn] & bugchess.BB_RANK_8
        )

    def has_insufficient_material(self, color: bugchess.Color) -> bool:
        return False

    def status(self) -> bugchess.Status:
        status = super().status()
        if self.is_check():
            status |= bugchess.STATUS_RACE_CHECK
        if self.turn == bugchess.BLACK and all(
            self.occupied_co[co] & self.kings & bugchess.BB_RANK_8 for co in bugchess.COLORS
        ):
            status |= bugchess.STATUS_RACE_OVER
        if self.pawns:
            status |= bugchess.STATUS_RACE_MATERIAL
        for color in bugchess.COLORS:
            if bugchess.popcount(self.occupied_co[color] & self.knights) > 2:
                status |= bugchess.STATUS_RACE_MATERIAL
            if bugchess.popcount(self.occupied_co[color] & self.bishops) > 2:
                status |= bugchess.STATUS_RACE_MATERIAL
            if bugchess.popcount(self.occupied_co[color] & self.rooks) > 2:
                status |= bugchess.STATUS_RACE_MATERIAL
            if bugchess.popcount(self.occupied_co[color] & self.queens) > 1:
                status |= bugchess.STATUS_RACE_MATERIAL
        return status


class HordeBoard(bugchess.Board):
    aliases = ["Horde", "Horde chess"]
    uci_variant = "horde"
    xboard_variant = "horde"  # Unofficial
    starting_fen = "rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1"

    tbw_suffix = None
    tbz_suffix = None
    tbw_magic = None
    tbz_magic = None

    def __init__(self, fen: Optional[str] = starting_fen, chess960: bool = False) -> None:
        super().__init__(fen, chess960=chess960)

    def reset(self) -> None:
        self.set_fen(type(self).starting_fen)

    def is_variant_end(self) -> bool:
        return not all(has_pieces for has_pieces in self.occupied_co)

    def is_variant_draw(self) -> bool:
        return not self.occupied

    def is_variant_loss(self) -> bool:
        return bool(self.occupied) and not self.occupied_co[self.turn]

    def is_variant_win(self) -> bool:
        return bool(self.occupied) and not self.occupied_co[not self.turn]

    def has_insufficient_material(self, color: bugchess.Color) -> bool:
        # TODO: Could detect some cases where the Horde can no longer mate.
        return False

    def status(self) -> bugchess.Status:
        status = super().status()
        status &= ~bugchess.STATUS_NO_WHITE_KING

        if bugchess.popcount(self.occupied_co[bugchess.WHITE]) <= 36:
            status &= ~bugchess.STATUS_TOO_MANY_WHITE_PIECES
            status &= ~bugchess.STATUS_TOO_MANY_WHITE_PAWNS

        if (
            not self.pawns & bugchess.BB_RANK_8
            and not self.occupied_co[bugchess.BLACK] & self.pawns & bugchess.BB_RANK_1
        ):
            status &= ~bugchess.STATUS_PAWNS_ON_BACKRANK

        if self.occupied_co[bugchess.WHITE] & self.kings:
            status |= bugchess.STATUS_TOO_MANY_KINGS

        return status


ThreeCheckBoardT = TypeVar("ThreeCheckBoardT", bound="ThreeCheckBoard")


class _ThreeCheckBoardState(Generic[ThreeCheckBoardT], bugchess._BoardState["ThreeCheckBoardT"]):
    def __init__(self, board: "ThreeCheckBoardT") -> None:
        super().__init__(board)
        self.remaining_checks_w = board.remaining_checks[bugchess.WHITE]
        self.remaining_checks_b = board.remaining_checks[bugchess.BLACK]

    def restore(self, board: "ThreeCheckBoardT") -> None:
        super().restore(board)
        board.remaining_checks[bugchess.WHITE] = self.remaining_checks_w
        board.remaining_checks[bugchess.BLACK] = self.remaining_checks_b


class ThreeCheckBoard(bugchess.Board):
    aliases = ["Three-check", "Three check", "Threecheck", "Three check chess"]
    uci_variant = "3check"
    xboard_variant = "3check"
    starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 3+3 0 1"

    tbw_suffix = None
    tbz_suffix = None
    tbw_magic = None
    tbz_magic = None

    def __init__(self, fen: Optional[str] = starting_fen, chess960: bool = False) -> None:
        self.remaining_checks = [3, 3]
        super().__init__(fen, chess960=chess960)

    def reset_board(self) -> None:
        super().reset_board()
        self.remaining_checks[bugchess.WHITE] = 3
        self.remaining_checks[bugchess.BLACK] = 3

    def clear_board(self) -> None:
        super().clear_board()
        self.remaining_checks[bugchess.WHITE] = 3
        self.remaining_checks[bugchess.BLACK] = 3

    def _board_state(self: ThreeCheckBoardT) -> _ThreeCheckBoardState[ThreeCheckBoardT]:
        return _ThreeCheckBoardState(self)

    def push(self, move: bugchess.Move) -> None:
        super().push(move)
        if self.is_check():
            self.remaining_checks[not self.turn] -= 1

    def has_insufficient_material(self, color: bugchess.Color) -> bool:
        # Any remaining piece can give check.
        return not (self.occupied_co[color] & ~self.kings)

    def set_epd(
        self, epd: str
    ) -> Dict[str, Union[None, str, int, float, bugchess.Move, List[bugchess.Move]]]:
        parts = epd.strip().rstrip(";").split(None, 5)

        # Parse ops.
        if len(parts) > 5:
            operations = self._parse_epd_ops(
                parts.pop(), lambda: type(self)(" ".join(parts) + " 0 1")
            )
            parts.append(str(operations["hmvc"]) if "hmvc" in operations else "0")
            parts.append(str(operations["fmvn"]) if "fmvn" in operations else "1")
            self.set_fen(" ".join(parts))
            return operations
        else:
            self.set_fen(epd)
            return {}

    def set_fen(self, fen: str) -> None:
        parts = fen.split()

        # Extract check part.
        if len(parts) >= 7 and parts[6][0] == "+":
            check_part = parts.pop(6)
            try:
                w, b = check_part[1:].split("+", 1)
                wc, bc = 3 - int(w), 3 - int(b)
            except ValueError:
                raise ValueError(
                    "invalid check part in lichess three-check fen: {}".format(repr(check_part))
                )
        elif len(parts) >= 5 and "+" in parts[4]:
            check_part = parts.pop(4)
            try:
                w, b = check_part.split("+", 1)
                wc, bc = int(w), int(b)
            except ValueError:
                raise ValueError(
                    "invalid check part in three-check fen: {}".format(repr(check_part))
                )
        else:
            wc, bc = 3, 3

        # Set fen.
        super().set_fen(" ".join(parts))
        self.remaining_checks[bugchess.WHITE] = wc
        self.remaining_checks[bugchess.BLACK] = bc

    def epd(
        self,
        shredder: bool = False,
        en_passant: str = "legal",
        promoted: Optional[bool] = None,
        **operations: Union[None, str, int, float, bugchess.Move, Iterable[bugchess.Move]],
    ) -> str:
        epd = [
            super().epd(shredder=shredder, en_passant=en_passant, promoted=promoted),
            "{:d}+{:d}".format(
                max(self.remaining_checks[bugchess.WHITE], 0),
                max(self.remaining_checks[bugchess.BLACK], 0),
            ),
        ]
        if operations:
            epd.append(self._epd_operations(operations))
        return " ".join(epd)

    def is_variant_end(self) -> bool:
        return any(remaining_checks <= 0 for remaining_checks in self.remaining_checks)

    def is_variant_draw(self) -> bool:
        return (
            self.remaining_checks[bugchess.WHITE] <= 0
            and self.remaining_checks[bugchess.BLACK] <= 0
        )

    def is_variant_loss(self) -> bool:
        return self.remaining_checks[not self.turn] <= 0 < self.remaining_checks[self.turn]

    def is_variant_win(self) -> bool:
        return self.remaining_checks[self.turn] <= 0 < self.remaining_checks[not self.turn]

    def is_irreversible(self, move: bugchess.Move) -> bool:
        if super().is_irreversible(move):
            return True

        self.push(move)
        gives_check = self.is_check()
        self.pop()
        return gives_check

    def _transposition_key(self) -> Hashable:
        return (
            super()._transposition_key(),
            self.remaining_checks[bugchess.WHITE],
            self.remaining_checks[bugchess.BLACK],
        )

    def copy(self: ThreeCheckBoardT, stack: Union[bool, int] = True) -> ThreeCheckBoardT:
        board = super().copy(stack=stack)
        board.remaining_checks = self.remaining_checks.copy()
        return board

    def mirror(self: ThreeCheckBoardT) -> ThreeCheckBoardT:
        board = super().mirror()
        board.remaining_checks[bugchess.WHITE] = self.remaining_checks[bugchess.BLACK]
        board.remaining_checks[bugchess.BLACK] = self.remaining_checks[bugchess.WHITE]
        return board


CrazyhouseBoardT = TypeVar("CrazyhouseBoardT", bound="CrazyhouseBoard")


class _CrazyhouseBoardState(Generic[CrazyhouseBoardT], bugchess._BoardState["CrazyhouseBoardT"]):
    def __init__(self, board: "CrazyhouseBoardT") -> None:
        super().__init__(board)
        self.pockets_w = board.pockets[bugchess.WHITE].copy()
        self.pockets_b = board.pockets[bugchess.BLACK].copy()

    def restore(self, board: "CrazyhouseBoardT") -> None:
        super().restore(board)
        board.pockets[bugchess.WHITE] = self.pockets_w.copy()
        board.pockets[bugchess.BLACK] = self.pockets_b.copy()


CrazyhousePocketT = TypeVar("CrazyhousePocketT", bound="CrazyhousePocket")


class CrazyhousePocket:
    def __init__(self, color: bool, symbols: Iterable[str] = "") -> None:
        symbols = list(symbols)
        self.pieces = OrderedDict(
            [(p, symbols.count(bugchess.PIECE_SYMBOLS[p])) for p in bugchess.PIECE_TYPES]
        )
        self._color = color

    def add(self, pt: bugchess.PieceType) -> None:
        self.pieces[pt] += 1

    def remove(self, pt: bugchess.PieceType) -> None:
        self.pieces[pt] -= 1

    def count(self, piece_type: bugchess.PieceType) -> int:
        return self.pieces[piece_type]

    def reset(self) -> None:
        self.pieces = OrderedDict([(p, 0) for p in bugchess.PIECE_TYPES])

    def __str__(self) -> str:
        return "".join(
            bugchess.piece_symbol(pt) * self.count(pt) for pt in reversed(bugchess.PIECE_TYPES)
        )

    def __len__(self) -> int:
        return sum(self.pieces.values())

    def __repr__(self) -> str:
        return "CrazyhousePocket('{}')".format(str(self))

    def _repr_svg_(self) -> str:
        import bugchess.svg

        return bugchess.svg.pocket(self, width=400)

    def copy(self: CrazyhousePocketT) -> CrazyhousePocketT:
        pocket = type(self)(self.color)
        pocket.pieces = copy.copy(self.pieces)
        return pocket

    @property
    def color(self) -> bool:
        return self._color


class CrazyhouseBoard(bugchess.Board):
    aliases = ["Crazyhouse", "Crazy House", "House", "ZH"]
    uci_variant = "crazyhouse"
    xboard_variant = "crazyhouse"
    starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1"

    tbw_suffix = None
    tbz_suffix = None
    tbw_magic = None
    tbz_magic = None

    def __init__(
        self,
        fen: Optional[str] = starting_fen,
        chess960: bool = False,
        board_id: Optional[int] = None,
    ):
        self.pockets = [CrazyhousePocket(bugchess.BLACK), CrazyhousePocket(bugchess.WHITE)]
        super().__init__(fen, chess960=chess960, board_id=board_id)

    def reset_board(self) -> None:
        super().reset_board()
        self.pockets[bugchess.WHITE].reset()
        self.pockets[bugchess.BLACK].reset()

    def clear_board(self) -> None:
        super().clear_board()
        self.pockets[bugchess.WHITE].reset()
        self.pockets[bugchess.BLACK].reset()

    def _board_state(self: CrazyhouseBoardT) -> _CrazyhouseBoardState[CrazyhouseBoardT]:
        return _CrazyhouseBoardState(self)

    def push(self, move: bugchess.Move) -> None:
        super().push(move)
        if move.drop:
            self.pockets[not self.turn].remove(move.drop)

    def _push_capture(
        self,
        move: bugchess.Move,
        capture_square: bugchess.Square,
        piece_type: bugchess.PieceType,
        was_promoted: bool,
    ) -> None:
        if was_promoted:
            self.pockets[self.turn].add(bugchess.PAWN)
        else:
            self.pockets[self.turn].add(piece_type)

    def can_claim_fifty_moves(self) -> bool:
        return False

    def is_seventyfive_moves(self) -> bool:
        return False

    def is_irreversible(self, move: bugchess.Move) -> bool:
        backrank = bugchess.BB_RANK_1 if self.turn == bugchess.WHITE else bugchess.BB_RANK_8
        castling_rights = self.clean_castling_rights() & backrank
        return bool(
            castling_rights
            and bugchess.BB_SQUARES[move.from_square] & self.kings & ~self.promoted
            or castling_rights & bugchess.BB_SQUARES[move.from_square]
            or castling_rights & bugchess.BB_SQUARES[move.to_square]
        )

    def _transposition_key(self) -> Hashable:
        return (
            super()._transposition_key(),
            self.promoted,
            tuple(self.pockets[bugchess.WHITE].pieces.values()),
            tuple(self.pockets[bugchess.BLACK].pieces.values()),
        )

    def legal_drop_squares_mask(self) -> bugchess.Bitboard:
        king = self.king(self.turn)
        if king is None:
            return ~self.occupied

        king_attackers = self.attackers_mask(not self.turn, king)

        if not king_attackers:
            return ~self.occupied
        elif bugchess.popcount(king_attackers) == 1:
            return bugchess.BB_BETWEEN[king][bugchess.msb(king_attackers)] & ~self.occupied
        else:
            return bugchess.BB_EMPTY

    def legal_drop_squares(self) -> bugchess.SquareSet:
        return bugchess.SquareSet(self.legal_drop_squares_mask())

    def is_pseudo_legal(self, move: bugchess.Move) -> bool:
        if move.drop and move.from_square == move.to_square:
            return (
                move.drop != bugchess.KING
                and not bugchess.BB_SQUARES[move.to_square] & self.occupied
                and not (
                    move.drop == bugchess.PAWN
                    and bugchess.BB_SQUARES[move.to_square] & bugchess.BB_BACKRANKS
                )
                and self.pockets[self.turn].count(move.drop) > 0
            )
        else:
            return super().is_pseudo_legal(move)

    def is_legal(self, move: bugchess.Move) -> bool:
        if move.drop:
            return self.is_pseudo_legal(move) and bool(
                self.legal_drop_squares_mask() & bugchess.BB_SQUARES[move.to_square]
            )
        else:
            return super().is_legal(move)

    def generate_pseudo_legal_drops(
        self, to_mask: bugchess.Bitboard = bugchess.BB_ALL
    ) -> Iterator[bugchess.Move]:
        for to_square in bugchess.scan_forward(to_mask & ~self.occupied):
            for pt, count in self.pockets[self.turn].pieces.items():
                if count and (
                    pt != bugchess.PAWN
                    or not bugchess.BB_BACKRANKS & bugchess.BB_SQUARES[to_square]
                ):
                    yield bugchess.Move(to_square, to_square, drop=pt, board_id=self.board_id)

    def generate_legal_drops(
        self, to_mask: bugchess.Bitboard = bugchess.BB_ALL
    ) -> Iterator[bugchess.Move]:
        return self.generate_pseudo_legal_drops(to_mask=self.legal_drop_squares_mask() & to_mask)

    def generate_legal_moves(
        self,
        from_mask: bugchess.Bitboard = bugchess.BB_ALL,
        to_mask: bugchess.Bitboard = bugchess.BB_ALL,
    ) -> Iterator[bugchess.Move]:
        return itertools.chain(
            super().generate_legal_moves(from_mask, to_mask),
            self.generate_legal_drops(from_mask & to_mask),
        )

    def parse_san(self, san: str) -> bugchess.Move:
        if "@" in san:
            uci = san.rstrip("+# ")
            if uci[0] == "@":
                uci = "P" + uci
            move = bugchess.Move.from_uci(uci)
            if not self.is_legal(move):
                raise ValueError("illegal drop san: {} in {}".format(repr(san), self.fen()))
            return move
        else:
            return super().parse_san(san)

    def has_insufficient_material(self, color: bugchess.Color) -> bool:
        # In practise no material can leave the game, but this is easy to
        # implement anyway. Note that bishops can be captured and put onto
        # a different color complex.
        return (
            bugchess.popcount(self.occupied) + sum(len(pocket) for pocket in self.pockets) <= 3
            and not self.pawns
            and not self.rooks
            and not self.queens
            and not any(pocket.count(bugchess.PAWN) for pocket in self.pockets)
            and not any(pocket.count(bugchess.ROOK) for pocket in self.pockets)
            and not any(pocket.count(bugchess.QUEEN) for pocket in self.pockets)
        )

    def set_fen(self, fen: str) -> None:
        position_part, info_part = fen.split(None, 1)

        # Transform to lichess-style ZH FEN.
        if position_part.endswith("]"):
            if position_part.count("/") != 7:
                raise ValueError(
                    "expected 8 rows in position part of zh fen: {}", format(repr(fen))
                )
            position_part = position_part[:-1].replace("[", "/", 1)

        # Split off pocket part.
        if position_part.count("/") == 8:
            position_part, pocket_part = position_part.rsplit("/", 1)
        else:
            pocket_part = ""

        # Parse pocket.
        white_pocket = CrazyhousePocket(
            bugchess.WHITE, (c.lower() for c in pocket_part if c.isupper())
        )
        black_pocket = CrazyhousePocket(bugchess.BLACK, (c for c in pocket_part if not c.isupper()))

        # Set FEN and pockets.
        super().set_fen(position_part + " " + info_part)
        self.pockets[bugchess.WHITE] = white_pocket
        self.pockets[bugchess.BLACK] = black_pocket

    def board_fen(self, promoted: Optional[bool] = None) -> str:
        if promoted is None:
            promoted = True
        return super().board_fen(promoted=promoted)

    def epd(
        self,
        shredder: bool = False,
        en_passant: str = "legal",
        promoted: Optional[bool] = None,
        **operations: Union[None, str, int, float, bugchess.Move, Iterable[bugchess.Move]],
    ) -> str:
        epd = super().epd(shredder=shredder, en_passant=en_passant, promoted=promoted)
        board_part, info_part = epd.split(" ", 1)
        return "{}[{}{}] {}".format(
            board_part,
            str(self.pockets[bugchess.WHITE]).upper(),
            str(self.pockets[bugchess.BLACK]),
            info_part,
        )

    def copy(self: CrazyhouseBoardT, stack: Union[bool, int] = True) -> CrazyhouseBoardT:
        board = super().copy(stack=stack)
        board.pockets[bugchess.WHITE] = self.pockets[bugchess.WHITE].copy()
        board.pockets[bugchess.BLACK] = self.pockets[bugchess.BLACK].copy()
        return board

    def mirror(self: CrazyhouseBoardT) -> CrazyhouseBoardT:
        board = super().mirror()
        board.pockets[bugchess.WHITE] = self.pockets[bugchess.BLACK].copy()
        board.pockets[bugchess.BLACK] = self.pockets[bugchess.WHITE].copy()
        return board

    def status(self) -> bugchess.Status:
        status = super().status()

        if (
            bugchess.popcount(self.pawns)
            + self.pockets[bugchess.WHITE].count(bugchess.PAWN)
            + self.pockets[bugchess.BLACK].count(bugchess.PAWN)
            <= 16
        ):
            status &= ~bugchess.STATUS_TOO_MANY_BLACK_PAWNS
            status &= ~bugchess.STATUS_TOO_MANY_WHITE_PAWNS

        if (
            bugchess.popcount(self.occupied)
            + len(self.pockets[bugchess.WHITE])
            + len(self.pockets[bugchess.BLACK])
            <= 32
        ):
            status &= ~bugchess.STATUS_TOO_MANY_BLACK_PIECES
            status &= ~bugchess.STATUS_TOO_MANY_WHITE_PIECES

        return status


SingleBughouseBoardT = TypeVar("SingleBughouseBoardT", bound="SingleBughouseBoard")


class _SingleBughouseBoardState(
    Generic[SingleBughouseBoardT], bugchess._BoardState["SingleBughouseBoardT"]
):
    def __init__(self, board: "CrazyhouseBoardT", disable_pocket_saving: bool = False) -> None:
        super().__init__(board)
        if not disable_pocket_saving:
            self.pockets_w = board.pockets[bugchess.WHITE].copy()
            self.pockets_b = board.pockets[bugchess.BLACK].copy()
        else:
            self.pockets_b = self.pockets_w = None

    def restore(self, board: "CrazyhouseBoardT", restore_pockets: bool = True) -> None:
        super().restore(board)
        if self.pockets_b is not None and restore_pockets:
            board.pockets[bugchess.WHITE] = self.pockets_w.copy()
            board.pockets[bugchess.BLACK] = self.pockets_b.copy()


class SingleBughouseBoard(CrazyhouseBoard):
    def __init__(
        self,
        bughouse_boards: "BughouseBoards",
        board_id: int,
        fen: Optional[str] = CrazyhouseBoard.starting_fen,
        chess960: bool = False,
    ) -> None:
        self._bughouse_boards = bughouse_boards
        self.disable_pocket_saving = False
        super().__init__(fen, chess960=chess960, board_id=board_id)

    def _push_capture(
        self,
        move: bugchess.Move,
        capture_square: bugchess.Square,
        piece_type: bugchess.PieceType,
        was_promoted: bool,
    ) -> None:
        if was_promoted:
            self._other_board.pockets[not self.turn].add(bugchess.PAWN)
        else:
            self._other_board.pockets[not self.turn].add(piece_type)

    def _push(self, move: bugchess.Move):
        super().push(move)

    def push(self, move: bugchess.Move):
        move.board_id = self.board_id
        self._bughouse_boards.push(move)

    def pop(self) -> bugchess.Move:
        return self._bughouse_boards.pop(self.board_id)

    def _board_state(self: SingleBughouseBoardT) -> _SingleBughouseBoardState[SingleBughouseBoardT]:
        return _SingleBughouseBoardState(self, self.disable_pocket_saving)

    def _pop(self) -> bugchess.Move:
        captured_piece_type = None
        pockets = self.pockets
        move = self.move_stack.pop()
        self._stack.pop().restore(self, restore_pockets=False)
        self._transposition_counter[self._transposition_key()] -= 1
        if move.drop is not None:
            pockets[self.turn].add(move.drop)
        elif self.is_en_passant(move):
            captured_piece_type = bugchess.PAWN
        else:
            captured_piece = self.piece_at(move.to_square)
            if captured_piece is not None:
                was_promoted = bool(self.promoted & bugchess.BB_SQUARES[move.to_square])
                captured_piece_type = (
                    captured_piece.piece_type if not was_promoted else bugchess.PAWN
                )
        if captured_piece_type is not None:
            partner_pocket = self._other_board.pockets[int(not self.turn)]
            if partner_pocket.count(captured_piece_type) == 0:
                raise ValueError("Cannot undo move, please undo move on other board first.")
            partner_pocket.remove(captured_piece_type)
        return move

    def is_checkmate(self) -> bool:
        if super().is_checkmate():
            # if self._other_board.turn != self.turn and self._other_board.is_temporary_checkmate():
            #     return True
            potential_pocket = CrazyhousePocket(self.turn)
            potential_pocket.pieces = {p: 1 for p in bugchess.PIECE_TYPES[:-1]}

            return not any(True for _ in self.generate_legal_drops(virtual_pocket=potential_pocket))
        else:
            return False

    def is_temporary_checkmate(self) -> bool:
        """
        Checks whether a player is checkmated by crazyhouse rules and can thus only hope to get material from his
        partner to avoid defeat.
        :return:
        """
        return super().is_checkmate()

    def _generate_pseudo_legal_drops_vp(
        self,
        to_mask: bugchess.Bitboard = bugchess.BB_ALL,
        virtual_pocket: Optional[CrazyhousePocket] = None,
    ) -> Iterator[bugchess.Move]:
        pocket = self.pockets[self.turn] if virtual_pocket is None else virtual_pocket
        for to_square in bugchess.scan_forward(to_mask & ~self.occupied):
            for pt, count in pocket.pieces.items():
                if count and (
                    pt != bugchess.PAWN
                    or not bugchess.BB_BACKRANKS & bugchess.BB_SQUARES[to_square]
                ):
                    yield bugchess.Move(to_square, to_square, drop=pt, board_id=self.board_id)

    def generate_pseudo_legal_drops(
        self,
        to_mask: bugchess.Bitboard = bugchess.BB_ALL,
        virtual_pocket: Optional[CrazyhousePocket] = None,
    ) -> Iterator[bugchess.Move]:
        yield from self._generate_pseudo_legal_drops_vp(to_mask, virtual_pocket)

    def generate_legal_drops(
        self,
        to_mask: bugchess.Bitboard = bugchess.BB_ALL,
        virtual_pocket: Optional[CrazyhousePocket] = None,
    ) -> Iterator[bugchess.Move]:
        yield from self._generate_pseudo_legal_drops_vp(
            to_mask=self.legal_drop_squares_mask() & to_mask, virtual_pocket=virtual_pocket
        )

    def parse_san(self, san: str) -> bugchess.Move:
        move = super().parse_san(san)
        move.board_id = self.board_id
        return move

    def is_legal(self, move: bugchess.Move) -> bool:
        if move.board_id is None:
            move.board_id = self.board_id
            output = super().is_legal(move)
            move.board_id = None
            return output
        else:
            return super().is_legal(move)

    def is_pseudo_legal(self, move: bugchess.Move) -> bool:
        if move.board_id is None:
            move.board_id = self.board_id
            output = super().is_pseudo_legal(move)
            move.board_id = None
            return output
        else:
            return super().is_pseudo_legal(move)

    @property
    def _other_board(self):
        return self._bughouse_boards[int(not self.board_id)]


TEAMS = [BOTTOM, TOP] = [TEAM_A, TEAM_B] = [0, 1]
BOARDS = [LEFT, RIGHT] = [BOARD_A, BOARD_B] = [0, 1]


class BughouseBoards:
    aliases = ["Bughouse"]
    uci_variant = "bughouse"
    xboard_variant = "bughouse"
    starting_fen = (
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1 | "
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1"
    )

    tbw_suffix = None
    tbz_suffix = None
    tbw_magic = None
    tbz_magic = None

    def __init__(self, fen: Optional[str] = None, chess960: bool = False):
        """

        :param fen:
        :param chess960: not yet implemented
        """
        self._boards: Optional[Tuple[SingleBughouseBoard, SingleBughouseBoard]] = None
        self.set_fen(self.starting_fen if fen is None else fen)
        self._move_stack: List[bugchess.Move] = []
        self.chess960 = chess960

    def reset_boards(self) -> None:
        for b in self._boards:
            b.reset_board()

    def reset(self) -> None:
        for b in self._boards:
            b.reset()

    def clear_boards(self) -> None:
        for b in self._boards:
            b.clear_board()

    def fen(self) -> str:
        return "{} | {}".format(self._boards[LEFT].fen(), self._boards[RIGHT].fen())

    def set_fen(self, value: str):
        fen_split = value.split("|")
        assert len(fen_split) == 2, "fen corrupt"
        self._boards = (
            SingleBughouseBoard(self, 0, fen_split[0]),
            SingleBughouseBoard(self, 1, fen_split[1]),
        )

    def push(self, move: bugchess.Move):
        self._boards[move.board_id]._push(move)
        self._move_stack.append(move)

    def pop(self, board_index: Optional[int] = None) -> bugchess.Move:
        if board_index is None:
            move = self._move_stack.pop()
        else:
            # Latest move on the specified board
            last_occurrence_index = len(self._move_stack) - 1
            while (
                last_occurrence_index >= 0
                and self._move_stack[last_occurrence_index].board_id != board_index
            ):
                last_occurrence_index -= 1
            assert last_occurrence_index >= 0, "No move left on board"
            move = self._move_stack[last_occurrence_index]
            self._move_stack[last_occurrence_index : last_occurrence_index + 1] = []
        self._boards[move.board_id]._pop()
        return move

    def peek(self) -> Optional[bugchess.Move]:
        if len(self._move_stack) == 0:
            return None
        return self._move_stack[-1]

    def __str__(self) -> str:
        def vp(pocket: CrazyhousePocket, white: bool):
            symbols = " ".join([bugchess.piece_symbol(p) for p in bugchess.PIECE_TYPES[:-1]])
            if white:
                symbols = symbols.upper()
            counts = " ".join([str(pocket.pieces.get(p, 0)) for p in bugchess.PIECE_TYPES[:-1]])
            return [symbols, counts]

        def join(line1: str, line2: str):
            return "{:<15}   {:<15}".format(line1, line2)

        board1_str = str(self._boards[LEFT])
        board1_lines = board1_str.splitlines()
        board2_str = str(self._boards[RIGHT])
        # Flip board for convenience
        board2_lines = board2_str.splitlines(keepends=False)
        board2_lines_reversed = reversed(["".join(reversed(lv)) for lv in board2_lines])

        board_lines_joint = map(join, board1_lines, board2_lines_reversed)
        header = join("Board 1:", "Board 2:")
        nl = join("", "")
        # Visualize pockets
        b1pb = vp(self._boards[LEFT].pockets[bugchess.BLACK], False)
        b2pw = vp(self._boards[RIGHT].pockets[bugchess.WHITE], True)
        b1pw = vp(self._boards[LEFT].pockets[bugchess.WHITE], True)
        b2pb = vp(self._boards[RIGHT].pockets[bugchess.BLACK], False)

        p_top = map(join, b1pb, b2pw)
        p_bottom = map(join, b1pw, b2pb)
        return "\n".join(
            itertools.chain([header, nl], p_top, [nl], board_lines_joint, [nl], p_bottom)
        )

    @property
    def boards(self) -> Tuple[SingleBughouseBoard, SingleBughouseBoard]:
        return self._boards

    def _repr_svg_(self):
        import bugchess.svg

        return bugchess.svg.bughouse_boards(
            boards=self,
            size=800,
            lastmoveL=self.boards[LEFT].peek() if self.boards[LEFT].move_stack else None,
            lastmoveR=self.boards[RIGHT].peek() if self.boards[RIGHT].move_stack else None,
            checkL=(
                self.boards[LEFT].king(self.boards[LEFT].turn)
                if self.boards[LEFT].is_check()
                else None
            ),
            checkR=(
                self.boards[RIGHT].king(self.boards[RIGHT].turn)
                if self.boards[RIGHT].is_check()
                else None
            ),
        )

    def is_checkmate(self) -> bool:
        return self.boards[LEFT].is_checkmate() or self.boards[RIGHT].is_checkmate()

    def is_game_over(self) -> bool:
        return self.is_checkmate() or not (
            any(True for _ in self.boards[LEFT].legal_moves)
            or any(True for _ in self.boards[RIGHT].legal_moves)
        )

    def is_threefold_repetition(self):
        return self.boards[LEFT].is_repetition(3) or self.boards[RIGHT].is_repetition(3)

    def result(self) -> str:
        """
        Gets the game result.

        ``1-0``, ``0-1`` or ``1/2-1/2`` if the
        :func:`game is over <bugchess.Board.is_game_over()>`. Otherwise, the
        result is undetermined: ``*``.
        """

        # Checkmate
        if self.is_checkmate():
            if self.boards[LEFT].is_checkmate():
                return "0-1" if self.boards[LEFT].turn == bugchess.WHITE else "1-0"
            else:
                return "1-0" if self.boards[RIGHT].turn == bugchess.WHITE else "0-1"

        if self.is_threefold_repetition():
            return "1/2-1/2"

        # Undetermined.
        return "*"

    def parse_san(self, san: str) -> bugchess.Move:
        if san[0].lower() == "a":
            return self._boards[LEFT].parse_san(san[3:])
        return self._boards[RIGHT].parse_san(san[3:])

    def is_chess960(self) -> bool:
        return self.chess960

    def has_chess960_castling_rights(self) -> bool:
        return self.chess960

    def fullmove_number(self) -> int:
        return self.boards[0].fullmove_number + self.boards[1].fullmove_number

    def is_legal(self, move: bugchess.Move) -> bool:
        return self[move.board_id].is_legal(move)

    def copy(self) -> "BughouseBoards":
        boards = BughouseBoards()
        boards._move_stack = copy.copy(self._move_stack)
        boards._boards = (self._boards[0].copy(), self._boards[1].copy())
        boards[0]._bughouse_boards = boards
        boards[1]._bughouse_boards = boards
        return boards

    def __getitem__(self, value: int) -> SingleBughouseBoard:
        return self._boards[value]

    def __len__(self):
        return len(self._boards)

    def __iter__(self):
        return self._boards.__iter__()

    def root(self) -> "BughouseBoards":
        """Returns a copy of the root position."""
        board = type(self)(None, chess960=self.chess960)
        board._boards = [b.root() for b in self]
        return board

    @property
    def move_stack(self) -> List[bugchess.Move]:
        return self._move_stack

    @property
    def disable_pocket_saving(self) -> bool:
        return any(b.disable_pocket_saving for b in self.boards)

    @disable_pocket_saving.setter
    def disable_pocket_saving(self, value: bool):
        for b in self.boards:
            b.disable_pocket_saving = value


VARIANTS = [
    bugchess.Board,
    SuicideBoard,
    GiveawayBoard,
    AtomicBoard,
    KingOfTheHillBoard,
    RacingKingsBoard,
    HordeBoard,
    ThreeCheckBoard,
    CrazyhouseBoard,
    BughouseBoards,
]  # type: List[Type[bugchess.Board]]


def find_variant(name: str) -> Type[bugchess.Board]:
    """Looks for a variant board class by variant name."""
    for variant in VARIANTS:
        if any(alias.lower() == name.lower() for alias in variant.aliases):
            return variant
    raise ValueError("unsupported variant: {}".format(name))
