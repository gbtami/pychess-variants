# S-chess 8x8 DIAGRAM to FEN (and maybe to .svg, .png)
# WHITE: Kg1, Hb2, f2, g3, h4 BLACK: Kg8, Rb8, b3, g7, h6

import sys

import chess
import chess.svg
import cairosvg


chess.PIECE_TYPES = [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, HAWK, ELEPHANT] = range(1, 9)

chess.PIECE_SYMBOLS.append("h")
chess.PIECE_SYMBOLS.append("e")

chess.PIECE_NAMES.append("hawk")
chess.PIECE_NAMES.append("elephant")

# TODO:
chess.svg.PIECES["h"] = """<g id="black-hawk" class="black hawk"></g>"""
chess.svg.PIECES["e"] = """<g id="black-elephant" class="black elephant"></g>"""

# TODO: resize and center
chess.svg.PIECES["E"] = """<g id="white-elephant" class="white elephant" clip-rule="evenodd" fill-rule="evenodd" height="177.17" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" viewBox="0 0 50 50" width="177.17" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><linearGradient id="a"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#808080"/></linearGradient><linearGradient id="b" gradientTransform="matrix(.18388585 0 0 .14372393 52.70999 -34.229473)" gradientUnits="userSpaceOnUse" x1="263.8862" x2="226.60266" xlink:href="#a" y1="556.02753" y2="613.10144"/><linearGradient id="c" gradientUnits="userSpaceOnUse" x1="99.346107" x2="78.265686" xlink:href="#a" y1="53.234913" y2="53.234913"/><linearGradient id="d" gradientUnits="userSpaceOnUse" x1="103.51731" x2="80.967453" y1="65.571739" y2="65.571739"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#999"/></linearGradient><g stroke="#1f1a17" stroke-width="1.424543" transform="matrix(-.99155091878 0 0 .95559809158 115.57238182451 -21.3329947323)"><path d="m101.65188 69.860643c-8.735986.0568-14.117214.14808-22.788666.19069.03444-1.96153.626084-3.92305 1.717131-5.88458-3.660327-5.97534-2.711629-9.46976.660435-11.8724 1.643358-2.511672 3.09135-5.155635 5.415568-8.465541 2.408402-1.729975 5.368613-3.27511 7.000615-5.265155.999651-2.012102.536145-3.261803-1.452958-3.716578-4.929266.392414-2.586788 4.337045-3.038003 6.916968-8.157022 5.9081-11.375898-.892949-11.09531-3.303627.866167-.425478 1.436706.424041 2.322856.892644.745737-.450725 1.324113-.600373 2.036018-.582929 1.279361.765191 1.000634 1.249092 1.395919 2.187032-1.172713-6.738948.45135-11.146721 9.567302-11.684957 5.781167.546187 8.561033 3.546411 9.238073 8.665756-.79017.516192-1.6238.995882-1.70912 1.658075.11979 2.1649-1.042871 4.455102-1.849206 6.710489l.839225.503666-.18681 1.287886c-.14937.350239-1.013511-.404227-1.282174-.07299-.332596.410032-.549328 2.109829-.479463 2.409619 1.065533-2.767772 3.623888-3.864359 6.128528-5.573506 1.13193-1.312743 2.68829-2.395172 2.72894-1.721383-.38292 1.952979-1.15417 5.034143-2.68652 8.156665.12703 2.952026.73992 5.567583.22174 8.431036-.73303 4.050686-2.87676 5.20466-2.70412 10.13313z" fill="url(#c)" stroke-width="1.739546"/><path d="m95.673807 48.092246c1.042408 4.232607 2.16064 4.761207 3.672297 5.142667 6.828586-9.427033 6.556516-15.721988 4.453476-17.881256-2.08345 3.65474-4.072731 9.989388-8.125773 12.738589z" fill="url(#b)" stroke-width="1.739546"/><ellipse cx="87.397079" cy="49.458702" fill="#1f1a17" rx=".742959" ry="1.43285" stroke-linecap="square" stroke-linejoin="bevel" stroke-width="1.424543"/><path d="m80.758294 56.749733c-1.780779 3.16306-4.348115 6.291688-4.821424 12.443248 5.742335-2.051055 13.154089 1.099485 17.23671-.135008-2.50154-4.0381-1.208197-3.908699-2.189333-8.984699" fill="url(#d)" stroke-width="1.739546"/></g></g>"""
chess.svg.PIECES["H"] = """<g id="white-hawk" class="white hawk" clip-rule="evenodd" fill-rule="evenodd" height="177.17" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" viewBox="0 0 50 50" width="177.17" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><linearGradient id="a" gradientUnits="userSpaceOnUse" x1="115.58475" x2="87.865845" y1="51.192822" y2="51.538971"><stop offset="0" stop-color="#808080"/><stop offset="1" stop-color="#fff"/></linearGradient><g stroke="#1f1a17" transform="matrix(1.0539134 0 0 1.1187798 -70.902198 -28.281003)"><g stroke-width="1.559396"><path d="m84.568171 35.093828-6.217144.149811c-6.203086 2.383935-6.962587 5.934352-4.793947 10.112228-.05331-4.629564 3.609449-3.313402 6.366959-3.445648 9.559786 5.46999 4.25599 14.805717-.599244 18.426723l4.419419.449433-.524338 3.07112 4.269605-2.92131 2.696594 3.520551 3.895081-2.92131 1.573012 2.621691 2.022444-2.696597c1.307039 1.013938 2.064854 2.354644 2.627738 3.526604l1.86659-3.226981c1.23104.812023 1.87638 2.044599 2.8464 3.07112v-4.119794l4.41942 2.621688c.57264-16.897498-1.12516-28.07245-13.932403-31.759881-2.710707-.060144-5.491501-.344569-7.865064.674147z" fill="url(#a)"/><path d="m91.159846 44.531907-11.235807-2.621688" fill="none"/><path d="m83.103812 35.805085c-.02515 1.008854.490503 1.148881 1.112288 1.324152" fill="none"/></g><path d="m91.413755 41.973846a2.5158896 1.8273305 0 0 1 -1.307932 1.602928 2.5158896 1.8273305 0 0 1 -2.563889-.0637 2.5158896 1.8273305 0 0 1 -1.154078-1.664092l2.510009.124859z" fill="#1f1a17" stroke-linecap="square" stroke-linejoin="bevel" stroke-width="1.693289" transform="matrix(.99847255 -.05525006 .05525006 .99847255 0 0)"/><path d="m93.644067 36.864407 3.760592-.423729" fill="#1f1a17" stroke-width="1.693244"/></g></g>"""


