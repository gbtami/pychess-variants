from __future__ import annotations
import asyncio
import json
import logging

from const import TYPE_CHECKING

import random
from datetime import datetime, timezone, timedelta
from functools import partial

from aiohttp import web
import aiohttp_session
from aiohttp.web import WebSocketResponse
from aiohttp_sse import sse_response

from broadcast import round_broadcast
from const import (
    NOTIFY_PAGE_SIZE,
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
from compress import get_decode_method, get_encode_method, R2C, C2R, V2C, C2V
from convert import mirror5, mirror9, grand2zero, zero2grand
from fairy import BLACK, WHITE, STANDARD_FEN, FairyBoard
from game import Game
from newid import new_id
from user import User
from users import NotInDbUsers

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state

log = logging.getLogger(__name__)

try:
    import pyffish as sf

    sf.set_option("VariantPath", "variants.ini")
except ImportError:
    log.error("No pyffish module installed!", exc_info=True)


# See https://github.com/aio-libs/aiohttp/issues/3122 why this is needed
class MyWebSocketResponse(WebSocketResponse):
    @property
    def closed(self):
        return self._closed or self._req is None or self._req.transport is None


async def tv_game(app_state: PychessGlobalAppState):
    """Get latest played game id"""
    if app_state.tv is not None:
        return app_state.tv
    game_id = None
    doc = await app_state.db.game.find_one({}, sort=[("$natural", -1)])
    if doc is not None:
        game_id = doc["_id"]
        app_state.tv = game_id
    return game_id


async def tv_game_user(db, users, profileId):
    """Get latest played game id by a given user name"""
    if users[profileId].tv is not None:
        return users[profileId].tv
    game_id = None
    doc = await db.game.find_one({"us": profileId}, sort=[("$natural", -1)])
    if doc is not None:
        game_id = doc["_id"]
        users[profileId].tv = game_id
    return game_id


async def load_game(app_state: PychessGlobalAppState, game_id):
    """Return Game object from app cache or from database"""
    if game_id in app_state.games:
        return app_state.games[game_id]

    doc = await app_state.db.game.find_one({"_id": game_id})

    if doc is None:
        return None

    wp, bp = doc["us"]

    wplayer = await app_state.users.get(wp)
    bplayer = await app_state.users.get(bp)

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
                initial_fen = (
                    parts[0] + pockets + (" w" if parts[1] == "b" else " b") + " 0 " + parts[3]
                )
            else:
                initial_fen = parts[0] + (" w" if parts[1] == "b" else " b") + " 0"
            # print("   changed to:", initial_fen)

    corr = doc.get("c", False)

    game = Game(
        app_state,
        game_id,
        variant,
        initial_fen,
        wplayer,
        bplayer,
        base=doc["b"],
        inc=doc["i"],
        byoyomi_period=int(bool(doc.get("bp"))),
        level=doc.get("x"),
        rated=doc.get("y"),
        chess960=bool(doc.get("z")),
        corr=corr,
        create=False,
        tournamentId=doc.get("tid"),
    )

    game.usi_format = usi_format

    decode_method = get_decode_method(variant)
    mlist = [*map(decode_method, doc["m"])]

    if (mlist or game.tournamentId is not None) and doc["s"] > STARTED:
        game.saved = True

    if usi_format and variant == "shogi":
        mirror = mirror9
        mlist = [*map(mirror, mlist)]

    elif usi_format and (variant in ("minishogi", "kyotoshogi")):
        mirror = mirror5
        mlist = [*map(mirror, mlist)]

    elif variant in GRANDS:
        mlist = [*map(zero2grand, mlist)]
        if variant == "janggi":
            game.wsetup = doc.get("ws", False)
            game.bsetup = doc.get("bs", False)

    if "a" in doc:
        game.analysis = doc["a"]

    if "cw" in doc:
        base_clock_time = (game.base * 1000 * 60) + (0 if game.base > 0 else game.inc * 1000)
        game.clocks_w = [base_clock_time] + doc["cw"] if len(doc["cw"]) > 0 else [base_clock_time]
        game.clocks_b = [base_clock_time] + doc["cb"] if len(doc["cb"]) > 0 else [base_clock_time]

    level = doc.get("x")
    game.date = doc["d"]
    game.last_move_time = doc.get("l")
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

    if game.corr:
        if doc.get("wd", False):
            game.draw_offers.add(game.wplayer.username)
        if doc.get("bd", False):
            game.draw_offers.add(game.bplayer.username)

    if len(mlist) > 0:
        game.board.move_stack = mlist
        game.board.fen = doc["f"]
        game.board.ply = len(mlist)
        game.board.color = WHITE if game.board.fen.split()[1] == "w" else BLACK
        game.lastmove = mlist[-1]
        game.mct = doc.get("mct")

    game.loaded_at = datetime.now(timezone.utc)

    return game


async def import_game(request):
    data = await request.post()
    app_state = get_app_state(request.app)

    # print("---IMPORT GAME---")
    # print(data)
    # print("-----------------")

    wp = data["White"]
    bp = data["Black"]

    try:
        wplayer = await app_state.users.get(wp)
    except NotInDbUsers:
        wplayer = User(app_state, username=wp, anon=True)
        app_state.users[wp] = wplayer

    try:
        bplayer = await app_state.users.get(bp)
    except NotInDbUsers:
        bplayer = User(app_state, username=bp, anon=True)
        app_state.users[bp] = bplayer

    variant = data.get("Variant", "chess").lower()
    chess960 = variant.endswith("960")
    variant = variant.removesuffix("960")
    if variant == "caparandom":
        variant = "capablanca"
        chess960 = True
    elif variant == "fischerandom":
        variant = "chess"
        chess960 = True

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
        base = int((tc[0] / 60 if tc[0] > 60 else tc[0]) if not minute else tc[0])
        inc = int(tc[1])
    except Exception:
        log.exception("TimeControl tag parsing failed")
        base, inc = 0, 0

    move_stack = data.get("moves", "").split(" ")
    encode_method = get_encode_method(variant)
    moves = [*map(encode_method, map(grand2zero, move_stack) if variant in GRANDS else move_stack)]

    game_id = await new_id(None if app_state.db is None else app_state.db.game)
    existing = await app_state.db.game.find_one({"_id": {"$eq": game_id}})
    if existing:
        message = "Failed to create game. Game ID %s already in mongodb." % game_id
        log.exception(message)
        return web.json_response({"error": message})

    try:
        # print(game_id, variant, initial_fen, wplayer, bplayer)
        new_game = Game(
            app_state,
            game_id,
            variant,
            initial_fen,
            wplayer,
            bplayer,
            rated=IMPORTED,
            chess960=chess960,
            create=False,
        )
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

    if variant.endswith("shogi") or variant in ("dobutsu", "gorogoro", "gorogoroplus"):
        document["uci"] = 1

    wrating = data.get("WhiteElo")
    brating = data.get("BlackElo")
    if wrating:
        document["p0"] = {"e": wrating}
    if brating:
        document["p1"] = {"e": brating}

    # print(document)
    result = await app_state.db.game.insert_one(document)
    # print("db insert IMPORTED game result %s" % repr(result.inserted_id))

    return web.json_response({"gameId": game_id})


async def join_seek(app_state: PychessGlobalAppState, user, seek_id, game_id=None, join_as="any"):
    seek = app_state.seeks[seek_id]
    log.info(
        "+++ Seek %s joined by %s FEN:%s 960:%s",
        seek_id,
        user.username,
        seek.fen,
        seek.chess960,
    )

    if user is seek.player1 or user is seek.player2:
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
        return await new_game(app_state, seek_id, game_id)
    else:
        return {"type": "seek_joined", "seekID": seek_id}


async def new_game(app_state: PychessGlobalAppState, seek_id, game_id=None):
    seek = app_state.seeks[seek_id]

    fen_valid = True
    if seek.fen:
        fen_valid, sanitized_fen = sanitize_fen(seek.variant, seek.fen, seek.chess960)
        if not fen_valid:
            message = "Failed to create game. Invalid FEN %s" % seek.fen
            log.debug(message)
            remove_seek(app_state.seeks, seek)
            return {"type": "error", "message": message}
    else:
        sanitized_fen = ""

    color = random.choice(("w", "b")) if seek.color == "r" else seek.color
    wplayer = seek.player1 if color == "w" else seek.player2
    bplayer = seek.player1 if color == "b" else seek.player2

    if game_id is not None:
        # game invitation
        del app_state.invites[game_id]
    else:
        game_id = await new_id(None if app_state.db is None else app_state.db.game)

    # print("new_game", game_id, seek.variant, seek.fen, wplayer, bplayer, seek.base, seek.inc, seek.level, seek.rated, seek.chess960)
    try:
        rated = RATED if (seek.rated and (not wplayer.anon) and (not bplayer.anon)) else CASUAL

        game = Game(
            app_state,
            game_id,
            seek.variant,
            sanitized_fen,
            wplayer,
            bplayer,
            base=seek.base if seek.day == 0 else seek.day,
            inc=seek.inc,
            byoyomi_period=seek.byoyomi_period,
            level=seek.level,
            rated=rated,
            chess960=seek.chess960,
            corr=seek.day > 0,
            create=True,
        )
    except Exception:
        log.exception(
            "Creating new game %s failed! %s 960:%s FEN:%s %s vs %s",
            game_id,
            seek.variant,
            seek.chess960,
            seek.fen,
            wplayer,
            bplayer,
        )
        remove_seek(app_state.seeks, seek)
        return {"type": "error", "message": "Failed to create game"}
    app_state.games[game_id] = game

    remove_seek(app_state.seeks, seek)

    await insert_game_to_db(game, app_state)

    if game.corr:
        game.wplayer.correspondence_games.append(game)
        game.bplayer.correspondence_games.append(game)

    return {
        "type": "new_game",
        "gameId": game_id,
        "wplayer": wplayer.username,
        "bplayer": bplayer.username,
    }


async def insert_game_to_db(game, app_state: PychessGlobalAppState):
    # unit test app may have no db
    if app_state.db is None:
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
        "f": game.board.initial_fen,
        "s": game.status,
        "r": R2C["*"],
        "x": game.level,
        "y": int(game.rated),
        "z": int(game.chess960),
        "c": game.corr,
    }

    if game.tournamentId is not None:
        document["tid"] = game.tournamentId

    if game.variant.endswith("shogi") or game.variant in (
        "dobutsu",
        "gorogoro",
        "gorogoroplus",
    ):
        document["uci"] = 1

    if game.variant == "janggi":
        document["ws"] = game.wsetup
        document["bs"] = game.bsetup
        document["if"] = game.board.initial_fen

    if game.initial_fen or game.chess960:
        document["if"] = game.initial_fen

    result = await app_state.db.game.insert_one(document)
    if result.inserted_id != game.id:
        log.error("db insert game result %s failed !!!", game.id)

    if not game.corr:
        app_state.tv = game.id
        await app_state.lobby.lobby_broadcast(game.tv_game_json)
        game.wplayer.tv = game.id
        game.bplayer.tv = game.id


