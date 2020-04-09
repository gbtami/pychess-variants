import logging
import random
import string

from aiohttp.web import WebSocketResponse

try:
    import pyffish as sf
    sf.set_option("VariantPath", "variants.ini")
except ImportError:
    print("No pyffish module installed!")

from broadcast import round_broadcast
from const import DRAW, LOSERS, STARTED, VARIANT_960_TO_PGN, INVALIDMOVE
from compress import decode_moves, R2C, C2R, V2C, C2V
from convert import mirror5, mirror9, usi2uci, zero2grand
from fairy import WHITE, BLACK, STANDARD_FEN
from game import Game
from user import User
from settings import URI

log = logging.getLogger(__name__)


class MyWebSocketResponse(WebSocketResponse):
    @property
    def closed(self):
        return self._closed or self._req is None or self._req.transport is None


async def tv_game(db, app):
    """ Get latest played game id """
    if app["tv"] is not None:
        return app["tv"]
    else:
        game_id = None
        doc = await db.game.find_one({}, sort=[('$natural', -1)])
        if doc is not None:
            game_id = doc["_id"]
            app["tv"] = game_id
        return game_id


async def tv_game_user(db, users, profileId):
    """ Get latest played game id by a given user name"""
    if users[profileId].tv is not None:
        return users[profileId].tv
    else:
        game_id = None
        doc = await db.game.find_one({"us": profileId}, sort=[('$natural', -1)])
        if doc is not None:
            game_id = doc["_id"]
            users[profileId].tv = game_id
        return game_id


async def load_game(app, game_id):
    """ Return Game object from app cache or from database """
    db = app["db"]
    games = app["games"]
    users = app["users"]
    if game_id in games:
        return games[game_id]

    doc = await db.game.find_one({"_id": game_id})

    if doc is None:
        return None

    wp, bp = doc["us"]
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

    variant = C2V[doc["v"]]

    initial_fen = doc.get("if")

    # Old USI Shogi games saved using usi2uci() need special handling
    usi_format = variant.endswith("shogi") and doc.get("uci") is None

    if usi_format:
        wplayer, bplayer = bplayer, wplayer
        if initial_fen:
            print("load_game() USI SFEN was:", initial_fen)
            parts = initial_fen.split()
            pockets = "[%s]" % parts[2]
            initial_fen = parts[0] + pockets + (" w" if parts[1] == " b" else " w") + " 0 " + parts[3]
            print("   changed to:", initial_fen)

    game = Game(app, game_id, variant, initial_fen, wplayer, bplayer, doc["b"], doc["i"], doc.get("x"), bool(doc.get("y")), bool(doc.get("z")), create=False)

    mlist = decode_moves(doc["m"], variant)

    if mlist:
        game.saved = True

    if usi_format and variant == "shogi":
        mirror = mirror9
        mlist = list(map(mirror, mlist))

    elif usi_format and (variant == "minishogi" or variant == "kyotoshogi"):
        mirror = mirror5
        mlist = list(map(mirror, mlist))

    elif variant == "xiangqi" or variant == "grand" or variant == "grandhouse" or variant == "shako" or variant == "janggi":
        mlist = map(zero2grand, mlist)

    if "a" in doc:
        if usi_format and "m" in doc["a"][0]:
            doc["a"][0]["m"] = mirror(usi2uci(doc["a"][0]["m"]))
        game.steps[0]["analysis"] = doc["a"][0]

    for ply, move in enumerate(mlist):
        try:
            san = game.board.get_san(move)
            game.board.push(move)
            game.check = game.board.is_checked()
            turnColor = "black" if game.board.color == BLACK else "white"
            if usi_format:
                turnColor = "black" if turnColor == "white" else "white"
            game.steps.append({
                "fen": game.board.fen,
                "move": move,
                "san": san,
                "turnColor": turnColor,
                "check": game.check}
            )

            if "a" in doc:
                if usi_format and "m" in doc["a"][ply + 1]:
                    doc["a"][ply + 1]["m"] = mirror(usi2uci(doc["a"][ply + 1]["m"]))
                game.steps[-1]["analysis"] = doc["a"][ply + 1]

        except Exception:
            log.exception("ERROR: Exception in load_game() %s %s %s %s" % (game_id, variant, doc.get("if"), mlist))
            break

    if len(game.steps) > 1:
        move = game.steps[-1]["move"]
        game.lastmove = move

    level = doc.get("x")
    game.date = doc["d"]
    game.status = doc["s"]
    game.level = level if level is not None else 0
    game.result = C2R[doc["r"]]

    try:
        game.wrating = doc["p0"]["e"]
        game.wrdiff = doc["p0"]["d"]
        game.brating = doc["p1"]["e"]
        game.brdiff = doc["p1"]["d"]
    except KeyError:
        game.wrating = "1500?"
        game.wrdiff = "0"
        game.brating = "1500?"
        game.brdiff = "0"
    return game


