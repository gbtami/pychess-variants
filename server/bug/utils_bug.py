import asyncio
import random
from datetime import timezone

from pychess_global_app_state import PychessGlobalAppState
from compress import R2C, C2R
from convert import zero2grand
from bug.game_bug import GameBug
from const import (
    MATE,
    STARTED,
    INVALIDMOVE,
    CASUAL,
    RATED,
    POCKET_PATTERN,
)
from glicko2.glicko2 import gl2
from newid import new_id
from utils import remove_seek, round_broadcast, sanitize_fen
from websocket_utils import ws_send_json
from logger import log
from variants import C2V, GRANDS


async def init_players(app_state: PychessGlobalAppState, wp_a, bp_a, wp_b, bp_b):
    wplayer_a = await app_state.users.get(wp_a)
    wplayer_b = await app_state.users.get(wp_b)
    bplayer_a = await app_state.users.get(bp_a)
    bplayer_b = await app_state.users.get(bp_b)
    return [wplayer_a, bplayer_a, wplayer_b, bplayer_b]


async def load_game_bug(app_state: PychessGlobalAppState, game_id):
    """Return Game object from app cache or from database"""
    log.debug("load_game_bug from db ")
    doc = await app_state.db.game.find_one({"_id": game_id})

    log.debug("load_game_bug parse START")
    if doc is None:
        return None

    wp, bp, wp_b, bp_b = doc["us"]
    wplayer, bplayer, wplayer_b, bplayer_b = await init_players(app_state, wp, bp, wp_b, bp_b)

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

    decode_method = game.server_variant.move_decoding
    mlist = [*map(decode_method, doc["m"])]

    if variant in GRANDS:
        mlist = [*map(zero2grand, mlist)]

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

    board_ply = {"a": 0, "b": 0}
    last_move, last_move_b = "", ""
    for ply, move in enumerate(mlist):
        try:
            board_name = (
                "a" if doc["o"][ply] == 0 else "b"
            )  # todo why am i not storing a/b instead of 0/1. either that or compress to bits maybe
            last_move, last_move_b = (
                move if board_name == "a" else last_move,
                move if board_name == "b" else last_move_b,
            )

            if move[1:2] != "@":
                last_move_captured_role = game.boards[board_name].piece_to_partner(move)
                # Add the captured piece to the partner pocked
                if last_move_captured_role is not None:
                    partner_board = "b" if board_name == "a" else "a"
                    game.boards[partner_board].fen = POCKET_PATTERN.sub(
                        r"[\1%s]" % last_move_captured_role, game.boards[partner_board].fen
                    )

            san = game.boards[board_name].get_san(move)

            if doc["s"] != MATE and san.endswith("#"):
                san = san.replace("#", "+")

            game.boards[board_name].push(move)

            if board_name == "a":
                game.checkA = game.boards[board_name].is_checked()
            else:
                game.checkB = game.boards[board_name].is_checked()

            # turnColor = "black" if game.board.color == BLACK else "white" todo: should i use board at all here? i mean adding a second one - maybe for fen ahd and check - but still can happen on client as well
            turn_color = "white" if (board_ply[board_name] + 1) % 2 == 0 else "black"

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

            step["clocks"] = [
                clocktimes_w[ply] if ply < len(clocktimes_w) and clocktimes_w[ply] else None,
                clocktimes_b[ply] if ply < len(clocktimes_b) and clocktimes_b[ply] else None,
            ]
            step["clocksB"] = [
                clocktimes_wB[ply] if ply < len(clocktimes_wB) and clocktimes_wB[ply] else None,
                clocktimes_bB[ply] if ply < len(clocktimes_bB) and clocktimes_bB[ply] else None,
            ]

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
        move = (
            game.steps[-1]["move"]
            if game.steps[-1]["boardName"] == "a"
            else game.steps[-1]["moveB"]
        )
        game.lastmove = move  # TODO: msg.lastmove where this value goes is totally redundant imho

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
            try:
                idx = int(key.replace("m", ""))
                game.steps[idx]["chat"] = []
                for c in chat[key]:
                    game.steps[idx]["chat"].append(
                        {"message": c["m"], "username": c["u"], "time": c["t"]}
                    )
            except Exception:
                log.exception(
                    "ERROR: Exception in load_game() chat parsing %s %s %s",
                    game_id,
                    variant,
                    doc.get("c"),
                )
                break

    app_state.games[game_id] = game
    if game.status > STARTED:
        asyncio.create_task(app_state.remove_from_cache(game), name="game-remove-%s" % game_id)
    log.debug("load_game_bug parse DONE")

    return game


