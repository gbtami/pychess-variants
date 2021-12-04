import logging
import random
from datetime import datetime, timezone

from aiohttp import web
from aiohttp.web import WebSocketResponse

try:
    import pyffish as sf
    sf.set_option("VariantPath", "variants.ini")
except ImportError:
    print("No pyffish module installed!")

from glicko2.glicko2 import gl2
from broadcast import round_broadcast
from const import STARTED, VARIANT_960_TO_PGN, INVALIDMOVE, GRANDS, \
    UNKNOWNFINISH, CASUAL, RATED, IMPORTED, CONSERVATIVE_CAPA_FEN, T_STARTED
from compress import decode_moves, encode_moves, R2C, C2R, V2C, C2V
from convert import mirror5, mirror9, usi2uci, grand2zero, zero2grand
from fairy import BLACK, STANDARD_FEN, FairyBoard
from game import Game, MAX_PLY
from newid import new_id
from user import User
from settings import URI

log = logging.getLogger(__name__)


# See https://github.com/aio-libs/aiohttp/issues/3122 why this is needed
class MyWebSocketResponse(WebSocketResponse):
    @property
    def closed(self):
        return self._closed or self._req is None or self._req.transport is None


async def tv_game(db, app):
    """ Get latest played game id """
    if app["tv"] is not None:
        return app["tv"]
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
            # print("load_game() USI SFEN was:", initial_fen)
            parts = initial_fen.split()
            if len(parts) > 3 and parts[1] in "wb":
                pockets = "[%s]" % parts[2] if parts[2] not in "-0" else ""
                initial_fen = parts[0] + pockets + (" w" if parts[1] == "b" else " b") + " 0 " + parts[3]
            else:
                initial_fen = parts[0] + (" w" if parts[1] == "b" else " b") + " 0"
            # print("   changed to:", initial_fen)

    game = Game(
        app, game_id, variant, initial_fen, wplayer, bplayer,
        base=doc["b"],
        inc=doc["i"],
        byoyomi_period=int(bool(doc.get("bp"))),
        level=doc.get("x"),
        rated=doc.get("y"),
        chess960=bool(doc.get("z")),
        create=False,
        tournamentId=doc.get("tid"))

    mlist = decode_moves(doc["m"], variant)

    if mlist or (game.tournamentId is not None and doc["s"] > STARTED):
        game.saved = True

    if usi_format and variant == "shogi":
        mirror = mirror9
        mlist = map(mirror, mlist)

    elif usi_format and (variant in ("minishogi", "kyotoshogi")):
        mirror = mirror5
        mlist = map(mirror, mlist)

    elif variant in GRANDS:
        mlist = map(zero2grand, mlist)

    if "a" in doc:
        if usi_format and "m" in doc["a"][0]:
            doc["a"][0]["m"] = mirror(usi2uci(doc["a"][0]["m"]))
        game.steps[0]["analysis"] = doc["a"][0]

    if "mct" in doc:
        print(doc["mct"])
        manual_count_toggled = iter(doc["mct"])
        count_started = -1
        count_ended = -1

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
                try:
                    game.steps[-1]["analysis"] = doc["a"][ply + 1]
                except IndexError:
                    print("IndexError", ply, move, san)

        except Exception:
            log.exception("ERROR: Exception in load_game() %s %s %s %s %s", game_id, variant, doc.get("if"), move, list(mlist))
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
        game.wberserk = doc.get("wb", False)
        game.bberserk = doc.get("bb", False)

    if doc.get("by") is not None:
        game.imported_by = doc.get("by")

    return game


