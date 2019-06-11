import asyncio
import logging
import random
import string
from time import monotonic, time

import fairy
import seirawan
import xiangqi

log = logging.getLogger(__name__)

BLACK = True


def usi2uci(move):
    """ Used to create chessground dests UCI coordinates from USI shogi moves """
    if move[1] == "*":
        return "%s@%s%s" % (move[0], chr(ord(move[2]) + 48), chr(ord(move[3]) - 48))
    else:
        return "%s%s%s%s" % (chr(ord(move[0]) + 48), chr(ord(move[1]) - 48), chr(ord(move[2]) + 48), chr(ord(move[3]) - 48))


class Seek:
    gen_id = 0

    def __init__(self, user, variant, fen="", color="r", base=5, inc=3, level=1, rated=False):
        self.user = user
        self.variant = variant
        self.color = color
        self.fen = fen
        self.rated = rated
        self.base = base
        self.inc = inc
        self.level = level

        Seek.gen_id += 1
        self.id = self.gen_id


def seek_to_json(seek):
    rated = "Rated" if seek.rated else "Casual"
    return {"seekID": seek.id, "user": seek.user.username, "variant": seek.variant, "color": seek.color, "rated": rated, "tc": "%s+%s" % (seek.base, seek.inc)}


class User:
    def __init__(self, lobby_ws=None, event_stream=None, username=None):
        self.lobby_ws = lobby_ws
        self.event_stream = event_stream
        if username is None:
            self.username = "Anonymous" + "".join(random.sample(string.ascii_uppercase, 4))
        else:
            self.username = username
        self.first_name = ""
        self.last_name = ""
        self.country = ""
        self.seeks = {}
        if self.event_stream is not None:
            self.game_queues = {}
        else:
            self.game_sockets = {}
        self.online = True
        self.ping_counter = 0

    @property
    def id(self):
        return id(self)

    @property
    def is_bot(self):
        return self.event_stream is not None

    async def quit(self, sockets, seeks):
        print(self.username, "quit()")
        has_seek = len(self.seeks) > 0
        if has_seek:
            for seek in self.seeks:
                del seeks[seek]
            self.seeks.clear()

        self.online = False
        if self.username in sockets:
            del sockets[self.username]

        if has_seek:
            response = get_seeks(seeks)
            for client_ws in sockets.values():
                if client_ws is not None:
                    await client_ws.send_json(response)

    async def pinger(self, sockets, seeks):
        while True:
            if self.ping_counter > 3:
                log.info("%s went offline" % self.username)
                await self.quit(sockets, seeks)
                break

            if self.is_bot:
                await self.event_queue.put("\n")
            else:
                await self.lobby_ws.send_json({"type": "ping", "timestamp": "%s" % time()})
            self.ping_counter += 1

            if self.is_bot:
                # heroku needs this to not close BOT connections (stream events) on server side
                await asyncio.sleep(50)
            else:
                # TODO: measure lag, indicate online status on web ui
                await asyncio.sleep(1)

    def __str__(self):
        return self.username


CREATED, STARTED, ABORTED, MATE, RESIGN, STALEMATE, TIMEOUT, DRAW, FLAG, CHEAT, \
    NOSTART, INVALIDMOVE, UNKNOWNFINISH, VARIANTEND = range(-2, 12)


