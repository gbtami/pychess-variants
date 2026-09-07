from time import monotonic
from typing import TYPE_CHECKING

from clock import Clock
from const import STARTED
from fairy import BLACK, WHITE


class GameBugClocks:
    def __init__(self, game):
        self.game = game
        base = game.base
        inc = game.inc

        # TODO: self.ply_clocks dict stores clock data redundantly to what is in steps
        self.ply_clocks = {
            "a": [
                [
                    (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
                    (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
                ]
            ],
            "b": [
                [
                    (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
                    (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
                ]
            ],
        }
        self.last_move_clocks = {
            "a": [
                (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
                (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
            ],
            "b": [
                (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
                (base * 1000 * 60) + 0 if base > 0 else inc * 1000,
            ],
        }

        self.last_server_clock = monotonic()  # the last time a move was made on board A - we reconstruct current time on client refresh/reconnect from this
        self.last_server_clockB = self.last_server_clock  # the last time a move was made on board A - we reconstruct current time on client refresh/reconnect from this

        self.stopwatches = {
            "a": Clock(
                self.game,
                self.game.boards["a"],
                self.last_move_clocks["a"][self.game.boards["a"].color],
            ),
            "b": Clock(
                self.game,
                self.game.boards["b"],
                self.last_move_clocks["b"][self.game.boards["b"].color],
            ),
        }

    def update_clocks(
        self,
        board,
        clocks: list[int | float] | None = None,
        clocks_b: list[int | float] | None = None,
    ):
        self.stopwatches[board].stop()

        cur_color = self.game.boards[board].color
        cur_time = monotonic()

        if board == "a":
            self.last_server_clock = cur_time
            clocks_current = clocks
        else:
            self.last_server_clockB = cur_time
            clocks_current = clocks_b

        if TYPE_CHECKING:
            assert clocks_current is not None
            assert clocks is not None
            assert clocks_b is not None

        # This is the ONE reliable value in the message: the mover's own clock, on the mover's own
        # board, paused by its client before it was read. Nothing else here is authoritative.
        self.last_move_clocks[board][cur_color] = clocks_current[cur_color]

        # DEPRECATED SHAPE: we store four values per ply and three of them are the mover's stale
        # view of seats it does not own — see the comment in `roundCtrl.sendMove`. They are kept
        # only as diagnostics (they are never read back into any clock), and no new code may use
        # them. The intended shape is ONE number per ply, the mover's; the analysis page already
        # derives the other three from those alone, so nothing needs these to be accurate.
        self.ply_clocks["a"].append(clocks)
        self.ply_clocks["b"].append(clocks_b)

    def restart(self, board):
        self.stopwatches[board].restart(self.last_move_clocks[board][self.game.boards[board].color])

    def restore_after_load(self, last_move_ts, loaded_at_ns):
        """Restart both boards' stopwatches from persisted state, charging the downtime.

        `monotonic()` starts afresh in a new process, so the gap between the last move and this
        load cannot be read from it — it has to come from wall-clock timestamps, which is what the
        `ts` array in the document is for. This mirrors `Game.restore_realtime_clock_after_load()`
        on the one-board path; the only difference is that bughouse has TWO turns running at once,
        so the gap is measured per board.

        `last_move_ts` maps a board to the epoch-ns of the last move ON THAT BOARD, or is missing
        for a board nobody has moved on yet — in which case the turn started when the game did,
        because both boards' white clocks run from the first second.

        WHO PAYS FOR THE DOWNTIME: the side to move, exactly as on the one-board path. Their clock
        was running when the server went down and it does not stop because the process did.

        THE RESULT IS DELIBERATELY NOT CLAMPED AT ZERO. A negative value is how the clock task and
        a reconnecting client's flag claim learn that the turn expired while the server was down;
        clamping would silently hand the player their time back.

        THE DOWNTIME IS FOLDED INTO `last_move_clocks`, NOT JUST HANDED TO THE STOPWATCH. Restoring
        only the stopwatch looked right and did nothing visible: every client reads its clocks from
        `get_clocks_for_board_msg()`, which recomputes them from `last_move_clocks` minus the
        elapsed time since `last_server_clock` and never consults the stopwatch at all. Measured on
        `o7bSAD9B` before this: a 28s outage was charged to nobody, and all four windows resumed as
        though the server had never stopped. After folding, the one number both readers share
        carries the charge, so the stopwatch that flags and the message that renders agree.

        The entry therefore stops meaning strictly "as of that seat's last move" and becomes "as of
        the last time this seat's clock was known to start running", which is what both readers
        actually want — the restore is simply another such moment.
        """
        for board in ("a", "b"):
            turn_started_at_ns = last_move_ts.get(board)
            if turn_started_at_ns is None:
                turn_started_at_ns = int(self.game.date.timestamp() * 1_000_000_000)

            downtime_ms = max(0, round((loaded_at_ns - turn_started_at_ns) / 1_000_000))
            cur_color = self.game.boards[board].color
            self.last_move_clocks[board][cur_color] -= downtime_ms

        # Open the new monotonic epoch only after the wall-clock gap above has been charged,
        # so the elapsed time is not counted twice — once here and again as "time since load".
        now = monotonic()
        self.last_server_clock = now
        self.last_server_clockB = now

        for board in ("a", "b"):
            self.restart(board)

    def last_move_clock(self):
        return max(self.last_server_clock, self.last_server_clockB)

    def elapsed_both_boards(self):
        cur_time = monotonic()
        return [
            round((cur_time - self.last_server_clock) * 1000),
            round((cur_time - self.last_server_clockB) * 1000),
        ]

    def elapsed_since_last_move(self):
        cur_time = monotonic()
        return round((cur_time - self.last_move_clock()) * 1000)

    async def cancel_stopwatches(self):
        self.stopwatches["a"].stop()
        self.stopwatches["b"].stop()

        await self.stopwatches["a"].cancel()
        await self.stopwatches["b"].cancel()

    def get_ply_clocks_for_board_and_color(self, board, color):
        return [p[color] for p in self.ply_clocks[board]]

    def get_clocks_for_board_msg(self, full=False):
        if full:
            # To not touch self._ply_clocks we are creating deep copy from clocks
            clocks_a = [self.last_move_clocks["a"][WHITE], self.last_move_clocks["a"][BLACK]]
            clocks_b = [self.last_move_clocks["b"][WHITE], self.last_move_clocks["b"][BLACK]]

            if self.game.status >= STARTED:
                # We have to adjust current player latest saved clock time
                # otherwise he will get free extra time on browser page refresh
                # (also needed for spectators entering to see correct clock times)

                [elapsed_a, elapsed_b] = self.elapsed_both_boards()

                cur_color_a = self.game.boards["a"].color
                cur_color_b = self.game.boards["b"].color
                clocks_a[cur_color_a] = max(0, clocks_a[cur_color_a] - elapsed_a)
                clocks_b[cur_color_b] = max(0, clocks_b[cur_color_b] - elapsed_b)
        else:
            clocks_a = [self.last_move_clocks["a"][WHITE], self.last_move_clocks["a"][BLACK]]
            clocks_b = [self.last_move_clocks["b"][WHITE], self.last_move_clocks["b"][BLACK]]
        return [clocks_a, clocks_b]
