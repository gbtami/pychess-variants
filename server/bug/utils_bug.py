import logging
import random
import re
from datetime import timezone

from pychess_global_app_state import PychessGlobalAppState
from user import User
from compress import decode_moves, R2C, C2R, V2C, C2V
from bug.game_bug import GameBug, MAX_PLY
from const import (
    STARTED,
    INVALIDMOVE,
    CASUAL,
    RATED,
)
from glicko2.glicko2 import gl2
from newid import new_id
from utils import round_broadcast

log = logging.getLogger(__name__)


def init_players(app_state: PychessGlobalAppState, wp_a, bp_a, wp_b, bp_b):
    if wp_a in app_state.users:
        wplayer_a = app_state.users[wp_a]
    else:
        wplayer_a = User(app_state, username=wp_a, anon=True)
        app_state.users[wp_a] = wplayer_a
    if wp_b in app_state.users:
        wplayer_b = app_state.users[wp_b]
    else:
        wplayer_b = User(app_state, username=wp_b, anon=True)
        app_state.users[wp_b] = wplayer_b

    if bp_a in app_state.users:
        bplayer_a = app_state.users[bp_a]
    else:
        bplayer_a = User(app_state, username=bp_a, anon=True)
        app_state.users[bp_a] = bplayer_a
    if bp_b in app_state.users:
        bplayer_b = app_state.users[bp_b]
    else:
        bplayer_b = User(app_state, username=bp_b, anon=True)
        app_state.users[bp_b] = bplayer_b
    return [wplayer_a, bplayer_a, wplayer_b, bplayer_b]


async def load_game_bug(app_state: PychessGlobalAppState, game_id):
    """Return Game object from app cache or from database"""

    # games = app[games_key]

    # if game_id in games:
    #     return games[game_id]

    doc = await app_state.db.game.find_one({"_id": game_id})

    if doc is None:
        return None

    wp, bp, wp_b, bp_b = doc["us"]
    wplayer, bplayer, wplayer_b, bplayer_b = init_players(app_state, wp, bp, wp_b, bp_b)

    variant = C2V[doc["v"]]

    initial_fen = doc.get("if")

    game = GameBug(
        app_state,
        game_id,
        variant,
        initial_fen,
        wplayer,
        bplayer,
        wplayer_b,
        bplayer_b,
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

    base_clock_time = (game.base * 1000 * 60) + (0 if game.base > 0 else game.inc * 1000)

    if "cw" in doc:
        clocktimes_w = doc["cw"] if len(doc["cw"]) > 0 else [base_clock_time]
        clocktimes_b = doc["cb"] if len(doc["cb"]) > 0 else [base_clock_time]
        clocktimes_w.insert(0, base_clock_time)
        clocktimes_b.insert(0, base_clock_time)

    if "cwB" in doc:
        clocktimes_wB = doc["cwB"] if len(doc["cwB"]) > 0 else [base_clock_time]
        clocktimes_bB = doc["cbB"] if len(doc["cbB"]) > 0 else [base_clock_time]
        clocktimes_wB.insert(0, base_clock_time)
        clocktimes_bB.insert(0, base_clock_time)

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

            # todo:niki: see where this check stuff is used at all - theoretically can always be calculated on client
            #  - if we decide to use it, because important for scrolling moves for example, then consider adding
            #  checkB to have it for both boards if we jump at a ply with check on the other board
            if board_name == "a":
                game.checkA = game.boards[board_name].is_checked()
            if board_name == "b":
                game.checkB = game.boards[board_name].is_checked()

            # turnColor = "black" if game.board.color == BLACK else "white" todo: should i use board at all here? i mean adding a second one - maybe for fen ahd and check - but still can happen on client as well
            turn_color = "white" if (board_ply[board_name]+1) % 2 == 0 else "black"

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
                "check": game.checkA if board_name == "a" else game.checkB,
            }

            step["clocks"] = {
                "white": clocktimes_w[ply],
                "black": clocktimes_b[ply],
            }
            step["clocksB"] = {
                "white": clocktimes_wB[ply],
                "black": clocktimes_bB[ply],
            }

            board_ply[board_name] += 1

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
        game.wrating_a = doc["p0"]["e"]
        game.brating_a = doc["p1"]["e"]
        game.wrating_b = doc["p2"]["e"]
        game.brating_b = doc["p3"]["e"]
    except KeyError:
        game.wrating_a = "1500?"
        game.brating_a = "1500?"
        game.wrating_b = "1500?"
        game.brating_b = "1500?"

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

    if doc.get("c") is not None:
        chat = doc.get("c")
        for key in chat:
            idx = int(key)
            game.steps[idx]["chat"] = []
            for c in chat[key]:
                game.steps[idx]["chat"].append({
                    "message": c["m"],
                    "username": c["u"],
                    "time": c["t"]
                })
    return game


