import asyncio
import collections
import logging
import random
from datetime import datetime, timedelta, timezone
from operator import neg

from sortedcollections import ValueSortedDict
from pymongo import ReturnDocument

from broadcast import lobby_broadcast
from compress import C2V, V2C
from const import CASUAL, RATED
from game import Game
from newid import new_id
from rr import BERGER_TABLES
from utils import insert_game_to_db

log = logging.getLogger(__name__)

T_CREATED, T_STARTED, T_ABORTED, T_FINISHED = range(4)
ARENA, RR, SWISS = range(3)

SCORE, STREAK, DOUBLE = range(1, 4)


class EnoughPlayer(Exception):
    """ Raised when RR is already full """
    pass


class Player:
    __slots__ = "rating", "provisional", "free", "paused", "win_streak", "games", "points", "nb_games", "performance"

    def __init__(self, rating, provisional):
        self.rating = rating
        self.provisional = provisional
        self.free = True
        self.paused = False
        self.win_streak = 0
        self.games = []
        self.points = []
        self.nb_games = 0
        self.performance = 0

    def __str__(self):
        return self.points.join(" ")


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
        self.starts_at = self.created_at + timedelta(seconds=int(before_start * 60))

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

        if minutes is not None:
            self.finish = self.starts_at + timedelta(minutes=minutes)

        self.finish_event = asyncio.Event()

        self.clock_task = asyncio.create_task(self.clock())

    # TODO: cache this
    def players_json(self, page=1):
        def player_json(player, full_score):
            return {
                "paused": self.players[player].paused,
                "title": player.title,
                "name": player.username,
                "rating": self.players[player].rating,
                "points": self.players[player].points,
                "fire": self.players[player].win_streak,
                "score": int(full_score / 100000),
                "perf": self.players[player].performance
            }

        start = (page - 1) * 10
        end = start + 10

        return {
            "type": "get_players",
            "nbPlayers": self.nb_players,
            "page": page,
            "players": [
                player_json(player, full_score) for
                player, full_score in
                self.leaderboard.items()[start:end]
            ]
        }

    # TODO: cache this
    def games_json(self, player_name, player_rank):
        player = self.app["users"].get(player_name)

        def game_json(player, game):
            color = "w" if game.wplayer == player else "b"
            opp_player = game.bplayer if color == "w" else game.wplayer
            opp_rating = game.black_rating if color == "w" else game.white_rating
            opp_rating, prov = opp_rating.rating_prov
            return {
                "gameId": game.id,
                "oppname": opp_player.username,
                "rating": opp_rating,
                "prov": prov,
                "color": color,
                "result": game.result,
            }

        return {
            "type": "get_games",
            "rank": player_rank,
            "title": player.title,
            "name": player_name,
            "perf": self.players[player].performance,
            "games": [
                game_json(player, game) for
                game in
                self.players[player].games
            ]
        }

    async def clock(self):
        while self.status != T_FINISHED:
            now = datetime.now(timezone.utc)

            if self.status == T_CREATED and now >= self.starts_at:
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

        # remove latest games from players tournament if it was not finished in time
        for player in self.players:
            if not self.players[player].free:
                self.players[player].games.pop()
                self.players[player].points.pop()
                self.players[player].nb_games -= 1

        await lobby_broadcast(self.app["tourneysockets"], {"type": "finished"})

        await self.save()

        self.finish_event.set()

    def terminate(self):
        self.status = T_FINISHED

    def join(self, player):
        if self.system == RR and len(self.players) > self.rounds + 1:
            raise EnoughPlayer

        if player not in self.players:
            rating, provisional = player.get_rating(self.variant, self.chess960).rating_prov
            self.players[player] = Player(rating, provisional)
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
        game_table = None if self.app["db"] is None else self.app["db"].game
        for wp, bp in pairing:
            game_id = await new_id(game_table)
            game = Game(self.app, game_id, self.variant, "", wp, bp,
                        base=self.base,
                        inc=self.inc,
                        byoyomi_period=self.byoyomi_period,
                        rated=self.rated,
                        tournamentId=self.id,
                        chess960=self.chess960)

            games.append(game)
            self.app["games"][game_id] = game
            await insert_game_to_db(game, self.app)

            if self.app["db"] is not None:
                doc = {
                    "_id": game.id,
                    "tid": self.id,
                    "us": [game.wplayer.username, game.bplayer.username],
                    "s": game.status,
                }
                await self.app["db"].tournament_pairing.insert_one(doc)

            self.players[wp].games.append(game)
            self.players[bp].games.append(game)

            self.players[wp].points.append("*")
            self.players[bp].points.append("*")

            self.ongoing_games += 1

            self.players[wp].free = False
            self.players[bp].free = False

            self.players[wp].nb_games += 1
            self.players[bp].nb_games += 1

            response = {"type": "new_game", "gameId": game_id, "wplayer": wp.username, "bplayer": bp.username}
            print(response)

            if len(wp.tournament_sockets) > 0:
                ws = next(iter(wp.tournament_sockets))
                if ws is not None:
                    await ws.send_json(response)
            if len(bp.tournament_sockets) > 0:
                ws = next(iter(bp.tournament_sockets))
                if ws is not None:
                    await ws.send_json(response)

        return games

    def points_perfs(self, game):
        wplayer = self.players[game.wplayer]
        bplayer = self.players[game.bplayer]

        wpoint = (0, SCORE)
        bpoint = (0, SCORE)
        wperf = game.black_rating.rating_prov[0]
        bperf = game.white_rating.rating_prov[0]

        if game.result == "1/2-1/2":
            if self.system == ARENA:
                if game.board.ply > 10:
                    wpoint = (2, SCORE) if wplayer.win_streak == 2 else (1, SCORE)
                    bpoint = (2, SCORE) if bplayer.win_streak == 2 else (1, SCORE)

                wplayer.win_streak = 0
                bplayer.win_streak = 0
            else:
                wpoint, bpoint = (0.5, SCORE), (0.5, SCORE)

        elif game.result == "1-0":
            if self.system == ARENA:
                if wplayer.win_streak == 2:
                    wpoint = (4, DOUBLE)
                else:
                    wplayer.win_streak += 1
                    wpoint = (2, STREAK if wplayer.win_streak == 2 else SCORE)

                bplayer.win_streak = 0
            else:
                wpoint = (1, SCORE)

            wperf += 500
            bperf -= 500

        elif game.result == "0-1":
            if self.system == ARENA:
                if bplayer.win_streak == 2:
                    bpoint = (4, DOUBLE)
                else:
                    bplayer.win_streak += 1
                    bpoint = (2, STREAK if bplayer.win_streak == 2 else SCORE)

                wplayer.win_streak = 0
            else:
                bpoint = (1, SCORE)

            wperf -= 500
            bperf += 500

        return (wpoint, bpoint, wperf, bperf)

    async def game_update(self, game):
        """ Called from Game.update_status() """
        if self.status == T_FINISHED:
            return

        wplayer = self.players[game.wplayer]
        bplayer = self.players[game.bplayer]

        wpoint, bpoint, wperf, bperf = self.points_perfs(game)

        wplayer.points[-1] = wpoint
        bplayer.points[-1] = bpoint
        if wpoint[1] == STREAK:
            wplayer.points[-2] = (wplayer.points[-2][0], STREAK)
        if bpoint[1] == STREAK:
            bplayer.points[-2] = (bplayer.points[-2][0], STREAK)

        wplayer.rating += game.wrdiff
        bplayer.rating += game.brdiff

        nb = wplayer.nb_games
        wplayer.performance = int(round((wplayer.performance * (nb - 1) + wperf) / nb, 0))

        nb = bplayer.nb_games
        bplayer.performance = int(round((bplayer.performance * (nb - 1) + bperf) / nb, 0))

        wpscore = int(self.leaderboard.get(game.wplayer) / 100000)
        self.leaderboard.update({game.wplayer: 100000 * (wpscore + wpoint[0]) + wplayer.performance})

        bpscore = int(self.leaderboard.get(game.bplayer) / 100000)
        self.leaderboard.update({game.bplayer: 100000 * (bpscore + bpoint[0]) + bplayer.performance})

        self.ongoing_games -= 1

        wplayer.free = True
        bplayer.free = True

        await lobby_broadcast(self.app["tourneysockets"], {"type": "game_update"})

    async def save(self):
        if len(self.leaderboard) == 0 or self.app["db"] is None:
            return

        winner = self.leaderboard.peekitem(0)[0].username
        new_data = {
            "status": self.status,
            "nbPlayers": self.nb_players,
            "winner": winner,
        }

        print(await self.app["db"].tournament.find_one_and_update(
            {"_id": self.id},
            {"$set": new_data},
            return_document=ReturnDocument.AFTER)
        )

        player_documents = []
        leaderboard_documents = []

        player_table = self.app["db"].tournament_player
        leaderboard_table = self.app["db"].tournament_leaderboard

        i = 0
        for user, full_score in self.leaderboard.items():
            i += 1
            player = self.players[user]
            # print("%s %20s %s %s %s" % (i, user.title + user.username, player.points, int(full_score / 100000), player.performance))
            player_id = await new_id(player_table)

            player_documents.append({
                "_id": player_id,
                "tid": self.id,
                "uid": user.username,
                "r": player.rating,
                "pr": player.provisional,
                "f": player.win_streak == 2,
                "s": int(full_score / 100000),
                "g": player.nb_games,
                "e": player.performance,
            })

            leaderboard_documents.append({
                "_id": player_id,
                "tid": self.id,
                "uid": user.username,
                "r": i,
            })

        await player_table.insert_many(player_documents)
        await leaderboard_table.insert_many(leaderboard_documents)


