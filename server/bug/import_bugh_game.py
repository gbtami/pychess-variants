import logging

from bug.utils_bug import init_players
from pychess_global_app_state_utils import get_app_state
from const import (
    UNKNOWNFINISH,
    IMPORTED,
)
from datetime import datetime, timezone
from compress import R2C, V2C, encode_move_standard
from newid import new_id
from aiohttp import web
from bugchess.pgn import read_game, Game

log = logging.getLogger(__name__)


def get_main_variation(game: Game) -> [list, list]:
    variations = game.variations
    turns = {0: "w", 1: "w"}
    moves = []
    boards = []
    move_times = {0: {"w": [], "b": []}, 1: {"w": [], "b": []}}
    while variations:
        board = variations[0].move.board_id
        turn = turns[board]
        turns[board] = "b" if turn == "w" else "w"
        moves.append(variations[0].move.uci())
        move_times[board][turn].append(
            int(variations[0].move.move_time * 1000)
            if variations[0].move.move_time is not None
            else None
        )
        boards.append(board)
        variations = variations[0].variations
    return [moves, move_times, boards]


async def import_game_bpgn(request):
    data = await request.post()
    app_state = get_app_state(request.app)

    # print("---IMPORT GAME---")
    # print(data)
    # print("-----------------")

    pgn = data["pgn"]

    # strange bug in chess.com bpgn, whenever there is N@ it is instead $146@
    pgn = pgn.replace("$146@", "N@")

    first_game = read_game(pgn)

    wp_a = first_game.headers.get("WhiteA")
    bp_a = first_game.headers.get("BlackA")
    wp_b = first_game.headers.get("WhiteB")
    bp_b = first_game.headers.get("BlackB")
    wplayer_a, bplayer_a, wplayer_b, bplayer_b = init_players(app_state, wp_a, bp_a, wp_b, bp_b)

    variant = "bughouse"
    chess960 = False  # variant.endswith("960")
    # variant = variant.removesuffix("960")

    # todo: replace with valid intial fen for now - maybe fix the problematic fen that ends with / instead of [] eventually - that is how chess.com fen looks like and doesnt parse well here
    initial_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1 | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1"  # first_game.headers.get("FEN", "")
    final_fen = first_game.headers.get("final_fen", "")
    status = int(first_game.headers.get("Status", UNKNOWNFINISH))
    result = first_game.headers.get("Result", "*")
    try:
        date = first_game.headers.get("Date", "")[0:10]
        date = map(int, date.split("." if "." in date else "/"))
        date = datetime(*date, tzinfo=timezone.utc)
    except Exception:
        log.exception("Date tag parsing failed")
        date = datetime.now(timezone.utc)

    try:
        minute = False
        tc = first_game.headers.get("TimeControl", "").split("+")
        if len(tc) == 1:
            tc.append("0")
        if tc[0][-1] == "分":
            minute = True
            tc[0] = tc[0][:-1]
        if tc[1][-1] == "秒":
            tc[1] = tc[1][:-1]
        tc = list(map(int, tc))
        base = int((tc[0] / 60) if not minute else tc[0])
        inc = int(tc[1])
    except Exception:
        log.exception("TimeControl tag parsing failed")
        base, inc = 0, 0

    [move_stack, move_times, boards] = get_main_variation(
        first_game
    )  # data.get("moves", "").split(" ")
    moves = [*map(encode_move_standard, move_stack)]

    game_id = await new_id(None if app_state.db is None else app_state.db.game)
    existing = await app_state.db.game.find_one({"_id": {"$eq": game_id}})
    if existing:
        message = "Failed to create game. Game ID %s allready in mongodb." % game_id
        log.exception(message)
        return web.json_response({"error": message})

    try:
        print(game_id, variant, initial_fen, wplayer_a, bplayer_a, wplayer_b, bplayer_b)
        # new_game = Game( todo: not sure why needed to create object at all at this point
        #     app,
        #     game_id,
        #     variant,
        #     initial_fen,
        #     wplayer,
        #     bplayer,
        #     rated=IMPORTED,
        #     chess960=chess960,
        #     create=False,
        # )
    except Exception:
        message = "Creating new Game %s failed!" % game_id
        log.exception(message)
        return web.json_response({"error": message})

    document = {
        "_id": game_id,
        "us": [wplayer_a.username, bplayer_a.username, wplayer_b.username, bplayer_b.username],
        "v": V2C[variant],
        "b": base,
        "i": inc,
        "bp": 0,
        "m": moves,
        "o": boards,
        "cw": move_times[0]["w"],
        "cb": move_times[0]["b"],
        "cwB": move_times[1]["w"],
        "cbB": move_times[1]["b"],
        "d": date,
        "f": final_fen,
        "s": status,
        "r": R2C[result],
        "x": 0,
        "y": IMPORTED,
        "z": int(False),  # int(new_game.chess960),
        "by": first_game.headers.get("username"),
    }

    if initial_fen or chess960:
        document["if"] = initial_fen

    wrating = first_game.headers.get("WhiteElo")
    brating = first_game.headers.get("BlackElo")
    if wrating:
        document["p0"] = {"e": wrating}
    if brating:
        document["p1"] = {"e": brating}

    print(document)
    result = await app_state.db.game.insert_one(document)
    print("db insert IMPORTED game result %s" % repr(result.inserted_id))

    return web.json_response({"gameId": game_id})