async def import_game(request):
    data = await request.post()
    app = request.app
    db = app["db"]
    users = app["users"]

    # print("---IMPORT GAME---")
    # print(data)
    # print("-----------------")

    wp = data["White"]
    bp = data["Black"]
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

    variant = data.get("Variant", "chess").lower()
    initial_fen = data.get("FEN", "")
    final_fen = data.get("final_fen", "")
    status = int(data.get("Status", UNKNOWNFINISH))
    result = data.get("Result", "*")
    try:
        date = data.get("Date", "")[0:10]
        date = map(int, date.split("." if "." in date else "/"))
        date = datetime(*date, tzinfo=timezone.utc)
    except Exception:
        log.exception("Date tag parsing failed")
        date = datetime.now(timezone.utc)

    try:
        minute = False
        tc = data.get("TimeControl", "").split("+")
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

    move_stack = data.get("moves", "").split(" ")
    moves = encode_moves(
        map(grand2zero, move_stack) if variant in GRANDS
        else move_stack, variant)

    game_id = await new_id(None if db is None else db.game)
    existing = await db.game.find_one({'_id': {'$eq': game_id}})
    if existing:
        message = "Failed to create game. Game ID %s allready in mongodb." % game_id
        log.exception(message)
        return web.json_response({"error": message})

    try:
        print(game_id, variant, initial_fen, wplayer, bplayer)
        new_game = Game(app, game_id, variant, initial_fen, wplayer, bplayer, rated=IMPORTED, create=False)
    except Exception:
        message = "Creating new Game %s failed!" % game_id
        log.exception(message)
        return web.json_response({"error": message})

    document = {
        "_id": game_id,
        "us": [wplayer.username, bplayer.username],
        "v": V2C[variant],
        "b": base,
        "i": inc,
        "bp": new_game.byoyomi_period,
        "m": moves,
        "d": date,
        "f": final_fen,
        "s": status,
        "r": R2C[result],
        "x": new_game.level,
        "y": IMPORTED,
        "z": int(new_game.chess960),
        "by": data["username"],
    }

    if initial_fen or new_game.chess960:
        document["if"] = new_game.initial_fen

    if variant.endswith("shogi") or variant in ("dobutsu", "gorogoro"):
        document["uci"] = 1

    wrating = data.get("WhiteElo")
    brating = data.get("BlackElo")
    if wrating:
        document["p0"] = {"e": wrating}
    if brating:
        document["p1"] = {"e": brating}

    print(document)
    result = await db.game.insert_one(document)
    print("db insert IMPORTED game result %s" % repr(result.inserted_id))

    return web.json_response({"gameId": game_id})


async def join_seek(app, user, seek_id, game_id=None, join_as="any"):
    seeks = app["seeks"]
    seek = seeks[seek_id]
    log.info("+++ Seek %s joined by %s FEN:%s 960:%s", seek_id, user.username, seek.fen, seek.chess960)

    if (user is seek.player1 or user is seek.player2):
        return {"type": "seek_yourself", "seekID": seek_id}

    if join_as == "player1":
        if seek.player1 is None:
            seek.player1 = user
        else:
            return {"type": "seek_occupied", "seekID": seek_id}
    elif join_as == "player2":
        if seek.player2 is None:
            seek.player2 = user
        else:
            return {"type": "seek_occupied", "seekID": seek_id}
    else:
        if seek.player1 is None:
            seek.player1 = user
        elif seek.player2 is None:
            seek.player2 = user
        else:
            return {"type": "seek_occupied", "seekID": seek_id}

    if seek.player1 is not None and seek.player2 is not None:
        return await new_game(app, seek_id, game_id)
    else:
        return {"type": "seek_joined", "seekID": seek_id}


async def new_game(app, seek_id, game_id=None):
    db = app["db"]
    games = app["games"]
    seeks = app["seeks"]
    seek = seeks[seek_id]

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

    color = random.choice(("w", "b")) if seek.color == "r" else seek.color
    wplayer = seek.player1 if color == "w" else seek.player2
    bplayer = seek.player1 if color == "b" else seek.player2

    if game_id is not None:
        # game invitation
        del app["invites"][game_id]
    else:
        game_id = await new_id(None if db is None else db.game)

    # print("new_game", game_id, seek.variant, seek.fen, wplayer, bplayer, seek.base, seek.inc, seek.level, seek.rated, seek.chess960)
    try:
        game = Game(
            app, game_id, seek.variant, sanitized_fen, wplayer, bplayer,
            base=seek.base,
            inc=seek.inc,
            byoyomi_period=seek.byoyomi_period,
            level=seek.level,
            rated=RATED if (seek.rated and (not wplayer.anon) and (not bplayer.anon)) else CASUAL,
            chess960=seek.chess960,
            create=True)
    except Exception:
        log.exception("Creating new game %s failed! %s 960:%s FEN:%s %s vs %s", game_id, seek.variant, seek.chess960, seek.fen, wplayer, bplayer)
        remove_seek(seeks, seek)
        return {"type": "error", "message": "Failed to create game"}
    games[game_id] = game

    remove_seek(seeks, seek)

    await insert_game_to_db(game, app)

    return {"type": "new_game", "gameId": game_id, "wplayer": wplayer.username, "bplayer": bplayer.username}


