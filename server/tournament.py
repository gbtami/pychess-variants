import asyncio
import collections
import logging
import random
import string
from datetime import datetime, timedelta, timezone


log = logging.getLogger(__name__)

TCREATED, TSTARTED, TABORTED, TFINISHED = range(4)


async def new_tournament_id(db):
    new_id = "".join(random.choice(string.ascii_letters + string.digits) for x in range(8))
    existing = await db.tournament.find_one({'_id': {'$eq': new_id}})
    if existing:
        new_id = "".join(random.choice(string.digits + string.ascii_letters) for x in range(8))
    return new_id


class Tournament:

    def __init__(self, tournamentId, name, variant, before_start=5, duration=45, description="", fen="", base=1, inc=0, byoyomi_period=0, chess960=False, ws=None):
        self.id = tournamentId
        self.name = name
        self.variant = variant
        self.before_start = before_start  # in minutes
        self.duration = duration  # in minutes
        self.description = description
        self.fen = fen
        self.base = base
        self.inc = inc
        self.byoyomi_period = byoyomi_period
        self.chess960 = chess960
        self.ws = ws

        self.created = datetime.now(timezone.utc)
        self.start_time = self.created + timedelta(minutes=before_start)
        self.messages = collections.deque([], 200)

        self.spectators = set()
        self.players = set()
        self.status = TCREATED

        if duration is not None:
            self.finish = self.start_time + timedelta(minutes=duration)
        else:
            self.finish = None

        self.start_task = asyncio.create_task(self.start())

    async def start(self):
        while True:
            await asyncio.sleep(60)
            if self.status == TCREATED and datetime.utcnow() >= self.start_time:
                self.status = TSTARTED
            elif (duration is not None) and datetime.utcnow() >= self.finish:
                self.status = TFINISHED
                break

    def join(self, player):
        player.paused = False
        self.players.add(player)

    def withdraw(self, player):
        self.players.remove(player)

    def pause(self, player):
        player.paused = True
