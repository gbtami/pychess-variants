import asyncio
import collections
from datetime import datetime, timezone
from time import time_ns

from bug.game_bug_clocks import GameBugClocks
from pychess_global_app_state import PychessGlobalAppState
from user import User
from logger import log

try:
    import pyffish as sf

    sf.set_option("VariantPath", "variants.ini")
except ImportError:
    print("No pyffish module installed!")

from compress import R2C
from convert import grand2zero
from const import (
    STARTED,
    ABORTED,
    MATE,
    DRAW,
    INVALIDMOVE,
    LOSERS,
    CASUAL,
    RATED,
    IMPORTED,
    MAX_CHAT_LINES,
    POCKET_PATTERN,
)
from fairy import FairyBoard, BLACK, WHITE
from spectators import spectators
from variants import get_server_variant, GRANDS

MAX_HIGH_SCORE = 10
MAX_PLY = 2 * 600
KEEP_TIME = 1800  # keep game in app[games_key] for KEEP_TIME secs


class GameBug:
    def __init__(
        self,
        app_state: PychessGlobalAppState,
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
        new_960_fen_needed_for_rematch=False,
    ):
        self.app_state = app_state

        self.saved = False
        self.remove_task = None

        self.variant = variant
        self.initial_fen = initial_fen
        self.wplayerA = wplayerA
        self.bplayerA = bplayerA
        self.wplayerB = wplayerB
        self.bplayerB = bplayerB
        self.team1 = [self.wplayerA.username, self.bplayerB.username]
        self.team2 = [self.bplayerA.username, self.wplayerB.username]
        self.rated = rated
        self.base = base
        self.inc = inc
        self.level = level if level is not None else 0
        self.tournamentId = tournamentId
        self.chess960 = chess960
        self.create = create
        self.new_960_fen_needed_for_rematch = new_960_fen_needed_for_rematch
        self.imported_by = ""

        self.server_variant = get_server_variant(variant, chess960)
        self.encode_method = self.server_variant.move_encoding

        self.berserk_time = self.base * 1000 * 30

        self.browser_title = "%s • %s+%s vs %s+%s" % (
            self.server_variant.display_name.title(),
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
        self.wrdiff = 0
        self.black_rating_a = bplayerA.get_rating(variant, chess960)
        self.black_rating_b = bplayerB.get_rating(variant, chess960)
        self.brating_a = "%s%s" % self.black_rating_a.rating_prov
        self.brating_b = "%s%s" % self.black_rating_b.rating_prov
        self.brdiff = 0

        # crosstable info
        self.need_crosstable_save = False
        self.bot_game = False

        self.spectators = set()
        self.draw_offers = set()
        self.rematch_offers = set()
        self.messages = collections.deque([], MAX_CHAT_LINES)
        self.date = datetime.now(timezone.utc)

        self.lastmove = None
        self.lastmovePerBoardAndUser = {"a": {}, "b": {}}
        self.status = STARTED  # CREATED
        self.result = "*"
        self.id = gameId

        start_fen = initial_fen if initial_fen else FairyBoard.start_fen(variant, chess960)
        if chess960:
            self.initial_fen = start_fen

        fenA, fenB = map(str.strip, start_fen.split("|"))

        self.boards = {
            "a": FairyBoard(self.variant, fenA, self.chess960),
            "b": FairyBoard(self.variant, fenB, self.chess960),
        }

        self.gameClocks = GameBugClocks(self)

        self.overtime = False

        self.has_legal_moveA = self.boards["a"].has_legal_move()
        self.has_legal_moveB = self.boards["b"].has_legal_move()

        self.checkA = self.boards["a"].is_checked()
        self.checkB = self.boards["b"].is_checked()

        self.steps = [
            {
                "fen": self.boards["a"].initial_fen,
                "fenB": self.boards["b"].initial_fen,
                "san": None,
                "clocks": self.gameClocks.ply_clocks["a"][0],
                "clocksB": self.gameClocks.ply_clocks["b"][0],
                "ts": time_ns(),
            }
        ]

        if not self.bplayerA.bot:
            self.bplayerA.game_in_progress = self.id
        if not self.wplayerA.bot:
            self.wplayerA.game_in_progress = self.id
        if not self.bplayerB.bot:
            self.bplayerB.game_in_progress = self.id
        if not self.wplayerB.bot:
            self.wplayerB.game_in_progress = self.id

        self.move_lock = asyncio.Lock()

    def berserk(self, color):
        pass

    def handle_chat_message(self, user, message, room):
        cur_ply = len(self.steps) - 1
        time = self.gameClocks.elapsed_since_last_move()
        step_chat = {"message": message, "username": user.username, "time": time, "room": room}
        self.steps[cur_ply].setdefault("chat", []).append(step_chat)
        return step_chat

    def construct_chat_list(self):
        chat = {}
        for ply, step in enumerate(self.steps):
            if "chat" in step:
                chat["m" + str(ply)] = []
                for msg in step["chat"]:
                    if msg["room"] != "spectator":
                        chat["m" + str(ply)].append(
                            {"t": msg["time"], "u": msg["username"], "m": msg["message"]}
                        )
        return chat

    async def play_move(
        self, move, clocks=None, clocks_b=None, board="a"  # , last_move_captured_role=None
    ):
        log.debug(
            "play_move %r %r %r %r", move, clocks, clocks_b, board  # , last_move_captured_role
        )

        if self.status > STARTED:
            log.warning("play_move: game %s already ended", self.id)
            return
        if self.ply == 0:  # game is considered started right off the bat - notify lobbies
            self.app_state.g_cnt[0] += 1
            response = {"type": "g_cnt", "cnt": self.app_state.g_cnt[0]}
            await self.app_state.lobby.lobby_broadcast(response)

        cur_player_a = self.bplayerA if self.boards["a"].color == BLACK else self.wplayerA
        cur_player_b = self.bplayerB if self.boards["b"].color == BLACK else self.wplayerB
        cur_player = cur_player_a if board == "a" else cur_player_b

        if self.status <= STARTED:
            self.gameClocks.update_clocks(board, clocks, clocks_b)
            try:
                last_move_captured_role = self.boards[board].piece_to_partner(move)
                # Add the captured piece to the partner pocked
                if last_move_captured_role is not None:
                    partner_board = "a" if board == "b" else "b"
                    log.debug("lastMoveCapturedRole: %s", last_move_captured_role)
                    log.debug("self.boards[partner_board].fen: %s", self.boards[partner_board].fen)
                    # todo: this doesnt work after first move when starting game from custom initial fen that doesnt
                    #       have square brackets - either add them or dont consider it valid if missing pockets
                    self.boards[partner_board].fen = POCKET_PATTERN.sub(
                        r"[\1%s]" % last_move_captured_role, self.boards[partner_board].fen
                    )

                san = self.boards[board].get_san(move)
                self.lastmove = move
                self.lastmovePerBoardAndUser[board][cur_player.username] = move
                self.boards[board].push(move)

                self.has_legal_moveA = self.boards["a"].has_legal_move()
                self.has_legal_moveB = self.boards["b"].has_legal_move()

                self.update_status()

                if self.status != MATE and san.endswith("#"):
                    san = san.replace("#", "+")

                move_a = move if board == "a" else ""
                move_b = move if board == "b" else ""
                check = self.checkB if board == "b" else self.checkA
                self.steps.append(
                    {
                        "fen": self.boards["a"].fen,
                        "fenB": self.boards["b"].fen,
                        "move": move_a,
                        "moveB": move_b,
                        "boardName": board,
                        "san": san,
                        "turnColor": (
                            "black" if self.boards[board].color == BLACK else "white"
                        ),  # can be derived from
                        # the fen and that is what i am actually doing - consider stop sending this value
                        "check": check,  # ignored. deriving  at the client the check status for each board from fens
                        "clocks": clocks,
                        "clocksB": clocks_b,
                        "ts": time_ns(),  # redundancy, but i am want to record how server time corresponds to sent
                    }
                )

                if self.status > STARTED:
                    await self.save_game()
                self.gameClocks.restart(board)
            except Exception:
                log.exception("ERROR: Exception in game %s play_move() %s", self.id, move)
                result = "1-0" if self.boards[board].color == BLACK else "0-1"
                self.update_status(INVALIDMOVE, result)
                await self.save_game()

    async def save_game(self):
        if self.saved:
            return
        self.saved = True

        if self.rated == IMPORTED:
            log.exception("Save IMPORTED game %s ???", self.id)
            return

        await self.gameClocks.cancel_stopwatches()

        self.app_state.g_cnt[0] -= 1
        response = {"type": "g_cnt", "cnt": self.app_state.g_cnt[0]}
        await self.app_state.lobby.lobby_broadcast(response)

        asyncio.create_task(self.app_state.remove_from_cache(self), name="game-remove-%s" % self.id)

        # always save them, even if no moves - todo: will optimize eventually, just want it simple now
        # and have trace of all games for later investigation
        if False and (self.app_state.db is not None) and (self.tournamentId is None):
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

            if self.tournamentId is not None:
                try:
                    await self.app_state.tournaments[self.tournamentId].game_update(self)
                except Exception:
                    log.exception("Exception in tournament game_update()")
            moves = [x["move"] + x["moveB"] for x in self.steps[1:]]
            new_data = {
                "d": self.date,
                "f": self.boards["a"].fen + " | " + self.boards["b"].fen,
                "s": self.status,
                "r": R2C[self.result],
                "m": [
                    *map(
                        self.encode_method,
                        (map(grand2zero, moves) if self.variant in GRANDS else moves),
                    )
                ],
                "o": [0 if x["boardName"] == "a" else 1 for x in self.steps[1:]],
                "c": self.construct_chat_list(),
                "ts": [x["ts"] for x in self.steps],
                "cw": self.gameClocks.get_ply_clocks_for_board_and_color("a", WHITE),
                "cb": self.gameClocks.get_ply_clocks_for_board_and_color("a", BLACK),
                "cwB": self.gameClocks.get_ply_clocks_for_board_and_color("b", WHITE),
                "cbB": self.gameClocks.get_ply_clocks_for_board_and_color("b", BLACK),
            }

            if self.app_state.db is not None:
                await self.app_state.db.game.find_one_and_update(
                    {"_id": self.id}, {"$set": new_data}
                )

    async def update_ratings(self):
        pass  # todo no rating in bughouse for now

    @property
    def corr(self):
        return False

    @property
    def all_players(self):
        return [self.wplayerA, self.bplayerA, self.wplayerB, self.bplayerB]

    @property
    def non_bot_players(self):
        return set(filter(lambda p: not p.bot, self.all_players))

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

    def get_player_at(self, color, board):
        if board == self.boards["a"]:
            return self.bplayerA if color == BLACK else self.wplayerA
        else:
            return self.bplayerB if color == BLACK else self.wplayerB

    def is_player(self, user: User) -> bool:
        return user.username in (
            self.wplayerA.username,
            self.bplayerA.username,
            self.wplayerB.username,
            self.bplayerB.username,
        )

    def update_status(self, status=None, result=None):
        if self.status > STARTED:
            return

        if status is not None:
            self.status = status
            if result is not None:
                self.result = result
            self.remove_players_game_in_progress()
            return

        self.checkA = self.boards["a"].is_checked()
        self.checkB = self.boards["b"].is_checked()

        self.check_checkmate_on_board_and_update_status("a")
        self.check_checkmate_on_board_and_update_status("b")

        if self.boards["a"].ply + self.boards["b"].ply > MAX_PLY:
            self.status = DRAW
            self.result = "1/2-1/2"

        if self.status > STARTED:
            self.remove_players_game_in_progress()

    def remove_players_game_in_progress(self):
        if not self.bplayerA.bot:
            self.bplayerA.game_in_progress = None
        if not self.wplayerA.bot:
            self.wplayerA.game_in_progress = None
        if not self.bplayerB.bot:
            self.bplayerB.game_in_progress = None
        if not self.wplayerB.bot:
            self.wplayerB.game_in_progress = None

    @staticmethod
    def result_string_from_value(game_result_value, board_which_ended):
        if board_which_ended == "a":
            if game_result_value < 0:
                return "0-1"  # black wins on first board => team 2 wins
            if game_result_value > 0:
                return "1-0"  # white wins on first board => team 1 wins
            return "1/2-1/2"
        if board_which_ended == "b":
            if game_result_value < 0:
                return "1-0"  # black wins on second board => team 1 wins
            if game_result_value > 0:
                return "0-1"  # white wins on second board => team 2 wins
            return "1/2-1/2"

    def check_checkmate_on_board_and_update_status(self, board: str):
        # it is not mate if there are possible move dests on the given board
        # todo: if it is check that is blockable, but no pieces in pocket, dests might be empty but it is not mate
        if board == "a" and self.has_legal_moveA:
            return False
        elif board == "b" and self.has_legal_moveB:
            return False

        # did it really end - chess rules for checkmate do not apply here if it is possible to block the check
        # with a piece that partner could potentially give. Check same position, but with full pocket
        # to confirm it is really checkmate even if we wait for partner
        fen_before = self.boards[board].fen
        self.boards[board].fen = POCKET_PATTERN.sub("[qrbnpQRBNP]", fen_before)
        count_valid_moves_with_full_pockets = len(self.boards[board].legal_moves_no_history())
        self.boards[board].fen = fen_before

        if count_valid_moves_with_full_pockets == 0:
            # this always returns -32000 todo: maybe delete that function if cant figure out why
            # game_result_value =  self.boards[board].game_result_no_history()
            # if it is whites turn then black wins => -1, else white wins => +1
            game_result_value = -1 if self.boards[board].color == WHITE else 1
            self.result = GameBug.result_string_from_value(game_result_value, board)
            self.status = MATE
            return True
        return False

    def print_game(self):
        print(self.pgn)
        print(self.boards["a"].print_pos())
        print(self.boards["b"].print_pos())

    @property
    def board(self):
        # todo: potentially code that expects such property might be need to be changed in places related to
        #       draw request and tournaments if we implement those for bughouse.
        #
        # todo: The only other place where this might be called for bughouse game object is in game_api.py/get_games.
        #       Leaving it like this for now, doesn't seem critical.
        #
        # todo: Other places I have reviewed seem to only work with single-board game.py object. Often are related to
        #       some specific variant logic - maybe consider encapsulating such logic in game.py object somehow
        #       and avoid exposing board object directly.

        # Still in case this gets accidently called for game_bug.py objects, logging here an error and returning a
        # valid board object for board "A" so it doesn't crash:
        log.error(
            "game.board property called for a bughouse game object. Returning info just for board A"
        )
        return self.boards["a"]

    @property
    def pgn(self):
        return "serverside bpgn export not implemented"  # as far as I can tell this is never used - its only sent on
        # gameEnd message, but never read on client

    @property
    def uci_usi(self):
        return "position fen %s moves %s" % (
            self.boards["a"].initial_fen + " | " + self.boards["b"].initial_fen,
            " ".join(self.boards["a"].move_stack) + " | " + " ".join(self.boards["b"].move_stack),
        )

    @property
    def is_claimable_draw(self):  # todo not sure this makes much sense in bughouse
        return False

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
    def game_end(
        self,
    ):  # only used by bot code, so not relevant for now for bughouse but keeping it anyway
        return '{"type": "gameEnd", "game": {"id": "%s"}}\n' % self.id

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
                result = "0-1" if user.username in self.team1 else "1-0"

            self.update_status(LOSERS[reason], result)
            await self.save_game()

        return {
            "type": "gameEnd",
            "status": self.status,
            "result": self.result,
            "gameId": self.id,
            "pgn": self.pgn,
            # "ct": self.crosstable,
            "rdiffs": (
                {"brdiff": self.brdiff, "wrdiff": self.wrdiff}
                if self.status > STARTED and self.rated == RATED
                else ""
            ),
        }

    def get_board(self, full=False, persp_color=None):
        [clocks_a, clocks_b] = self.gameClocks.get_clocks_for_board_msg(full)
        if full:
            steps = self.steps
        else:
            steps = (self.steps[-1],)

        return {
            "type": "board",
            "gameId": self.id,
            "status": self.status,
            "result": self.result,
            "fen": self.boards["a"].fen + " | " + self.boards["b"].fen,
            "lastMove": self.lastmove,
            "steps": steps,
            "check": self.checkA,
            "checkB": self.checkB,
            "ply": self.ply,
            "clocks": clocks_a,
            "clocksB": clocks_b,
            "pgn": self.pgn if self.status > STARTED else "",
            "rdiffs": (
                {"brdiff": self.brdiff, "wrdiff": self.wrdiff}
                if self.status > STARTED and self.rated == RATED
                else ""
            ),
            "uci_usi": self.uci_usi if self.status > STARTED else "",
            "rmA": "",
            "rmB": "",
            "berserk": {"w": False, "b": False},
            "by": self.imported_by,
        }

    @property
    def turn_player(self):
        return self.wplayer.username if self.board.color == WHITE else self.bplayer.username

    def game_json(self, player):
        color = "w" if self.wplayerA == player or self.wplayerB == player else "b"
        opp_rating, opp_player = (
            (self.bplayerA, self.black_rating_a)
            if self.wplayerA == player
            else (
                (self.wplayerA, self.white_rating_a)
                if self.bplayerA == player
                else (
                    (self.wplayerB, self.white_rating_b)
                    if self.bplayerB == player
                    else (self.bplayerB, self.black_rating_b)
                )
            )
        )
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