async def insert_game_to_db(game, app):
    # unit test app may have no db
    if app["db"] is None:
        return

    document = {
        "_id": game.id,
        "us": [game.wplayer.username, game.bplayer.username],
        "p0": {"e": game.wrating},
        "p1": {"e": game.brating},
        "v": V2C[game.variant],
        "b": game.base,
        "i": game.inc,
        "bp": game.byoyomi_period,
        "m": [],
        "d": game.date,
        "f": game.initial_fen,
        "s": game.status,
        "r": R2C["*"],
        "x": game.level,
        "y": int(game.rated),
        "z": int(game.chess960),
    }

    if game.tournamentId is not None:
        document["tid"] = game.tournamentId

    if game.initial_fen or game.chess960:
        document["if"] = game.initial_fen

    if game.variant.endswith("shogi") or game.variant in ("dobutsu", "gorogoro"):
        document["uci"] = 1

    result = await app["db"].game.insert_one(document)
    if not result:
        log.error("db insert game result %s failed !!!", game.id)

    app["tv"] = game.id
    game.wplayer.tv = game.id
    game.bplayer.tv = game.id


def remove_seek(seeks, seek):
    if (not seek.creator.bot) and seek.id in seeks:
        del seeks[seek.id]
        if seek.id in seek.creator.seeks:
            del seek.creator.seeks[seek.id]


# This will be removed when we can use ffishjs
def get_dests(board):
    dests = {}
    promotions = []
    moves = board.legal_moves()

    for move in moves:
        if board.variant in GRANDS:
            move = grand2zero(move)
        source, dest = move[0:2], move[2:4]
        if source in dests:
            dests[source].append(dest)
        else:
            dests[source] = [dest]

        if not move[-1].isdigit():
            if not (board.variant in ("seirawan", "shouse") and (move[1] in ('1', '8'))):
                promotions.append(move)

        if board.variant == "kyotoshogi" and move[0] == "+":
            promotions.append(move)

    return (dests, promotions)


async def analysis_move(app, user, game, move, fen, ply):
    invalid_move = False

    board = FairyBoard(game.variant, fen, game.chess960)

    try:
        # san = board.get_san(move)
        lastmove = move
        board.push(move)
        dests, promotions = get_dests(board)
        check = board.is_checked()
    except Exception:
        invalid_move = True
        log.exception("!!! analysis_move() exception occured")

    if invalid_move:
        analysis_board_response = game.get_board(full=True)
    else:
        analysis_board_response = {
            "type": "analysis_board",
            "gameId": game.id,
            "fen": board.fen,
            "ply": ply,
            "lastMove": lastmove,
            "dests": dests,
            "promo": promotions,
            "check": check,
        }

    ws = user.game_sockets[game.id]
    await ws.send_json(analysis_board_response)


async def play_move(app, user, game, move, clocks=None, ply=None):
    gameId = game.id
    users = app["users"]
    invalid_move = False
    # log.info("%s move %s %s %s - %s" % (user.username, move, gameId, game.wplayer.username, game.bplayer.username))

    if game.status <= STARTED:
        if ply is not None and game.board.ply + 1 != ply:
            log.info("invalid ply received - probably a re-sent move that has already been processed")
            return
        try:
            await game.play_move(move, clocks, ply)
        except SystemError:
            invalid_move = True
            log.exception("Game %s aborted because invalid move %s by %s !!!", gameId, move, user.username)
            game.status = INVALIDMOVE
            game.result = "0-1" if user.username == game.wplayer.username else "1-0"
    else:
        # never play moves in finished games!
        return

    if not invalid_move:
        board_response = game.get_board(full=game.board.ply == 1)

        if not user.bot:
            try:
                ws = user.game_sockets[gameId]
                await ws.send_json(board_response)
            except (KeyError, ConnectionResetError):
                pass

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
                response = {"type": "gameEnd", "status": game.status, "result": game.result, "gameId": game.id, "pgn": game.pgn}
                await opp_ws.send_json(response)
        except (KeyError, ConnectionResetError):
            pass

    if not invalid_move:
        await round_broadcast(game, users, board_response, channels=app["game_channels"])

        if game.tournamentId is not None:
            tournament = app["tournaments"][game.tournamentId]
            if (tournament.top_game is not None) and tournament.status == T_STARTED and tournament.top_game.id == gameId:
                # no need to send lots of data to tournament top game
                del board_response["dests"]
                del board_response["promo"]
                del board_response["pgn"]
                del board_response["uci_usi"]
                del board_response["ct"]

                await tournament.broadcast(board_response)


