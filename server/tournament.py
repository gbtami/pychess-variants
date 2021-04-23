import asyncio
import collections
import logging
import random
import string
from datetime import datetime, timedelta, timezone
from operator import neg

from sortedcollections import ValueSortedDict

from broadcast import lobby_broadcast
from compress import C2V
from const import RATED, STARTED
from game import Game, new_game_id
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
    __slots__ = "rating", "free", "paused", "win_streak", "games", "points"

    def __init__(self, rating):
        self.rating = rating
        self.free = True
        self.paused = False
        self.win_streak = 0
        self.games = []
        self.points = []


class Tournament:

    def __init__(self, app, tournamentId, variant="chess", chess960=False, rated=RATED, before_start=5, minutes=45, name="", fen="", base=1, inc=0, byoyomi_period=0, system=ARENA, rounds=0, created_by=""):
        self.app = app
        self.id = tournamentId
        self.name = name
        self.variant = variant
        self.rated = rated
        self.before_start = before_start  # in minutes
        self.minutes = minutes  # in minutes
        self.fen = fen
        self.base = base
        self.inc = inc
        self.byoyomi_period = byoyomi_period
        self.chess960 = chess960
        self.system = system
        self.rounds = rounds

        self.created_by = created_by
        self.created_at = datetime.now(timezone.utc)
        self.started_at = self.created_at + timedelta(seconds=int(before_start * 60))

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
        self.nb_players = 0
        self.game_ended = False

        if minutes is not None:
            self.finish = self.started_at + timedelta(minutes=minutes)

        self.finish_event = asyncio.Event()

        self.clock_task = asyncio.create_task(self.clock())

    def players_json(self, page=1):
        # TODO: implement pagination
        def player_json(player, score):
            return {
                "title": player.title,
                "name": player.username,
                "rating": self.players[player].rating,
                "points": self.players[player].points,
                "score": score,
            }
        return {"type": "get_players", "players": [player_json(player, full_score) for player, full_score in self.leaderboard.items()]}

    async def clock(self):
        while self.status != T_FINISHED:
            now = datetime.now(timezone.utc)

            if self.status == T_CREATED and now >= self.started_at:
                self.status = T_STARTED

                # force first pairing wave in arena
                if self.system == ARENA:
                    self.prev_pairing = now - self.wave
                continue

            elif (self.minutes is not None) and now >= self.finish:
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

            if self.game_ended:
                await lobby_broadcast(self.app["tourneysockets"], self.players_json())
                self.game_ended = False

        # remove latest games from players tournament if it was not finished in time
        for player in self.players:
            games = self.players[player].games
            if len(games) > 0 and (games[-1] is not None) and games[-1].status <= STARTED:
                self.players[player].games.pop()
                self.players[player].points.pop()

        await lobby_broadcast(self.app["tourneysockets"], self.players_json())

        self.finish_event.set()

    def terminate(self):
        self.status = T_FINISHED

    def join(self, player):
        if self.system == RR and len(self.players) > self.rounds + 1:
            raise EnoughPlayer

        if player not in self.players:
            self.players[player] = PlayerData(int(round(player.get_rating(self.variant, self.chess960).mu, 0)))
            self.leaderboard.setdefault(player, 0)
            self.nb_players += 1

        self.players[player].paused = False

    def withdraw(self, player):
        if player in self.players:
            del self.players[player]
        self.leaderboard.pop(player)
        self.nb_players -= 1

    def pause(self, player):
        self.players[player].paused = True

    def spactator_join(self, spectator):
        self.spectators.add(spectator)

    def spactator_leave(self, spectator):
        self.spectators.remove(spectator)

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
                    self.players[players[sit - 1]].points.append("-")
                else:
                    wp = players[wpn - 1]
                    bp = players[bpn - 1]
                    pairing.append((wp, bp))

        else:
            waiting_players = [
                p for p in self.players if
                self.players[p].free and
                len(p.tournament_sockets) > 0 and
                not self.players[p].paused
            ]

            # TODO: this is just a simple random pairing
            # TODO: create pairings for SWISS and ARENA
            while len(waiting_players) > 1:
                wp = random.choice(waiting_players)
                waiting_players.remove(wp)

                bp = random.choice(waiting_players)
                waiting_players.remove(bp)

                pairing.append((wp, bp))

            if len(waiting_players) == 1 and self.system == SWISS:
                self.players[waiting_players[0]].games.append(None)
                self.players[waiting_players[0]].points.append("-")

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

            self.players[wp].points.append("*")
            self.players[bp].points.append("*")

            self.ongoing_games += 1

            self.players[wp].free = False
            self.players[bp].free = False

            response = {"type": "new_game", "gameId": game_id, "wplayer": wp.username, "bplayer": bp.username}

            if len(wp.tournament_sockets) > 0:
                ws = next(iter(wp.tournament_sockets))
                if ws is not None:
                    await ws.send_json(response)
            if len(bp.tournament_sockets) > 0:
                ws = next(iter(bp.tournament_sockets))
                if ws is not None:
                    await ws.send_json(response)

        return games

    def points(self, game):
        wplayer_data = self.players[game.wplayer]
        bplayer_data = self.players[game.bplayer]

        if self.system == ARENA:
            if game.result == "1/2-1/2":
                if game.board.ply > 10:
                    points = (2 if wplayer_data.win_streak == 2 else 1, 2 if bplayer_data.win_streak == 2 else 1)
                else:
                    points = (0, 0)

                wplayer_data.win_streak = 0
                bplayer_data.win_streak = 0

            elif game.result == "1-0":
                if wplayer_data.win_streak == 2:
                    points = (4, 0)
                else:
                    wplayer_data.win_streak += 1
                    points = (2, 0)

                bplayer_data.win_streak = 0

            elif game.result == "0-1":
                if bplayer_data.win_streak == 2:
                    points = (0, 4)
                else:
                    bplayer_data.win_streak += 1
                    points = (0, 2)

                wplayer_data.win_streak = 0

            else:
                points = (0, 0)

        else:
            if game.result == "1/2-1/2":
                points = (0.5, 0.5)
            elif game.result == "1-0":
                points = (1, 0)
            elif game.result == "0-1":
                points = (0, 1)
            else:
                points = (0, 0)

        return points

    def game_update(self, game):
        """ Called from Game.update_status() """
        leaderboard = self.leaderboard
        players = self.players

        wpscore = leaderboard.get(game.wplayer)
        bpscore = leaderboard.get(game.bplayer)

        wpoint, bpoint = self.points(game)

        if wpoint > 0:
            leaderboard.update({game.wplayer: wpscore + wpoint})
        if bpoint > 0:
            leaderboard.update({game.bplayer: bpscore + bpoint})

        players[game.wplayer].points[-1] = wpoint
        players[game.bplayer].points[-1] = bpoint

        self.ongoing_games -= 1
        self.game_ended = True

        players[game.wplayer].free = True
        players[game.bplayer].free = True

    def get_games(self, player):
        for game in self.players[player].games:
            if game is None:
                print("-")
            else:
                color = "w" if game.wplayer == player else "b"
                opp_player = game.bplayer if color == "w" else game.wplayer
                opp_rating = game.black_rating if color == "w" else game.white_rating
                opp_rating = int(round(opp_rating.mu, 0))
                print(opp_player.username, opp_rating, color, game.result)


