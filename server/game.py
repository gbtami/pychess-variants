from __future__ import annotations
import asyncio
import collections
import logging
from datetime import datetime, timezone, timedelta
from time import monotonic
from typing import Set, List

from user import User

from broadcast import round_broadcast
from clock import Clock, CorrClock
from compress import get_encode_method, R2C
from const import (
    CREATED,
    STARTED,
    ABORTED,
    MATE,
    STALEMATE,
    DRAW,
    FLAG,
    CLAIM,
    INVALIDMOVE,
    VARIANT_960_TO_PGN,
    LOSERS,
    VARIANTEND,
    GRANDS,
    CASUAL,
    RATED,
    IMPORTED,
    HIGHSCORE_MIN_GAMES,
    MAX_HIGHSCORE_ITEM_LIMIT,
    variant_display_name,
    MAX_CHAT_LINES,
    TYPE_CHECKING,
)
from convert import grand2zero, uci2usi, mirror5, mirror9
from fairy import FairyBoard, BLACK, WHITE
from glicko2.glicko2 import gl2
from draw import reject_draw
from settings import URI
from spectators import spectators

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

log = logging.getLogger(__name__)

try:
    import pyffish as sf

    sf.set_option("VariantPath", "variants.ini")
except ImportError:
    log.error("No pyffish module installed!", exc_info=True)

log = logging.getLogger(__name__)

MAX_PLY = 600
KEEP_TIME = 1800  # keep game in app[games_key] for KEEP_TIME secs

INVALID_PAWN_DROP_MATE = (
    ("P@", "shogi"),
    ("P@", "minishogi"),
    ("P@", "gorogoro"),
    ("P@", "gorogoroplus"),
    ("S@", "torishogi"),
)


