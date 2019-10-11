import asyncio
import json
import logging
import random
import string
from time import monotonic, time
from datetime import datetime
from functools import partial

from aiohttp.web import WebSocketResponse

try:
    import pyffish as sf
    sf.set_option("VariantPath", "variants.ini")
except ImportError:
    print("No pyffish module installed!")

from fairy import FairyBoard, WHITE, BLACK, STANDARD_FEN, SHOGI_FEN, MINISHOGI_FEN
from xiangqi import XiangqiBoard

from settings import URI
from compress import encode_moves, decode_moves, R2C, C2R, V2C, C2V

log = logging.getLogger(__name__)


MAX_USER_SEEKS = 10
MORE_TIME = 15 * 1000
MOVE, ANALYSIS = 0, 1

CREATED, STARTED, ABORTED, MATE, RESIGN, STALEMATE, TIMEOUT, DRAW, FLAG, \
    ABANDONE, CHEAT, NOSTART, INVALIDMOVE, UNKNOWNFINISH, VARIANTEND = range(-2, 13)

LOSERS = {
    "abandone": ABANDONE,
    "abort": ABORTED,
    "resign": RESIGN,
    "flag": FLAG,
}

VARIANTS = (
    "makruk",
    "sittuyin",
    "shogi",
    "xiangqi",
    "standard",
    "crazyhouse",
    "placement",
    "capablanca",
    "capahouse",
    "seirawan",
    "shouse",
    "grand",
    "grandhouse",
    "gothic",
    "gothhouse",
    "minishogi",
)

VARIANTS960 = {
    "standard": "Chess960",
    "capablanca": "Caparandom",
    "capahouse": "Capahouse960",
    "crazyhouse": "Crazyhouse960",
    "seirawan": "Seirawan960",
    "shogi": "shogi",
    "sittuyin": "sittuyin",
    "makruk": "makruk",
    "placement": "placement",
    "grand": "grand",
}


class MyWebSocketResponse(WebSocketResponse):
    @property
    def closed(self):
        return self._closed or self._req is None or self._req.transport is None


def usi2uci(move):
    """ Used to create chessground dests UCI coordinates from USI shogi moves and on game save also. """
    if move[1] == "*":
        return "%s@%s%s" % (move[0], chr(ord(move[2]) + 48), chr(ord(move[3]) - 48))
    else:
        return "%s%s%s%s%s" % (chr(ord(move[0]) + 48), chr(ord(move[1]) - 48), chr(ord(move[2]) + 48), chr(ord(move[3]) - 48), move[4] if len(move) == 5 else "")


def uci2usi(move):
    if move[1] == "@":
        return "%s*%s%s" % (move[0], chr(ord(move[2]) - 48), chr(ord(move[3]) + 48))
    else:
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
        else:
            return "%s%s%s%s" % (move[0], int(move[1]) - 1, move[2], int(move[3:]) - 1)
    else:
        # promotion
        promo = move[-1]
        move = move[:-1]
        if move[2].isdigit():
            return "%s%s%s%s%s" % (move[0], int(move[1:3]) - 1, move[3], int(move[4:]) - 1, promo)
        else:
            return "%s%s%s%s%s" % (move[0], int(move[1]) - 1, move[2], int(move[3:]) - 1, promo)


def zero2grand(move):
    if move[1] == "@":
        return "%s@%s%s" % (move[0], move[2], int(move[3:]) + 1)
    return "%s%s%s%s%s" % (move[0], int(move[1]) + 1, move[2], int(move[3]) + 1, move[4] if len(move) == 5 else "")


class Seek:
    gen_id = 0

    def __init__(self, user, variant, fen="", color="r", base=5, inc=3, level=6, rated=False, chess960=False):
        self.user = user
        self.variant = variant
        self.color = color
        self.fen = "" if fen is None else fen
        self.rated = rated
        self.base = base
        self.inc = inc
        self.level = 0 if user.username == "Random-Mover" else level
        self.chess960 = chess960

        Seek.gen_id += 1
        self.id = self.gen_id

        self.as_json = {
            "seekID": self.id,
            "user": self.user.username,
            "bot": self.user.bot,
            "variant": self.variant,
            "chess960": self.chess960,
            "fen": self.fen,
            "color": self.color,
            "rated": "Rated" if self.rated else "Casual",
            "tc": "%s+%s" % (self.base, self.inc)
        }


