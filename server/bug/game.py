import asyncio
import collections
import logging
import random
from datetime import datetime, timezone
from time import monotonic

from user import User

try:
    import pyffish as sf

    sf.set_option("VariantPath", "variants.ini")
except ImportError:
    print("No pyffish module installed!")

from broadcast import lobby_broadcast
from clock import Clock
from compress import encode_moves, R2C
from const import (
    CREATED,
    STARTED,
    ABORTED,
    MATE,
    STALEMATE,
    DRAW,
    FLAG,
    INVALIDMOVE,
    LOSERS,
    VARIANTEND,
    CASUAL,
    RATED,
    IMPORTED,
    variant_display_name,
    MAX_CHAT_LINES,
)
from fairy import FairyBoard, BLACK
from spectators import spectators

log = logging.getLogger(__name__)

MAX_HIGH_SCORE = 10
MAX_PLY = 2*600
KEEP_TIME = 1800  # keep game in app["games"] for KEEP_TIME secs


class GameBug:
    def __init__(
        self,
        app,
        gameId,
        variant,
        initial_fen,
        wplayerA,
        bplayerA,
        wplayerB,
        bplayerB,
        base=1,
        inc=0,
        level=0,
        rated=CASUAL,
        chess960=False,
        create=True,
        tournamentId=None,
    ):
        self.app = app
        self.db = app["db"] if "db" in app else None
        self.users = app["users"]
        self.games = app["games"]
        self.highscore = app["highscore"]
        self.db_crosstable = app["crosstable"]

        self.saved = False
        self.remove_task = None

        self.variant = variant
        self.initial_fen = initial_fen
        self.wplayerA = wplayerA
        self.bplayerA = bplayerA
        self.wplayerB = wplayerB
        self.bplayerB = bplayerB
        self.rated = rated
        self.base = base
        self.inc = inc
        self.level = level if level is not None else 0
        self.tournamentId = tournamentId
        self.chess960 = chess960
        self.create = create
        self.imported_by = ""

        self.berserk_time = self.base * 1000 * 30

        self.browser_title = "%s • %s+%s vs %s+%s" % (
            variant_display_name(self.variant + ("960" if self.chess960 else "")).title(),
            self.wplayerA.username,
            self.bplayerB.username,
            self.wplayerB.username,
            self.bplayerA.username,
        )

        # rating info
        self.white_rating_a = wplayerA.get_rating(variant, chess960)
        self.white_rating_b = wplayerB.get_rating(variant, chess960)
        self.wrating_a = "%s%s" % self.white_rating_a.rating_prov
        self.wrating_b = "%s%s" % self.white_rating_b.rating_prov
        self.wrdiff = 0 # todo: what was this - should i duplicate it for 2 boards?
        self.black_rating_a = bplayerA.get_rating(variant, chess960)
        self.black_rating_b = bplayerB.get_rating(variant, chess960)
        self.brating_a = "%s%s" % self.black_rating_a.rating_prov
        self.brating_b = "%s%s" % self.black_rating_b.rating_prov
        self.brdiff = 0 # todo: what was this - should i duplicate it for 2 boards?

        # crosstable info
        self.need_crosstable_save = False
        self.bot_game = self.bplayerA.bot or self.bplayerB.bot or self.wplayerA.bot or self.wplayerB.bot  # todo: whats the purpose of bot_game property?
        # if self.bot_game or self.wplayer.anon or self.bplayer.anon: todo:cross table support not sure how to design it even
        #     self.crosstable = ""
        # else:
        #     if self.wplayer.username < self.bplayer.username:
        #         self.s1player = self.wplayer.username
        #         self.s2player = self.bplayer.username
        #     else:
        #         self.s1player = self.bplayer.username
        #         self.s2player = self.wplayer.username
        #     self.ct_id = self.s1player + "/" + self.s2player
        #     self.crosstable = self.db_crosstable.get(
        #         self.ct_id, {"_id": self.ct_id, "s1": 0, "s2": 0, "r": []}
        #     )

        self.spectators = set()
        self.draw_offers = set()
        self.rematch_offers = set()
        self.messages = collections.deque([], MAX_CHAT_LINES)
        self.date = datetime.now(timezone.utc)

        self.ply_clocks = [
            {
                "black": (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
                "white": (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
            }
        ]
        self.dests_a = {}
        self.dests_b = {}
        self.promotions_a = []
        self.promotions_b = []
        self.lastmove = None
        self.check = False
        self.status = CREATED
        self.result = "*"
        self.last_server_clock = monotonic()

        self.id = gameId

        disabled_fen = ""
        # if self.chess960 and self.initial_fen and self.create: todo: i dont even undrstand this code block so commenting it before deleting it just to read one last time before deleting - obv for now not needed before we at least support 960
        #     if self.wplayer.fen960_as_white == self.initial_fen:
        #         disabled_fen = self.initial_fen
        #         self.initial_fen = ""

        self.boards = {"a": FairyBoard(self.variant, self.initial_fen.split("|")[0].strip(), self.chess960, 0, disabled_fen),
                       "b": FairyBoard(self.variant, self.initial_fen.split("|")[1].strip(), self.chess960, 0, disabled_fen)}

        self.overtime = False

        self.initial_fen = self.boards["a"].initial_fen + " | " + self.boards["b"].initial_fen
        # self.wplayer.fen960_as_white = self.initial_fen

        self.random_mover = "Random-Mover" in (
            self.wplayerA.username,
            self.bplayerA.username,
            self.wplayerB.username,
            self.bplayerB.username,
        )
        self.random_move_a = ""
        self.random_move_b = ""

        self.set_dests()
        if self.boards["a"].move_stack or self.boards["b"].move_stack:
            self.check = self.boards["a"].is_checked() or self.boards["b"].is_checked()  # todo not sure whats the point - except maybe for game-end/checkmate logic

        self.steps = [
            {
                "fen": self.boards["a"].initial_fen,
                "fenB": self.boards["b"].initial_fen,
                "san": None,
                "turnColor": "white",  # todo: doesn't make sense in this initial step now - maybe have 2 fields for both boards for this reason when we don't have "active" board for last move and this.
                "check": self.check,
                "clocks": self.ply_clocks[0],
            }
        ]

        # self.stopwatch = Clock(self)

        if not self.bplayerA.bot:
            self.bplayerA.game_in_progress = self.id
        if not self.wplayerA.bot:
            self.wplayerA.game_in_progress = self.id
        if not self.bplayerB.bot:
            self.bplayerB.game_in_progress = self.id
        if not self.wplayerB.bot:
            self.wplayerB.game_in_progress = self.id

        # self.wberserk = False todo: thinking about berserk for bughouse is not on the horizon
        # self.bberserk = False

        self.move_lock = asyncio.Lock()

    def berserk(self, color):
        pass
        # if color == "white" and not self.wberserk:
        #     self.wberserk = True
        #     self.ply_clocks[0]["white"] = self.berserk_time
        # elif color == "black" and not self.bberserk:
        #     self.bberserk = True
        #     self.ply_clocks[0]["black"] = self.berserk_time

    async def play_move(self, move, clocks=None, ply=None, board="a"):
        # self.stopwatch.stop()
        self.byo_correction = 0

        if self.status > STARTED:
            return
        if self.status == CREATED:
            self.status = STARTED
            self.app["g_cnt"][0] += 1
            response = {"type": "g_cnt", "cnt": self.app["g_cnt"][0]}
            await lobby_broadcast(self.app["lobbysockets"], response)

        cur_player_a = self.bplayerA if self.boards["a"].color == BLACK else self.wplayerA
        cur_player_b = self.bplayerB if self.boards["b"].color == BLACK else self.wplayerB
        cur_player = cur_player_a if board == "a" else cur_player_b
        # opp_player_a = self.wplayerA if self.boards["a"].color == BLACK else self.bplayerA
        # opp_player_b = self.wplayerB if self.boards["b"].color == BLACK else self.bplayerB

        # Move cancels draw offer todo: cant decide how draw mechanics should work exactly in bug
        # response = reject_draw(self, opp_player.username)
        # if response is not None:
        #     await round_broadcast(self, response, full=True)

        cur_time = monotonic()

        # BOT players doesn't send times used for moves todo: why?
        if self.bot_game:
            movetime = (
                int(round((cur_time - self.last_server_clock) * 1000)) if self.boards[board].ply >= 2 else 0
            )
            if clocks is None:
                clocks = {
                    "white": self.ply_clocks[-1]["white"],
                    "black": self.ply_clocks[-1]["black"],
                }

            if cur_player.bot and self.boards[board].ply >= 2:
                cur_color = "black" if self.boards[board].color == BLACK else "white"
                clocks[cur_color] = max(
                    0, self.clocks[cur_color] - movetime + (self.inc * 1000)
                )

                if clocks[cur_color] == 0:
                    w, b = self.boards[board].insufficient_material()
                    if (
                        (w and b)
                        or (cur_color == "black" and w)
                        or (cur_color == "white" and b)
                    ):
                        result = "1/2-1/2"
                    else:
                        result = "1-0" if self.boards[board].color == BLACK else "0-1"
                    self.update_status(FLAG, result)
                    print(self.result, "flag")
                    await self.save_game()

        self.last_server_clock = cur_time

        if self.status <= STARTED:
            try:
                san = self.boards[board].get_san(move)
                self.lastmove = move
                self.boards[board].push(move)
                self.ply_clocks.append(clocks)
                self.set_dests()
                self.update_status()

                if self.status > STARTED:
                    await self.save_game()

                self.steps.append(
                    {
                        "fen": self.boards[board].fen,
                        "move": move,
                        "boardName": board,
                        "san": san,
                        "turnColor": "black" if self.boards[board].color == BLACK else "white",
                        "check": self.check,
                        "clocks": clocks,
                    }
                )
                # self.stopwatch.restart()

            except Exception:
                log.exception("ERROR: Exception in game %s play_move() %s", self.id, move)
                result = "1-0" if self.boards[board].color == BLACK else "0-1"
                self.update_status(INVALIDMOVE, result)
                await self.save_game()

            # # TODO: this causes random game abort... todo niki no ide what is this - is it relevant ot bugh
            # if False:  # not self.bot_game:
            #     opp_color = self.steps[-1]["turnColor"]
            #     if (
            #         clocks[opp_color] < self.ply_clocks[ply - 1][opp_color]
            #         and self.status <= STARTED
            #     ):
            #         self.update_status(ABORTED)
            #         await self.save_game()

    async def save_game(self):
        if self.saved:
            return
        self.saved = True

        if self.rated == IMPORTED:
            log.exception("Save IMPORTED game %s ???", self.id)
            return

        # self.stopwatch.clock_task.cancel()
        # try:
        #     await self.stopwatch.clock_task
        # except asyncio.CancelledError:
        #     pass

        if self.boards["a"].ply > 0 or self.boards["b"].ply > 0:  # todo niki no idea what this is - just gonna or both boards now
            self.app["g_cnt"][0] -= 1
            response = {"type": "g_cnt", "cnt": self.app["g_cnt"][0]}
            await lobby_broadcast(self.app["lobbysockets"], response)

        async def remove(keep_time):
            # Keep it in our games dict a little to let players get the last board
            # not to mention that BOT players want to abort games after 20 sec inactivity
            await asyncio.sleep(keep_time)

            try:
                del self.games[self.id]
            except KeyError:
                log.info("Failed to del %s from games", self.id)

            if self.bot_game:
                try:
                    if self.wplayerA.bot:
                        del self.wplayerA.game_queues[self.id]
                    if self.bplayerA.bot:
                        del self.bplayerA.game_queues[self.id]
                    if self.wplayerB.bot:
                        del self.wplayerB.game_queues[self.id]
                    if self.bplayerB.bot:
                        del self.bplayerB.game_queues[self.id]
                except KeyError:
                    log.info("Failed to del %s from game_queues", self.id)

        self.remove_task = asyncio.create_task(remove(KEEP_TIME))

        # todo niki just adding up both ply instead. think later what actually makes sense in bughouse
        if self.boards["a"].ply + self.boards["b"].ply < 6 and (self.db is not None) and (self.tournamentId is None):
            result = await self.db.game.delete_one({"_id": self.id})
            log.debug(
                "Removed too short game %s from db. Deleted %s game.",
                self.id,
                result.deleted_count,
            )
        else:
            if self.result != "*":
                if self.rated == RATED:
                    await self.update_ratings()
                # if (not self.bot_game) and (not self.wplayer.anon) and (not self.bplayer.anon):  todo:niki: crosstable for bug not supported for now
                #     await self.save_crosstable()

            if self.tournamentId is not None:
                try:
                    await self.app["tournaments"][self.tournamentId].game_update(self)
                except Exception:
                    log.exception("Exception in tournament game_update()")

            new_data = {
                "d": self.date,
                "f": self.boards["a"].fen + " | " + self.boards["b"].fen,
                "s": self.status,
                "r": R2C[self.result],
                "m": encode_moves(
                    self.boards["a"].move_stack, # todo niki probably best to maintain separate list of steps similar to cliend-side structures. for now just lets have something that passes static analysis
                    self.variant
                ),
            }

            # if self.rated == RATED and self.result != "*": # todo niki fix together with update_rating when decide how to do bughouse ratings
            #     new_data["p0"] = self.p0
            #     new_data["p1"] = self.p1

            if self.rated == RATED:
                # TODO: self.ply_clocks dict stores clock data redundant
                # possible it would be better to use self.ply_clocks_w and self.ply_clocks_b arrays instead
                new_data["cw"] = [p["white"] for p in self.ply_clocks[1:]][0::2]
                new_data["cb"] = [p["black"] for p in self.ply_clocks[2:]][0::2]

            # if self.tournamentId is not None:
            #     new_data["wb"] = self.wberserk
            #     new_data["bb"] = self.bberserk

            if self.db is not None:
                await self.db.game.find_one_and_update({"_id": self.id}, {"$set": new_data})

    # def set_crosstable(self):
    #     if (
    #         self.bot_game
    #         or self.wplayer.anon
    #         or self.bplayer.anon
    #         or self.board.ply < 3
    #         or self.result == "*"
    #     ):
    #         return
    #
    #     if len(self.crosstable["r"]) > 0 and self.crosstable["r"][-1].startswith(self.id):
    #         log.info("Crosstable was already updated with %s result", self.id)
    #         return
    #
    #     if self.result == "1/2-1/2":
    #         s1 = s2 = 5
    #         tail = "="
    #     elif (self.result == "1-0" and self.s1player == self.wplayer.username) or (
    #         self.result == "0-1" and self.s1player == self.bplayer.username
    #     ):
    #         s1 = 10
    #         s2 = 0
    #         tail = "+"
    #     else:
    #         s1 = 0
    #         s2 = 10
    #         tail = "-"
    #
    #     self.crosstable["s1"] += s1
    #     self.crosstable["s2"] += s2
    #     self.crosstable["r"].append("%s%s" % (self.id, tail))
    #     self.crosstable["r"] = self.crosstable["r"][-20:]
    #
    #     new_data = {
    #         "_id": self.ct_id,
    #         "s1": self.crosstable["s1"],
    #         "s2": self.crosstable["s2"],
    #         "r": self.crosstable["r"],
    #     }
    #     self.db_crosstable[self.ct_id] = new_data
    #
    #     self.need_crosstable_save = True

    # async def save_crosstable(self):
    #     if not self.need_crosstable_save:
    #         log.info("Crosstable update for %s was already saved to mongodb", self.id)
    #         return
    #
    #     new_data = {
    #         "s1": self.crosstable["s1"],
    #         "s2": self.crosstable["s2"],
    #         "r": self.crosstable["r"],
    #     }
    #     try:
    #         await self.db.crosstable.find_one_and_update(
    #             {"_id": self.ct_id}, {"$set": new_data}, upsert=True
    #         )
    #     except Exception:
    #         if self.db is not None:
    #             log.error("Failed to save new crosstable to mongodb!")
    #
    #     self.need_crosstable_save = False

    # def get_highscore(self, variant, chess960): todo niki what is this highscore stuff ??
    #     len_hs = len(self.highscore[variant + ("960" if chess960 else "")])
    #     if len_hs > 0:
    #         return (
    #             self.highscore[variant + ("960" if chess960 else "")].peekitem()[1],
    #             len_hs,
    #         )
    #     return (0, 0)

    async def set_highscore(self, variant, chess960, value):
        self.highscore[variant + ("960" if chess960 else "")].update(value)
        # We have to preserve previous top 10!
        # See test_win_and_in_then_lost_and_out() in test.py
        # if len(self.highscore[variant + ("960" if chess960 else "")]) > MAX_HIGH_SCORE:
        #     self.highscore[variant + ("960" if chess960 else "")].popitem()

        new_data = {
            "scores": dict(self.highscore[variant + ("960" if chess960 else "")].items()[:10])
        }
        try:
            await self.db.highscore.find_one_and_update(
                {"_id": variant + ("960" if chess960 else "")},
                {"$set": new_data},
                upsert=True,
            )
        except Exception:
            if self.db is not None:
                log.error("Failed to save new highscore to mongodb!")

    async def update_ratings(self):
        pass
        # todo niki this requires discussion how to do rating in bughouse
        # if self.result == "1-0":
        #     (white_score, black_score) = (1.0, 0.0)
        # elif self.result == "1/2-1/2":
        #     (white_score, black_score) = (0.5, 0.5)
        # elif self.result == "0-1":
        #     (white_score, black_score) = (0.0, 1.0)
        # else:
        #     raise RuntimeError("game.result: unexpected result code")
        #
        # wr = gl2.rate(self.white_rating, [(white_score, self.black_rating)])
        # br = gl2.rate(self.black_rating, [(black_score, self.white_rating)])
        #
        # await self.wplayer.set_rating(self.variant, self.chess960, wr)
        # await self.bplayer.set_rating(self.variant, self.chess960, br)
        #
        # self.wrdiff = int(round(wr.mu - self.white_rating.mu, 0))
        # self.p0 = {"e": self.wrating, "d": self.wrdiff}
        #
        # self.brdiff = int(round(br.mu - self.black_rating.mu, 0))
        # self.p1 = {"e": self.brating, "d": self.brdiff}
        #
        # w_nb = self.wplayer.perfs[self.variant + ("960" if self.chess960 else "")]["nb"]
        # if w_nb >= HIGHSCORE_MIN_GAMES:
        #     await self.set_highscore(
        #         self.variant,
        #         self.chess960,
        #         {self.wplayer.username: int(round(wr.mu, 0))},
        #     )
        #
        # b_nb = self.bplayer.perfs[self.variant + ("960" if self.chess960 else "")]["nb"]
        # if b_nb >= HIGHSCORE_MIN_GAMES:
        #     await self.set_highscore(
        #         self.variant,
        #         self.chess960,
        #         {self.bplayer.username: int(round(br.mu, 0))},
        #     )

    @property
    def wplayer(self):
        return self.wplayerA  # temporary for compatibitly everywhere this stuff is accessed now
    @property
    def bplayer(self):
        return self.bplayerA  # temporary for compatibitly everywhere this stuff is accessed now
    @property
    def byoyomi_period(self):
        return 0
    @property
    def crosstable(self):
        return ""

    @property
    def wrating(self):
        return self.wrating_a  # temporary for compatibitly everywhere this stuff is accessed now
    @property
    def brating(self):
        return self.brating_a  # temporary for compatibitly everywhere this stuff is accessed now

    @property
    def fen(self):
        return self.boards["a"].fen + " | " + self.boards["b"].fen
    @property
    def ply(self):
        return self.boards["a"].ply + self.boards["b"].ply

    def is_player(self, user: User) -> bool:
        return user.username in (self.wplayerA.username, self.bplayerA.username, self.wplayerB.username, self.bplayerB.username)

    def update_status(self, status=None, result=None):
        if self.status > STARTED:
            return

        def result_string_from_value(color, game_result_value):
            if game_result_value < 0:
                return "1-0" if color == BLACK else "0-1"
            if game_result_value > 0:
                return "0-1" if color == BLACK else "1-0"
            return "1/2-1/2"

        if status is not None:
            self.status = status
            if result is not None:
                self.result = result

            # self.set_crosstable()

            if not self.bplayerA.bot:
                self.bplayerA.game_in_progress = None
            if not self.wplayerA.bot:
                self.wplayerA.game_in_progress = None
            if not self.bplayerB.bot:
                self.bplayerB.game_in_progress = None
            if not self.wplayerB.bot:
                self.wplayerB.game_in_progress = None

            return

        if self.boards["a"].move_stack:
            self.check = self.boards["a"].is_checked()
        if self.boards["b"].move_stack:
            self.check = self.check or self.boards["b"].is_checked()  # todo niki no idea what self.check is needed for, but lets fix it here instead of coment it out

        # w, b = self.board.insufficient_material()  todo niki have to think again, but i feel insufficient is not applicable for bughouse
        # if w and b:
        #     self.status = DRAW
        #     self.result = "1/2-1/2"

        if not self.dests_a or not self.dests_b:
            board_which_ended = "a" if not self.dests_a else "b"
            game_result_value = self.boards[board_which_ended].game_result()
            self.result = result_string_from_value(self.boards[board_which_ended].color, game_result_value)

            if self.boards[board_which_ended].is_immediate_game_end()[0]:
                self.status = VARIANTEND
            elif self.check:
                self.status = MATE

                if self.variant == "atomic" and game_result_value == 0:
                    # If Fairy game_result() is 0 it is not mate but stalemate
                    self.status = STALEMATE

                # Draw if the checkmating player is the one counting
                if self.boards[board_which_ended].count_started > 0:
                    counting_side = "b" if self.boards[board_which_ended].count_started % 2 == 0 else "w"
                    if self.result == ("1-0" if counting_side == "w" else "0-1"):
                        self.status = DRAW
                        self.result = "1/2-1/2"

                # Pawn drop mate
                # TODO: remove this when https://github.com/ianfab/Fairy-Stockfish/issues/48 resolves
                if self.boards[board_which_ended].move_stack[-1][1] == "@":
                    if (
                        self.boards[board_which_ended].move_stack[-1][0] == "P"
                        and self.variant
                        in (
                            "shogi",
                            "minishogi",
                            "gorogoro",
                            "gorogoroplus",
                        )
                    ) or (self.boards[board_which_ended].move_stack[-1][0] == "S" and self.variant == "torishogi"):
                        self.status = INVALIDMOVE
            else:
                self.status = STALEMATE

        else:
            pass # todo niki dont think this applies to bughouse but should check/discuss at some point
            # # end the game by 50 move rule and repetition automatically
            # # for non-draw results and bot games
            # is_game_end, game_result_value = self.board.is_optional_game_end()
            # if is_game_end and (game_result_value != 0 or (self.wplayer.bot or self.bplayer.bot)):
            #     self.result = result_string_from_value(self.board.color, game_result_value)
            #     self.status = CLAIM if game_result_value != 0 else DRAW

        if self.boards["a"].ply + self.boards["b"].ply > MAX_PLY:  # todo niki use global ply counter eventually
            self.status = DRAW
            self.result = "1/2-1/2"

        if self.status > STARTED:
            # self.set_crosstable()

            if not self.bplayerA.bot:
                self.bplayerA.game_in_progress = None
            if not self.wplayerA.bot:
                self.wplayerA.game_in_progress = None
            if not self.bplayerB.bot:
                self.bplayerB.game_in_progress = None
            if not self.wplayerB.bot:
                self.wplayerB.game_in_progress = None

    def set_dests(self):
        dests_a = {}
        dests_b = {}
        promotions_a = []
        promotions_b = []
        moves_a = self.boards["a"].legal_moves()
        moves_b = self.boards["b"].legal_moves()
        if self.random_mover:  # todo niki i do not understand why this move is generated here at this moment - whose turn is it?
            self.random_move_a = random.choice(moves_a) if moves_a else ""
            self.random_move_b = random.choice(moves_b) if moves_b else ""

        for move in moves_a:
            source, dest = move[0:2], move[2:4]
            if source in dests_a:
                dests_a[source].append(dest)
            else:
                dests_a[source] = [dest]

            if not move[-1].isdigit():
                promotions_a.append(move)

        for move in moves_b:
            source, dest = move[0:2], move[2:4]
            if source in dests_b:
                dests_b[source].append(dest)
            else:
                dests_b[source] = [dest]

            if not move[-1].isdigit():
                promotions_b.append(move)

        self.dests_a = dests_a
        self.promotions_a = promotions_a
        self.dests_b = dests_b
        self.promotions_b = promotions_b

    def print_game(self):
        print(self.pgn)
        print(self.boards["a"].print_pos())
        print(self.boards["b"].print_pos())

    @property
    def pgn(self):
        return "bpgn export not implemented"  # todo niki - first need to store global move list somewhere
        # try:
        #     mlist = sf.get_san_moves(
        #         self.variant,
        #         self.initial_fen,
        #         self.board.move_stack,
        #         self.chess960,
        #         sf.NOTATION_SAN,
        #     )
        # except Exception:
        #     log.exception("ERROR: Exception in game %s pgn()", self.id)
        #     mlist = self.board.move_stack
        # moves = " ".join(
        #     (
        #         move if ind % 2 == 1 else "%s. %s" % (((ind + 1) // 2) + 1, move)
        #         for ind, move in enumerate(mlist)
        #     )
        # )
        # no_setup = self.initial_fen == self.board.start_fen("bughouse") and not self.chess960
        # # Use lichess format for crazyhouse games to support easy import
        # setup_fen = (
        #     self.initial_fen if self.variant != "crazyhouse" else self.initial_fen.replace("[]", "")
        # )
        # tc = "-" if self.base + self.inc == 0 else "%s+%s" % (int(self.base * 60), self.inc)
        # return '[Event "{}"]\n[Site "{}"]\n[Date "{}"]\n[Round "-"]\n[White "{}"]\n[Black "{}"]\n[Result "{}"]\n[TimeControl "{}"]\n[WhiteElo "{}"]\n[BlackElo "{}"]\n[Variant "{}"]\n{fen}{setup}\n{} {}\n'.format(
        #     "PyChess "
        #     + ("rated" if self.rated == RATED else "casual" if self.rated == CASUAL else "imported")
        #     + " game",
        #     URI + "/" + self.id,
        #     self.date.strftime("%Y.%m.%d"),
        #     self.wplayer.username,
        #     self.bplayer.username,
        #     self.result,
        #     tc,
        #     self.wrating,
        #     self.brating,
        #     self.variant.capitalize() if not self.chess960 else VARIANT_960_TO_PGN[self.variant],
        #     moves,
        #     self.result,
        #     fen="" if no_setup else '[FEN "%s"]\n' % setup_fen,
        #     setup="" if no_setup else '[SetUp "1"]\n',
        # )

    @property
    def uci_usi(self):
        return "position fen %s moves %s" % (
            self.boards["a"].initial_fen + " | " + self.boards["b"].initial_fen,
            " ".join(self.boards["a"].move_stack) + " | " + " ".join(self.boards["b"].move_stack),
        )

    @property
    def clocks(self):
        return self.ply_clocks[-1]

    @property
    def is_claimable_draw(self): # todo niki - not sure this makes much sense in bughouse
        return self.boards["a"].is_claimable_draw() or self.boards["b"].is_claimable_draw()

    @property
    def spectator_list(self):
        return spectators(self)

    def analysis_start(self, username):
        return (
            '{"type": "analysisStart", "username": "%s", "game": {"id": "%s", "skill_level": "%s", "chess960": "%s"}}\n'
            % (username, self.id, self.level, self.chess960)
        )

    @property
    def game_start(self):
        return (
            '{"type": "gameStart", "game": {"id": "%s", "skill_level": "%s", "chess960": "%s"}}\n'
            % (self.id, self.level, self.chess960)
        )

    @property
    def game_end(self):
        return '{"type": "gameEnd", "game": {"id": "%s"}}\n' % self.id

    @property
    def game_full(self):
        return (
            '{"type": "gameFull", "id": "%s", "variant": {"name": "%s"}, "white": {"name": "%s"}, "black": {"name": "%s"}, "initialFen": "%s", "state": %s}\n'
            % (
                self.id,
                self.variant,
                self.wplayerA.username,  # todo niki - i think this is only relevant for some bot games so postponing for now
                self.bplayerA.username,
                self.initial_fen,
                self.game_state[:-1],
            )
        )

    @property
    def game_state(self):
        clocks = self.clocks
        return (
            '{"type": "gameState", "moves": "%s", "wtime": %s, "btime": %s, "winc": %s, "binc": %s}\n'
            % (
                " ".join(self.boards["a"].move_stack),  # todo niki - i think this is only relevant for some bot games so postponing for now
                clocks["white"],
                clocks["black"],
                self.inc,
                self.inc,
            )
        )

    async def abort(self):
        self.update_status(ABORTED)
        await self.save_game()
        return {
            "type": "gameEnd",
            "status": self.status,
            "result": "Game aborted.",
            "gameId": self.id,
            "pgn": self.pgn,
        }

    async def game_ended(self, user, reason):
        """Abort, resign, flag, abandone"""
        if self.result == "*":
            if reason == "abort":
                result = "*"
            else:
                if reason == "flag":
                    result = "0-1" if user.username == self.wplayerA.username else "1-0" # todo niki - i have just hardcoded board A for now so it "compiles" and does something. Actual logic i have to think about
                else:
                    result = "0-1" if user.username == self.wplayerA.username else "1-0" # todo niki - i have just hardcoded board A for now so it "compiles" and does something. Actual logic i have to think about

            self.update_status(LOSERS[reason], result)
            await self.save_game()

        return {
            "type": "gameEnd",
            "status": self.status,
            "result": self.result,
            "gameId": self.id,
            "pgn": self.pgn,
            # "ct": self.crosstable,
            "rdiffs": {"brdiff": self.brdiff, "wrdiff": self.wrdiff}
            if self.status > STARTED and self.rated == RATED
            else "",
        }

    def get_board(self, full=False):
        if full:
            steps = self.steps

            # To not touch self.ply_clocks we are creating deep copy from clocks
            clocks = {"black": self.clocks["black"], "white": self.clocks["white"]}

            if self.status == STARTED and self.boards["a"].ply >= 2: # todo niki temporary hardocding board "a" - no idea what this is
                # We have to adjust current player latest saved clock time
                # otherwise he will get free extra time on browser page refresh
                # (also needed for spectators entering to see correct clock times)

                cur_time = monotonic()
                elapsed = int(round((cur_time - self.last_server_clock) * 1000))

                cur_color = "black" if self.boards["a"].color == BLACK else "white" # todo niki temporary hardocding board "a" - no idea what this is
                clocks[cur_color] = max(0, clocks[cur_color] + self.byo_correction - elapsed)
            # crosstable = self.crosstable
        else:
            clocks = self.clocks
            steps = (self.steps[-1],)
            # crosstable = self.crosstable if self.status > STARTED else ""

        return {
            "type": "board",
            "gameId": self.id,
            "status": self.status,
            "result": self.result,
            "fen": self.boards["a"].fen + " | " + self.boards["b"].fen,
            "lastMove": self.lastmove,
            "steps": steps,
            "destsA": self.dests_a,
            "destsB": self.dests_b,
            "promoA": self.promotions_a,
            "promoB": self.promotions_b,
            "check": self.check,
            "ply": self.boards["a"].ply + self.boards["b"].ply,  # todo niki - just use global ply counter and moves list eventually. just putting this here so it is correct but not best
            "clocks": {"black": clocks["black"], "white": clocks["white"]}, # todo niki
            # "byo": byoyomi_periods,
            "pgn": self.pgn if self.status > STARTED else "",
            "rdiffs": {"brdiff": self.brdiff, "wrdiff": self.wrdiff} # todo niki
            if self.status > STARTED and self.rated == RATED
            else "",
            "uci_usi": self.uci_usi if self.status > STARTED else "",
            "rmA": self.random_move_a if self.status <= STARTED else "",
            "rmB": self.random_move_b if self.status <= STARTED else "",  # todo niki - actually we might need 3 random moves to be generated when human + randommover vs random+random
            # "ct": crosstable,
            "berserk": {"w": False, "b": False}, # {"w": self.wberserk, "b": self.bberserk},
            "by": self.imported_by,
        }

    def game_json(self, player):
        color = "w" if self.wplayerA == player or self.wplayerB == player else "b"
        opp_rating, opp_player = \
                 (self.bplayerA, self.black_rating_a) if self.wplayerA == player \
            else (self.wplayerA, self.white_rating_a) if self.bplayerA == player \
            else (self.wplayerB, self.white_rating_b) if self.bplayerB == player \
            else (self.bplayerB, self.black_rating_b)
        opp_rating, prov = opp_rating.rating_prov
        return {
            "gameId": self.id,
            "title": opp_player.title,
            "name": opp_player.username,
            "rating": opp_rating,
            "prov": prov,
            "color": color,
            "result": self.result,
        }