def remove_seek(seeks, seek):
    if (not seek.creator.bot) and seek.id in seeks:
        del seeks[seek.id]
        if seek.id in seek.creator.seeks:
            del seek.creator.seeks[seek.id]


async def analysis_move(user, game, move, fen, ply):
    invalid_move = False

    board = FairyBoard(game.variant, fen, game.chess960)

    try:
        # san = board.get_san(move)
        lastmove = move
        board.push(move)
        check = board.is_checked()
    except Exception:
        invalid_move = True
        log.exception("!!! analysis_move() exception occurred")

    if invalid_move:
        analysis_board_response = game.get_board(full=True)
    else:
        analysis_board_response = {
            "type": "analysis_board",
            "gameId": game.id,
            "fen": board.fen,
            "ply": ply,
            "lastMove": lastmove,
            "check": check,
        }
    await user.send_game_message(game.id, analysis_board_response)


async def play_move(app_state: PychessGlobalAppState, user, game, move, clocks=None, ply=None):
    gameId = game.id
    users = app_state.users
    invalid_move = False
    # log.info("%s move %s %s %s - %s" % (user.username, move, gameId, game.wplayer.username, game.bplayer.username))

    if game.status <= STARTED:
        if ply is not None and game.ply + 1 != ply:
            log.info(
                "invalid ply received - probably a re-sent move that has already been processed"
            )
            return

        cur_player = game.bplayer if game.board.color == BLACK else game.wplayer
        if user.bot and not cur_player.bot:
            log.info("BOT move %s arrived probably while human player takeback happened" % move)
            return

        try:
            await game.play_move(move, clocks, ply)
        except SystemError:
            invalid_move = True
            log.exception(
                "Game %s aborted because invalid move %s by %s !!!",
                gameId,
                move,
                user.username,
            )
            game.status = INVALIDMOVE
            game.result = "0-1" if user.username == game.wplayer.username else "1-0"
    else:
        # never play moves in finished games!
        log.error("Move received for finished game", stack_info=True)
        return

    if not invalid_move:
        board_response = game.get_board(full=game.board.ply == 1)

        if not user.bot:
            await user.send_game_message(gameId, board_response)

    if user.bot and game.status > STARTED:
        await user.game_queues[gameId].put(game.game_end)

    opp_name = (
        game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
    )
    if users[opp_name].bot:
        if game.status > STARTED:
            await users[opp_name].game_queues[gameId].put(game.game_end)
        else:
            await users[opp_name].game_queues[gameId].put(game.game_state)
    else:
        if not invalid_move:
            await users[opp_name].send_game_message(gameId, board_response)
        if game.status > STARTED:
            response = {
                "type": "gameEnd",
                "status": game.status,
                "result": game.result,
                "gameId": gameId,
                "pgn": game.pgn,
            }
            await users[opp_name].send_game_message(gameId, response)

    if not invalid_move:
        await round_broadcast(game, board_response, channels=app_state.game_channels)

        if game.tournamentId is not None:
            tournament = app_state.tournaments[game.tournamentId]
            if (
                (tournament.top_game is not None)
                and tournament.status == T_STARTED
                and tournament.top_game.id == gameId
            ):
                await tournament.broadcast(board_response)

        if app_state.tv == gameId:
            await app_state.lobby.lobby_broadcast(board_response)