class Game:
    def __init__(self, variant, initial_fen, wplayer, bplayer, base=1, inc=0, level=20, rated=False):
        self.variant = variant
        self.initial_fen = initial_fen
        self.wplayer = wplayer
        self.bplayer = bplayer
        self.rated = rated
        self.base = base
        self.inc = inc
        self.skill_level = level
        self.spectators = set()

        self.ply_clocks = [{"black": base * 1000 * 60, "white": base * 1000 * 60, "movetime": 0}]
        self.dests = {}
        self.lastmove = None
        self.san = None
        self.check = False
        self.status = CREATED
        self.result = "*"
        self.bot_game = False
        self.last_server_clock = monotonic()

        self.id = self.create_game_id()
        self.board = self.create_board(self.variant, self.initial_fen)

        # Initial_fen needs validation to prevent segfaulting in pyffish
        if self.initial_fen:
            start_fen = self.board.start_fen(self.variant)
            start = start_fen.split()
            init = self.initial_fen.split()
            invalid0 = len(init) < 2
            invalid1 = any((c not in start[0] for c in init[0] if not c.isdigit()))
            invalid2 = start[0].count("/") != init[0].count("/")
            invalid3 = init[1] != "b" and init[1] != "w"
            if variant == "seirawan":
                invalid4 = len(init) > 2 and any((c not in "KQBCDFGkqbcdfgAHah" for c in init[2]))
            else:
                invalid4 = len(init) > 2 and any((c not in start[2] for c in init[2]))

            if invalid0 or invalid1 or invalid2 or invalid3 or invalid4:
                log.error("Got invalid initial_fen %s for game %s" % (self.initial_fen, self.id))
                self.initial_fen = start_fen
                self.board = self.create_board(self.variant, self.initial_fen)
        else:
            self.initial_fen = self.board.fen

        self.set_dests()
        self.check_status()

    def create_game_id(self):
        # TODO: check for existence when we will have database
        return ''.join(random.choice(
            string.ascii_letters + string.digits) for x in range(12))

    def create_board(self, variant, initial_fen):
        if variant == "seirawan":
            board = seirawan.SeirawanBoard(initial_fen)
        elif variant == "xiangqi":
            board = xiangqi.XiangqiBoard(initial_fen)
        else:
            board = fairy.FairyBoard(variant, initial_fen)
        return board

    def play_move(self, move, clocks=None):
        if self.status > STARTED:
            return
        elif self.status == CREATED:
            self.status = STARTED
            self.bot_game = self.bplayer.is_bot or self.wplayer.is_bot

        # BOT players doesn't send times used for moves
        if self.bot_game:
            cur_player = self.bplayer if self.board.color == BLACK else self.wplayer
            cur_time = monotonic()
            movetime = int(round((cur_time - self.last_server_clock) * 1000))
            self.last_server_clock = cur_time
            if clocks is None:
                clocks = {
                    "white": self.ply_clocks[-1]["white"],
                    "black": self.ply_clocks[-1]["black"]}
            clocks["movetime"] = movetime

            if cur_player.is_bot and self.ply > 2:
                cur_color = "black" if self.board.color == BLACK else "white"
                clocks[cur_color] = max(0, self.clocks[cur_color] - movetime)
                if clocks[cur_color] == 0:
                    self.status = FLAG
                    self.result = "1-0" if self.board.color == BLACK else "0-1"
                    self.check_status()

        if self.status != FLAG:
            self.san = self.board.get_san(move)
            self.lastmove = (move[0:2], move[2:4])
            self.board.push(move)
            self.ply_clocks.append(clocks)
            self.set_dests()
            self.check_status()

    def check_status(self):
        if self.status > STARTED:
            self.print_game()
            return

        if self.board.move_stack:
            self.check = self.board.is_checked()

        # TODO: implement this in pyffish/pysfish
        if self.board.insufficient_material():
            self.status = DRAW
            self.result = "1/2"

        # check 50 move rule and repetition
        if self.board.is_claimable_draw() and (self.wplayer.is_bot or self.bplayer.is_bot):
            self.status = DRAW
            self.result = "1/2"

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
                    self.result = "1/2"
        if self.status > STARTED:
            self.print_game()

    def set_dests(self):
        dests = {}
        for move in self.board.legal_moves():
            if self.variant == "shogi":
                move = usi2uci(move)
            source, dest = move[0:2], move[2:4]
            if source in dests:
                dests[source].append(dest)
            else:
                dests[source] = [dest]
        self.dests = dests

    def print_game(self):
        print(self)
        print(self.board.print_pos())
        print("---CLOCKS---")
        for ply, clocks in enumerate(self.ply_clocks):
            print(ply, self.board.move_stack[ply - 1] if ply > 0 else "", self.ply_clocks[ply]["movetime"], self.ply_clocks[ply]["black"], self.ply_clocks[ply]["white"])
        print(self.result)

    def __str__(self):
        moves = " ".join(self.board.move_stack)
        return "[%s vs %s]\n[%s]\n[%s]\n\n%s %s\n----" % (self.wplayer.username, self.bplayer.username, self.variant, self.id, moves, self.result)

    @property
    def ply(self):
        return len(self.board.move_stack)

    @property
    def clocks(self):
        return self.ply_clocks[-1]

    @property
    def is_claimable_draw(self):
        return self.board.is_claimable_draw()

    @property
    def game_start(self):
        return '{"type": "gameStart", "game": {"id": "%s", "skill_level": "%s"}}\n' % (self.id, self.skill_level)

    @property
    def game_end(self):
        return '{"type": "gameEnd", "game": {"id": "%s"}}\n' % self.id

    @property
    def game_full(self):
        return '{"type": "gameFull", "id": "%s", "variant": {"name": "%s"}, "white": {"name": "%s"}, "black": {"name": "%s"}, "state": {"moves": ""}, "initialFen": "%s"}\n' % (self.id, self.variant, self.wplayer.username, self.bplayer.username, self.initial_fen)

    @property
    def game_state(self):
        clocks = self.clocks
        return '{"type": "gameState", "moves": "%s", "wtime": %s, "btime": %s, "winc": %s, "binc": %s}\n' % (" ".join(self.board.move_stack), clocks["white"], clocks["black"], self.inc, self.inc)

    def abort(self):
        self.status = ABORTED
        self.check_status()
        return {"type": "gameEnd", "status": self.status, "result": "Game aborted.", "gameId": self.id}