class Game:
    def __init__(
        self,
        app_state: PychessGlobalAppState,
        gameId,
        variant,
        initial_fen,
        wplayer,
        bplayer,
        base=1,
        inc=0,
        byoyomi_period=0,
        level=0,
        rated=CASUAL,
        chess960=False,
        corr=False,
        create=True,
        tournamentId=None,
    ):
        self.app_state = app_state

        self.saved = False
        self.remove_task = None

        self.variant = variant
        self.initial_fen = initial_fen
        self.wplayer = wplayer
        self.bplayer = bplayer

        self.all_players = [self.wplayer, self.bplayer]
        self.non_bot_players = [player for player in self.all_players if not player.bot]

        self.rated = rated
        self.base = base
        self.inc = inc
        self.level = level if level is not None else 0
        self.tournamentId = tournamentId
        self.chess960 = chess960
        self.corr = corr
        self.create = create
        self.imported_by = ""

        self.berserk_time = self.base * 1000 * 30

        self.browser_title = "%s • %s vs %s" % (
            variant_display_name(self.variant + ("960" if self.chess960 else "")).title(),
            self.wplayer.username,
            self.bplayer.username,
        )

        # rating info
        white_rating = wplayer.get_rating(variant, chess960)
        self.wrating: int | str = "%s%s" % white_rating.rating_prov
        self.wrdiff: int | str = 0
        black_rating = bplayer.get_rating(variant, chess960)
        self.brating: int | str = "%s%s" % black_rating.rating_prov
        self.brdiff: int | str = 0

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
            self.crosstable = app_state.crosstable.get(
                self.ct_id, {"_id": self.ct_id, "s1": 0, "s2": 0, "r": []}
            )

        self.spectators: Set[User] = set()
        self.draw_offers: Set[str] = set()
        self.rematch_offers: Set[str] = set()
        self.messages: collections.deque = collections.deque([], MAX_CHAT_LINES)

        self.date = datetime.now(timezone.utc)
        self.loaded_at = None
        self.analysis = None

        clocks_init = (base * 1000 * 60) + 0 if base > 0 else inc * 1000
        self.clocks_w = [clocks_init]
        self.clocks_b = [clocks_init]

        self.lastmove = None
        self.check = False
        self.status = CREATED
        self.result = "*"
        self.last_server_clock = monotonic()

        self.id = gameId

        self.encode_method = get_encode_method(variant)

        self.n_fold_is_draw = self.variant in (
            "makruk",
            "makpong",
            "cambodian",
            "shogi",
            "dobutsu",
            "gorogoro",
            "gorogoroplus",
            "kyotoshogi",
        )
        self.has_counting = self.variant in ("makruk", "makpong", "cambodian", "sittuyin", "asean")
        # Makruk manual counting
        use_manual_counting = self.variant in ("makruk", "makpong", "cambodian")
        self.manual_count = use_manual_counting and not self.bot_game
        self.manual_count_toggled: List = []
        self.mct = None

        # Old USI Shogi games saved using usi2uci() need special handling in create_steps()
        self.usi_format = False

        # Ataxx is not default or 960, just random
        self.random_only = self.variant == "ataxx"

        # Calculate the start of manual counting
        count_started = 0
        if self.manual_count:
            count_started = -1
            if self.initial_fen:
                parts = self.initial_fen.split()
                board_state = parts[0]
                side_to_move = parts[1]
                counting_limit = int(parts[3]) if len(parts) >= 4 and parts[3].isdigit() else 0
                counting_ply = int(parts[4]) if len(parts) >= 5 else 0
                move_number = int(parts[5]) if len(parts) >= 6 else 0

                white_pieces = sum(1 for c in board_state if c.isupper())
                black_pieces = sum(1 for c in board_state if c.islower())
                pawns = sum(1 for c in board_state if c in ("P", "p"))
                if counting_limit > 0 and counting_ply > 0:
                    if pawns == 0 and (white_pieces <= 1 or black_pieces <= 1):
                        # Disable manual count if either side is already down to lone king
                        count_started = 0
                        self.manual_count = False
                    else:
                        last_ply = 2 * move_number - (2 if side_to_move == "w" else 1)
                        count_started = last_ply - counting_ply + 1
                        if count_started < 1:
                            # Move number is too small for the current count
                            count_started = 0
                            self.manual_count = False
                        else:
                            counting_player = (
                                self.bplayer if counting_ply % 2 == 0 else self.wplayer
                            )
                            self.draw_offers.add(counting_player.username)

        disabled_fen = ""
        if (self.chess960 or self.random_only) and self.initial_fen and self.create:
            if self.wplayer.fen960_as_white == self.initial_fen:
                disabled_fen = self.initial_fen
                self.initial_fen = ""

        self.board = FairyBoard(
            self.variant, self.initial_fen, self.chess960, count_started, disabled_fen
        )

        # Janggi setup needed when player is not BOT
        if self.variant == "janggi":
            # Janggi custom start position -> no setup phase
            if self.initial_fen:
                self.bsetup = False
                self.wsetup = False
                self.status = STARTED
            else:
                # Red (the second player) have to choose the starting positions of the horses and elephants
                self.bsetup = not self.bplayer.bot
                # Blue (the first player) have to choose the starting positions of the horses and elephants
                self.wsetup = not self.wplayer.bot
                if self.bplayer.bot:
                    self.board.janggi_setup("b")

        self.overtime = False
        self.byoyomi = byoyomi_period > 0
        self.byoyomi_period = byoyomi_period

        # Remaining byoyomi periods by players
        self.byoyomi_periods = [byoyomi_period, byoyomi_period]

        # On page refresh we have to add extra byoyomi times gained by current player to report correct clock time
        # We adjust this in "byoyomi" messages in wsr.py
        self.byo_correction = 0

        if self.chess960 or self.random_only:
            self.initial_fen = self.board.initial_fen
            self.wplayer.fen960_as_white = self.initial_fen

        self.random_mover = "Random-Mover" in (
            self.wplayer.username,
            self.bplayer.username,
        )
        self.legal_moves = self.board.legal_moves()

        if self.board.move_stack:
            self.check = self.board.is_checked()

        self.steps = [
            {
                "fen": self.initial_fen if self.initial_fen else self.board.initial_fen,
                "san": None,
                "turnColor": "black" if self.board.color == BLACK else "white",
                "check": self.check,
                "clocks": (self.clocks_w[0], self.clocks_b[0]),
            }
        ]

        self.last_move_time = None
        if self.corr:
            self.stopwatch: Clock | CorrClock = CorrClock(self)
        else:
            self.stopwatch: Clock | CorrClock = Clock(self)

        if (not self.corr) and (not self.bplayer.bot):
            self.bplayer.game_in_progress = self.id
        if (not self.corr) and (not self.wplayer.bot):
            self.wplayer.game_in_progress = self.id

        self.wberserk = False
        self.bberserk = False

        self.move_lock = asyncio.Lock()

    def berserk(self, color):
        if color == "white" and not self.wberserk:
            self.wberserk = True
            self.clocks_w[0] = self.berserk_time
        elif color == "black" and not self.bberserk:
            self.bberserk = True
            self.clocks_b[0] = self.berserk_time

    async def save_berserk(self):
        new_data = {
            "wb": self.wberserk,
            "bb": self.bberserk,
            "cw": self.clocks_w[1:],
            "cb": self.clocks_b[1:],
        }

        await self.app_state.db.game.find_one_and_update({"_id": self.id}, {"$set": new_data})

    async def play_move(self, move, clocks=None, ply=None):
        self.stopwatch.stop()

        self.byo_correction = 0

        if self.status > STARTED:
            return

        # In Janggi games self.status was already set to STARTED when setup phase ended
        # so we have to check board.ply instead here!
        if self.board.ply == 0:
            self.status = STARTED
            self.app_state.g_cnt[0] += 1
            response = {"type": "g_cnt", "cnt": self.app_state.g_cnt[0]}
            await self.app_state.lobby.lobby_broadcast(response)

        cur_color = self.board.color
        cur_player = self.bplayer if cur_color == BLACK else self.wplayer
        opp_player = self.wplayer if cur_color == BLACK else self.bplayer

        # Move cancels draw offer
        response = await reject_draw(self, opp_player)
        if response is not None:
            await round_broadcast(self, response, full=True)

        cur_time = monotonic()

        # BOT players doesn't send times used for moves
        if self.bot_game:
            movetime = (
                int(round((cur_time - self.last_server_clock) * 1000)) if self.board.ply >= 2 else 0
            )
            if clocks is None:
                clocks = [self.clocks_w[-1], self.clocks_b[-1]]

            if cur_player.bot and self.board.ply >= 2:
                if self.byoyomi:
                    if self.overtime:
                        clocks[cur_color] = self.inc * 1000
                    else:
                        clocks[cur_color] = max(0, self.clocks[cur_color] - movetime)
                else:
                    clocks[cur_color] = max(
                        0, self.clocks[cur_color] - movetime + (self.inc * 1000)
                    )

                if clocks[cur_color] == 0:
                    if self.byoyomi and self.byoyomi_periods[cur_color] > 0:
                        self.overtime = True
                        clocks[cur_color] = self.inc * 1000
                        self.byoyomi_periods[cur_color] -= 1
                    else:
                        w, b = self.board.insufficient_material()
                        if (w and b) or (cur_color == BLACK and w) or (cur_color == WHITE and b):
                            result = "1/2-1/2"
                        else:
                            result = "1-0" if cur_color == BLACK else "0-1"
                        self.update_status(FLAG, result)
                        print(self.result, "flag")
                        await self.save_game()
        else:
            if (ply is not None) and ply <= 2 and self.tournamentId is not None:
                # Just in case for move and berserk messages race
                if self.wberserk:
                    clocks[WHITE] = self.berserk_time
                if self.bberserk:
                    clocks[BLACK] = self.berserk_time

        self.last_server_clock = cur_time

        if self.status <= STARTED:
            try:
                san = self.board.get_san(move)
                self.lastmove = move
                if cur_color == WHITE:
                    self.clocks_w.append(clocks[WHITE])
                else:
                    self.clocks_b.append(clocks[BLACK])

                self.board.push(move)
                self.legal_moves = self.board.legal_moves()
                self.update_status()

                if self.status > STARTED:
                    await self.save_game()
                    if self.corr:
                        await opp_player.notify_game_end(self)
                else:
                    await self.save_move(move)

                self.steps.append(
                    {
                        "fen": self.board.fen,
                        "move": move,
                        "san": san,
                        "turnColor": "black" if self.board.color == BLACK else "white",
                        "check": self.check,
                        "clocks": clocks,
                    }
                )
                self.stopwatch.restart()

            except Exception:
                log.exception("ERROR: Exception in game %s play_move() %s", self.id, move)
                result = "1-0" if self.board.color == BLACK else "0-1"
                self.update_status(INVALIDMOVE, result)
                await self.save_game()
                if self.corr:
                    await opp_player.notify_game_end(self)

    async def save_move(self, move):
        self.last_move_time = datetime.now(timezone.utc)
        move_encoded = self.encode_method(grand2zero(move) if self.variant in GRANDS else move)

        new_data = {
            "f": self.board.fen,
            "l": self.last_move_time,
            "s": self.status,
        }

        if self.rated == RATED:
            new_data["cw"] = self.clocks_w[1:]
            new_data["cb"] = self.clocks_b[1:]

        if self.app_state.db is not None:
            await self.app_state.db.game.update_one(
                {"_id": self.id}, {"$set": new_data, "$push": {"m": move_encoded}}
            )

    async def save_setup(self):
        """Used by Janggi prelude phase"""
        new_data = {
            "f": self.board.fen,
            "l": datetime.now(timezone.utc),
            "s": self.status,
            "if": self.board.fen,
            "ws": self.wsetup,
            "bs": self.bsetup,
        }
        if self.app_state.db is not None:
            await self.app_state.db.game.find_one_and_update({"_id": self.id}, {"$set": new_data})

    async def save_game(self):
        if self.saved:
            return
        self.saved = True

        if self.rated == IMPORTED:
            log.exception("Save IMPORTED game %s ???", self.id)
            return

        self.stopwatch.stop()
        self.stopwatch.clock_task.cancel()
        try:
            await self.stopwatch.clock_task
        except asyncio.CancelledError:
            pass

        if self.board.ply > 0:
            self.app_state.g_cnt[0] -= 1
            response = {"type": "g_cnt", "cnt": self.app_state.g_cnt[0]}
            await self.app_state.lobby.lobby_broadcast(response)

        async def remove(keep_time):
            # Keep it in our games dict a little to let players get the last board
            # not to mention that BOT players want to abort games after 20 sec inactivity
            await asyncio.sleep(keep_time)

            if self.id == self.app_state.tv:
                self.app_state.tv = None

            if self.id in self.app_state.games:
                del self.app_state.games[self.id]

            if self.bot_game:
                try:
                    if self.wplayer.bot:
                        del self.wplayer.game_queues[self.id]
                    if self.bplayer.bot:
                        del self.bplayer.game_queues[self.id]
                except KeyError:
                    log.error("Failed to del %s from game_queues", self.id, exc_info=True)

        self.remove_task = asyncio.create_task(remove(KEEP_TIME))

        if self.board.ply < 3 and (self.app_state.db is not None) and (self.tournamentId is None):
            result = await self.app_state.db.game.delete_one({"_id": self.id})
            log.debug(
                "Removed too short game %s from db. Deleted %s game.",
                self.id,
                result.deleted_count,
            )
        else:
            if self.result != "*":
                if self.rated == RATED:
                    await self.update_ratings()
                if (not self.bot_game) and (not self.wplayer.anon) and (not self.bplayer.anon):
                    await self.save_crosstable()

            if self.tournamentId is not None:
                try:
                    # In case of server restart we have to wait for loading ongoing tournaments
                    await self.app_state.tournaments_loaded.wait()
                    await self.app_state.tournaments[self.tournamentId].game_update(self)
                except Exception:
                    log.exception("Exception in tournament game_update()")

            new_data = {
                "f": self.board.fen,
                "s": self.status,
                "r": R2C[self.result],
                "m": [
                    *map(
                        self.encode_method,
                        (
                            map(grand2zero, self.board.move_stack)
                            if self.variant in GRANDS
                            else self.board.move_stack
                        ),
                    )
                ],
            }

            if self.rated == RATED and self.result != "*":
                new_data["p0"] = self.p0
                new_data["p1"] = self.p1

            # Janggi game starts with a prelude phase to set up horses and elephants, so
            # initial FEN may be different compared to one we used when db game document was created
            if self.variant == "janggi":
                new_data["if"] = self.board.initial_fen

            if self.rated == RATED:
                new_data["cw"] = self.clocks_w[1:]
                new_data["cb"] = self.clocks_b[1:]

            if self.tournamentId is not None:
                new_data["wb"] = self.wberserk
                new_data["bb"] = self.bberserk

            if self.manual_count:
                if self.board.count_started > 0:
                    self.manual_count_toggled.append((self.board.count_started, self.board.ply + 1))
                new_data["mct"] = self.manual_count_toggled

            if self.app_state.db is not None:
                await self.app_state.db.game.find_one_and_update(
                    {"_id": self.id}, {"$set": new_data}
                )

    def set_crosstable(self):
        if (
            self.bot_game
            or self.wplayer.anon
            or self.bplayer.anon
            or self.board.ply < 3
            or self.result == "*"
        ):
            return

        if len(self.crosstable["r"]) > 0 and self.crosstable["r"][-1].startswith(self.id):
            log.info("Crosstable was already updated with %s result", self.id)
            return

        if self.result == "1/2-1/2":
            s1 = s2 = 5
            tail = "="
        elif (self.result == "1-0" and self.s1player == self.wplayer.username) or (
            self.result == "0-1" and self.s1player == self.bplayer.username
        ):
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
        self.app_state.crosstable[self.ct_id] = new_data

        self.need_crosstable_save = True

    async def save_crosstable(self):
        if not self.need_crosstable_save:
            log.info("Crosstable update for %s was already saved to mongodb", self.id)
            return

        new_data = {
            "s1": self.crosstable["s1"],
            "s2": self.crosstable["s2"],
            "r": self.crosstable["r"],
        }
        try:
            await self.app_state.db.crosstable.find_one_and_update(
                {"_id": self.ct_id}, {"$set": new_data}, upsert=True
            )
        except Exception:
            log.error("Failed to save new crosstable to mongodb!", exc_info=True)

        self.need_crosstable_save = False

    def get_highscore(self, variant, chess960):
        len_hs = len(self.app_state.highscore[variant + ("960" if chess960 else "")])
        if len_hs > 0:
            return (
                self.app_state.highscore[variant + ("960" if chess960 else "")].peekitem()[1],
                len_hs,
            )
        return (0, 0)

    async def set_highscore(self, variant, chess960, value):
        self.app_state.highscore[variant + ("960" if chess960 else "")].update(value)
        new_data = {
            "scores": dict(
                self.app_state.highscore[variant + ("960" if chess960 else "")].items()[
                    :MAX_HIGHSCORE_ITEM_LIMIT
                ]
            )
        }
        try:
            await self.app_state.db.highscore.find_one_and_update(
                {"_id": variant + ("960" if chess960 else "")},
                {"$set": new_data},
                upsert=True,
            )
        except Exception:
            log.error("Failed to save new highscore to mongodb!", exc_info=True)

    async def update_ratings(self):
        if self.result == "1-0":
            (white_score, black_score) = (1.0, 0.0)
        elif self.result == "1/2-1/2":
            (white_score, black_score) = (0.5, 0.5)
        elif self.result == "0-1":
            (white_score, black_score) = (0.0, 1.0)
        else:
            raise RuntimeError("game.result: unexpected result code")

        wr_old = int(self.wrating.rstrip("?"))
        br_old = int(self.brating.rstrip("?"))

        wcurr = self.wplayer.get_rating(self.variant, self.chess960)
        bcurr = self.bplayer.get_rating(self.variant, self.chess960)

        white_rating = gl2.create_rating(wr_old, wcurr.phi, wcurr.sigma, wcurr.ltime)
        black_rating = gl2.create_rating(br_old, bcurr.phi, bcurr.sigma, bcurr.ltime)

        wr = gl2.rate(white_rating, [(white_score, black_rating)])
        br = gl2.rate(black_rating, [(black_score, white_rating)])

        wrdiff = wr.mu - white_rating.mu
        self.wrdiff = int(round(wrdiff, 0))
        self.p0 = {"e": self.wrating, "d": self.wrdiff}

        brdiff = br.mu - black_rating.mu
        self.brdiff = int(round(brdiff, 0))
        self.p1 = {"e": self.brating, "d": self.brdiff}

        new_white_rating = gl2.create_rating(wcurr.mu + wrdiff, wr.phi, wr.sigma, wr.ltime)
        new_black_rating = gl2.create_rating(bcurr.mu + brdiff, br.phi, br.sigma, br.ltime)

        await self.wplayer.set_rating(self.variant, self.chess960, new_white_rating)
        await self.bplayer.set_rating(self.variant, self.chess960, new_black_rating)

        w_nb = self.wplayer.perfs[self.variant + ("960" if self.chess960 else "")]["nb"]
        if w_nb >= HIGHSCORE_MIN_GAMES:
            await self.set_highscore(
                self.variant,
                self.chess960,
                {self.wplayer.username: int(round(wcurr.mu + wrdiff, 0))},
            )

        b_nb = self.bplayer.perfs[self.variant + ("960" if self.chess960 else "")]["nb"]
        if b_nb >= HIGHSCORE_MIN_GAMES:
            await self.set_highscore(
                self.variant,
                self.chess960,
                {self.bplayer.username: int(round(bcurr.mu + brdiff, 0))},
            )

    def is_player(self, user: User) -> bool:
        return user.username in (self.wplayer.username, self.bplayer.username)

    @property
    def fen(self):
        return self.board.fen

    @property
    def ply(self):
        return self.board.ply

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

            self.set_crosstable()
            self.update_in_plays()

            return

        if self.board.move_stack:
            self.check = self.board.is_checked()

        w, b = self.board.insufficient_material()
        if w and b:
            self.status = DRAW
            self.result = "1/2-1/2"

        if not self.legal_moves:
            game_result_value = self.board.game_result()
            self.result = result_string_from_value(self.board.color, game_result_value)

            if self.board.is_immediate_game_end()[0]:
                self.status = VARIANTEND
            elif self.check:
                self.status = MATE

                if self.variant == "atomic" and game_result_value == 0:
                    # If Fairy game_result() is 0 it is not mate but stalemate
                    self.status = STALEMATE

                # Draw if the checkmating player is the one counting
                if self.board.count_started > 0:
                    counting_side = "b" if self.board.count_started % 2 == 0 else "w"
                    if self.result == ("1-0" if counting_side == "w" else "0-1"):
                        self.status = DRAW
                        self.result = "1/2-1/2"

                # Pawn drop mate
                # TODO: remove this when https://github.com/ianfab/Fairy-Stockfish/issues/48 resolves
                if (self.board.move_stack[-1][0:2], self.variant) in INVALID_PAWN_DROP_MATE:
                    self.status = INVALIDMOVE
            else:
                self.status = STALEMATE

        else:
            # end the game by 50 move rule and repetition automatically
            is_game_end, game_result_value = self.board.is_optional_game_end()
            if is_game_end and (
                game_result_value != 0
                or (game_result_value == 0 and self.n_fold_is_draw)
                or (self.wplayer.bot or self.bplayer.bot)
                or self.variant == "ataxx"
            ):
                self.result = result_string_from_value(self.board.color, game_result_value)

                self.status = CLAIM if game_result_value != 0 else DRAW

        if self.has_counting:
            parts = self.board.fen.split()
            if parts[3].isdigit():
                counting_limit = int(parts[3])
                counting_ply = int(parts[4])
                if counting_ply > counting_limit:
                    self.status = DRAW
                    self.result = "1/2-1/2"

        if self.board.ply > MAX_PLY:
            self.status = DRAW
            self.result = "1/2-1/2"

        if self.status > STARTED:
            self.set_crosstable()
            self.update_in_plays()

    def update_in_plays(self):
        if not self.bplayer.bot:
            self.bplayer.game_in_progress = None
        if not self.wplayer.bot:
            self.wplayer.game_in_progress = None

        if self.corr:
            self.wplayer.correspondence_games.remove(self)
            self.bplayer.correspondence_games.remove(self)

    def print_game(self):
        print(self.pgn)
        print(self.board.print_pos())

    @property
    def pgn(self):
        try:
            mlist = sf.get_san_moves(
                self.variant,
                self.initial_fen if self.initial_fen else self.board.initial_fen,
                self.board.move_stack,
                self.chess960,
                sf.NOTATION_SAN,
            )
        except Exception:
            log.error("ERROR: Exception in game %s pgn()", self.id, exc_info=True)
            mlist = self.board.move_stack
        moves = " ".join(
            (
                move if ind % 2 == 1 else "%s. %s" % (((ind + 1) // 2) + 1, move)
                for ind, move in enumerate(mlist)
            )
        )
        no_setup = self.board.initial_fen == FairyBoard.start_fen("chess") and not self.chess960
        # Use lichess format for crazyhouse games to support easy import
        setup_fen = (
            self.board.initial_fen
            if self.variant != "crazyhouse"
            else self.board.initial_fen.replace("[]", "")
        )
        tc = "-" if self.base + self.inc == 0 else "%s+%s" % (int(self.base * 60), self.inc)
        return '[Event "{}"]\n[Site "{}"]\n[Date "{}"]\n[Round "-"]\n[White "{}"]\n[Black "{}"]\n[Result "{}"]\n[TimeControl "{}"]\n[WhiteElo "{}"]\n[BlackElo "{}"]\n[Variant "{}"]\n{fen}{setup}\n{} {}\n'.format(
            "PyChess "
            + ("rated" if self.rated == RATED else "casual" if self.rated == CASUAL else "imported")
            + " game",
            URI + "/" + self.id,
            self.date.strftime("%Y.%m.%d"),
            self.wplayer.username,
            self.bplayer.username,
            self.result,
            tc,
            self.wrating,
            self.brating,
            self.variant.capitalize() if not self.chess960 else VARIANT_960_TO_PGN[self.variant],
            moves,
            self.result,
            fen="" if no_setup else '[FEN "%s"]\n' % setup_fen,
            setup="" if no_setup else '[SetUp "1"]\n',
        )

    @property
    def uci_usi(self):
        if self.variant[-5:] == "shogi":
            mirror = mirror9 if self.variant == "shogi" else mirror5
            return "position sfen %s moves %s" % (
                self.board.initial_sfen,
                " ".join(map(uci2usi, map(mirror, self.board.move_stack))),
            )
        return "position fen %s moves %s" % (
            self.board.initial_fen,
            " ".join(self.board.move_stack),
        )

    @property
    def clocks(self):
        return (self.clocks_w[-1], self.clocks_b[-1])

    @property
    def is_claimable_draw(self):
        return self.board.is_claimable_draw()

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
                self.wplayer.username,
                self.bplayer.username,
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
                " ".join(self.board.move_stack),
                clocks[WHITE],
                clocks[BLACK],
                self.inc,
                self.inc,
            )
        )

    async def abort_by_server(self):
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
        """Abort, resign, flag, abandon"""
        if self.result == "*":
            if reason == "abort":
                result = "*"
            elif self.variant == "janggi" and reason == "flag" and (self.bsetup or self.wsetup):
                if self.bsetup:
                    # In Janggi game the second player (red, who have to do the setup first!) failed to do the setup phase in time
                    result = "1-0"
                elif self.wsetup:
                    # the first player (blue) failed to do the setup phase in time
                    result = "0-1"
            else:
                if reason == "flag":
                    w, b = self.board.insufficient_material()
                    if (
                        (w and b)
                        or (self.board.color == BLACK and w)
                        or (self.board.color == WHITE and b)
                    ):
                        result = "1/2-1/2"
                    else:
                        result = "0-1" if user.username == self.wplayer.username else "1-0"
                else:
                    result = "0-1" if user.username == self.wplayer.username else "1-0"

            self.update_status(LOSERS[reason], result)
            log.debug("%s game_ended(%s, %s) %s", self.id, user.username, reason, result)
            await self.save_game()

            if self.corr:
                cur_player = (
                    self.wplayer if user.username == self.wplayer.username else self.bplayer
                )
                opp_player = (
                    self.wplayer if user.username == self.bplayer.username else self.bplayer
                )
                if reason == "resign":
                    await opp_player.notify_game_end(self)
                else:
                    await cur_player.notify_game_end(self)
                    await opp_player.notify_game_end(self)

        return {
            "type": "gameEnd",
            "status": self.status,
            "result": self.result,
            "gameId": self.id,
            "pgn": self.pgn,
            "ct": self.crosstable,
            "rdiffs": (
                {"brdiff": self.brdiff, "wrdiff": self.wrdiff}
                if self.status > STARTED and self.rated == RATED
                else ""
            ),
        }

    def start_manual_count(self):
        if self.manual_count:
            cur_player = self.bplayer if self.board.color == BLACK else self.wplayer
            opp_player = self.wplayer if self.board.color == BLACK else self.bplayer
            self.draw_offers.discard(opp_player.username)
            self.draw_offers.add(cur_player.username)
            self.board.count_started = self.board.ply + 1

    def stop_manual_count(self):
        if self.manual_count:
            cur_player = self.bplayer if self.board.color == BLACK else self.wplayer
            opp_player = self.wplayer if self.board.color == BLACK else self.bplayer
            self.draw_offers.discard(cur_player.username)
            self.draw_offers.discard(opp_player.username)
            self.manual_count_toggled.append((self.board.count_started, self.board.ply + 1))
            self.board.count_started = -1

    def create_steps(self):
        if self.mct is not None:
            manual_count_toggled = iter(self.mct)
            count_started = -1
            count_ended = -1

        if self.analysis is not None:
            self.steps[0]["analysis"] = self.analysis[0]

        self.board.fen = self.board.initial_fen
        self.board.color = WHITE if self.board.fen.split()[1] == "w" else BLACK
        for ply, move in enumerate(self.board.move_stack):
            try:
                if self.mct is not None:
                    # print("Ply", ply, "Move", move)
                    if ply + 1 >= count_ended:
                        try:
                            self.board.count_started = -1
                            count_started, count_ended = next(manual_count_toggled)
                            # print("New count interval", (count_started, count_ended))
                        except StopIteration:
                            # print("Piece's honour counting started")
                            count_started = 0
                            count_ended = MAX_PLY + 1
                            self.board.count_started = 0
                    if ply + 1 == count_started:
                        # print("Count started", count_started)
                        self.board.count_started = ply

                san = self.board.get_san(move)
                self.board.push(move, append=False)
                self.check = self.board.is_checked()
                turnColor = "black" if self.board.color == BLACK else "white"

                if self.usi_format:
                    turnColor = "black" if turnColor == "white" else "white"
                step = {
                    "fen": self.board.fen,
                    "move": move,
                    "san": san,
                    "turnColor": turnColor,
                    "check": self.check,
                }

                if len(self.clocks_w) > 1 and not self.corr:
                    move_number = ((ply + 1) // 2) + (1 if ply % 2 == 0 else 0)
                    if ply >= 2:
                        if ply % 2 == 0:
                            step["clocks"] = (
                                self.clocks_w[move_number],
                                self.clocks_b[move_number - 1],
                            )
                        else:
                            step["clocks"] = (
                                self.clocks_w[move_number],
                                self.clocks_b[move_number],
                            )
                    else:
                        step["clocks"] = (
                            self.clocks_w[move_number],
                            self.clocks_b[move_number],
                        )

                self.steps.append(step)

                if (self.analysis is not None) and (not self.usi_format):
                    try:
                        self.steps[-1]["analysis"] = self.analysis[ply + 1]
                    except IndexError:
                        log.error("IndexError %d %s %s", ply, move, san, exc_info=True)

            except Exception:
                log.exception(
                    "ERROR: Exception in load_game() %s %s %s %s %s",
                    self.id,
                    self.variant,
                    self.board.initial_fen,
                    move,
                    self.board.move_stack,
                )
                break

    def get_board(self, full=False):
        if len(self.board.move_stack) > 0 and len(self.steps) == 1:
            self.create_steps()

        if full:
            steps = self.steps

            # To not touch self.clocks_w and self.clocks_b we are creating deep copy from clocks
            clocks = [self.clocks[WHITE], self.clocks[BLACK]]

            if self.status == STARTED and self.board.ply >= 2 and (not self.corr):
                # We have to adjust current player latest saved clock time
                # otherwise he will get free extra time on browser page refresh
                # (also needed for spectators entering to see correct clock times)

                elapsed0 = 0
                # Extra adjustment needed when game resumed after server restart
                if (self.last_move_time is not None) and (self.loaded_at is not None):
                    elapsed0 = ((self.loaded_at - self.last_move_time).total_seconds()) * 1000

                cur_time = monotonic()
                elapsed1 = int(round((cur_time - self.last_server_clock) * 1000))
                clocks[self.board.color] = max(
                    0, clocks[self.board.color] + self.byo_correction - elapsed0 - elapsed1
                )
            crosstable = self.crosstable
        else:
            clocks = self.clocks
            steps = (self.steps[-1],)
            crosstable = self.crosstable if self.status > STARTED else ""

        if self.corr:
            clock_mins = self.stopwatch.mins * 60 * 1000
            base_mins = self.base * 24 * 60 * 60 * 1000
            clocks = (
                base_mins if self.board.color == BLACK else clock_mins,
                base_mins if self.board.color == WHITE else clock_mins,
            )

        return {
            "type": "board",
            "gameId": self.id,
            "status": self.status,
            "result": self.result,
            "fen": self.board.fen,
            "lastMove": self.lastmove,
            "tp": self.turn_player,
            "steps": steps,
            "check": self.check,
            "ply": self.board.ply,
            "clocks": clocks,
            "byo": self.byoyomi_periods if self.byoyomi else "",
            "pgn": self.pgn if self.status > STARTED else "",
            "rdiffs": (
                {"brdiff": self.brdiff, "wrdiff": self.wrdiff}
                if self.status > STARTED and self.rated == RATED
                else ""
            ),
            "date": (
                (datetime.now(timezone.utc) + timedelta(minutes=self.stopwatch.mins)).isoformat()
                if self.corr
                else ""
            ),
            "uci_usi": self.uci_usi if self.status > STARTED else "",
            "ct": crosstable,
            "berserk": {"w": self.wberserk, "b": self.bberserk},
            "by": self.imported_by,
        }

    def game_json(self, player):
        color = "w" if self.wplayer == player else "b"
        opp_player = self.bplayer if color == "w" else self.wplayer
        opp_rating = self.brating if color == "w" else self.wrating
        return {
            "gameId": self.id,
            "title": opp_player.title,
            "name": opp_player.username,
            "rating": int(opp_rating.rstrip("?")),
            "color": color,
            "result": self.result,
        }

    @property
    def tv_game_json(self):
        return {
            "type": "tv_game",
            "gameId": self.id,
            "variant": self.variant,
            "fen": self.board.fen,
            "wt": self.wplayer.title,
            "bt": self.bplayer.title,
            "w": self.wplayer.username,
            "b": self.bplayer.username,
            "wr": self.wrating,
            "br": self.brating,
            "chess960": self.chess960,
            "base": self.base,
            "inc": self.inc,
            "byoyomi": self.byoyomi_period,
            "lastMove": self.lastmove,
        }

    @property
    def turn_player(self):
        return self.wplayer.username if self.board.color == WHITE else self.bplayer.username

    def takeback(self):
        if self.bot_game and self.board.ply >= 2:
            cur_player = self.bplayer if self.board.color == BLACK else self.wplayer
            cur_clock = self.clocks_b if self.board.color == BLACK else self.clocks_w

            self.board.pop()
            cur_clock.pop()
            self.steps.pop()

            if not cur_player.bot:
                cur_clock = self.clocks_b if self.board.color == BLACK else self.clocks_w

                self.board.pop()
                cur_clock.pop()
                self.steps.pop()

            self.legal_moves = self.board.legal_moves()
            self.lastmove = self.board.move_stack[-1] if self.board.move_stack else None

    def handle_chat_message(self, chat_message):
        self.messages.append(chat_message)
