from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone

from const import ABORTED
from fairy import WHITE, BLACK
from broadcast import round_broadcast
from notify import notify

log = logging.getLogger(__name__)

ESTIMATE_MOVES = 40
CORR_TICK = 60


class Clock:
    """Check game start and time out abandoned games"""

    def __init__(self, game):
        self.game = game
        self.running = False
        self.secs = -1
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
                if self.game.tournamentId is None:
                    # Non tournament games are not timed for the first moves of either
                    # player. We stop the clock to prevent unnecessary clock
                    # updates and to give players unlimited time.
                    self.running = False
                    return
                # Rated games have their first move time set
                self.secs = self.time_for_first_move
            else:
                self.secs = (
                    self.game.clocks_w[-1] if self.color == WHITE else self.game.clocks_b[-1]
                )
        self.running = True

    async def countdown(self):
        while True:
            while self.running and self.secs > 0:
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
                        reason = (
                            "abort"
                            if (self.ply < 2) and (self.game.tournamentId is None)
                            else "flag"
                        )
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
        # Fix 45s for janggi because it has setup phase
        if self.game.variant == "janggi" or self.game.chess960:
            return 45 * 1000

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

        return base * 1000


class CorrClock:
    """Correspondence games use 0 + x byoyomi time control, where x is a day"""

    def __init__(self, game):
        self.game = game
        self.running = False
        self.restart()
        self.time_for_first_move = self.mins
        self.clock_task = asyncio.create_task(self.countdown())
        self.alarm_mins = int((self.game.base * 24 * 60) / 5)
        self.alarms = set()

    def stop(self):
        self.running = False
        return self.mins

    def restart(self, from_db=False):
        self.ply = self.game.board.ply
        self.color = self.game.board.color
        self.mins = self.game.base * 24 * 60
        if from_db and self.game.last_move_time is not None:
            delta = datetime.now(timezone.utc) - self.game.last_move_time
            self.mins -= delta.total_seconds() / 60
        self.running = True

    async def countdown(self):
        while True:
            while self.running and self.mins > 0:
                await asyncio.sleep(CORR_TICK)
                self.mins -= 1

                if (
                    self.game.status < ABORTED
                    and self.game.board.ply not in self.alarms
                    and self.mins <= self.alarm_mins
                    and self.mins > self.alarm_mins - 2
                ):
                    user = self.game.bplayer if self.color == BLACK else self.game.wplayer
                    await self.notify_hurry(user)

            if self.game.status < ABORTED and self.running:
                user = self.game.bplayer if self.color == BLACK else self.game.wplayer
                if self.mins <= 0:
                    reason = "abort" if self.ply < 2 else "flag"

                    async with self.game.move_lock:
                        response = await self.game.game_ended(user, reason)
                        await round_broadcast(self.game, response, full=True)
                    return

            # After stop() we are just waiting for next restart
            await asyncio.sleep(CORR_TICK)

    async def notify_hurry(self, user):
        opp_name = (
            self.game.wplayer.username
            if self.game.bplayer.username == user.username
            else self.game.bplayer.username
        )

        notif_type = "corrAlarm"
        content = {
            "id": self.game.id,
            "opp": opp_name,
        }
        await notify(self.game.app_state.db, user, notif_type, content)

        # to prevent creating more than one notification for the same ply
        self.alarms.add(self.game.board.ply)
