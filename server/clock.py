import asyncio
import logging

from const import ABORTED, FLAG
from fairy import WHITE, BLACK
from broadcast import round_broadcast

log = logging.getLogger(__name__)


class Clock:
    """ Check game start and abandoned games time out """

    def __init__(self, game):
        self.game = game
        self.running = False
        self.alive = True
        self.restart()
        loop = asyncio.get_event_loop()
        self.countdown_task = loop.create_task(self.countdown())

    def kill(self):
        self.alive = False

    def stop(self):
        self.running = False
        return self.secs

    def restart(self, secs=None):
        self.ply = self.game.ply
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
        while self.alive:
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
                    if self.game.status < ABORTED and self.secs <= 0 and self.running:
                        if self.ply < 2:
                            self.game.update_status(ABORTED)
                            await self.save_game()
                            log.info("Game %s ABORT by server." % self.game.id)
                        else:
                            w, b = self.game.board.insufficient_material()
                            cur_color = "black" if self.color == BLACK else "white"
                            if (w and b) or (cur_color == "black" and w) or (cur_color == "white" and b):
                                result = "1/2-1/2"
                            else:
                                result = "1-0" if self.color == BLACK else "0-1"
                            self.game.update_status(FLAG, result)
                            await self.save_game()
                            log.info("Game %s FLAG by server!" % self.game.id)

                        response = {"type": "gameEnd", "status": self.game.status, "result": self.game.result, "gameId": self.game.id, "pgn": self.game.pgn}
                        await round_broadcast(self.game, self.game.users, response, full=True)
                        return

            # After stop() we are just waiting for next restart
            await asyncio.sleep(1)