def start(games, data):
    # game = games[data["gameId"]]
    return {"type": "gameStart", "gameId": data["gameId"]}


def end(games, data):
    game = games[data["gameId"]]
    return {"type": "gameEnd", "status": game.status, "result": game.result, "gameId": data["gameId"]}


def draw(games, data):
    game = games[data["gameId"]]
    if game.is_claimable_draw:
        game.status = DRAW
        game.result = "1/2"
        game.check_status()
        return {"type": "gameEnd", "status": game.status, "result": game.result, "gameId": data["gameId"]}
    else:
        return {"ok": False}


def resign(games, user, data):
    game = games[data["gameId"]]
    game.status = RESIGN
    game.result = "0-1" if user.username == game.wplayer.username else "1-0"
    game.check_status()
    return {"type": "gameEnd", "status": game.status, "result": game.result, "gameId": data["gameId"]}


def flag(games, user, data):
    game = games[data["gameId"]]
    game.status = FLAG
    game.result = "0-1" if user.username == game.wplayer.username else "1-0"
    game.check_status()
    return {"type": "gameEnd", "status": game.status, "result": game.result, "gameId": data["gameId"]}


def challenge(seek, response):
    return '{"type":"challenge", "challenge": {"id":"%s", "challenger":{"name":"%s", "rating":1500,"title":""},"variant":{"key":"%s"},"rated":"true","timeControl":{"type":"clock","limit":300,"increment":0},"color":"random","speed":"rapid","perf":{"name":"Rapid"}, "level":%s}}\n' % (response["gameId"], seek.user.username, seek.variant, seek.level)


def create_seek(seeks, user, data):
    seek = Seek(user, data["variant"], data["fen"], data["color"], data["minutes"], data["increment"])
    seeks[seek.id] = seek
    user.seeks[seek.id] = seek
    return {"type": "create_seek", "seeks": list(map(seek_to_json, seeks.values()))}


def get_seeks(seeks):
    return {"type": "get_seeks", "seeks": list(map(seek_to_json, seeks.values()))}


def accept_seek(seeks, games, user, seek_id):
    log.info("+++ Seek %s accepted by%s" % (seek_id, user.username))
    seek = seeks[seek_id]

    if seek.color == "r":
        wplayer = random.choice((user, seek.user))
        bplayer = user if wplayer.username == seek.user.username else seek.user
    else:
        wplayer = seek.user if seek.color == "w" else user
        bplayer = seek.user if seek.color == "b" else user

    new_game = Game(seek.variant, seek.fen, wplayer, bplayer, seek.base, seek.inc, seek.level)
    seek.fen = new_game.board.fen
    games[new_game.id] = new_game
    print(user.username, user.is_bot, seek.user.username, seek.user.is_bot)
    if not seek.user.is_bot:
        del seeks[seek_id]
        if seek_id in seek.user.seeks:
            del seek.user.seeks[seek_id]
    return {"type": "accept_seek", "ok": True, "variant": seek.variant, "gameId": new_game.id, "wplayer": wplayer.username, "bplayer": bplayer.username, "fen": seek.fen, "base": seek.base, "inc": seek.inc}


def play_move(games, data):
    game = games[data["gameId"]]
    move = data["move"]
    clocks = data["clocks"]
    assert move
    game.play_move(move, clocks)


def get_board(games, data):
    game = games[data["gameId"]]
    clocks = game.clocks
    return {"type": "board",
            "gameId": data["gameId"],
            "status": game.status,
            "result": game.result,
            "fen": game.board.fen,
            "lastMove": game.lastmove,
            "san": game.san,
            "dests": game.dests,
            "check": game.check,
            "ply": game.ply,
            "clocks": {"black": clocks["black"], "white": clocks["white"]},
            }