async def new_game_bughouse(app_state: PychessGlobalAppState, seek_id, game_id=None):
    seek = app_state.seeks[seek_id]

    if seek.fen:
        from utils import sanitize_fen
        fens = seek.fen.split(" | ")
        fen_a = fens[0]
        fen_b = fens[1]
        fen_valid_a, sanitized_fen_a = sanitize_fen(seek.variant, fen_a, seek.chess960)
        fen_valid_b, sanitized_fen_b = sanitize_fen(seek.variant, fen_b, seek.chess960)
        if not fen_valid_a or not fen_valid_b:
            message = "Failed to create game. Invalid FEN %s" % seek.fen
            log.debug(message)
            from utils import remove_seek
            remove_seek(app_state.seeks, seek)
            return {"type": "error", "message": message}
        sanitized_fen = sanitized_fen_a + " | " + sanitized_fen_b
    else:
        sanitized_fen = ""

    color = random.choice(("w", "b")) if seek.color == "r" else seek.color
    wplayer, bug_bplayer = (seek.player1, seek.bugPlayer1) if color == "w" else (seek.player2, seek.bugPlayer2)
    bplayer, bug_wplayer = (seek.player1, seek.bugPlayer1) if color == "b" else (seek.player2, seek.bugPlayer2)

    if game_id is not None:
        # game invitation
        del app_state.invites[game_id]
    else:
        game_id = await new_id(None if app_state.db is None else app_state.db.game)

    # print("new_game", game_id, seek.variant, seek.fen, wplayer, bplayer, seek.base, seek.inc, seek.level, seek.rated, seek.chess960)
    try:
        game = GameBug(
            app_state,
            game_id,
            seek.variant,
            sanitized_fen,
            wplayer,
            bplayer,
            bug_wplayer,
            bug_bplayer,
            base=seek.base,
            inc=seek.inc,
            level=seek.level,
            rated=RATED if (seek.rated and (not wplayer.anon) and (not bplayer.anon)) else CASUAL,
            chess960=seek.chess960,
            create=True,
        )
    except Exception:
        log.exception(
            "Creating new BugHouse game %s failed! %s 960:%s FEN:%s %s+%s vs %s+%s",
            game_id,
            seek.variant,
            seek.chess960,
            seek.fen,
            wplayer,
            bug_bplayer,
            bug_wplayer,
            bplayer,
        )
        from utils import remove_seek
        remove_seek(app_state.seeks, seek)
        return {"type": "error", "message": "Failed to create game"}
    app_state.games[game_id] = game

    from utils import remove_seek
    remove_seek(app_state.seeks, seek)

    await insert_game_to_db_bughouse(game, app_state)

    return {
        "type": "new_game",
        "gameId": game_id,
        "wplayer": wplayer.username,
        "bplayer": bplayer.username,
        "bug_wplayer": bug_wplayer.username,
        "bug_bplayer": bug_bplayer.username,
    }