def pgn(doc):
    variant = C2V[doc["v"]]
    decode_method = get_decode_method(variant)
    mlist = [*map(decode_method, doc["m"])]
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
                initial_fen = (
                    parts[0] + pockets + (" w" if parts[1] == "b" else " b") + " 0 " + parts[3]
                )
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

    fen = initial_fen if initial_fen is not None else FairyBoard.start_fen(variant)
    # print(variant, fen, mlist)
    try:
        mlist = sf.get_san_moves(variant, fen, mlist, chess960, sf.NOTATION_SAN)
    except Exception as e:
        log.error(e, exc_info=True)
        try:
            mlist = sf.get_san_moves(variant, fen, mlist[:-1], chess960, sf.NOTATION_SAN)
        except Exception:
            log.exception("%s %s %s movelist contains invalid move", doc["_id"], variant, doc["d"])
            mlist = mlist[0]

    moves = " ".join(
        (
            move if ind % 2 == 1 else "%s. %s" % (((ind + 1) // 2) + 1, move)
            for ind, move in enumerate(mlist)
        )
    )
    no_setup = fen == STANDARD_FEN and not chess960
    # Use lichess format for crazyhouse games to support easy import
    setup_fen = fen if variant != "crazyhouse" else fen.replace("[]", "")

    return '[Event "{}"]\n[Site "{}"]\n[Date "{}"]\n[Round "-"]\n[White "{}"]\n[Black "{}"]\n[Result "{}"]\n[TimeControl "{}+{}"]\n[WhiteElo "{}"]\n[BlackElo "{}"]\n[Variant "{}"]\n{fen}{setup}\n{} {}\n'.format(
        "PyChess " + ("rated" if "y" in doc and doc["y"] == 1 else "casual") + " game",
        "https://www.pychess.org/" + doc["_id"],
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
        setup="" if no_setup else '[SetUp "1"]\n',
    )


def sanitize_fen(variant, initial_fen, chess960):
    # Prevent this particular one to fail on our general castling check
    if variant == "capablanca" and initial_fen == CONSERVATIVE_CAPA_FEN:
        return True, initial_fen

    sf_validate = sf.validate_fen(initial_fen, variant, chess960)
    if sf_validate != sf.FEN_OK and variant != "duck":
        return False, ""

    # Initial_fen needs validation to prevent segfaulting in pyffish
    sanitized_fen = initial_fen

    start_fen = FairyBoard.start_fen(variant)  # self.board.start_fen(self.variant)
    start_fen_length = len(start_fen)
    start = start_fen.split()
    init = initial_fen.split()

    # Cut off tail
    if len(init) > start_fen_length:
        init = init[:start_fen_length]
        sanitized_fen = " ".join(init)

    # We need starting color
    invalid0 = len(init) < 2

    # Only piece types listed in variant start position can be used later
    if variant == "dobutsu":
        non_piece = "~+0123456789[]hH-"
    elif variant == "orda":
        non_piece = "~+0123456789[]qH-"
    elif variant == "duck":
        non_piece = "~+0123456789[]*-"
    elif variant == "ataxx":
        non_piece = "0123456789*-"
    else:
        non_piece = "~+0123456789[]-"
    invalid1 = any((c not in start[0] + non_piece for c in init[0]))

    # Required number of rows
    invalid2 = start[0].count("/") != init[0].count("/")

    # Accept zh FEN in lichess format (they use / instead if [] for pockets)
    if invalid2 and variant == "crazyhouse":
        if (init[0].count("/") == 8) and ("[" not in init[0]) and ("]" not in init[0]):
            k = init[0].rfind("/")
            init[0] = init[0][:k] + "[" + init[0][k + 1 :] + "]"
            sanitized_fen = " ".join(init)
            invalid2 = False

    # Allowed starting colors
    invalid3 = len(init) > 1 and init[1] not in "bw"

    # ataxx has no kings at all
    if variant == "ataxx":
        return True, sanitized_fen

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
        elif variant[-5:] != "shogi" and variant not in (
            "dobutsu",
            "gorogoro",
            "gorogoroplus",
        ):
            invalid4 = any((c not in start[2] + "-" for c in init[2]))

        # Castling right need rooks and king placed in starting square
        if (
            (not invalid2)
            and (not invalid4)
            and not (chess960 and (variant in ("seirawan", "shouse")))
        ):
            rows = init[0].split("/")
            backRankB = rows[1] if (variant == "shako") else rows[0]
            backRankW = rows[-2] if (variant == "shako") else rows[-1]
            # cut off pockets
            k = backRankW.rfind("[")
            if k > 0:
                backRankW = backRankW[:k]
            rookPosQ = 1 if (variant == "shako") else 0
            rookPosK = -2 if (variant == "shako") else -1
            if (
                ("q" in init[2] and backRankB[rookPosQ] != "r")
                or ("k" in init[2] and backRankB[rookPosK] != "r")
                or ("Q" in init[2] and backRankW[rookPosQ] != "R")
                or ("K" in init[2] and backRankW[rookPosK] != "R")
            ):
                invalid4 = True

    # Number of kings
    bking = "l" if variant == "dobutsu" else "k"
    wking = "L" if variant == "dobutsu" else "K"
    bK = init[0].count(bking)
    wK = init[0].count(wking)
    if variant == "spartan":
        invalid5 = bK == 0 or bK > 2 or wK != 1
    else:
        invalid5 = bK != 1 or wK != 1

    # Opp king already in check
    invalid6 = False
    if not (invalid0 or invalid1 or invalid2 or invalid3 or invalid4 or invalid5):
        curr_color = init[1]
        opp_color = "w" if curr_color == "b" else "b"
        init[1] = init[1].replace(curr_color, opp_color)
        board = FairyBoard(variant, " ".join(init), chess960)
        invalid6 = board.is_checked()

    if invalid0 or invalid1 or invalid2 or invalid3 or invalid4 or invalid5 or invalid6:
        print(invalid0, invalid1, invalid2, invalid3, invalid4, invalid5, invalid6)
        return False, ""
    return True, sanitized_fen


async def get_names(request):
    app_state = get_app_state(request.app)
    names = []
    prefix = request.rel_url.query.get("p")
    if prefix is None or len(prefix) < 3:
        return web.json_response(names)

    # case insensitive _id prefix search
    cursor = app_state.db.user.find({"_id": {"$regex": "^%s" % prefix, "$options": "i"}}, limit=12)
    async for doc in cursor:
        names.append((doc["_id"], doc["title"]))
    return web.json_response(names)


async def get_blogs(request, tag=None, limit=0):
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return []

    blogs = []
    if tag is None:
        cursor = app_state.db.blog.find()
    else:
        cursor = app_state.db.blog.find({"tags": tag})

    cursor.sort("date", -1).limit(limit)
    async for doc in cursor:
        user = await app_state.users.get(doc["author"])
        doc["atitle"] = user.title
        blogs.append(doc)
    return blogs


async def get_notifications(request):
    app_state = get_app_state(request.app)
    page_num = int(request.rel_url.query.get("p", 0))

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        return web.json_response({})

    user = app_state.users[session_user]

    if user.notifications is None:
        cursor = app_state.db.notify.find({"notifies": session_user})
        user.notifications = await cursor.to_list(length=100)
    if page_num == 0:
        notifications = user.notifications[-NOTIFY_PAGE_SIZE:]
    else:
        notifications = user.notifications[
            -(page_num + 1) * NOTIFY_PAGE_SIZE : -page_num * NOTIFY_PAGE_SIZE
        ]

    return web.json_response(notifications, dumps=partial(json.dumps, default=datetime.isoformat))


async def notified(request):
    app_state = get_app_state(request.app)

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        return web.json_response({})

    user = await app_state.users.get(session_user)
    await user.notified()
    return web.json_response({})


async def subscribe_notify(request):
    app_state = get_app_state(request.app)
    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        return web.json_response({})

    user = await app_state.users.get(session_user)
    queue = asyncio.Queue()
    user.notify_channels.add(queue)
    try:
        async with sse_response(request) as response:
            while not response.task.done():
                payload = await queue.get()
                await response.send(payload)
                queue.task_done()
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    finally:
        user.notify_channels.remove(queue)
    return response


def corr_games(games):
    now = datetime.now(timezone.utc)
    return [
        {
            "gameId": game.id,
            "variant": game.variant,
            "fen": game.board.fen,
            "lastMove": game.lastmove,
            "tp": game.turn_player,
            "w": game.wplayer.username,
            "wTitle": game.wplayer.title,
            "b": game.bplayer.username,
            "bTitle": game.bplayer.title,
            "chess960": game.chess960,
            "base": game.base,
            "inc": game.inc,
            "byoyomi": game.byoyomi_period,
            "level": game.level,
            "date": (now + timedelta(minutes=game.stopwatch.mins)).isoformat(),
        }
        for game in games
    ]