class User:
    def __init__(self, lobby_ws=None, bot=False, username=None, title="", country="", first_name="", last_name=""):
        self.lobby_ws = lobby_ws
        self.bot = bot
        if username is None:
            self.anon = True
            self.username = "Anonymous" + "".join(random.sample(string.ascii_uppercase, 4))
        else:
            self.anon = False
            self.username = username
        self.first_name = first_name
        self.last_name = last_name
        self.country = country
        self.seeks = {}
        if self.bot:
            self.event_queue = asyncio.Queue()
            self.game_queues = {}
            self.title = "BOT"
        else:
            self.game_sockets = {}
            self.title = title
        self.online = False
        self.ping_counter = 0

    @property
    def as_json(self):
        return {
            "_id": self.username,
            "title": self.title,
            "first_name": self.first_name,
            "last-name": self.last_name,
            "online": self.online,
            "country": self.country,
        }

    async def clear_seeks(self, sockets, seeks):
        has_seek = len(self.seeks) > 0
        if has_seek:
            for seek in self.seeks:
                del seeks[seek]
            self.seeks.clear()

            await lobby_broadcast(sockets, get_seeks(seeks))

    async def quit_lobby(self, sockets, disconnect):
        print(self.username, "quit()")

        self.online = False
        if self.username in sockets:
            del sockets[self.username]

        text = "disconnected" if disconnect else "left the lobby"
        response = {"type": "lobbychat", "user": "", "message": "%s %s" % (self.username, text)}
        await lobby_broadcast(sockets, response)

    async def round_broadcast_disconnect(self, users, games):
        games_involved = self.game_queues.keys() if self.bot else self.game_sockets.keys()

        for gameId in games_involved:
            if gameId not in games:
                continue
            game = games[gameId]
            if self.username != game.wplayer.username and self.username != game.bplayer.username:
                continue

            response = {"type": "user_disconnected", "username": self.username, "gameId": gameId}
            opp = game.bplayer if game.wplayer.username == self.username else game.wplayer
            if (not opp.bot) and gameId in opp.game_sockets:
                await opp.game_sockets[gameId].send_json(response)

            await round_broadcast(game, users, response)

    async def pinger(self, sockets, seeks, users, games):
        while True:
            if self.ping_counter > 2:
                self.online = False
                log.info("%s went offline" % self.username)
                await self.round_broadcast_disconnect(users, games)
                await self.clear_seeks(sockets, seeks)
                await self.quit_lobby(sockets, disconnect=True)
                break

            if self.bot:
                await self.event_queue.put("\n")
                # heroku needs something at least in 50 sec not to close BOT connections (stream events) on server side
            else:
                await self.lobby_ws.send_json({"type": "ping", "timestamp": "%s" % time()})
            await asyncio.sleep(3)
            self.ping_counter += 1

    def __str__(self):
        return self.username


class Clock:
    """ Check game start and abandoned games time out """

    def __init__(self, game):
        self.game = game
        self.running = False
        self.restart()
        loop = asyncio.get_event_loop()
        self.countdown_task = loop.create_task(self.countdown())

    def cancel(self):
        self.countdown_task.cancel()

    def stop(self):
        self.running = False
        return self.secs

    def restart(self, secs=None):
        self.ply = self.game.ply
        self.color = self.game.board.color
        if secs is not None:
            self.secs = secs
        else:
            self.secs = 20 * 1000 if self.ply < 2 else self.game.ply_clocks[self.ply]["white" if self.color == WHITE else "black"]
        self.running = True

    async def countdown(self):
        while True:
            while self.secs > 0 and self.running:
                await asyncio.sleep(1)
                self.secs -= 1000

            # Time was running out
            if self.running:
                if self.game.ply == self.ply:
                    # On lichess rage quit waits 10 seconds
                    # until the other side gets the win claim,
                    # and a disconnection gets 120 seconds.
                    await asyncio.sleep(10)

                    # If FLAG was not received we have to act
                    if self.game.status < ABORTED:
                        if self.ply < 2:
                            await self.game.update_status(ABORTED)
                            print("   ABORTED by server!!!.", )
                        else:
                            w, b = self.game.board.insufficient_material()
                            cur_color = "black" if self.color == BLACK else "white"
                            if (w and b) or (cur_color == "black" and w) or (cur_color == "white" and b):
                                result = "1/2-1/2"
                            else:
                                result = "1-0" if self.color == BLACK else "0-1"
                            await self.game.update_status(FLAG, result)
                            print("   FLAG by server!!!", )

            # After stop() we are just waiting for next restart
            await asyncio.sleep(1)


