import logging
import re
from datetime import datetime, timezone
from user import User
from compress import decode_moves, encode_moves, R2C, C2R, V2C, C2V
from bug.game import GameBug, MAX_PLY
from fairy import BLACK, STANDARD_FEN, FairyBoard
from const import (
    STARTED,
    VARIANT_960_TO_PGN,
    INVALIDMOVE,
    GRANDS,
    UNKNOWNFINISH,
    CASUAL,
    RATED,
    IMPORTED,
    CONSERVATIVE_CAPA_FEN,
    T_STARTED,
)
from convert import mirror5, mirror9, usi2uci, grand2zero, zero2grand
from glicko2.glicko2 import gl2

log = logging.getLogger(__name__)

async def load_game_bug(app, game_id):
    """Return Game object from app cache or from database"""
    db = app["db"]
    # games = app["games"]
    users = app["users"]
    # if game_id in games:
    #     return games[game_id]

    doc = await db.game.find_one({"_id": game_id})

    if doc is None:
        return None

    wp, bp, wpB, bpB = doc["us"]
    if wp in users:
        wplayer = users[wp]
    else:
        wplayer = User(app, username=wp, anon=True)
        users[wp] = wplayer

    if bp in users:
        bplayer = users[bp]
    else:
        bplayer = User(app, username=bp, anon=True)
        users[bp] = bplayer

    if wpB in users:
        wplayerB = users[wpB]
    else:
        wplayerB = User(app, username=wpB, anon=True)
        users[wpB] = wplayerB

    if bpB in users:
        bplayerB = users[bpB]
    else:
        bplayerB = User(app, username=bpB, anon=True)
        users[bpB] = bplayerB

    variant = C2V[doc["v"]]

    initial_fen = doc.get("if")

    game = GameBug(
        app,
        game_id,
        variant,
        initial_fen,
        wplayer,
        bplayer,
        wplayerB,
        bplayerB,
        base=doc["b"],
        inc=doc["i"],
        level=doc.get("x"),
        rated=doc.get("y"),
        chess960=bool(doc.get("z")),
        create=False,
        tournamentId=doc.get("tid"),
    )

    mlist = decode_moves(doc["m"], variant)

    if mlist or (game.tournamentId is not None and doc["s"] > STARTED):
        game.saved = True

    if "a" in doc:
        game.steps[0]["analysis"] = doc["a"][0]

    if "cw" in doc:
        base_clock_time = (game.base * 1000 * 60) + (0 if game.base > 0 else game.inc * 1000)
        clocktimes_w = doc["cw"] if len(doc["cw"]) > 0 else [base_clock_time]
        clocktimes_b = doc["cb"] if len(doc["cb"]) > 0 else [base_clock_time]

    if "mct" in doc:
        manual_count_toggled = iter(doc["mct"])
        count_started = -1
        count_ended = -1

    board_ply = {"a": 0, "b": 0}
    last_move, last_move_b = "", ""
    for ply, move in enumerate(mlist):
        try:
            if "mct" in doc:
                # print("Ply", ply, "Move", move)
                if ply + 1 >= count_ended:
                    try:
                        game.board.count_started = -1
                        count_started, count_ended = next(manual_count_toggled)
                        # print("New count interval", (count_started, count_ended))
                    except StopIteration:
                        # print("Piece's honour counting started")
                        count_started = 0
                        count_ended = MAX_PLY + 1
                        game.board.count_started = 0
                if ply + 1 == count_started:
                    # print("Count started", count_started)
                    game.board.count_started = ply

            board_name = "a" if doc["o"][ply] == 0 else "b"  # todo why am i not storing a/b instead of 0/1. either that or compress to bits maybe
            board_ply[board_name] += 1
            last_move, last_move_b = move if board_name == "a" else last_move, move if board_name == "b" else last_move_b

            if move[1:2] != "@":
                piece = re.sub(r"\d", (lambda m: "." * int(m.group(0))), game.boards[board_name].fen.split("[")[0]).split("/")[8-int(move[1:2])][ord(move[0:1]) - ord('a')]
                piece_captured = re.sub(r"\d", (lambda m: "." * int(m.group(0))), game.boards[board_name].fen.split("[")[0]).split("/")[8-int(move[3:4])][ord(move[2:3]) - ord('a')]
                if piece == 'p' and piece_captured == '.' and move[0:1] != move[2:3]:
                    piece_captured = 'p'  # en passant
                if piece_captured != ".":
                    f = game.boards["b" if board_name=="a" else "a"].fen
                    f = re.sub("\[(.*)\]", r"[\1{}]".format(piece_captured), f)
                    game.boards["b" if board_name == "a" else "a"].fen = f

            san = game.boards[board_name].get_san(move)
            game.boards[board_name].push(move)
            game.check = game.boards[board_name].is_checked()
            # turnColor = "black" if game.board.color == BLACK else "white" todo: should i use board at all here? i mean adding a second one - maybe for fen ahd and check - but still can happen on client as well
            turn_color = "white" if board_ply[board_name] % 2 == 0 else "black"

            # No matter on which board the ply is happening i always need both fens and moves for both boards.
            # This way when jumping to a ply in the middle of the list i can setup both boards and highlight both last moves
            step = {
                "fen": game.fen.split(" | ")[0],
                "fenB": game.fen.split(" | ")[1],
                "move": last_move,
                "moveB": last_move_b,
                "boardName": board_name,
                "san": san,
                "turnColor": turn_color,
                "check": game.check,
            }
            if "cw" in doc:
                move_number = ((ply + 1) // 2) + (1 if ply % 2 == 0 else 0)
                if ply >= 2:
                    if ply % 2 == 0:
                        step["clocks"] = {
                            "white": clocktimes_w[move_number - 1],
                            "black": clocktimes_b[move_number - 2],
                        }
                    else:
                        step["clocks"] = {
                            "white": clocktimes_w[move_number - 1],
                            "black": clocktimes_b[move_number - 1],
                        }
                else:
                    step["clocks"] = {
                        "white": clocktimes_w[move_number - 1],
                        "black": clocktimes_b[move_number - 1],
                    }

            game.steps.append(step)

            if "a" in doc:
                try:
                    game.steps[-1]["analysis"] = doc["a"][ply + 1]
                except IndexError:
                    print("IndexError", ply, move, san)

        except Exception:
            log.exception(
                "ERROR: Exception in load_game() %s %s %s %s %s",
                game_id,
                variant,
                doc.get("if"),
                move,
                list(mlist),
            )
            break

    if len(game.steps) > 1:
        move = game.steps[-1]["move"]
        game.lastmove = move

    level = doc.get("x")
    game.date = doc["d"]
    if game.date.tzinfo is None:
        game.date = game.date.replace(tzinfo=timezone.utc)
    game.status = doc["s"]
    game.level = level if level is not None else 0
    game.result = C2R[doc["r"]]

    try:
        game.wrating = doc["p0"]["e"]
        game.brating = doc["p1"]["e"]
    except KeyError:
        game.wrating = "1500?"
        game.brating = "1500?"

    game.white_rating = gl2.create_rating(int(game.wrating.rstrip("?")))
    game.black_rating = gl2.create_rating(int(game.brating.rstrip("?")))

    try:
        game.wrdiff = doc["p0"]["d"]
        game.brdiff = doc["p1"]["d"]
    except KeyError:
        game.wrdiff = ""
        game.brdiff = ""

    if game.tournamentId is not None:
        if doc.get("wb", False):
            game.berserk("white")
        if doc.get("bb", False):
            game.berserk("black")

    if doc.get("by") is not None:
        game.imported_by = doc.get("by")

    return game