async def new_tournament(app, data):
    tid = await new_id(app["db"].tournament)

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

    insert_tournament_to_db(tournament, app)

    return {"type": "new_tournament", "tournamentId": tid}


async def insert_tournament_to_db(tournament, app):
    # unit test app may have no db
    if app["db"] is None:
        return

    document = {
        "_id": tournament.id,
        "name": tournament.name,
        "minutes": tournament.minutes,
        "v": V2C[tournament.variant],
        "b": tournament.base,
        "i": tournament.inc,
        "bp": tournament.byoyomi_period,
        "f": tournament.fen,
        "s": tournament.status,
        "y": RATED if tournament.rated else CASUAL,
        "z": int(tournament.chess960),
        "system": tournament.system,
        "rounds": tournament.rounds,
        "nbPlayers": 0,
        "createdBy": tournament.created_by,
        "cretaedAt": tournament.created_at,
        "startsAt": tournament.starts_at,
        "status": T_CREATED,
    }

    result = await app["db"].tournament.insert_one(document)
    print("db insert tournament result %s" % repr(result.inserted_id))


async def load_tournament(app, tournament_id):
    """ Return Tournament object from app cache or from database """
    db = app["db"]
    tournaments = app["tournaments"]
    if tournament_id in tournaments:
        return tournaments[tournament_id]

    doc = await db.tournament.find_one({"_id": tournament_id})

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
        fen=doc.get("f"),
        system=doc["system"],
        rounds=doc["rounds"],
        created_by=doc["createdBy"],
        minutes=doc["minutes"],
        name=doc["name"],
    )

    tournament.created_at = doc["createdAt"],
    tournament.starts_at = doc["startsAt"],
    tournament.status = doc["status"]
    tournament.nb_players = doc["nbPlayers"]
    tournament.winner = doc["winner"]

    # TODO: load players(games) and leaderboard data
    return tournament