class Game:
    def __init__(self, app, gameId, variant, initial_fen, wplayer, bplayer, base=1, inc=0, level=0, rated=False, chess960=False):
        self.db = app["db"]
        self.games = app["games"]
        self.tasks = app["tasks"]
        self.saved = False
        self.variant = variant
        self.initial_fen = initial_fen
        self.wplayer = wplayer
        self.bplayer = bplayer
        self.rated = rated
        self.base = base
        self.inc = inc
        self.level = level if level is not None else 0
        self.chess960 = chess960

        self.spectators = set()
        self.draw_offers = set()
        self.rematch_offers = set()
        self.messages = []
        self.date = datetime.utcnow()

        self.ply_clocks = [{
            "black": (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
            "white": (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
            "movetime": 0
        }]
        self.dests = {}
        self.promotions = []
        self.lastmove = None
        self.check = False
        self.status = CREATED
        self.result = "*"
        self.bot_game = False
        self.last_server_clock = monotonic()

        self.id = gameId
        # print("Game", self.variant, self.initial_fen, self.chess960)
        self.board = self.create_board(self.variant, self.initial_fen, self.chess960)

        # Initial_fen needs validation to prevent segfaulting in pyffish
        if self.initial_fen:
            start_fen = self.board.start_fen(self.variant)
            start = start_fen.split()
            init = self.initial_fen.split()

            # Cut off tail
            if len(init) > 6:
                init = init[:6]
                self.initial_fen = " ".join(init)

            # We need starting color
            invalid0 = len(init) < 2

            # Only piece types listed in variant start position can be used later
            invalid1 = any((c not in start[0] for c in init[0] if not c.isdigit()))

            # Required number of rows
            invalid2 = start[0].count("/") != init[0].count("/")

            # Allowed starting colors
            invalid3 = init[1] not in "bw"

            # Castling rights (and piece virginity) check
            if self.variant == "seirawan" or self.variant == "shouse":
                invalid4 = len(init) > 2 and any((c not in "KQBCDFGkqbcdfgAHah-" for c in init[2]))
            elif self.chess960:
                if all((c in "KQkq-" for c in init[2])):
                    invalid4 = False
                    self.chess960 = False
                else:
                    invalid4 = len(init) > 2 and any((c not in "ABCDEFGHIJabcdefghij-" for c in init[2]))
            else:
                invalid4 = len(init) > 2 and any((c not in start[2] + "-" for c in init[2]))

            if invalid0 or invalid1 or invalid2 or invalid3 or invalid4:
                log.error("Got invalid initial_fen %s for game %s" % (self.initial_fen, self.id))
                print(invalid0, invalid1, invalid2, invalid3, invalid4)
                self.initial_fen = start_fen
                self.board = self.create_board(self.variant, self.initial_fen, self.chess960)
        else:
            self.initial_fen = self.board.fen

        self.bot_game = self.bplayer.bot or self.wplayer.bot
        self.random_mover = self.wplayer.username == "Random-Mover" or self.bplayer.username == "Random-Mover"
        self.random_move = ""

        self.set_dests()
        if self.board.move_stack:
            self.check = self.board.is_checked()

        self.steps = [{
            "fen": self.initial_fen,
            "san": None,
            "turnColor": "black" if self.board.color == BLACK else "white",
            "check": self.check}
        ]

        self.stopwatch = Clock(self)

    def create_board(self, variant, initial_fen, chess960):
        if variant == "xiangqi":
            board = XiangqiBoard(initial_fen)
        else:
            board = FairyBoard(variant, initial_fen, chess960)
        return board

    async def play_move(self, move, clocks=None):
        self.stopwatch.stop()

        if self.status > STARTED:
            return
        elif self.status == CREATED:
            self.status = STARTED

        cur_player = self.bplayer if self.board.color == BLACK else self.wplayer
        if cur_player.username in self.draw_offers:
            self.draw_offers.remove(cur_player.username)

        cur_time = monotonic()
        # BOT players doesn't send times used for moves
        if self.bot_game:
            movetime = int(round((cur_time - self.last_server_clock) * 1000))
            if clocks is None:
                clocks = {
                    "white": self.ply_clocks[-1]["white"],
                    "black": self.ply_clocks[-1]["black"]}
            clocks["movetime"] = movetime

            if cur_player.bot and self.ply > 2:
                cur_color = "black" if self.board.color == BLACK else "white"
                clocks[cur_color] = max(0, self.clocks[cur_color] - movetime)
                if clocks[cur_color] == 0:
                    w, b = self.board.insufficient_material()
                    if (w and b) or (cur_color == "black" and w) or (cur_color == "white" and b):
                        result = "1/2-1/2"
                    else:
                        result = "1-0" if self.board.color == BLACK else "0-1"
                    await self.update_status(FLAG, result)
        self.last_server_clock = cur_time

        if self.status != FLAG:
            try:
                san = self.board.get_san(move)
                self.lastmove = move
                self.board.push(move)
                self.ply_clocks.append(clocks)
                self.set_dests()
                await self.update_status()

                self.steps.append({
                    "fen": self.board.fen,
                    "move": move,
                    "san": san,
                    "turnColor": "black" if self.board.color == BLACK else "white",
                    "check": self.check}
                )
                self.stopwatch.restart()

            except Exception:
                log.exception("ERROR: Exception in game.play_move()!")
                raise

    async def save_game(self):
        self.stopwatch.cancel()

        async def remove():
            # Keep it in our games dict a little to let players get the last board
            # not to mention that BOT players want to abort games after 20 sec inactivity
            await asyncio.sleep(60)
            del self.games[self.id]

        if self.saved:
            return

        self.saved = True
        loop = asyncio.get_event_loop()
        self.tasks.add(loop.create_task(remove()))

        if self.rated:
            if self.result == '1-0':
                (white_score, black_score) = (1.0, 0.0)
            elif self.result == '1/2-1/2':
                (white_score, black_score) = (0.5, 0.5)
            elif self.result == '0-1':
                (white_score, black_score) = (0.0, 1.0)
            else:
                raise RuntimeError('game.result: unexpected result code')
            await rating.update_ratings(self, white_score, black_score)

        if self.ply < 3:
            await self.db.game.delete_one({"_id": self.id})
        else:
            self.print_game()
            await self.db.game.find_one_and_update(
                {"_id": self.id},
                {"$set":
                 {"d": self.date,
                  "f": self.board.fen,
                  "s": self.status,
                  "r": R2C[self.result],
                  'm': encode_moves(
                      map(usi2uci, self.board.move_stack) if self.variant[-5:] == "shogi"
                      else map(grand2zero, self.board.move_stack) if self.variant == "grand" or self.variant == "grandhouse"
                      else self.board.move_stack)}
                 }
            )

    async def update_status(self, status=None, result=None):
        if status is not None:
            self.status = status
            if result is not None:
                self.result = result
            await self.save_game()
            return

        if self.board.move_stack:
            self.check = self.board.is_checked()

        w, b = self.board.insufficient_material()
        if w and b:
            print("1/2 by board.insufficient_material()")
            self.status = DRAW
            self.result = "1/2-1/2"

        # check 50 move rule and repetition
        if self.board.is_claimable_draw() and (self.wplayer.bot or self.bplayer.bot):
            print("1/2 by board.is_claimable_draw()")
            self.status = DRAW
            self.result = "1/2-1/2"

        if not self.dests:
            if self.check:
                self.status = MATE
                self.result = "1-0" if self.board.color == BLACK else "0-1"
            else:
                # being in stalemate loses in xiangqi
                self.status = STALEMATE
                if self.variant == "xiangqi":
                    self.result = "0-1" if self.board.color == BLACK else "1-0"
                else:
                    print("1/2 by stalemate")
                    self.result = "1/2-1/2"

        if self.status > STARTED:
            await self.save_game()

    def set_dests(self):
        # print("-----------------------------------------------------------")
        # print(self.board.print_pos())
        dests = {}
        promotions = []
        moves = self.board.legal_moves()

        if self.random_mover:
            self.random_move = random.choice(moves) if moves else ""

        for move in moves:
            if self.variant[-5:] == "shogi":
                move = usi2uci(move)
            elif self.variant == "grand" or self.variant == "grandhouse":
                move = grand2zero(move)
            source, dest = move[0:2], move[2:4]
            if source in dests:
                dests[source].append(dest)
            else:
                dests[source] = [dest]

            if not move[-1].isdigit():
                promotions.append(move)

        # print(dests)
        # print("-----------------------------------------------------------")
        self.dests = dests
        self.promotions = promotions

    def print_game(self):
        print(self.pgn)
        print(self.board.print_pos())
        # print(self.board.move_stack)
        # print("---CLOCKS---")
        # for ply, clocks in enumerate(self.ply_clocks):
        #     print(ply, self.board.move_stack[ply - 1] if ply > 0 else "", self.ply_clocks[ply]["movetime"], self.ply_clocks[ply]["black"], self.ply_clocks[ply]["white"])
        # print(self.result)

    @property
    def pgn(self):
        moves = " ".join((step["san"] if ind % 2 == 0 else "%s. %s" % ((ind + 1) // 2, step["san"]) for ind, step in enumerate(self.steps) if ind > 0))
        no_setup = self.initial_fen == self.board.start_fen("standard") and not self.chess960
        return '[Event "{}"]\n[Site "{}"]\n[Date "{}"]\n[Round "-"]\n[White "{}"]\n[Black "{}"]\n[Result "{}"]\n[TimeControl "{}+{}"]\n[Variant "{}"]\n{fen}{setup}\n{} {}\n'.format(
            "PyChess casual game",
            URI + "/" + self.id,
            self.date.strftime("%Y.%m.%d"),
            self.wplayer.username,
            self.bplayer.username,
            self.result,
            self.base * 60,
            self.inc,
            self.variant.capitalize() if not self.chess960 else VARIANTS960[self.variant],
            moves,
            self.result,
            fen="" if no_setup else '[FEN "%s"]\n' % self.initial_fen,
            setup="" if no_setup else '[SetUp "1"]\n')

    @property
    def uci_usi(self):
        if self.variant[-5:] == "shogi":
            return "position sfen %s moves %s" % (self.board.initial_sfen, " ".join(self.board.move_stack))
        else:
            return "position fen %s moves %s" % (self.board.initial_fen, " ".join(self.board.move_stack))

    @property
    def ply(self):
        return len(self.board.move_stack)

    @property
    def clocks(self):
        return self.ply_clocks[-1]

    @property
    def is_claimable_draw(self):
        return self.board.is_claimable_draw()

    def analysis_start(self, username):
        return '{"type": "analysisStart", "username": "%s", "game": {"id": "%s", "skill_level": "%s", "chess960": "%s"}}\n' % (username, self.id, self.level, self.chess960)

    @property
    def game_start(self):
        return '{"type": "gameStart", "game": {"id": "%s", "skill_level": "%s", "chess960": "%s"}}\n' % (self.id, self.level, self.chess960)

    @property
    def game_end(self):
        return '{"type": "gameEnd", "game": {"id": "%s"}}\n' % self.id

    @property
    def game_full(self):
        return '{"type": "gameFull", "id": "%s", "variant": {"name": "%s"}, "white": {"name": "%s"}, "black": {"name": "%s"}, "initialFen": "%s", "state": %s}\n' % (self.id, self.variant, self.wplayer.username, self.bplayer.username, self.initial_fen, self.game_state[:-1])

    @property
    def game_state(self):
        clocks = self.clocks
        return '{"type": "gameState", "moves": "%s", "wtime": %s, "btime": %s, "winc": %s, "binc": %s}\n' % (" ".join(self.board.move_stack), clocks["white"], clocks["black"], self.inc, self.inc)

    async def abort(self):
        await self.update_status(ABORTED)
        return {"type": "gameEnd", "status": self.status, "result": "Game aborted.", "gameId": self.id, "pgn": self.pgn}


async def load_game(app, game_id):
    db = app["db"]
    games = app["games"]
    users = app["users"]
    if game_id in games:
        return games[game_id]

    doc = await db.game.find_one({"_id": game_id})

    if doc is None:
        return None

    wp = doc["us"][0]
    if wp in users:
        wplayer = users[wp]
    else:
        wplayer = User(username=wp)
        users[wp] = wplayer

    bp = doc["us"][1]
    if bp in users:
        bplayer = users[bp]
    else:
        bplayer = User(username=bp)
        users[bp] = bplayer

    variant = C2V[doc["v"]]

    game = Game(app, game_id, variant, doc.get("if"), wplayer, bplayer, doc["b"], doc["i"], doc.get("x"), bool(doc.get("y")), bool(doc.get("z")))

    mlist = decode_moves(doc["m"])

    if mlist:
        game.saved = True

    if variant[-5:] == "shogi":
        mlist = map(uci2usi, mlist)
    elif variant == "grand" or variant == "grandhouse":
        mlist = map(zero2grand, mlist)

    for move in mlist:
        try:
            san = game.board.get_san(move)
            game.board.push(move)
            game.check = game.board.is_checked()
            game.steps.append({
                "fen": game.board.fen,
                "move": move,
                "san": san,
                "turnColor": "black" if game.board.color == BLACK else "white",
                "check": game.check}
            )
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
    game.random_move = ""
    return game


def start(games, data):
    return {"type": "gameStart", "gameId": data["gameId"]}


async def draw(games, data, agreement=False):
    game = games[data["gameId"]]
    if game.is_claimable_draw or agreement:
        result = "1/2-1/2"
        await game.update_status(DRAW, result)
        return {"type": "gameEnd", "status": game.status, "result": game.result, "gameId": data["gameId"], "pgn": game.pgn}
    else:
        return {"type": "offer", "message": "Draw offer sent"}


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
        await game.update_status(LOSERS[reason], result)
    return {"type": "gameEnd", "status": game.status, "result": game.result, "gameId": data["gameId"], "pgn": game.pgn}


def challenge(seek, gameId):
    return '{"type":"challenge", "challenge": {"id":"%s", "challenger":{"name":"%s", "rating":1500,"title":""},"variant":{"key":"%s"},"rated":"true","timeControl":{"type":"clock","limit":300,"increment":0},"color":"random","speed":"rapid","perf":{"name":"Rapid"}, "level":%s, "chess960":%s}}\n' % (gameId, seek.user.username, seek.variant, seek.level, str(seek.chess960).lower())


def create_seek(seeks, user, data):
    if len(user.seeks) >= MAX_USER_SEEKS:
        return None

    seek = Seek(user, data["variant"], data["fen"], data["color"], data["minutes"], data["increment"], rated=data.get("rated"), chess960=data.get("chess960"))
    seeks[seek.id] = seek
    user.seeks[seek.id] = seek


def get_seeks(seeks):
    return {"type": "get_seeks", "seeks": [seek.as_json for seek in seeks.values()]}


async def new_game(app, user, seek_id):
    log.info("+++ Seek %s accepted by%s" % (seek_id, user.username))
    db = app["db"]
    games = app["games"]
    seeks = app["seeks"]
    seek = seeks[seek_id]

    if seek.color == "r":
        wplayer = random.choice((user, seek.user))
        bplayer = user if wplayer.username == seek.user.username else seek.user
    else:
        wplayer = seek.user if seek.color == "w" else user
        bplayer = seek.user if seek.color == "b" else user

    new_id = "".join(random.choice(string.ascii_letters + string.digits) for x in range(8))
    existing = await db.game.find_one({'_id': {'$eq': new_id}})
    if existing:
        log.debug("!!! Game ID %s allready in mongodb !!!" % new_id)
        return {"type": "error"}
    # print("new_game", new_id, seek.variant, seek.fen, wplayer, bplayer, seek.base, seek.inc, seek.level, seek.rated, seek.chess960)
    new_game = Game(app, new_id, seek.variant, seek.fen, wplayer, bplayer, seek.base, seek.inc, seek.level, seek.rated, seek.chess960)
    games[new_game.id] = new_game

    if not seek.user.bot:
        del seeks[seek_id]
        if seek_id in seek.user.seeks:
            del seek.user.seeks[seek_id]

    document = {
        "_id": new_id,
        "us": [wplayer.username, bplayer.username],
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
    result = await db.game.insert_one(document)
    print("db insert game result %s" % repr(result.inserted_id))

    return {"type": "new_game", "gameId": new_game.id}


async def lobby_broadcast(sockets, response):
    for client_ws in sockets.values():
        if client_ws is not None:
            await client_ws.send_json(response, dumps=partial(json.dumps, default=datetime.isoformat))


async def round_broadcast(game, users, response):
    if game.spectators:
        for spectator in game.spectators:
            if game.id in users[spectator.username].game_sockets:
                await users[spectator.username].game_sockets[game.id].send_json(response)


async def play_move(games, data):
    game = games[data["gameId"]]
    move = data["move"]
    clocks = data["clocks"]
    assert move
    try:
        await game.play_move(move, clocks)
        return True
    except Exception:
        return False


def get_board(games, data, full=False):
    game = games[data["gameId"]]
    if full:
        steps = game.steps

        # To not touch game.ply_clocks we are creating deep copy from clocks
        clocks = {"black": game.clocks["black"], "white": game.clocks["white"]}

        if game.status == STARTED and game.ply >= 2:
            # We have to adjust current player latest saved clock time
            # unless he will get free extra time on browser page refresh
            # (also needed for spectators entering to see correct clock times)

            cur_time = monotonic()
            elapsed = int(round((cur_time - game.last_server_clock) * 1000))

            cur_color = "black" if game.board.color == BLACK else "white"
            clocks[cur_color] = max(0, clocks[cur_color] - elapsed)
    else:
        clocks = game.clocks
        steps = (game.steps[-1],)

    return {"type": "board",
            "gameId": data["gameId"],
            "status": game.status,
            "result": game.result,
            "fen": game.board.fen,
            "lastMove": game.lastmove,
            "steps": steps,
            "dests": game.dests,
            "promo": game.promotions,
            "check": game.check,
            "ply": game.ply,
            "clocks": {"black": clocks["black"], "white": clocks["white"]},
            "pgn": game.pgn if game.status > STARTED else "",
            "uci_usi": game.uci_usi if game.status > STARTED else "",
            "rm": game.random_move,
            }


def pgn(doc):
    mlist = decode_moves(doc["m"])
    variant = C2V[doc["v"]]
    chess960 = bool(int(doc.get("z"))) if "z" in doc else False

    if variant[-5:] == "shogi":
        mlist = list(map(uci2usi, mlist))
    elif variant == "grand" or variant == "grandhouse":
        mlist = list(map(zero2grand, mlist))

    if variant != "xiangqi":
        fen = doc["if"] if "if" in doc else SHOGI_FEN if variant == "shogi" else MINISHOGI_FEN if variant == "minishogi" else sf.start_fen(variant)
        mlist = sf.get_san_moves(variant, fen, mlist, chess960)

    moves = " ".join((move if ind % 2 == 0 else "%s. %s" % ((ind + 1) // 2, move) for ind, move in enumerate(mlist) if ind > 0))
    no_setup = doc["f"] == STANDARD_FEN and not chess960
    return '[Event "{}"]\n[Site "{}"]\n[Date "{}"]\n[Round "-"]\n[White "{}"]\n[Black "{}"]\n[Result "{}"]\n[TimeControl "{}+{}"]\n[Variant "{}"]\n{fen}{setup}\n{} {}\n'.format(
        "PyChess casual game",
        URI + "/" + doc["_id"],
        doc["d"].strftime("%Y.%m.%d"),
        doc["us"][0],
        doc["us"][1],
        C2R[doc["r"]],
        doc["b"] * 60,
        doc["i"],
        variant.capitalize() if not chess960 else VARIANTS960[variant],
        moves,
        C2R[doc["r"]],
        fen="" if no_setup else '[FEN "%s"]\n' % doc["f"],
        setup="" if no_setup else '[SetUp "1"]\n')
