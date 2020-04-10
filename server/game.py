import asyncio
import collections
import logging
import random
from datetime import datetime
from itertools import chain
from time import monotonic

from broadcast import lobby_broadcast
from clock import Clock
from compress import encode_moves, R2C
from const import CREATED, STARTED, ABORTED, MATE, STALEMATE, DRAW, FLAG, CHEAT, INVALIDMOVE, VARIANT_960_TO_PGN, LOSERS, VARIANTEND
from convert import grand2zero, uci2usi, mirror5, mirror9
from fairy import FairyBoard, WHITE, BLACK
from glicko2.glicko2 import gl2, PROVISIONAL_PHI
from settings import URI

log = logging.getLogger(__name__)

MAX_HIGH_SCORE = 10
MAX_PLY = 600
KEEP_TIME = 600  # keep game in app["games"] for KEEP_TIME secs


class Game:
    def __init__(self, app, gameId, variant, initial_fen, wplayer, bplayer, base=1, inc=0, level=0, rated=False, chess960=False, create=True):
        self.app = app
        self.db = app["db"] if "db" in app else None
        self.users = app["users"]
        self.games = app["games"]
        self.highscore = app["highscore"]
        self.db_crosstable = app["crosstable"]

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
        self.create = create

        # rating info
        self.white_rating = wplayer.get_rating(variant, chess960)
        self.wrating = "%s%s" % (int(round(self.white_rating.mu, 0)), "?" if self.white_rating.phi > PROVISIONAL_PHI else "")
        self.wrdiff = 0
        self.black_rating = bplayer.get_rating(variant, chess960)
        self.brating = "%s%s" % (int(round(self.black_rating.mu, 0)), "?" if self.black_rating.phi > PROVISIONAL_PHI else "")
        self.brdiff = 0

        # crosstable info
        self.need_crosstable_save = False
        self.bot_game = self.bplayer.bot or self.wplayer.bot
        if self.bot_game or self.wplayer.anon or self.bplayer.anon:
            self.crosstable = ""
        else:
            if self.wplayer.username < self.bplayer.username:
                self.s1player = self.wplayer.username
                self.s2player = self.bplayer.username
            else:
                self.s1player = self.bplayer.username
                self.s2player = self.wplayer.username
            self.ct_id = self.s1player + "/" + self.s2player
            self.crosstable = self.db_crosstable.get(self.ct_id, {"_id": self.ct_id, "s1": 0, "s2": 0, "r": []})

        self.spectators = set()
        self.draw_offers = set()
        self.rematch_offers = set()
        self.messages = collections.deque([], 200)
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
        self.last_server_clock = monotonic()

        self.id = gameId

        if self.chess960 and self.initial_fen and self.create:
            if self.wplayer.fen960_as_white == self.initial_fen:
                self.initial_fen = ""

        self.board = self.create_board(self.variant, self.initial_fen, self.chess960)

        # Janggi setup needed when player is not BOT
        if self.variant == "janggi":
            if self.initial_fen:
                self.bsetup = False
                self.wsetup = False
            else:
                self.bsetup = not self.bplayer.bot
                self.wsetup = not self.wplayer.bot
                if self.bplayer.bot:
                    self.board.janggi_setup("b")

        self.overtime = False
        self.byoyomi = self.variant == "janggi" or self.variant.endswith("shogi")

        self.initial_fen = self.board.initial_fen
        self.wplayer.fen960_as_white = self.initial_fen

        self.random_mover = self.wplayer.username == "Random-Mover" or self.bplayer.username == "Random-Mover"
        self.random_move = ""

        self.set_dests()
        if self.board.move_stack:
            self.check = self.board.is_checked()

        self.steps = [{
            "fen": self.initial_fen if self.initial_fen else self.board.initial_fen,
            "san": None,
            "turnColor": "black" if self.board.color == BLACK else "white",
            "check": self.check}
        ]

        self.stopwatch = Clock(self)

        if not self.bplayer.bot:
            self.bplayer.game_in_progress = self.id
        if not self.wplayer.bot:
            self.wplayer.game_in_progress = self.id

    def create_board(self, variant, initial_fen, chess960):
        return FairyBoard(variant, initial_fen, chess960)

    async def play_move(self, move, clocks=None):
        self.stopwatch.stop()

        if self.status > STARTED:
            return
        elif self.status == CREATED:
            self.status = STARTED
            self.app["g_cnt"] += 1
            response = {"type": "g_cnt", "cnt": self.app["g_cnt"]}
            await lobby_broadcast(self.app["websockets"], response)

        cur_player = self.bplayer if self.board.color == BLACK else self.wplayer
        if cur_player.username in self.draw_offers:
            # Move cancels draw offer
            # Except Janggi pass moves (like e2e2 or f10f10)
            # They are draw offers at the same time!
            half, rem = divmod(len(move), 2)
            pass_move = rem == 0 and move[:half] == move[half:]
            if not pass_move:
                self.draw_offers.remove(cur_player.username)

        cur_time = monotonic()
        # BOT players doesn't send times used for moves
        if self.bot_game:
            movetime = int(round((cur_time - self.last_server_clock) * 1000))
            # print(self.board.ply, move, movetime)
            if clocks is None:
                clocks = {
                    "white": self.ply_clocks[-1]["white"],
                    "black": self.ply_clocks[-1]["black"],
                    "movetime": movetime
                }

            if cur_player.bot and self.board.ply >= 2:
                cur_color = "black" if self.board.color == BLACK else "white"
                if self.byoyomi:
                    if self.overtime:
                        clocks[cur_color] = self.inc * 1000
                    else:
                        clocks[cur_color] = max(0, self.clocks[cur_color] - movetime)
                else:
                    clocks[cur_color] = max(0, self.clocks[cur_color] - movetime + (self.inc * 1000))

                if clocks[cur_color] == 0:
                    if self.byoyomi and not self.overtime:
                        self.overtime = True
                        clocks[cur_color] = self.inc * 1000
                    else:
                        w, b = self.board.insufficient_material()
                        if (w and b) or (cur_color == "black" and w) or (cur_color == "white" and b):
                            result = "1/2-1/2"
                        else:
                            result = "1-0" if self.board.color == BLACK else "0-1"
                        self.update_status(FLAG, result)
                        print(self.result, "flag")
                        await self.save_game()

        self.last_server_clock = cur_time

        opp_color = "black" if self.board.color == WHITE else "white"
        if False:  # clocks is not None:
            # print("--------------")
            # print(opp_color, clocks, self.ply_clocks)
            if clocks[opp_color] < self.clocks[opp_color]:
                result = "1-0" if self.board.color == BLACK else "0-1"
                self.update_status(CHEAT, result)
                await self.save_game()

        if self.status <= STARTED:
            try:
                san = self.board.get_san(move)
                self.lastmove = move
                self.board.push(move)
                self.ply_clocks.append(clocks)
                self.set_dests()
                self.update_status()

                if self.status > STARTED:
                    await self.save_game()

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
                result = "1-0" if self.board.color == BLACK else "0-1"
                self.update_status(INVALIDMOVE, result)
                await self.save_game()

    async def save_game(self):
        if self.saved:
            return

        self.stopwatch.kill()

        if self.board.ply > 0:
            self.app["g_cnt"] -= 1
            response = {"type": "g_cnt", "cnt": self.app["g_cnt"]}
            await lobby_broadcast(self.app["websockets"], response)

        async def remove(keep_time):
            # Keep it in our games dict a little to let players get the last board
            # not to mention that BOT players want to abort games after 20 sec inactivity
            await asyncio.sleep(keep_time)

            try:
                del self.games[self.id]
            except KeyError:
                log.error("Failed to del %s from games" % self.id)

            if self.bot_game:
                try:
                    if self.wplayer.bot:
                        del self.wplayer.game_queues[self.id]
                    if self.bplayer.bot:
                        del self.bplayer.game_queues[self.id]
                except KeyError:
                    log.error("Failed to del %s from game_queues" % self.id)

        self.saved = True
        loop = asyncio.get_event_loop()
        loop.create_task(remove(KEEP_TIME))

        if self.board.ply < 3 and (self.db is not None):
            result = await self.db.game.delete_one({"_id": self.id})
            log.debug("Removed too short game %s from db. Deleted %s game." % (self.id, result.deleted_count))
        else:
            if self.result != "*":
                if self.rated:
                    await self.update_ratings()
                if (not self.bot_game) and (not self.wplayer.anon) and (not self.bplayer.anon):
                    await self.save_crosstable()

            # self.print_game()

            new_data = {
                "d": self.date,
                "f": self.board.fen,
                "s": self.status,
                "r": R2C[self.result],
                'm': encode_moves(
                    map(grand2zero, self.board.move_stack) if self.variant == "xiangqi" or self.variant == "grand" or self.variant == "grandhouse" or self.variant == "shako" or self.variant == "janggi"
                    else self.board.move_stack, self.variant)}

            if self.rated and self.result != "*":
                new_data["p0"] = self.p0
                new_data["p1"] = self.p1

            # Janggi game starts with a prelude phase to set up horses and elephants, so
            # initial FEN may be different compared to one we used when db game document was created
            if self.variant == "janggi":
                new_data["if"] = self.board.initial_fen

            if self.db is not None:
                await self.db.game.find_one_and_update({"_id": self.id}, {"$set": new_data})

    def set_crosstable(self):
        if self.bot_game or self.wplayer.anon or self.bplayer.anon or self.board.ply < 3 or self.result == "*":
            return

        if len(self.crosstable["r"]) > 0 and self.crosstable["r"][-1].startswith(self.id):
            print("Crosstable was already updated with %s result" % self.id)
            return

        if self.result == "1/2-1/2":
            s1 = s2 = 5
            tail = "="
        elif (self.result == "1-0" and self.s1player == self.wplayer.username) or (self.result == "0-1" and self.s1player == self.bplayer.username):
            s1 = 10
            s2 = 0
            tail = "+"
        else:
            s1 = 0
            s2 = 10
            tail = "-"

        self.crosstable["s1"] += s1
        self.crosstable["s2"] += s2
        self.crosstable["r"].append("%s%s" % (self.id, tail))
        self.crosstable["r"] = self.crosstable["r"][-20:]

        new_data = {
            "_id": self.ct_id,
            "s1": self.crosstable["s1"],
            "s2": self.crosstable["s2"],
            "r": self.crosstable["r"],
        }
        self.db_crosstable[self.ct_id] = new_data

        self.need_crosstable_save = True

    async def save_crosstable(self):
        if not self.need_crosstable_save:
            print("Crosstable update for %s was already saved to mongodb" % self.id)
            return

        new_data = {
            "s1": self.crosstable["s1"],
            "s2": self.crosstable["s2"],
            "r": self.crosstable["r"],
        }
        try:
            await self.db.crosstable.find_one_and_update({"_id": self.ct_id}, {"$set": new_data}, upsert=True)
        except Exception:
            if self.db is not None:
                log.error("Failed to save new crosstable to mongodb!")

        self.need_crosstable_save = False

    def get_highscore(self, variant, chess960):
        len_hs = len(self.highscore[variant + ("960" if chess960 else "")])
        if len_hs > 0:
            return (self.highscore[variant + ("960" if chess960 else "")].peekitem()[1], len_hs)
        else:
            return (0, 0)

    async def set_highscore(self, variant, chess960, value):
        self.highscore[variant + ("960" if chess960 else "")].update(value)
        # if len(self.highscore[variant + ("960" if chess960 else "")]) > MAX_HIGH_SCORE:
        #     self.highscore[variant + ("960" if chess960 else "")].popitem()

        new_data = {"scores": {key: value for key, value in self.highscore[variant + ("960" if chess960 else "")].items()[:10]}}
        try:
            await self.db.highscore.find_one_and_update({"_id": variant + ("960" if chess960 else "")}, {"$set": new_data}, upsert=True)
        except Exception:
            if self.db is not None:
                log.error("Failed to save new highscore to mongodb!")

    async def update_ratings(self):
        if self.result == '1-0':
            (white_score, black_score) = (1.0, 0.0)
        elif self.result == '1/2-1/2':
            (white_score, black_score) = (0.5, 0.5)
        elif self.result == '0-1':
            (white_score, black_score) = (0.0, 1.0)
        else:
            raise RuntimeError('game.result: unexpected result code')
        wr, br = self.white_rating, self.black_rating
        # print("ratings before updated:", wr, br)
        wr = gl2.rate(self.white_rating, [(white_score, br)])
        br = gl2.rate(self.black_rating, [(black_score, wr)])
        # print("ratings after updated:", wr, br)
        await self.wplayer.set_rating(self.variant, self.chess960, wr)
        await self.bplayer.set_rating(self.variant, self.chess960, br)

        self.wrdiff = int(round(wr.mu - self.white_rating.mu, 0))
        self.p0 = {"e": self.wrating, "d": self.wrdiff}

        self.brdiff = int(round(br.mu - self.black_rating.mu, 0))
        self.p1 = {"e": self.brating, "d": self.brdiff}

        await self.set_highscore(self.variant, self.chess960, {self.wplayer.username: int(round(wr.mu, 0))})
        await self.set_highscore(self.variant, self.chess960, {self.bplayer.username: int(round(br.mu, 0))})

    def update_status(self, status=None, result=None):
        if status is not None:
            self.status = status
            if result is not None:
                self.result = result

            self.set_crosstable()

            if not self.bplayer.bot:
                self.bplayer.game_in_progress = None
            if not self.wplayer.bot:
                self.wplayer.game_in_progress = None
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
            if self.variant == 'janggi':
                w, b = self.board.get_janggi_points()
                self.status = VARIANTEND
                self.result = "1-0" if w > b else "0-1"
            else:
                print("1/2 by board.is_claimable_draw()")
                self.status = DRAW
                self.result = "1/2-1/2"

        if not self.dests:
            game_result_value = self.board.game_result()

            if game_result_value < 0:
                self.result = "1-0" if self.board.color == BLACK else "0-1"
            elif game_result_value > 0:
                self.result = "0-1" if self.board.color == BLACK else "1-0"
            else:
                self.result = "1/2-1/2"

            if self.check:
                self.status = MATE
                print(self.result, "checkmate")
            else:
                # being in stalemate loses in xiangqi and shogi variants
                self.status = STALEMATE
                print(self.result, "stalemate")

        if self.variant == "janggi":
            immediate_end, game_result_value = self.board.is_immediate_game_end()
            if immediate_end:
                self.status = VARIANTEND
                if game_result_value < 0:
                    self.result = "1-0" if self.board.color == BLACK else "0-1"
                else:
                    self.result = "0-1" if self.board.color == BLACK else "1-0"
                print(self.result, "point counting")

        if self.board.ply > MAX_PLY:
            self.status = DRAW
            self.result = "1/2-1/2"
            print(self.result, "Ply %s reached" % MAX_PLY)

        if self.status > STARTED:
            self.set_crosstable()
            if not self.bplayer.bot:
                self.bplayer.game_in_progress = None
            if not self.wplayer.bot:
                self.wplayer.game_in_progress = None

    def set_dests(self):
        dests = {}
        promotions = []
        moves = self.board.legal_moves()
        # print("self.board.legal_moves()", moves)
        if self.random_mover:
            self.random_move = random.choice(moves) if moves else ""
            # print("RM: %s" % self.random_move)

        for move in moves:
            if self.variant == "xiangqi" or self.variant == "grand" or self.variant == "grandhouse" or self.variant == "shako" or self.variant == "janggi":
                move = grand2zero(move)
            source, dest = move[0:2], move[2:4]
            if source in dests:
                dests[source].append(dest)
            else:
                dests[source] = [dest]

            if not move[-1].isdigit():
                promotions.append(move)

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
        no_setup = self.initial_fen == self.board.start_fen("chess") and not self.chess960
        # Use lichess format for crazyhouse games to support easy import
        setup_fen = self.initial_fen if self.variant != "crazyhouse" else self.initial_fen.replace("[]", "")
        return '[Event "{}"]\n[Site "{}"]\n[Date "{}"]\n[Round "-"]\n[White "{}"]\n[Black "{}"]\n[Result "{}"]\n[TimeControl "{}+{}"]\n[WhiteElo "{}"]\n[BlackElo "{}"]\n[Variant "{}"]\n{fen}{setup}\n{} {}\n'.format(
            "PyChess " + ("rated" if self.rated else "casual") + " game",
            URI + "/" + self.id,
            self.date.strftime("%Y.%m.%d"),
            self.wplayer.username,
            self.bplayer.username,
            self.result,
            self.base * 60,
            self.inc,
            self.wrating,
            self.brating,
            self.variant.capitalize() if not self.chess960 else VARIANT_960_TO_PGN[self.variant],
            moves,
            self.result,
            fen="" if no_setup else '[FEN "%s"]\n' % setup_fen,
            setup="" if no_setup else '[SetUp "1"]\n')

    @property
    def uci_usi(self):
        if self.variant[-5:] == "shogi":
            mirror = mirror9 if self.variant == "shogi" else mirror5
            return "position sfen %s moves %s" % (self.board.initial_sfen, " ".join(map(uci2usi, map(mirror, self.board.move_stack))))
        else:
            return "position fen %s moves %s" % (self.board.initial_fen, " ".join(self.board.move_stack))

    @property
    def clocks(self):
        return self.ply_clocks[-1]

    @property
    def is_claimable_draw(self):
        return self.board.is_claimable_draw()

    @property
    def spectator_list(self):
        spectators = (spectator.username for spectator in self.spectators if not spectator.anon)
        anons = ()
        anon = sum(1 for user in self.spectators if user.anon)

        cnt = len(self.spectators)
        if cnt > 10:
            spectators = str(cnt)
        else:
            if anon > 0:
                anons = ("Anonymous(%s)" % anon,)
            spectators = ", ".join(chain(spectators, anons))
        return {"type": "spectators", "spectators": spectators, "gameId": self.id}

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
        self.update_status(ABORTED)
        await self.save_game()
        return {"type": "gameEnd", "status": self.status, "result": "Game aborted.", "gameId": self.id, "pgn": self.pgn}

    async def abandone(self, user):
        result = "0-1" if user.username == self.wplayer.username else "1-0"
        self.update_status(LOSERS["abandone"], result)
        await self.save_game()
        return {"type": "gameEnd", "status": self.status, "result": result, "gameId": self.id, "pgn": self.pgn}

    def get_board(self, full=False):
        if full:
            steps = self.steps

            # To not touch self.ply_clocks we are creating deep copy from clocks
            clocks = {"black": self.clocks["black"], "white": self.clocks["white"]}

            if self.status == STARTED and self.board.ply >= 2:
                # We have to adjust current player latest saved clock time
                # unless he will get free extra time on browser page refresh
                # (also needed for spectators entering to see correct clock times)

                cur_time = monotonic()
                elapsed = int(round((cur_time - self.last_server_clock) * 1000))

                cur_color = "black" if self.board.color == BLACK else "white"
                clocks[cur_color] = max(0, clocks[cur_color] - elapsed)
            crosstable = self.crosstable
        else:
            clocks = self.clocks
            steps = (self.steps[-1],)
            crosstable = ""

        return {"type": "board",
                "gameId": self.id,
                "status": self.status,
                "result": self.result,
                "fen": self.board.fen,
                "lastMove": self.lastmove,
                "steps": steps,
                "dests": self.dests,
                "promo": self.promotions,
                "check": self.check,
                "ply": self.board.ply,
                "clocks": {"black": clocks["black"], "white": clocks["white"]},
                "pgn": self.pgn if self.status > STARTED else "",
                "rdiffs": {"brdiff": self.brdiff, "wrdiff": self.wrdiff} if self.status > STARTED and self.rated else "",
                "uci_usi": self.uci_usi if self.status > STARTED else "",
                "ct": crosstable,
                }
