def usi2uci(move):
    return move
    """ Used to create chessground dests UCI coordinates from USI shogi moves and on game save also. """
    if move[1] == "*":
        return "%s@%s%s" % (move[0], chr(ord(move[2]) + 48), chr(ord(move[3]) - 48))
    elif move[2] == "*":
        return "%s%s@%s%s" % (move[0], move[1], chr(ord(move[3]) + 48), chr(ord(move[4]) - 48))
    else:
        return "%s%s%s%s%s" % (chr(ord(move[0]) + 48), chr(ord(move[1]) - 48), chr(ord(move[2]) + 48), chr(ord(move[3]) - 48), move[4] if len(move) == 5 else "")


def uci2usi(move):
    return move
    if move[1] == "@":
        return "%s*%s%s" % (move[0], chr(ord(move[2]) - 48), chr(ord(move[3]) + 48))
    elif move[2] == "@":
        return "%s%s*%s%s" % (move[0], move[1], chr(ord(move[3]) - 48), chr(ord(move[4]) + 48))
    else:
        return "%s%s%s%s%s" % (chr(ord(move[0]) - 48), chr(ord(move[1]) + 48), chr(ord(move[2]) - 48), chr(ord(move[3]) + 48), move[4] if len(move) == 5 else "")


def grand2zero(move):
    """ Converts 1 based UCI move row part (1-10) to be 0 based (0-9).
        This step is needed to use compress.py (store 2 byte moves on 1 byte)
        and send 0 based list of keys/squares for chessgroundx dests. """

    if move[1] == "@":
        return "%s@%s%s" % (move[0], move[2], int(move[3:]) - 1)

    if move[-1].isdigit():
        # normal move
        if move[2].isdigit():
            return "%s%s%s%s" % (move[0], int(move[1:3]) - 1, move[3], int(move[4:]) - 1)
        else:
            return "%s%s%s%s" % (move[0], int(move[1]) - 1, move[2], int(move[3:]) - 1)
    else:
        # promotion
        promo = move[-1]
        move = move[:-1]
        if move[2].isdigit():
            return "%s%s%s%s%s" % (move[0], int(move[1:3]) - 1, move[3], int(move[4:]) - 1, promo)
        else:
            return "%s%s%s%s%s" % (move[0], int(move[1]) - 1, move[2], int(move[3:]) - 1, promo)


def zero2grand(move):
    if move[1] == "@":
        return "%s@%s%s" % (move[0], move[2], int(move[3:]) + 1)
    return "%s%s%s%s%s" % (move[0], int(move[1]) + 1, move[2], int(move[3]) + 1, move[4] if len(move) == 5 else "")
