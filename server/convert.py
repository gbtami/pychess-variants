def usi2uci(move):
    """ Used to read USI format moves from old db games """
    if move[1] == "*":
        return "%s@%s%s" % (move[0], chr(ord(move[2]) + 48), chr(ord(move[3]) - 48))
    if move[2] == "*":
        return "%s%s@%s%s" % (move[0], move[1], chr(ord(move[3]) + 48), chr(ord(move[4]) - 48))
    return "%s%s%s%s%s" % (chr(ord(move[0]) + 48), chr(ord(move[1]) - 48), chr(ord(move[2]) + 48), chr(ord(move[3]) - 48), move[4] if len(move) == 5 else "")


# reversed letters
L5 = str.maketrans("abcde", "edcba")
L9 = str.maketrans("abcdefghi", "ihgfedcba")

# reversed digits
D5 = str.maketrans("12345", "54321")
D9 = str.maketrans("123456789", "987654321")


def mirror5(move):
    if move[1] == "@":
        return "%s@%s%s" % (move[0], move[2].translate(L5), move[3].translate(D5))
    if move[2] == "@":
        return "%s%s@%s%s" % (move[0], move[1], move[3].translate(L5), move[4].translate(D5))
    return "%s%s%s%s%s" % (move[0].translate(L5), move[1].translate(D5), move[2].translate(L5), move[3].translate(D5), move[4] if len(move) == 5 else "")


def mirror9(move):
    if move[1] == "@":
        return "%s@%s%s" % (move[0], move[2].translate(L9), move[3].translate(D9))
    if move[2] == "@":
        return "%s%s@%s%s" % (move[0], move[1], move[3].translate(L9), move[4].translate(D9))
    return "%s%s%s%s%s" % (move[0].translate(L9), move[1].translate(D9), move[2].translate(L9), move[3].translate(D9), move[4] if len(move) == 5 else "")


def uci2usi(move):
    if move[1] == "@":
        return "%s*%s%s" % (move[0], chr(ord(move[2]) - 48), chr(ord(move[3]) + 48))
    if move[2] == "@":
        return "%s%s*%s%s" % (move[0], move[1], chr(ord(move[3]) - 48), chr(ord(move[4]) + 48))
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
        return "%s%s%s%s" % (move[0], int(move[1]) - 1, move[2], int(move[3:]) - 1)
    else:
        # promotion
        promo = move[-1]
        move = move[:-1]
        if move[2].isdigit():
            return "%s%s%s%s%s" % (move[0], int(move[1:3]) - 1, move[3], int(move[4:]) - 1, promo)
        return "%s%s%s%s%s" % (move[0], int(move[1]) - 1, move[2], int(move[3:]) - 1, promo)


def zero2grand(move):
    if move[1] == "@":
        return "%s@%s%s" % (move[0], move[2], int(move[3:]) + 1)
    return "%s%s%s%s%s" % (move[0], int(move[1]) + 1, move[2], int(move[3]) + 1, move[4] if len(move) == 5 else "")