async def draw(games, data, agreement=False):
    """ Draw or offer """
    game = games[data["gameId"]]
    if game.is_claimable_draw or agreement:
        result = "1/2-1/2"
        game.update_status(DRAW, result)
        await game.save_game()
        return {
            "type": "gameEnd", "status": game.status, "result": game.result, "gameId": data["gameId"], "pgn": game.pgn, "ct": game.crosstable,
            "rdiffs": {"brdiff": game.brdiff, "wrdiff": game.wrdiff} if game.status > STARTED and game.rated else ""}
    else:
        response = {"type": "offer", "message": "Draw offer sent", "room": "player", "user": ""}
        game.messages.append(response)
        return response


async def game_ended(games, user, data, reason):
    """ Abort, resign, flag, abandone """
    game = games[data["gameId"]]
    if game.result == "*":
        if reason == "abort":
            result = "*"
        else:
            if reason == "flag":
                w, b = game.board.insufficient_material()
                if (w and b) or (game.board.color == BLACK and w) or (game.board.color == WHITE and b):
                    result = "1/2-1/2"
                else:
                    result = "0-1" if user.username == game.wplayer.username else "1-0"
            else:
                result = "0-1" if user.username == game.wplayer.username else "1-0"

        game.update_status(LOSERS[reason], result)
        await game.save_game()

    return {
        "type": "gameEnd", "status": game.status, "result": game.result, "gameId": data["gameId"], "pgn": game.pgn, "ct": game.crosstable,
        "rdiffs": {"brdiff": game.brdiff, "wrdiff": game.wrdiff} if game.status > STARTED and game.rated else ""}


