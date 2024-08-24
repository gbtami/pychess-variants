import asyncio
from time import monotonic

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

        self.last_server_clock = (
            monotonic()
        )  # the last time a move was made on board A - we reconstruct current time on client refresh/reconnect from this
        self.last_server_clockB = (
            self.last_server_clock
        )  # the last time a move was made on board A - we reconstruct current time on client refresh/reconnect from this

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

    def update_clocks(self, board, clocks=None, clocks_b=None):
        self.stopwatches[board].stop()

        cur_color = self.game.boards[board].color
        cur_time = monotonic()

        if board == "a":
            self.last_server_clock = cur_time
            clocks_current = clocks
        else:
            self.last_server_clockB = cur_time
            clocks_current = clocks_b

        self.last_move_clocks[board][cur_color] = clocks_current[cur_color]

        self.ply_clocks["a"].append(clocks)
        self.ply_clocks["b"].append(clocks_b)

    def restart(self, board):
        self.stopwatches[board].restart(self.last_move_clocks[board][self.game.boards[board].color])

    def last_move_clock(self):
        return max(self.last_server_clock, self.last_server_clockB)

    def elapsed_both_boards(self):
        cur_time = monotonic()
        return [
            int(round((cur_time - self.last_server_clock) * 1000)),
            int(round((cur_time - self.last_server_clockB) * 1000)),
        ]

    def elapsed_since_last_move(self):
        cur_time = monotonic()
        return int(round((cur_time - self.last_move_clock()) * 1000))

    async def cancel_stopwatches(self):
        self.stopwatches["a"].stop()
        self.stopwatches["b"].stop()

        self.stopwatches["a"].clock_task.cancel()
        try:
            await self.stopwatches["a"].clock_task
        except asyncio.CancelledError:
            pass

        self.stopwatches["b"].clock_task.cancel()
        try:
            await self.stopwatches["b"].clock_task
        except asyncio.CancelledError:
            pass

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
