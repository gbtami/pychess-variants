import asyncio
import collections
import logging
import random
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from itertools import chain
from operator import neg, attrgetter

from sortedcollections import ValueSortedDict
from sortedcontainers import SortedKeysView
from pymongo import ReturnDocument

from compress import R2C
from const import RATED, CREATED, STARTED, VARIANTEND, FLAG, ARENA, RR
from game import Game
from glicko2.glicko2 import gl2
from newid import new_id
from utils import insert_game_to_db

log = logging.getLogger(__name__)

T_CREATED, T_STARTED, T_ABORTED, T_FINISHED, T_ARCHIVED = range(5)

SCORE, STREAK, DOUBLE = range(1, 4)

SCORE_SHIFT = 100000


class EnoughPlayer(Exception):
    """ Raised when RR is already full """
    pass


class PlayerData:
    __slots__ = "rating", "provisional", "free", "paused", "win_streak", "games", "points", "nb_games", "nb_win", "performance", "prev_opp", "color_diff"

    def __init__(self, rating, provisional):
        self.rating = rating
        self.provisional = provisional
        self.free = True
        self.paused = False
        self.win_streak = 0
        self.games = []
        self.points = []
        self.nb_games = 0
        self.nb_win = 0
        self.performance = 0
        self.prev_opp = ""
        self.color_diff = 0

    def __str__(self):
        return (" ").join(self.points)


class GameData:
    __slots__ = "id", "wplayer", "white_rating", "bplayer", "black_rating", "result", "date"

    def __init__(self, _id, wplayer, wrating, bplayer, brating, result, date):
        self.id = _id
        self.wplayer = wplayer
        self.bplayer = bplayer
        self.result = result
        self.date = date
        self.white_rating = gl2.create_rating(int(wrating.rstrip("?")))
        self.black_rating = gl2.create_rating(int(brating.rstrip("?")))