async def new_game(app, user, seek_id):
    db = app["db"]
    games = app["games"]
    seeks = app["seeks"]
    seek = seeks[seek_id]
    log.info("+++ Seek %s accepted by %s FEN:%s 960:%s" % (seek_id, user.username, seek.fen, seek.chess960))

    fen_valid = True
    if seek.fen:
        fen_valid, sanitized_fen = sanitize_fen(seek.variant, seek.fen, seek.chess960)
        if not fen_valid:
            message = "Failed to create game. Invalid FEN %s" % seek.fen
            log.debug(message)
            remove_seek(seeks, seek)
            return {"type": "error", "message": message}
    else:
        sanitized_fen = ""

    if seek.color == "r":
        wplayer = random.choice((user, seek.user))
        bplayer = user if wplayer.username == seek.user.username else seek.user
    else:
        wplayer = seek.user if seek.color == "w" else user
        bplayer = seek.user if seek.color == "b" else user

    new_id = "".join(random.choice(string.ascii_letters + string.digits) for x in range(8))
    existing = await db.game.find_one({'_id': {'$eq': new_id}})
    if existing:
        message = "Failed to create game. Game ID %s allready in mongodb." % new_id
        log.debug(message)
        remove_seek(seeks, seek)
        return {"type": "error", "message": message}
    # print("new_game", new_id, seek.variant, seek.fen, wplayer, bplayer, seek.base, seek.inc, seek.level, seek.rated, seek.chess960)
    try:
        new_game = Game(app, new_id, seek.variant, sanitized_fen, wplayer, bplayer, seek.base, seek.inc, seek.byoyomi_count, seek.level, seek.rated, seek.chess960, create=True)
    except Exception:
        log.error("Creating new game %s failed! %s 960:%s FEN:%s %s vs %s" % (new_id, seek.variant, seek.chess960, seek.fen, wplayer, bplayer))
        remove_seek(seeks, seek)
        return {"type": "error", "message": "Failed to create game"}
    games[new_game.id] = new_game

    remove_seek(seeks, seek)

    document = {
        "_id": new_id,
        "us": [wplayer.username, bplayer.username],
        "p0": {"e": new_game.wrating},
        "p1": {"e": new_game.brating},
        "v": V2C[seek.variant],
        "b": seek.base,
        "i": seek.inc,
        "m": [],
        "d": new_game.date,
        "f": new_game.initial_fen,
        "s": new_game.status,
        "r": R2C["*"],
        "x": seek.level,
        "y": int(seek.rated),
        "z": int(seek.chess960),
    }

    if seek.fen or seek.chess960:
        document["if"] = new_game.initial_fen

    if seek.variant.endswith("shogi"):
        document["uci"] = 1

    result = await db.game.insert_one(document)
    print("db insert game result %s" % repr(result.inserted_id))

    app["tv"] = new_id
    wplayer.tv = new_id
    bplayer.tv = new_id

    return {"type": "new_game", "gameId": new_id}


def remove_seek(seeks, seek):
    if (not seek.user.bot) and seek.id in seeks:
        del seeks[seek.id]
        if seek.id in seek.user.seeks:
            del seek.user.seeks[seek.id]


async def play_move(app, user, game, move, clocks=None):
    assert move
    gameId = game.id
    users = app["users"]
    invalid_move = False
    log.info("%s move %s %s %s - %s" % (user.username, move, gameId, game.wplayer.username, game.bplayer.username))

    if game.status <= STARTED:
        try:
            await game.play_move(move, clocks)
        except SystemError:
            invalid_move = True
            log.error("Game %s aborted because invalid move %s by %s !!!" % (gameId, move, user.username))
            game.status = INVALIDMOVE
            game.result = "0-1" if user.username == game.wplayer.username else "1-0"

    if not invalid_move:
        board_response = game.get_board(full=game.board.ply == 1)

    if not user.bot:
        ws = user.game_sockets[gameId]
        await ws.send_json(board_response)

    if user.bot and game.status > STARTED:
        await user.game_queues[gameId].put(game.game_end)

    opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
    if users[opp_name].bot:
        if game.status > STARTED:
            await users[opp_name].game_queues[gameId].put(game.game_end)
        else:
            await users[opp_name].game_queues[gameId].put(game.game_state)
    else:
        try:
            opp_ws = users[opp_name].game_sockets[gameId]
            if not invalid_move:
                await opp_ws.send_json(board_response)
            if game.status > STARTED:
                await opp_ws.send_json(game.game_end)
        except KeyError:
            log.error("Move %s can't send to %s. Game %s was removed from game_sockets !!!" % (move, user.username, gameId))

    if not invalid_move:
        await round_broadcast(game, users, board_response, channels=app["channels"])


