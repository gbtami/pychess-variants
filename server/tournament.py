import asyncio
import collections
import logging
import random
import string
from datetime import datetime, timedelta, timezone
from operator import neg

from sortedcollections import ValueSortedDict

from game import Game, new_game_id
from const import RATED, STARTED
from rr import BERGER_TABLES

log = logging.getLogger(__name__)

T_CREATED, T_STARTED, T_ABORTED, T_FINISHED = range(4)
ARENA, RR, SWISS = range(3)


class EnoughPlayer(Exception):
    """ Raised when RR is already full """
    pass


async def new_tournament_id(db):
    new_id = "".join(random.choice(string.ascii_letters + string.digits) for x in range(8))
    if db is not None:
        existing = await db.tournament.find_one({'_id': {'$eq': new_id}})
        if existing:
            new_id = "".join(random.choice(string.digits + string.ascii_letters) for x in range(8))
    return new_id


class PlayerData:
    '''Class for keeping track of player availability and games '''
    __slots__ = 'free', 'games'

    def __init__(self):
        self.free = True
        self.games = []


class Tournament:

    def __init__(self, app, tournamentId, name, variant, rated=RATED, before_start=5, duration=45, description="", fen="", base=1, inc=0, byoyomi_period=0, chess960=False, ws=None, system=ARENA, rounds=0):
        self.app = app
        self.id = tournamentId
        self.name = name
        self.variant = variant
        self.rated = rated
        self.before_start = before_start  # in minutes
        self.duration = duration  # in minutes
        self.description = description
        self.fen = fen
        self.base = base
        self.inc = inc
        self.byoyomi_period = byoyomi_period
        self.chess960 = chess960
        self.ws = ws
        self.system = system
        self.rounds = rounds

        self.created = datetime.now(timezone.utc)
        self.start_time = self.created + timedelta(seconds=int(before_start * 60))

        # TODO: calculate wave from TC, variant, number of players
        self.wave = timedelta(seconds=3)
        self.wave_delta = timedelta(seconds=1)
        self.current_round = 0

        self.messages = collections.deque([], 200)
        self.spectators = set()
        self.players = {}
        self.leaderboard = ValueSortedDict(neg)
        self.status = T_CREATED
        self.ongoing_games = 0

        if duration is not None:
            self.finish = self.start_time + timedelta(minutes=duration)

        self.finish_event = asyncio.Event()

        self.clock_task = asyncio.create_task(self.clock())

    async def clock(self):
        while self.status != T_FINISHED:
            now = datetime.now(timezone.utc)

            if self.status == T_CREATED and now >= self.start_time:
                self.status = T_STARTED

                # force first pairing wave in arena
                if self.system == ARENA:
                    self.prev_pairing = now - self.wave
                continue

            elif (self.duration is not None) and now >= self.finish:
                self.status = T_FINISHED
                break

            elif self.status == T_STARTED:
                if self.system == ARENA:
                    if now >= self.prev_pairing + self.wave + random.uniform(-self.wave_delta, self.wave_delta):
                        waiting_players = [p for p in self.players if self.players[p].free]
                        if len(waiting_players) >= 4:
                            await self.create_new_pairings()
                            self.prev_pairing = now

                elif self.ongoing_games == 0:
                    if self.current_round < self.rounds:
                        self.current_round += 1
                        await self.create_new_pairings()
                    else:
                        self.status = T_FINISHED
                        break

            print("CLOCK", now.strftime("%H:%M:%S"))
            await asyncio.sleep(1)

        # remove latest games from players tournament if it was not finished in time
        for player in self.players:
            games = self.players[player].games
            if len(games) > 0 and (games[-1] is not None) and games[-1].status <= STARTED:
                self.players[player].games.pop()

        self.finish_event.set()

    def terminate(self):
        self.status = T_FINISHED

    def join(self, player):
        if self.system == RR and len(self.players) > self.rounds + 1:
            raise EnoughPlayer

        self.players[player] = PlayerData()
        self.leaderboard.setdefault(player, 0)

    def withdraw(self, player):
        if player in self.players:
            del self.players[player]
        self.leaderboard.pop(player)

    def pause(self, player):
        self.players[player].free = False

    def resume(self, player):
        self.players[player].free = True

    def spactator_join(self, spactator):
        self.spectators.add(spactator)

    def spactator_leave(self, spactator):
        self.spectators.remove(spactator)

    async def create_new_pairing(self):
        pairing = self.create_pairing()
        games = await self.create_games(pairing)
        return (pairing, games)

    def create_pairing(self):
        pairing = []
        players = list(self.players.keys())

        if self.system == RR:
            n = len(self.players)
            odd = (n % 2 == 1)
            if odd:
                n += 1

            berger = BERGER_TABLES[int(n / 2) - 2][self.current_round - 1]

            for wpn, bpn in berger:
                if odd and (wpn == n or bpn == n):
                    sit = wpn if bpn == n else bpn
                    self.players[players[sit - 1]].games.append(None)
                else:
                    wp = players[wpn - 1]
                    bp = players[bpn - 1]
                    pairing.append((wp, bp))

        else:
            # TODO: this is just a simple random pairing
            # TODO: create pairings for SWISS and ARENA
            waiting_players = [p for p in self.players if self.players[p].free]

            while len(waiting_players) > 1:
                wp = random.choice(waiting_players)
                waiting_players.remove(wp)

                bp = random.choice(waiting_players)
                waiting_players.remove(bp)

                pairing.append((wp, bp))

            if len(waiting_players) == 1 and self.system == SWISS:
                self.players[waiting_players[0]].games.append(None)

        return pairing

    async def create_games(self, pairing):
        games = []
        for wp, bp in pairing:
            game_id = await new_game_id(self.app["db"])
            game = Game(self.app, game_id, self.variant, "", wp, bp,
                        base=self.base,
                        inc=self.inc,
                        byoyomi_period=self.byoyomi_period,
                        rated=self.rated,
                        tournament=self,
                        chess960=self.chess960)
            games.append(game)
            self.app["games"][game_id] = game

            self.players[wp].games.append(game)
            self.players[bp].games.append(game)

            self.ongoing_games += 1

            self.players[wp].free = False
            self.players[bp].free = False

        return games
