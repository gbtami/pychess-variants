import asyncio
import collections
import logging
import random
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from operator import neg

from sortedcollections import ValueSortedDict
from sortedcontainers import SortedKeysView
from pymongo import ReturnDocument

from broadcast import lobby_broadcast
from compress import R2C
from const import CASUAL, RATED, CREATED, STARTED, BYEGAME, VARIANTEND, FLAG,\
    ARENA, RR, T_CREATED, T_STARTED, T_ABORTED, T_FINISHED, T_ARCHIVED, SHIELD
from game import Game
from glicko2.glicko2 import gl2
from misc import time_control_str
from newid import new_id
from utils import insert_game_to_db
from spectators import spectators

log = logging.getLogger(__name__)


SCORE, STREAK, DOUBLE = range(1, 4)

SCORE_SHIFT = 100000


class EnoughPlayer(Exception):
    """ Raised when RR is already full """
    pass


class ByeGame:
    """ Used in RR/Swiss tournaments when pairing odd number of players """
    __slots__ = "date", "status"

    def __init__(self):
        self.date = datetime.now(timezone.utc)
        self.status = BYEGAME

    def game_json(self, player):
        return {
            "gameId": "",
            "title": "",
            "name": "",
            "rating": "",
            "prov": "",
            "color": "",
            "result": "-"
        }


class PlayerData:
    """ Used to save/load tournament players to/from mongodb tournament-player documents """

    __slots__ = "id", "rating", "provisional", "free", "paused", "withdrawn", "win_streak", "games", "points", "nb_games", "nb_win", "nb_not_paired", "performance", "prev_opp", "color_diff", "page"

    def __init__(self, rating, provisional):
        self.id = None
        self.rating = rating
        self.provisional = provisional
        self.free = True
        self.paused = False
        self.withdrawn = False
        self.win_streak = 0
        self.games = []
        self.points = []
        self.nb_games = 0
        self.nb_win = 0
        self.nb_not_paired = 0
        self.performance = 0
        self.prev_opp = ""
        self.color_diff = 0
        self.page = 0

    def __str__(self):
        return (" ").join(self.points)


class GameData:
    """ Used to save/load tournament games to/from mongodb tournament-pairing documents """

    __slots__ = "id", "wplayer", "white_rating", "bplayer", "black_rating", "result", "date"

    def __init__(self, _id, wplayer, wrating, bplayer, brating, result, date):
        self.id = _id
        self.wplayer = wplayer
        self.bplayer = bplayer
        self.result = result
        self.date = date
        self.white_rating = gl2.create_rating(int(wrating.rstrip("?")))
        self.black_rating = gl2.create_rating(int(brating.rstrip("?")))

    def game_json(self, player):
        color = "w" if self.wplayer == player else "b"
        opp_player = self.bplayer if color == "w" else self.wplayer
        opp_rating = self.black_rating if color == "w" else self.white_rating
        opp_rating, prov = opp_rating.rating_prov
        return {
            "gameId": self.id,
            "title": opp_player.title,
            "name": opp_player.username,
            "rating": opp_rating,
            "prov": prov,
            "color": color,
            "result": self.result,
        }