class SeirawanBoard(chess.Board):

    uci_variant = "seirawan"
    starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1"

    def __init__(self, fen=starting_fen, chess960=False):
        self.hawks = chess.BB_EMPTY
        self.elephants = chess.BB_EMPTY
        super().__init__(fen, chess960=chess960)

    def pieces_mask(self, piece_type, color):
        if piece_type == PAWN:
            bb = self.pawns
        elif piece_type == KNIGHT:
            bb = self.knights
        elif piece_type == BISHOP:
            bb = self.bishops
        elif piece_type == ROOK:
            bb = self.rooks
        elif piece_type == QUEEN:
            bb = self.queens
        elif piece_type == KING:
            bb = self.kings
        elif piece_type == HAWK:
            bb = self.hawks
        elif piece_type == ELEPHANT:
            bb = self.elephants
        else:
            assert False, f"expected PieceType, got {piece_type!r}"

        return bb & self.occupied_co[color]

    def piece_type_at(self, square):
        """Gets the piece type at the given square."""
        mask = chess.BB_SQUARES[square]

        if not self.occupied & mask:
            return None  # Early return
        elif self.pawns & mask:
            return PAWN
        elif self.knights & mask:
            return KNIGHT
        elif self.bishops & mask:
            return BISHOP
        elif self.rooks & mask:
            return ROOK
        elif self.queens & mask:
            return QUEEN
        elif self.hawks & mask:
            return HAWK
        elif self.elephants & mask:
            return ELEPHANT
        else:
            return KING

    def _set_piece_at(self, square, piece_type, color, promoted=False):
        self._remove_piece_at(square)

        mask = chess.BB_SQUARES[square]

        if piece_type == PAWN:
            self.pawns |= mask
        elif piece_type == KNIGHT:
            self.knights |= mask
        elif piece_type == BISHOP:
            self.bishops |= mask
        elif piece_type == ROOK:
            self.rooks |= mask
        elif piece_type == QUEEN:
            self.queens |= mask
        elif piece_type == KING:
            self.kings |= mask
        elif piece_type == HAWK:
            self.hawks |= mask
        elif piece_type == ELEPHANT:
            self.elephants |= mask
        else:
            return

        self.occupied ^= mask
        self.occupied_co[color] ^= mask

        if promoted:
            self.promoted ^= mask


def main(text_file):
    with open(text_file, "r") as f:
        line = f.readline()
        idx = 1
        while line:
            if "WHITE" in line:
                line = line.replace("DIAGRAM:", "")
                line = line.replace(".", ",")
                parts = line.strip().split(":")
                # print(parts)
                if len(parts) == 3 and parts[0] == "WHITE" and parts[1].endswith("BLACK"):
                    white_pieces = parts[1].strip("BLACK").strip().split(",")
                    black_pieces = parts[2].strip().split(",")

                    board = {
                        "8": [""] * 8,
                        "7": [""] * 8,
                        "6": [""] * 8,
                        "5": [""] * 8,
                        "4": [""] * 8,
                        "3": [""] * 8,
                        "2": [""] * 8,
                        "1": [""] * 8,
                    }

                    for san in white_pieces:
                        san = san.strip()
                        if len(san) == 2:
                            san = "p" + san
                        piece = san[0].upper()
                        piece_rank = san[2]
                        piece_file = ord(san[1]) - 96
                        board[piece_rank][piece_file - 1] = piece

                    for san in black_pieces:
                        san = san.strip()
                        if len(san) == 2:
                            san = "p" + san
                        piece = san[0].lower()
                        piece_rank = san[2]
                        piece_file = ord(san[1]) - 96
                        board[piece_rank][piece_file - 1] = piece

                    fen = []
                    for rank in board:
                        empty = 0
                        for piece in board[rank]:
                            if piece:
                                if empty > 0:
                                    fen.append(str(empty))
                                    empty = 0
                                fen.append(piece)
                            else:
                                empty += 1
                        if empty > 0:
                            fen.append(str(empty))
                        fen.append("/")

                    fen_str = "".join(fen).strip("/") + " w - - 0 1"
                    sys.stdout.write(fen_str)
                    sys.stdout.write("\n")

                    # TODO: see above
                    # fen2png(fen_str, idx)
                    idx += 1
                else:
                    print("ERROR in line", line)
                    sys.exit(1)

            line = f.readline()


def fen2png(fen, idx):
    board = SeirawanBoard(fen)
    print(board)
    board_svg = chess.svg.board(coordinates=False, board=board, size=350)
    file_name_svg = "diagram%s.svg" % idx
    with open(file_name_svg, "w") as f:
        f.write(board_svg)
        f.close()

    file_name_png = "diagram%s.png" % idx
    cairosvg.svg2png(url=file_name_svg, write_to=file_name_png, scale=1)


if __name__ == "__main__":
    main(sys.argv[1])