async def new_game_bughouse(app_state: PychessGlobalAppState, seek_id, game_id=None):
    seek = app_state.seeks[seek_id]

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
    wplayer, bug_bplayer = (
        (seek.player1, seek.bugPlayer1) if color == "w" else (seek.player2, seek.bugPlayer2)
    )
    bplayer, bug_wplayer = (
        (seek.player1, seek.bugPlayer1) if color == "b" else (seek.player2, seek.bugPlayer2)
    )

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
            rated=(RATED if (seek.rated and (not wplayer.anon) and (not bplayer.anon)) else CASUAL),
            chess960=seek.chess960,
            create=True,
            new_960_fen_needed_for_rematch=seek.reused_fen,
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

        remove_seek(app_state.seeks, seek)
        return {"type": "error", "message": "Failed to create game"}
    app_state.games[game_id] = game

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
        "us": [
            game.wplayerA.username,
            game.bplayerA.username,
            game.wplayerB.username,
            game.bplayerB.username,
        ],
        "p0": {"e": game.wrating_a},
        "p1": {"e": game.brating_a},
        "p2": {"e": game.wrating_b},
        "p3": {"e": game.brating_b},
        "v": game.server_variant.code,
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


async def join_seek_bughouse(
    app_state: PychessGlobalAppState, user, seek_id, game_id=None, join_as="any"
):
    seek = app_state.seeks[seek_id]

    log.info(
        "+++ BUGHOUSE Seek %s joined by %s FEN:%s 960:%s",
        seek_id,
        user.username if user else None,
        seek.fen,
        seek.chess960,
    )

    if (
        join_as == "player1"
    ):  # todo: not really possible at the moment - should implement possibility of unseating a slot and somehow
        #       allowing the player who created the challenge to sit back in another slot or just remove this case and
        #       dont bother supporting such complex scenarios
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

    if (
        seek.player1 is not None
        and seek.player2 is not None
        and seek.bugPlayer1 is not None
        and seek.bugPlayer2 is not None
    ):
        return await new_game_bughouse(app_state, seek_id, game_id)
    else:
        return {"type": "seek_joined", "seekID": seek_id}


async def play_move(
    app_state: PychessGlobalAppState,
    user,
    game,
    move,
    clocks=None,
    clocks_b=None,
    board=None,
):
    log.debug(
        "play_move %r %r %r %r %r %r",
        user,
        game,
        move,
        clocks,
        clocks_b,
        board,
    )
    gameId = game.id
    invalid_move = False
    # log.info("%s move %s %s %s - %s" % (user.username, move, gameId, game.wplayer.username, game.bplayer.username))

    if game.status <= STARTED:
        try:
            if (
                game.lastmovePerBoardAndUser[board].get(user.username) != move
            ):  # in case of resending after reconnect we can get same move sent multiple times from client
                await game.play_move(move, clocks, clocks_b, board)
            else:
                log.debug("move already played - probably resent twice after multiple reconnects")
                return
        except SystemError:
            invalid_move = True
            log.exception(
                "Game %s aborted because invalid move %s by %s !!!",
                gameId,
                move,
                user.username,
            )
            game.status = INVALIDMOVE
            game.result = (
                "0-1"
                if user.username == game.wplayer.username or user.username == game.bplayerB.username
                else "1-0"
            )  # if team1 sent the invalid move 0-1 team2 wins
    else:
        # never play moves in finished games!
        return

    if not invalid_move:
        board_response = game.get_board()
        await round_broadcast(game, board_response, full=True, channels=app_state.game_channels)

    if game.status > STARTED:
        response = {
            "type": "gameEnd",
            "status": game.status,
            "result": game.result,
            "gameId": gameId,
            "pgn": game.pgn,
        }
        for u in set(game.non_bot_players):
            await u.send_game_message(gameId, response)

        if app_state.tv == gameId:
            await app_state.lobby.lobby_broadcast(board_response)


async def handle_accept_seek_bughouse(app_state: PychessGlobalAppState, user, data, seek):
    if user.anon:
        return
    response = await join_seek_bughouse(app_state, user, data["seekID"], None, data["joinAs"])
    bug_users = set(
        filter(
            lambda item: item is not None,
            [seek.player1, seek.player2, seek.bugPlayer1, seek.bugPlayer2],
        )
    )
    for u in bug_users:
        for s in u.lobby_sockets:
            await ws_send_json(s, response)
    await app_state.lobby.lobby_broadcast_seeks()


async def handle_leave_seek_bughouse(app_state: PychessGlobalAppState, user, seek):
    if seek.player2 == user:
        seek.player2 = None
    if seek.bugPlayer1 == user:
        seek.bugPlayer1 = None
    if seek.bugPlayer2 == user:
        seek.bugPlayer2 = None
    await app_state.lobby.lobby_broadcast_seeks()