def pgn(doc):
    variant = C2V[doc["v"]]
    mlist = decode_moves(doc["m"], variant)
    chess960 = bool(int(doc.get("z"))) if "z" in doc else False

    if variant == "xiangqi" or variant == "grand" or variant == "grandhouse" or variant == "shako" or variant == "janggi":
        mlist = list(map(zero2grand, mlist))

    fen = doc["if"] if "if" in doc else sf.start_fen(variant)
    mlist = sf.get_san_moves(variant, fen, mlist, chess960)

    moves = " ".join((move if ind % 2 == 1 else "%s. %s" % (((ind + 1) // 2) + 1, move) for ind, move in enumerate(mlist)))
    no_setup = fen == STANDARD_FEN and not chess960
    # Use lichess format for crazyhouse games to support easy import
    setup_fen = fen if variant != "crazyhouse" else fen.replace("[]", "")

    return '[Event "{}"]\n[Site "{}"]\n[Date "{}"]\n[Round "-"]\n[White "{}"]\n[Black "{}"]\n[Result "{}"]\n[TimeControl "{}+{}"]\n[WhiteElo "{}"]\n[BlackElo "{}"]\n[Variant "{}"]\n{fen}{setup}\n{} {}\n'.format(
        "PyChess " + ("rated" if "y" in doc and doc["y"] == 1 else "casual") + " game",
        URI + "/" + doc["_id"],
        doc["d"].strftime("%Y.%m.%d"),
        doc["us"][0],
        doc["us"][1],
        C2R[doc["r"]],
        doc["b"] * 60,
        doc["i"],
        doc["p0"]["e"] if "p0" in doc else "?",
        doc["p1"]["e"] if "p1" in doc else "?",
        variant.capitalize() if not chess960 else VARIANT_960_TO_PGN[variant],
        moves,
        C2R[doc["r"]],
        fen="" if no_setup else '[FEN "%s"]\n' % setup_fen,
        setup="" if no_setup else '[SetUp "1"]\n')


def sanitize_fen(variant, initial_fen, chess960):
    # Initial_fen needs validation to prevent segfaulting in pyffish
    sanitized_fen = initial_fen

    start_fen = sf.start_fen(variant)  # self.board.start_fen(self.variant)
    start = start_fen.split()
    init = initial_fen.split()

    # Cut off tail
    if len(init) > 6:
        init = init[:6]
        sanitized_fen = " ".join(init)

    # We need starting color
    invalid0 = len(init) < 2

    # Only piece types listed in variant start position can be used later
    if variant == "makruk" or variant == "cambodian":
        non_piece = "~+0123456789[]fF"
    else:
        non_piece = "~+0123456789[]"
    invalid1 = any((c not in start[0] + non_piece for c in init[0]))

    # Required number of rows
    invalid2 = start[0].count("/") != init[0].count("/")

    # Accept zh FEN in lichess format (they use / instead if [] for pockets)
    if invalid2 and variant == "crazyhouse":
        if (init[0].count("/") == 8) and ("[" not in init[0]) and ("]" not in init[0]):
            k = init[0].rfind("/")
            init[0] = init[0][:k] + "[" + init[0][k + 1:] + "]"
            sanitized_fen = " ".join(init)
            invalid2 = False

    # Allowed starting colors
    invalid3 = len(init) > 1 and init[1] not in "bw"

    # Castling rights (and piece virginity) check
    invalid4 = False
    if variant == "seirawan" or variant == "shouse":
        invalid4 = len(init) > 2 and any((c not in "KQABCDEFGHkqabcdefgh-" for c in init[2]))
    elif chess960:
        if all((c in "KQkq-" for c in init[2])):
            chess960 = False
        else:
            invalid4 = len(init) > 2 and any((c not in "ABCDEFGHIJabcdefghij-" for c in init[2]))
    elif variant[-5:] != "shogi":
        invalid4 = len(init) > 2 and any((c not in start[2] + "-" for c in init[2]))

    # Number of kings
    invalid5 = init[0].count("k") != 1 or init[0].count("K") != 1

    if invalid0 or invalid1 or invalid2 or invalid3 or invalid4 or invalid5:
        print(invalid0, invalid1, invalid2, invalid3, invalid4, invalid5)
        sanitized_fen = start_fen
        return False, start_fen
    else:
        return True, sanitized_fen
