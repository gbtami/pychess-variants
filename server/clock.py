import asyncio
import logging

from const import ABORTED
from fairy import WHITE, BLACK
from broadcast import round_broadcast

log = logging.getLogger(__name__)


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
            # give 5 min per player to make first move
            if self.ply < 2:
                self.secs = 15 * 60 * 1000
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
                    await asyncio.sleep(10 + self.game.byoyomi_period * self.game.inc)

                    # If FLAG was not received we have to act
                    if self.game.status < ABORTED and self.secs <= 0 and self.running:
                        user = self.game.bplayer if self.color == BLACK else self.game.wplayer
                        reason = "abort" if (self.ply < 2) and (self.game.tournamentId is None) else "flag"
                        response = await self.game.game_ended(user, reason)
                        await round_broadcast(self.game, self.game.users, response, full=True)
                        return

            # After stop() we are just waiting for next restart
            await asyncio.sleep(1)