async def new_tournament(app, data):
    db = app["db"]
    tid = await new_tournament_id(db)

    tournament = Tournament(
        app, tid,
        variant=data["variant"],
        base=data["base"],
        inc=data["inc"],
        byoyomi_period=data["bp"],
        rated=data["rated"],
        chess960=data["chess960"],
        fen=data["fen"],
        system=data["system"],
        rounds=data["rounds"],
        created_by=data["createdBy"],
        before_start=data["beforeStart"],
        minutes=data["minutes"],
        name=data["name"],
    )

    app["tournaments"][tid] = tournament
    return {"type": "new_tournament", "tournamentId": tid}


async def load_tournament(app, tournament_id):
    """ Return Tournament object from app cache or from database """
    db = app["db"]
    tournaments = app["tournaments"]
    if tournament_id in tournaments:
        return tournaments[tournament_id]

    doc = await db.tournaments.find_one({"_id": tournament_id})

    if doc is None:
        return None

    variant = C2V[doc["v"]]

    tournament = Tournament(
        app, tournament_id, variant,
        base=doc["b"],
        inc=doc["i"],
        byoyomi_period=int(bool(doc.get("bp"))),
        rated=doc.get("y"),
        chess960=bool(doc.get("z")),
        fen=doc.get("if"),
        system=doc["system"],
        rounds=doc["rounds"],
        created_by=doc["createdBy"],
        minutes=doc["minutes"],
        name=doc["name"],
    )

    tournament.created_at = doc["createdAt"],
    tournament.started_at = doc["startedAt"],
    tournament.status = doc["status"]
    tournament.nb_players = doc["nbPlayers"]
    tournament.winner = doc["winner"]

    # TODO: load players(games) and leaderboard data
    return tournament