async def insert_game_to_db_bughouse(game: GameBug, app_state: PychessGlobalAppState):
    # unit test app may have no db
    if app_state.db is None:
        return

    document = {
        "_id": game.id,
        "us": [game.wplayerA.username, game.bplayerA.username, game.wplayerB.username, game.bplayerB.username],
        "p0": {"e": game.wrating_a},
        "p1": {"e": game.brating_a},
        "p2": {"e": game.wrating_b},
        "p3": {"e": game.brating_b},
        "v": V2C[game.variant],
        "b": game.base,
        "i": game.inc,
        # "bp": game.byoyomi_period,
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

    # if game.variant.endswith("shogi") or game.variant in (
    #     "dobutsu",
    #     "gorogoro",
    #     "gorogoroplus",
    # ):
    #     document["uci"] = 1

    result = await app_state.db.game.insert_one(document)
    if not result:
        log.error("db insert game result %s failed !!!", game.id)

    app_state.tv = game.id
    game.wplayerA.tv = game.id
    game.bplayerA.tv = game.id
    game.wplayerB.tv = game.id
    game.bplayerB.tv = game.id


async def join_seek_bughouse(app_state: PychessGlobalAppState, user, seek_id, game_id=None, join_as="any"):

    seek = app_state.seeks[seek_id]

    log.info(
        "+++ BUGHOUSE Seek %s joined by %s FEN:%s 960:%s",
        seek_id,
        user.username if user else None,
        seek.fen,
        seek.chess960,
    )

    if join_as == "player1": # todo:niki:not really possible to happen - maybe delete eventually unless change of mind - should implement unseating a slot first and decide if player1 can un-seat their default slot
        if seek.player1 is None:
            seek.player1 = user
        else:
            return {"type": "seek_occupied", "seekID": seek_id}
    elif join_as == "player2":
        if seek.player2 is None:
            seek.player2 = user
        else:
            return {"type": "seek_occupied", "seekID": seek_id}
    elif join_as == "bugPlayer1":
        if seek.bugPlayer1 is None:
            seek.bugPlayer1 = user
        else:
            return {"type": "seek_occupied", "seekID": seek_id}
    elif join_as == "bugPlayer2":
        if seek.bugPlayer2 is None:
            seek.bugPlayer2 = user
        else:
            return {"type": "seek_occupied", "seekID": seek_id}

    if seek.player1 is not None and seek.player2 is not None and seek.bugPlayer1 is not None and seek.bugPlayer2 is not None:
        return await new_game_bughouse(app_state, seek_id, game_id)
    else:
        return {"type": "seek_joined", "seekID": seek_id}


async def play_move(app_state: PychessGlobalAppState, user, game, move, clocks=None, clocks_b=None, board=None, last_move_captured_role=None):
    log.debug("play_move %r %r %r %r %r %r %r", user, game, move, clocks, clocks_b, board, last_move_captured_role)
    gameId = game.id
    invalid_move = False
    # log.info("%s move %s %s %s - %s" % (user.username, move, gameId, game.wplayer.username, game.bplayer.username))

    if game.status <= STARTED:
        try:
            if not game.lastmovePerBoardAndUser[board].get(user.username) == move: # in case of resending after reconnect we can have same move sent multiple times from client
                await game.play_move(move, clocks, clocks_b, board, last_move_captured_role)
            else:
                log.debug("move already played - probably resent twice after multiple reconnects")
                return
                # this move has already been processed.
                # todo:niki:i wonder if this is enough check.
                #      is it possible to resend some old move, but before that do a new one and send it before the
                #      resend of the old one or something like this?
                #      - If we disconnect, make a move, refresh/close browser/whatever/open game
                #        again and make a different move. If first one came through somehow but we refreshed before
                #        it was processed so got old position and made another move - that doesnt seem possible
        except SystemError:
            invalid_move = True
            log.exception(
                "Game %s aborted because invalid move %s by %s !!!",
                gameId,
                move,
                user.username,
            )
            game.status = INVALIDMOVE
            game.result = "0-1" if user.username == game.wplayer.username or user.username == game.bplayerB.username else "1-0" #if team1 sent the invalid move 0-1 team2 wins
    else:
        # never play moves in finished games!
        return

    if not invalid_move:
        board_response = game.get_board()
        await round_broadcast(game, board_response, channels=app_state.game_channels)

        for u in set(game.all_players):
            await u.send_game_message(gameId, board_response) # todo:niki:why am i not just doint full broadcast?

    if game.status > STARTED:
        response = {
            "type": "gameEnd",
            "status": game.status,
            "result": game.result,
            "gameId": gameId,
            "pgn": game.pgn,
        }
        for u in set(game.all_players):
            await u.send_game_message(gameId, response)

        if app_state.tv == gameId:
            await app_state.lobby.lobby_broadcast(board_response)