class Tournament(ABC):

    def __init__(self, app, tournamentId, variant="chess", chess960=False, rated=RATED, before_start=5, minutes=45, name="", fen="", base=1, inc=0, byoyomi_period=0, rounds=0, created_by="", created_at=None, status=None):
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
        self.rounds = rounds

        self.created_by = created_by
        self.created_at = datetime.now(timezone.utc) if created_at is None else created_at
        self.starts_at = self.created_at + timedelta(seconds=int(before_start * 60))

        # TODO: calculate wave from TC, variant, number of players
        self.wave = timedelta(seconds=3)
        self.wave_delta = timedelta(seconds=1)
        self.current_round = 0

        self.messages = collections.deque([], 200)
        self.spectators = set()
        self.players = {}
        self.leaderboard = ValueSortedDict(neg)
        self.leaderboard_keys_view = SortedKeysView(self.leaderboard)
        self.status = T_CREATED if status is None else status
        self.ongoing_games = 0
        self.nb_players = 0

        self.nb_games_finished = 0
        self.nb_games_cached = -1
        self.leaderboard_cache = {}

        self.first_pairing = False
        self.top_player = None
        self.top_game = None

        if minutes is not None:
            self.finish = self.starts_at + timedelta(minutes=minutes)

        self.finish_event = asyncio.Event()

        self.clock_task = asyncio.create_task(self.clock())

    @abstractmethod
    def create_pairing(self):
        pass

    def user_status(self, user):
        if user in self.players:
            return "paused" if self.players[user].paused else "joined"
        else:
            return "spectator"

    def user_rating(self, user):
        if user in self.players:
            return self.players[user].rating
        else:
            return "%s%s" % user.get_rating(self.variant, self.chess960).rating_prov

    def players_json(self, page=None, user=None):
        if page is None:
            page = 1

        if page is None and user is not None:
            page = ((self.leaderboard.index(user) + 1) // 10) + 1

        if self.nb_games_cached != self.nb_games_finished:
            # game ended
            self.leaderboard_cache = {}
            self.nb_games_cached = self.nb_games_finished
        elif user is not None:
            # player status changed (JOIN/PAUSE/WITHDRAW)
            if page in self.leaderboard_cache:
                del self.leaderboard_cache[page]

        if page in self.leaderboard_cache:
            return self.leaderboard_cache[page]

        def player_json(player, full_score):
            return {
                "paused": self.players[player].paused,
                "title": player.title,
                "name": player.username,
                "rating": self.players[player].rating,
                "points": self.players[player].points,
                "fire": self.players[player].win_streak,
                "score": int(full_score / SCORE_SHIFT),
                "perf": self.players[player].performance,
                "nbGames": self.players[player].nb_games,
                "nbWin": self.players[player].nb_win,
            }

        start = (page - 1) * 10
        end = min(start + 10, self.nb_players)

        page_json = {
            "type": "get_players",
            "nbPlayers": self.nb_players,
            "page": page,
            "players": [
                player_json(player, full_score) for
                player, full_score in
                self.leaderboard.items()[start:end]
            ]
        }

        self.leaderboard_cache[page] = page_json
        return page_json

    # TODO: cache this
    def games_json(self, player_name):
        player = self.app["users"].get(player_name)

        def game_json(player, game):
            color = "w" if game.wplayer == player else "b"
            opp_player = game.bplayer if color == "w" else game.wplayer
            opp_rating = game.black_rating if color == "w" else game.white_rating
            opp_rating, prov = opp_rating.rating_prov
            return {
                "gameId": game.id,
                "title": opp_player.title,
                "name": opp_player.username,
                "rating": opp_rating,
                "prov": prov,
                "color": color,
                "result": game.result,
            }

        return {
            "type": "get_games",
            "rank": self.leaderboard.index(player) + 1,
            "title": player.title,
            "name": player_name,
            "perf": self.players[player].performance,
            "nbGames": self.players[player].nb_games,
            "nbWin": self.players[player].nb_win,
            "games": [
                game_json(player, game) for
                game in
                sorted(self.players[player].games, key=attrgetter("date"))
            ]
        }

    @property
    def spectator_list(self):
        spectators = (spectator.username for spectator in self.spectators if not spectator.anon)
        anons = ()
        anon = sum(1 for user in self.spectators if user.anon)

        cnt = len(self.spectators)
        if cnt > 10:
            spectators = str(cnt)
        else:
            if anon > 0:
                anons = ("Anonymous(%s)" % anon,)
            spectators = ", ".join(chain(spectators, anons))
        return {"type": "spectators", "spectators": spectators, "gameId": self.id}

    @property
    def top_game_json(self):
        return {
            "type": "top_game",
            "gameId": self.top_game.id,
            "variant": self.top_game.variant,
            "fen": self.top_game.board.fen,
            "w": self.top_game.wplayer.username,
            "b": self.top_game.bplayer.username,
            "wr": self.leaderboard_keys_view.index(self.top_game.wplayer) + 1,
            "br": self.leaderboard_keys_view.index(self.top_game.bplayer) + 1,
            "chess960": self.top_game.chess960,
            "base": self.top_game.base,
            "inc": self.top_game.inc,
            "byoyomi": self.top_game.byoyomi_period
        }

    def waiting_players(self):
        return [
            p for p in self.leaderboard if
            self.players[p].free and
            len(p.tournament_sockets[self.id]) > 0 and
            not self.players[p].paused
        ]

    async def clock(self):
        while self.status not in (T_FINISHED, T_ARCHIVED):
            now = datetime.now(timezone.utc)

            if self.status == T_CREATED and now >= self.starts_at:
                if self.system != ARENA and len(self.players) < 3:
                    # Swiss and RR Tournaments need at least 3 players to start
                    self.status = T_ABORTED
                    response = {"type": "tstatus", "tstatus": self.status}
                    await self.broadcast(response)
                    break

                self.first_pairing = True
                self.status = T_STARTED
                self.set_top_player()

                response = {"type": "tstatus", "tstatus": self.status, "secondsToFinish": (self.finish - now).total_seconds()}
                await self.broadcast(response)

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
                        waiting_players = self.waiting_players()
                        if len(waiting_players) >= (4 if len(self.players) > 4 else 3):
                            print("Enough player (%s), do pairing" % len(waiting_players))
                            await self.create_new_pairings(waiting_players)
                            self.prev_pairing = now
                        else:
                            print("Too few player (%s) to make pairing" % len(waiting_players))
                    else:
                        print("Waiting for new pairing wave...")

                elif self.ongoing_games == 0:
                    if self.current_round < self.rounds:
                        self.current_round += 1
                        print("Do %s. round pairing" % self.current_round)
                        waiting_players = self.waiting_players()
                        await self.create_new_pairings(waiting_players)
                    else:
                        self.status = T_FINISHED
                        print("self.status")
                        break
                else:
                    print("%s has %s ongoing game(s)..." % ("RR" if self.system == RR else "Swiss", self.ongoing_games))

            print("CLOCK", now.strftime("%H:%M:%S"))
            await asyncio.sleep(1)

        # remove latest games from players tournament if it was not finished in time
        for player in self.players:
            if self.players[player].nb_games == 0:
                continue
            latest = self.players[player].games[-1]
            if latest and latest.status in (CREATED, STARTED):
                self.players[player].games.pop()
                self.players[player].points.pop()
                self.players[player].nb_games -= 1

        await self.broadcast({"type": "tstatus", "tstatus": self.status})

        await self.save()

        self.finish_event.set()

    def terminate(self):
        self.status = T_FINISHED

    def join(self, player):
        if player.anon:
            return

        if self.system == RR and len(self.players) > self.rounds + 1:
            raise EnoughPlayer

        if player not in self.players:
            rating, provisional = player.get_rating(self.variant, self.chess960).rating_prov
            self.players[player] = PlayerData(rating, provisional)
            if self.status == T_CREATED:
                self.leaderboard.setdefault(player, rating)
            else:
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

        if self.top_player.username == player.username:
            self.top_player = None

    def spactator_join(self, spectator):
        self.spectators.add(spectator)

    def spactator_leave(self, spectator):
        self.spectators.discard(spectator)

    async def create_new_pairings(self, waiting_players):
        pairing = self.create_pairing(waiting_players)

        if self.first_pairing:
            self.first_pairing = False
            # Before tournament starts leaderboard is ordered by ratings
            # After first pairing it will be sorted by score points and performance
            # so we have to make a clear (all 0) leaderboard here
            new_leaderboard = [(player, 0) for player in self.leaderboard]
            self.leaderboard = ValueSortedDict(neg, new_leaderboard)
            self.leaderboard_keys_view = SortedKeysView(self.leaderboard)

        games = await self.create_games(pairing)
        return (pairing, games)

    def set_top_player(self):
        idx = 0
        self.top_player = None
        while (idx < self.nb_players):
            top_player = self.leaderboard.peekitem(idx)[0]
            if self.players[top_player].paused:
                idx += 1
                continue
            else:
                self.top_player = top_player
                break

    async def create_games(self, pairing):
        check_top_game = self.top_player is not None
        new_top_game = False

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

            # TODO: save new game to db
            if 0:  # self.app["db"] is not None:
                doc = {
                    "_id": game.id,
                    "tid": self.id,
                    "u": [game.wplayer.username, game.bplayer.username],
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

            self.players[wp].prev_opp = game.bplayer.username
            self.players[bp].prev_opp = game.wplayer.username

            self.players[wp].color_diff += 1
            self.players[bp].color_diff -= 1

            response = {"type": "new_game", "gameId": game_id, "wplayer": wp.username, "bplayer": bp.username}

            try:
                ws = next(iter(wp.tournament_sockets[self.id]))
                if ws is not None:
                    await ws.send_json(response)
            except Exception:
                self.pause(wp)
                log.debug("White player %s left the tournament", wp.username)

            try:
                ws = next(iter(bp.tournament_sockets[self.id]))
                if ws is not None:
                    await ws.send_json(response)
            except Exception:
                self.pause(bp)
                log.debug("Black player %s left the tournament", bp.username)

            if (check_top_game) and (self.top_player is not None) and (self.top_player.username in (game.wplayer.username, game.bplayer.username)):
                self.top_game = game
                check_top_game = False
                new_top_game = True

        if new_top_game:
            tgj = self.top_game_json
            await self.broadcast(tgj)

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
            wplayer.nb_win += 1

            if self.system == ARENA:
                if wplayer.win_streak == 2:
                    wpoint = (4, DOUBLE)
                else:
                    wplayer.win_streak += 1
                    wpoint = (2, STREAK if wplayer.win_streak == 2 else SCORE)

                bplayer.win_streak = 0
            else:
                if game.variant == "janggi":
                    wpoint = (4 if game.status == VARIANTEND else 7, SCORE)
                    bpoint = (4 if game.status == VARIANTEND else 0, SCORE)
                else:
                    wpoint = (1, SCORE)

            wperf += 500
            bperf -= 500

        elif game.result == "0-1":
            bplayer.nb_win += 1

            if self.system == ARENA:
                if bplayer.win_streak == 2:
                    bpoint = (4, DOUBLE)
                else:
                    bplayer.win_streak += 1
                    bpoint = (2, STREAK if bplayer.win_streak == 2 else SCORE)

                wplayer.win_streak = 0
            else:
                if game.variant == "janggi":
                    wpoint = (2 if game.status == VARIANTEND else 0, SCORE)
                    bpoint = (4 if game.status == VARIANTEND else 7, SCORE)
                else:
                    bpoint = (1, SCORE)

            wperf -= 500
            bperf += 500

        return (wpoint, bpoint, wperf, bperf)

    async def game_update(self, game):
        """ Called from Game.update_status() """
        if self.status == T_FINISHED and self.status != T_ARCHIVED:
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

        wplayer.rating += int(game.wrdiff) if game.wrdiff else 0
        bplayer.rating += int(game.brdiff) if game.brdiff else 0

        nb = wplayer.nb_games
        wplayer.performance = int(round((wplayer.performance * (nb - 1) + wperf) / nb, 0))

        nb = bplayer.nb_games
        bplayer.performance = int(round((bplayer.performance * (nb - 1) + bperf) / nb, 0))

        # TODO: 0.5 points in RR/Swiss are not summarized at all
        wpscore = int(self.leaderboard.get(game.wplayer) / SCORE_SHIFT)
        self.leaderboard.update({game.wplayer: SCORE_SHIFT * (wpscore + wpoint[0]) + wplayer.performance})

        bpscore = int(self.leaderboard.get(game.bplayer) / SCORE_SHIFT)
        self.leaderboard.update({game.bplayer: SCORE_SHIFT * (bpscore + bpoint[0]) + bplayer.performance})

        self.ongoing_games -= 1
        self.nb_games_finished += 1

        if game.status == FLAG:
            # pause players when they don't start their game
            if game.board.ply == 0:
                wplayer.paused = True
                bplayer.free = True
            elif game.board.ply == 1:
                wplayer.free = True
                bplayer.paused = True
            else:
                wplayer.free = True
                bplayer.free = True
        else:
            wplayer.free = True
            bplayer.free = True

        self.set_top_player()

        await self.broadcast({
            "type": "game_update",
            "wname": game.wplayer.username,
            "bname": game.bplayer.username
        })

        if self.top_game is not None and self.top_game.id == game.id:
            response = {"type": "gameEnd", "status": game.status, "result": game.result, "gameId": game.id}
            await self.broadcast(response)

            if self.top_player.username not in (game.wplayer.username, game.bplayer.username):
                self.top_game = self.players[self.top_player].games[-1]
                if (self.top_game is not None) and (self.top_game.status <= STARTED):
                    tgj = self.top_game_json
                    await self.broadcast(tgj)

    async def broadcast(self, response):
        for spectator in self.spectators:
            for ws in spectator.tournament_sockets[self.id]:
                try:
                    await ws.send_json(response)
                except (KeyError, ConnectionResetError):
                    # spectator was removed
                    pass

    async def save(self):
        if len(self.leaderboard) == 0 or self.app["db"] is None:
            return

        winner = self.leaderboard.peekitem(0)[0].username
        new_data = {
            "status": self.status,
            "nbPlayers": self.nb_players,
            "nbGames": self.nb_games_finished,
            "winner": winner,
        }

        print(await self.app["db"].tournament.find_one_and_update(
            {"_id": self.id},
            {"$set": new_data},
            return_document=ReturnDocument.AFTER)
        )

        # TODO: save players and pairings on user join time and when games created
        player_documents = []
        player_table = self.app["db"].tournament_player

        i = 0
        for user, full_score in self.leaderboard.items():
            i += 1
            player = self.players[user]
            # print("%s %20s %s %s %s" % (i, user.title + user.username, player.points, int(full_score / SCORE_SHIFT), player.performance))
            player_id = await new_id(player_table)

            player_documents.append({
                "_id": player_id,
                "tid": self.id,
                "uid": user.username,
                "r": player.rating,
                "pr": player.provisional,
                "a": player.paused,
                "f": player.win_streak == 2,
                "s": int(full_score / SCORE_SHIFT),
                "g": player.nb_games,
                "w": player.nb_win,
                "e": player.performance,
                "p": player.points,
            })

        await player_table.insert_many(player_documents)

        pairing_documents = []
        pairing_table = self.app["db"].tournament_pairing

        processed_games = set()

        for user, user_data in self.players.items():
            for game in user_data.games:
                if game.id not in processed_games:
                    pairing_documents.append({
                        "_id": game.id,
                        "tid": self.id,
                        "u": (game.wplayer.username, game.bplayer.username),
                        "r": R2C[game.result],
                        "d": game.date,
                        "wr": game.wrating,
                        "br": game.brating,
                    })
                processed_games.add(game.id)

        await pairing_table.insert_many(pairing_documents)
