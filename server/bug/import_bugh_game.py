import logging

from user import User
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
from datetime import datetime, timezone
from compress import decode_moves, encode_moves, R2C, C2R, V2C, C2V
from convert import mirror5, mirror9, usi2uci, grand2zero, zero2grand
from newid import new_id
from game import Game, MAX_PLY
from aiohttp import web
from bug.chess.pgn import read_game, Game
log = logging.getLogger(__name__)

def get_main_variation(game: Game) -> [list,list]:
    variations = game.variations
    moves = []
    boards = []
    while variations:
        moves.append(variations[0].move.uci())
        boards.append(variations[0].move.board_id)
        variations = variations[0].variations
    return [moves, boards]

async def import_game_bpgn(request):
    data = await request.post()
    app = request.app
    db = app["db"]
    users = app["users"]

    # print("---IMPORT GAME---")
    # print(data)
    # print("-----------------")

    pgn = data["pgn"]

    # strange bug in chess.com bpgn, whenever there is N@ it is instead $146@
    pgn = pgn.replace("$146@", "N@")

    first_game = read_game(pgn)

    wpA = first_game.headers.get("WhiteA")
    bpA = first_game.headers.get("BlackA")
    wpB = first_game.headers.get("WhiteB")
    bpB = first_game.headers.get("BlackB")

    if wpA in users:
        wplayerA = users[wpA]
    else:
        wplayerA = User(app, username=wpA, anon=True)
        users[wpA] = wplayerA
    if wpB in users:
        wplayerB = users[wpB]
    else:
        wplayerB = User(app, username=wpB, anon=True)
        users[wpB] = wplayerB

    if bpA in users:
        bplayerA = users[bpA]
    else:
        bplayerA = User(app, username=bpA, anon=True)
        users[bpA] = bplayerA
    if bpB in users:
        bplayerB = users[bpB]
    else:
        bplayerB = User(app, username=bpB, anon=True)
        users[bpB] = bplayerB

    variant = "bughouse"
    chess960 = False  # variant.endswith("960")
    #variant = variant.removesuffix("960")

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

    [move_stack, boards] = get_main_variation(first_game)  # data.get("moves", "").split(" ")
    moves = encode_moves(map(grand2zero, move_stack) if variant in GRANDS else move_stack, variant)

    game_id = await new_id(None if db is None else db.game)
    existing = await db.game.find_one({"_id": {"$eq": game_id}})
    if existing:
        message = "Failed to create game. Game ID %s allready in mongodb." % game_id
        log.exception(message)
        return web.json_response({"error": message})

    try:
        print(game_id, variant, initial_fen, wplayerA, bplayerA, wplayerB, bplayerB)
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
        "us": [wplayerA.username, bplayerA.username, wplayerB.username, bplayerB.username],
        "v": V2C[variant],
        "b": base,
        "i": inc,
        "bp": 0,
        "m": moves,
        "o": boards,
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
    result = await db.game.insert_one(document)
    print("db insert IMPORTED game result %s" % repr(result.inserted_id))

    return web.json_response({"gameId": game_id})

