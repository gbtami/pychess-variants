import asyncio
import logging

from const import ABORTED
from fairy import WHITE, BLACK
from broadcast import round_broadcast

log = logging.getLogger(__name__)

ESTIMATE_MOVES = 40


class Clock:
    """ Check game start and abandoned games time out """

    def __init__(self, game):
        self.game = game
        self.running = False
        self.restart()
        self.clock_task = asyncio.create_task(self.countdown())

    def stop(self):
        self.running = False
        return self.secs

    def restart(self, secs=None):
        self.ply = self.game.board.ply
        self.color = self.game.board.color
        if secs is not None:
            self.secs = secs
        else:
            # give some time to make first move
            if self.ply < 2:
                self.secs = self.time_for_first_move
            else:
                self.secs = self.game.ply_clocks[self.ply]["white" if self.color == WHITE else "black"]
        self.running = True

    async def countdown(self):
        while True:
            while self.secs > 0 and self.running:
                await asyncio.sleep(1)
                self.secs -= 1000

            # Time was running out
            if self.running:
                if self.game.board.ply == self.ply:
                    # On lichess rage quit waits 10 seconds
                    # until the other side gets the win claim,
                    # and a disconnection gets 120 seconds.
                    if self.ply >= 2:
                        await asyncio.sleep(20 + self.game.byoyomi_period * self.game.inc)

                    # If FLAG was not received we have to act
                    if self.game.status < ABORTED and self.secs <= 0 and self.running:
                        user = self.game.bplayer if self.color == BLACK else self.game.wplayer
                        reason = "abort" if (self.ply < 2) and (self.game.tournamentId is None) else "flag"
                        async with self.game.move_lock:
                            response = await self.game.game_ended(user, reason)
                            await round_broadcast(self.game, response, full=True)
                        return

            # After stop() we are just waiting for next restart
            await asyncio.sleep(1)

    @property
    def estimate_game_time(self):
        # TODO: calculate with byoyomi
        return (60 * self.game.base) + (ESTIMATE_MOVES * self.game.inc)

    @property
    def time_for_first_move(self):
        # Fix 30s for janggi becuse it has setup phase
        if self.game.variant == "janggi":
            return 30 * 1000

        egt = self.estimate_game_time
        base = 0
        if self.game.tournamentId != "":
            if egt < 30:  # ultra
                base = 11
            elif egt < 180:  # bullet
                base = 16
            elif egt < 480:  # blitz
                base = 21
            elif egt < 1500:  # rapid
                base = 25
            else:  # classical
                base = 30
        else:
            if egt < 30:  # ultra
                base = 15
            elif egt < 180:  # bullet
                base = 20
            elif egt < 480:  # blitz
                base = 25
            elif egt < 1500:  # rapid
                base = 30
            else:  # classical
                base = 35

        return (int(base * 5 / 4) if self.game.chess960 else base) * 1000