def pgn(doc):
    variant = C2V[doc["v"]]
    mlist = decode_moves(doc["m"], variant)
    if len(mlist) == 0:
        return None

    chess960 = bool(int(doc.get("z"))) if "z" in doc else False

    initial_fen = doc.get("if")
    usi_format = variant.endswith("shogi") and doc.get("uci") is None

    if usi_format:
        # wplayer, bplayer = bplayer, wplayer
        if initial_fen:
            # print("load_game() USI SFEN was:", initial_fen)
            parts = initial_fen.split()
            if len(parts) > 3 and parts[1] in "wb":
                pockets = "[%s]" % parts[2] if parts[2] not in "-0" else ""
                initial_fen = parts[0] + pockets + (" w" if parts[1] == "b" else " b") + " 0 " + parts[3]
            else:
                initial_fen = parts[0] + (" w" if parts[1] == "b" else " b") + " 0"
            # print("   changed to:", initial_fen)

    if usi_format and variant == "shogi":
        mirror = mirror9
        mlist = list(map(mirror, mlist))

    elif usi_format and (variant in ("minishogi", "kyotoshogi")):
        mirror = mirror5
        mlist = list(map(mirror, mlist))

    elif variant in GRANDS:
        mlist = list(map(zero2grand, mlist))

    fen = initial_fen if initial_fen is not None else sf.start_fen(variant)
    # print(variant, fen, mlist)
    try:
        mlist = sf.get_san_moves(variant, fen, mlist, chess960, sf.NOTATION_SAN)
    except Exception:
        try:
            mlist = sf.get_san_moves(variant, fen, mlist[:-1], chess960, sf.NOTATION_SAN)
        except Exception:
            log.exception("%s %s %s movelist contains invalid move", doc["_id"], variant, doc["d"])
            mlist = mlist[0]

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
        int(doc["b"] * 60),
        doc["i"],
        doc["p0"]["e"] if "p0" in doc else "?",
        doc["p1"]["e"] if "p1" in doc else "?",
        variant.capitalize() if not chess960 else VARIANT_960_TO_PGN[variant],
        moves,
        C2R[doc["r"]],
        fen="" if no_setup else '[FEN "%s"]\n' % setup_fen,
        setup="" if no_setup else '[SetUp "1"]\n')


def sanitize_fen(variant, initial_fen, chess960):
    # Prevent this particular one to fail on our general sastling check
    if variant == "capablanca" and initial_fen == CONSERVATIVE_CAPA_FEN:
        return True, initial_fen

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
    if variant == "dobutsu":
        non_piece = "~+0123456789[]hH"
    elif variant == "orda":
        non_piece = "~+0123456789[]qH"
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
    if len(init) > 2:
        if variant in ("seirawan", "shouse"):
            invalid4 = any((c not in "KQABCDEFGHkqabcdefgh-" for c in init[2]))
        elif chess960:
            if all((c in "KQkq-" for c in init[2])):
                chess960 = False
            else:
                invalid4 = any((c not in "ABCDEFGHIJabcdefghij-" for c in init[2]))
        elif variant[-5:] != "shogi" and variant not in ("dobutsu", "gorogoro"):
            invalid4 = any((c not in start[2] + "-" for c in init[2]))

        # Castling right need rooks and king placed in starting square
        if (not invalid2) and (not invalid4) and not (chess960 and (variant in ("seirawan", "shouse"))):
            rows = init[0].split("/")
            backRankB = rows[1] if (variant == 'shako') else rows[0]
            backRankW = rows[-2] if (variant == 'shako') else rows[-1]
            # cut off pockets
            k = backRankW.rfind("[")
            if k > 0:
                backRankW = backRankW[:k]
            rookPosQ = 1 if (variant == 'shako') else 0
            rookPosK = -2 if (variant == 'shako') else -1
            if ("q" in init[2] and backRankB[rookPosQ] != 'r') or \
                ("k" in init[2] and backRankB[rookPosK] != 'r') or \
                    ("Q" in init[2] and backRankW[rookPosQ] != 'R') or \
                    ("K" in init[2] and backRankW[rookPosK] != 'R'):
                invalid4 = True

    # Number of kings
    bking = "l" if variant == "dobutsu" else "k"
    wking = "L" if variant == "dobutsu" else "K"
    invalid5 = init[0].count(bking) != 1 or init[0].count(wking) != 1

    # Opp king already in check
    curr_color = init[1]
    opp_color = "w" if curr_color == "b" else "b"
    init[1] = init[1].replace(curr_color, opp_color)
    board = FairyBoard(variant, " ".join(init), chess960)
    invalid6 = board.is_checked()

    if invalid0 or invalid1 or invalid2 or invalid3 or invalid4 or invalid5 or invalid6:
        print(invalid0, invalid1, invalid2, invalid3, invalid4, invalid5, invalid6)
        sanitized_fen = start_fen
        return False, start_fen
    return True, sanitized_fen


def online_count(users):
    return sum((1 for user in users.values() if user.online))