class Tournament(ABC):
    """ Abstract base class for Arena/Swisss/RR Tournament classes
        They have to implement create_pairing() for waiting_players """

    def __init__(self, app, tournamentId, variant="chess", chess960=False, rated=True, before_start=5, minutes=45, name="", description="",
                 fen="", base=1, inc=0, byoyomi_period=0, rounds=0, created_by="", created_at=None, starts_at=None, status=None, with_clock=True, frequency=""):
        self.app = app
        self.id = tournamentId
        self.name = name
        self.description = description
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
        self.frequency = frequency

        self.created_by = created_by
        self.created_at = datetime.now(timezone.utc) if created_at is None else created_at
        if starts_at == "" or starts_at is None:
            self.starts_at = self.created_at + timedelta(seconds=int(before_start * 60))
        else:
            self.starts_at = starts_at

        # TODO: calculate wave from TC, variant, number of players
        self.wave = timedelta(seconds=3)
        self.wave_delta = timedelta(seconds=1)
        self.current_round = 0
        self.prev_pairing = None

        self.messages = collections.deque([], 200)
        self.spectators = set()
        self.players = {}
        self.leaderboard = ValueSortedDict(neg)
        self.leaderboard_keys_view = SortedKeysView(self.leaderboard)
        self.status = T_CREATED if status is None else status
        self.ongoing_games = 0
        self.nb_players = 0

        self.nb_games_finished = 0
        self.w_win = 0
        self.b_win = 0
        self.draw = 0

        self.nb_games_cached = -1
        self.leaderboard_cache = {}

        self.first_pairing = False
        self.top_player = None
        self.top_game = None

        if minutes is None:
            self.ends_at = self.starts_at + timedelta(days=1)
        else:
            self.ends_at = self.starts_at + timedelta(minutes=minutes)

        if with_clock:
            self.clock_task = asyncio.create_task(self.clock())

    def __repr__(self):
        return " ".join((self.id, self.name, self.created_at.isoformat()))

    @abstractmethod
    def create_pairing(self, waiting_players):
        pass

    def user_status(self, user):
        if user in self.players:
            return "paused" if self.players[user].paused else "withdrawn" if self.players[user].withdrawn else "joined"
        else:
            return "spectator"

    def user_rating(self, user):
        if user in self.players:
            return self.players[user].rating
        else:
            return "%s%s" % user.get_rating(self.variant, self.chess960).rating_prov

    def players_json(self, page=None, user=None):
        if (page is None) and (user is not None) and (user in self.players):
            if self.players[user].page > 0:
                page = self.players[user].page
            else:
                div, mod = divmod(self.leaderboard.index(user) + 1, 10)
                page = div + (1 if mod > 0 else 0)
                if self.status == T_CREATED:
                    self.players[user].page = page
        if page is None:
            page = 1

        if self.nb_games_cached != self.nb_games_finished:
            # number of games changed (game ended)
            self.leaderboard_cache = {}
            self.nb_games_cached = self.nb_games_finished
        elif user is not None:
            if self.status == T_STARTED:
                # player status changed (JOIN/PAUSE)
                if page in self.leaderboard_cache:
                    del self.leaderboard_cache[page]
            elif self.status == T_CREATED:
                # number of players changed (JOIN/WITHDRAW)
                self.leaderboard_cache = {}

        if page in self.leaderboard_cache:
            return self.leaderboard_cache[page]

        def player_json(player, full_score):
            return {
                "paused": self.players[player].paused if self.status == T_STARTED else False,
                "title": player.title,
                "name": player.username,
                "rating": self.players[player].rating,
                "points": self.players[player].points,
                "fire": self.players[player].win_streak,
                "score": full_score,  # SCORE_SHIFT-ed + performance rating
                "perf": self.players[player].performance,
                "nbGames": self.players[player].nb_games,
                "nbWin": self.players[player].nb_win,
            }

        start = (page - 1) * 10
        end = min(start + 10, self.nb_players)

        page_json = {
            "type": "get_players",
            "requestedBy": user.username if user is not None else "",
            "nbPlayers": self.nb_players,
            "nbGames": self.nb_games_finished,
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
        return {
            "type": "get_games",
            "rank": self.leaderboard.index(player) + 1,
            "title": player.title,
            "name": player_name,
            "perf": self.players[player].performance,
            "nbGames": self.players[player].nb_games,
            "nbWin": self.players[player].nb_win,
            "games": [
                game.game_json(player) for
                game in
                self.players[player].games
            ]
        }

    @property
    def spectator_list(self):
        return spectators(self)

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
            self.id in p.tournament_sockets and
            len(p.tournament_sockets[self.id]) > 0 and
            not self.players[p].paused and
            not self.players[p].withdrawn
        ]

    async def clock(self):
        try:
            while self.status not in (T_ABORTED, T_FINISHED, T_ARCHIVED):
                now = datetime.now(timezone.utc)

                if self.status == T_CREATED and now >= self.starts_at:
                    if self.system != ARENA and len(self.players) < 3:
                        # Swiss and RR Tournaments need at least 3 players to start
                        await self.abort()
                        print("T_ABORTED: less than 3 player joined")
                        break

                    await self.start(now)
                    continue

                elif (self.minutes is not None) and now >= self.ends_at:
                    await self.finish()
                    print("T_FINISHED: no more time left")
                    break

                elif self.status == T_STARTED:
                    if self.system == ARENA:
                        # In case of server restart
                        if self.prev_pairing is None:
                            self.prev_pairing = now - self.wave

                        if now >= self.prev_pairing + self.wave + random.uniform(-self.wave_delta, self.wave_delta):
                            waiting_players = self.waiting_players()
                            if len(waiting_players) >= (4 if len(self.players) > 4 else 3):
                                log.debug("Enough player (%s), do pairing", len(waiting_players))
                                await self.create_new_pairings(waiting_players)
                                self.prev_pairing = now
                            else:
                                log.debug("Too few player (%s) to make pairing", len(waiting_players))
                        else:
                            log.debug("Waiting for new pairing wave...")

                    elif self.ongoing_games == 0:
                        if self.current_round < self.rounds:
                            self.current_round += 1
                            log.debug("Do %s. round pairing", self.current_round)
                            waiting_players = self.waiting_players()
                            await self.create_new_pairings(waiting_players)
                        else:
                            await self.finish()
                            log.debug("T_FINISHED: no more round left")
                            break
                    else:
                        print("%s has %s ongoing game(s)..." % ("RR" if self.system == RR else "Swiss", self.ongoing_games))

                log.debug("%s CLOCK %s", self.id, now.strftime("%H:%M:%S"))
                await asyncio.sleep(1)
        except Exception:
            log.exception("Exception in tournament clock()")

    async def start(self, now):
        self.status = T_STARTED

        self.first_pairing = True
        self.set_top_player()

        response = {"type": "tstatus", "tstatus": self.status, "secondsToFinish": (self.ends_at - now).total_seconds()}
        await self.broadcast(response)

        # force first pairing wave in arena
        if self.system == ARENA:
            self.prev_pairing = now - self.wave

        if self.app["db"] is not None:
            print(await self.app["db"].tournament.find_one_and_update(
                {"_id": self.id},
                {"$set": {"status": self.status}},
                return_document=ReturnDocument.AFTER)
            )

    @property
    def summary(self):
        return {
            "type": "tstatus",
            "tstatus": self.status,
            "nbPlayers": self.nb_players,
            "nbGames": self.nb_games_finished,
            "wWin": self.w_win,
            "bWin": self.b_win,
            "draw": self.draw,
            "sumRating": sum(self.players[player].rating for player in self.players if not self.players[player].withdrawn),
        }

    async def finalize(self, status):
        self.status = status

        if len(self.players) > 0:
            self.print_leaderboard()
            print("--- TOURNAMENT RESULT ---")
            for i in range(min(3, len(self.leaderboard))):
                player = self.leaderboard.peekitem(i)[0]
                print("--- #%s ---" % (i + 1), player.username)

        # remove latest games from players tournament if it was not finished in time
        for player in self.players:
            if len(self.players[player].games) == 0:
                continue
            latest = self.players[player].games[-1]
            if latest and latest.status in (CREATED, STARTED):
                self.players[player].games.pop()
                self.players[player].points.pop()
                self.players[player].nb_games -= 1

        # force to create new players json data
        self.nb_games_cached = -1

        await self.broadcast(self.summary)
        await self.save()

        await self.broadcast_spotlight()

    async def broadcast_spotlight(self):
        spotlights = tournament_spotlights(self.app["tournaments"])
        lobby_sockets = self.app["lobbysockets"]
        response = {"type": "spotlights", "items": spotlights}
        await lobby_broadcast(lobby_sockets, response)

    async def abort(self):
        await self.finalize(T_ABORTED)

    async def finish(self):
        await self.finalize(T_FINISHED)

    async def join(self, user):
        if user.anon:
            return

        if self.system == RR and len(self.players) > self.rounds + 1:
            raise EnoughPlayer

        if user not in self.players:
            # new player joined
            rating, provisional = user.get_rating(self.variant, self.chess960).rating_prov
            self.players[user] = PlayerData(rating, provisional)
        elif self.players[user].withdrawn:
            # withdrawn player joined again
            rating, provisional = user.get_rating(self.variant, self.chess960).rating_prov

        if user not in self.leaderboard:
            # new player joined or withdrawn player joined again
            if self.status == T_CREATED:
                self.leaderboard.setdefault(user, rating)
            else:
                self.leaderboard.setdefault(user, 0)
            self.nb_players += 1

        self.players[user].paused = False
        self.players[user].withdrawn = False

        response = self.players_json(user=user)
        await self.broadcast(response)

        if self.status == T_CREATED:
            await self.broadcast_spotlight()

        await self.db_update_player(user, self.players[user])

    async def withdraw(self, user):
        self.players[user].withdrawn = True

        self.leaderboard.pop(user)
        self.nb_players -= 1

        response = self.players_json(user=user)
        await self.broadcast(response)

        await self.broadcast_spotlight()

        await self.db_update_player(user, self.players[user])

    async def pause(self, user):
        self.players[user].paused = True

        # pause is different from withdraw and join because pause can be initiated from finished games page as well
        response = self.players_json(user=user)
        await self.broadcast(response)

        if (self.top_player is not None) and self.top_player.username == user.username:
            self.set_top_player()

        await self.db_update_player(user, self.players[user])

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
            new_leaderboard = [(user, 0) for user in self.leaderboard]
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
            game = Game(self.app, game_id, self.variant, self.fen, wp, bp,
                        base=self.base,
                        inc=self.inc,
                        byoyomi_period=self.byoyomi_period,
                        rated=RATED if self.rated else CASUAL,
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
                    "r": "*",
                    "d": game.date,
                    "wr": game.wrating,
                    "br": game.brating,
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

            self.players[wp].nb_not_paired = 0
            self.players[bp].nb_not_paired = 0

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

            if (check_top_game and (self.top_player is not None) and
                    self.top_player.username in (game.wplayer.username, game.bplayer.username) and
                    game.status != BYEGAME):  # Bye game
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
                wpoint, bpoint = (1, SCORE), (1, SCORE)

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
                    wpoint = (2, SCORE)

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
                    bpoint = (2, SCORE)

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

        wplayer.rating = game.white_rating.rating_prov[0] + (int(game.wrdiff) if game.wrdiff else 0)
        bplayer.rating = game.black_rating.rating_prov[0] + (int(game.brdiff) if game.brdiff else 0)

        # TODO: in Swiss we will need Berger instead of performance to calculate tie breaks
        nb = wplayer.nb_games
        wplayer.performance = int(round((wplayer.performance * (nb - 1) + wperf) / nb, 0))

        nb = bplayer.nb_games
        bplayer.performance = int(round((bplayer.performance * (nb - 1) + bperf) / nb, 0))

        wpscore = self.leaderboard.get(game.wplayer) // SCORE_SHIFT
        self.leaderboard.update({game.wplayer: SCORE_SHIFT * (wpscore + wpoint[0]) + wplayer.performance})

        bpscore = self.leaderboard.get(game.bplayer) // SCORE_SHIFT
        self.leaderboard.update({game.bplayer: SCORE_SHIFT * (bpscore + bpoint[0]) + bplayer.performance})

        self.ongoing_games -= 1
        self.nb_games_finished += 1

        if game.result == "1-0":
            self.w_win += 1
        elif game.result == "0-1":
            self.b_win += 1
        elif game.result == "1/2-1/2":
            self.draw += 1

        # TODO: save player points to db
        # await self.db_update_player(wplayer, self.players[wplayer])
        # await self.db_update_player(bplayer, self.players[bplayer])

        self.set_top_player()

        await self.broadcast({
            "type": "game_update",
            "wname": game.wplayer.username,
            "bname": game.bplayer.username
        })

        if self.top_game is not None and self.top_game.id == game.id:
            response = {"type": "gameEnd", "status": game.status, "result": game.result, "gameId": game.id}
            await self.broadcast(response)

            if (self.top_player is not None) and self.top_player.username not in (game.wplayer.username, game.bplayer.username):
                top_game_candidate = self.players[self.top_player].games[-1]
                if top_game_candidate.status != BYEGAME:
                    self.top_game = top_game_candidate
                    if (self.top_game is not None) and (self.top_game.status <= STARTED):
                        tgj = self.top_game_json
                        await self.broadcast(tgj)

        await self.delayed_free(game, wplayer, bplayer)

    async def delayed_free(self, game, wplayer, bplayer):
        asyncio.sleep(3)

        wplayer.free = True
        bplayer.free = True

        if game.status == FLAG:
            # pause players when they don't start their game
            if game.board.ply == 0:
                wplayer.paused = True
            elif game.board.ply == 1:
                bplayer.paused = True

    async def broadcast(self, response):
        for spectator in self.spectators:
            try:
                for ws in spectator.tournament_sockets[self.id]:
                    try:
                        await ws.send_json(response)
                    except ConnectionResetError:
                        pass
            except KeyError:
                # spectator was removed
                pass

    async def db_update_player(self, user, player_data):
        if self.app["db"] is None:
            return

        player_id = player_data.id
        player_table = self.app["db"].tournament_player

        if player_data.id is None:  # new player join
            player_id = await new_id(player_table)
            player_data.id = player_id

        if player_data.withdrawn:
            new_data = {
                "wd": True,
            }
        else:
            full_score = self.leaderboard[user]
            # print("%s %20s %s %s %s" % (i, user.title + user.username, player_data.points, int(full_score / SCORE_SHIFT), player_data.performance))
            new_data = {
                "_id": player_id,
                "tid": self.id,
                "uid": user.username,
                "r": player_data.rating,
                "pr": player_data.provisional,
                "a": player_data.paused,
                "f": player_data.win_streak == 2,
                "s": int(full_score / SCORE_SHIFT),
                "g": player_data.nb_games,
                "w": player_data.nb_win,
                "e": player_data.performance,
                "p": player_data.points,
                "wd": False,
            }

        try:
            print(await player_table.find_one_and_update(
                {"_id": player_id},
                {"$set": new_data},
                upsert=True,
                return_document=ReturnDocument.AFTER)
            )
        except Exception:
            if self.db is not None:
                log.error("db find_one_and_update tournament_player %s into %s failed !!!", player_id, self.id)

        new_data = {
            "nbPlayers": self.nb_players
        }
        print(await self.app["db"].tournament.find_one_and_update(
            {"_id": self.id},
            {"$set": new_data},
            return_document=ReturnDocument.AFTER)
        )

    async def save(self):
        if self.app["db"] is None:
            return

        if self.nb_games_finished == 0:
            print(await self.app["db"].tournament.delete_many({"_id": self.id}))
            print("--- Deleted empty tournament %s" % self.id)
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

        pairing_documents = []
        pairing_table = self.app["db"].tournament_pairing

        processed_games = set()

        for user, user_data in self.players.items():
            for game in user_data.games:
                if game.status == BYEGAME:  # ByeGame
                    continue
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

        for user in self.leaderboard:
            await self.db_update_player(user, self.players[user])

        if self.frequency == SHIELD:
            variant_name = self.variant + ("960" if self.chess960 else "")
            self.app["shield"][variant_name].append((winner, self.starts_at, self.id))
            self.app["shield_owners"][variant_name] = winner

    def print_leaderboard(self):
        print("--- LEADERBOARD ---", self.id)
        for player, full_score in self.leaderboard.items()[:10]:
            print("%20s %4s %30s %2s %s" % (
                player.username,
                self.players[player].rating,
                self.players[player].points,
                full_score,
                self.players[player].performance
            ))

    @property
    def discord_msg(self):
        tc = time_control_str(self.base, self.inc, self.byoyomi_period)
        tail960 = "960" if self.chess960 else ""
        return "%s: **%s%s** %s tournament starts at UTC %s, duration will be **%s** minutes" % (
            self.created_by, self.variant, tail960, tc, self.starts_at.strftime("%Y.%m.%d %H:%M"), self.minutes)


def tournament_spotlights(tournaments):
    items = []
    for tid, tournament in tournaments.items():
        if tournament.status in (T_CREATED, T_STARTED):
            items.append({
                "tid": tournament.id,
                "name": tournament.name,
                "variant": tournament.variant,
                "chess960": tournament.chess960,
                "nbPlayers": tournament.nb_players,
                "startsAt": tournament.starts_at.isoformat(),
            })
    return items
