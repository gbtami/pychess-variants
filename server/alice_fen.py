import sys


def fsf2py(fenin):
    s = fenin.strip().split(" ", 1)[0]
    board = {}
    board2 = {}
    r = 8
    f = 1
    m = False
    for c in s:
        if c.isdigit():
            f += int(c)
        elif c.isalpha():
            if m:
                board2[(f, r)] = c
            else:
                board[(f, r)] = c
            f += 1
            m = False
        elif c == "|":
            m = True
        elif c == "/":
            r -= 1
            f = 1

    fen = ""
    i = 0
    for r in range(8, 0, -1):
        for f in range(1, 9):
            if (f, r) in board:
                if i:
                    fen += str(i)
                    i = 0
                fen += board[(f, r)]
            else:
                i += 1
        if i:
            fen += str(i)
            i = 0
        fen += "/" if r > 1 else " "
    fen += fenin.split(" ", 1)[1] + "| "

    i = 0
    for r in range(8, 0, -1):
        for f in range(1, 9):
            if (f, r) in board2:
                if i:
                    fen += str(i)
                    i = 0
                fen += board2[(f, r)]
            else:
                i += 1
        if i:
            fen += str(i)
            i = 0
        fen += "/" if r > 1 else " "
    add = fenin.split(" ")[1:]
    add[1] = "-"
    fen += " ".join(add)
    return fen


def py2fsf(fenin):
    s1, s2 = fenin.split("|")
    s11 = s1.strip().split(" ", 1)[0]
    s21 = s2.strip().split(" ", 1)[0]
    board = {}
    r = 8
    f = 1
    for c in s11:
        if c.isdigit():
            f += int(c)
        elif c.isalpha():
            board[(f, r)] = c
            f += 1
        elif c == "/":
            r -= 1
            f = 1
    r = 8
    f = 1
    for c in s21:
        if c.isdigit():
            f += int(c)
        elif c.isalpha():
            board[(f, r)] = "|" + c
            f += 1
        elif c == "/":
            r -= 1
            f = 1

    fen = ""
    i = 0
    for r in range(8, 0, -1):
        for f in range(1, 9):
            if (f, r) in board:
                if i:
                    fen += str(i)
                    i = 0
                fen += board[(f, r)]
            else:
                i += 1
        if i:
            fen += str(i)
            i = 0
        fen += "/" if r > 1 else " "
    fen += s1.split(" ", 1)[1]
    return fen


if __name__ == "__main__":
    for line in sys.stdin:
        fen, rest = line.split(";", 1)
        func = py2fsf if fen.count("|") == 1 and fen.split("|")[0].count(" ") > 1 else fsf2py
        sys.stdout.write(";".join((func(fen), rest)))
