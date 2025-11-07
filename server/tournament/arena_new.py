from __future__ import annotations
import time
from itertools import product

import rustworkx as rx

from const import ARENA
from tournament.tournament import Tournament


class ArenaTournament(Tournament):
    system = ARENA
    color_balance_limit = 3

    def just_played_together(self, x, y):
        # Players can play consecutive games with each other
        # only in case when they are the only active players (duel)
        return y.username == self.players[x].prev_opp or x.username == self.players[y].prev_opp

    def color_balance_problem(self, x, y):
        # Players are not allowed to play more than 3 conseutive games with the same color
        color_balance_a = self.players[x].color_balance
        color_balance_b = self.players[y].color_balance
        return (color_balance_a == color_balance_b == self.color_balance_limit) or (
            color_balance_a == color_balance_b == -self.color_balance_limit
        )

    def create_pairing(self, waiting_players):
        start = time.time()
        pairing = []

        nb_waiting_players = len(waiting_players)

        print("=== WAITING PLAYERS ===", nb_waiting_players)
        for p in waiting_players:
            print("%20s %s" % (p.username, self.leaderboard[p]))
        print("======================")

        def pair_them(x, y):
            if self.players[x].color_balance < self.players[y].color_balance:
                wp, bp = x, y
            else:
                wp, bp = y, x
            pairing.append((wp, bp))

        # When we have only 2 waiting players, we pait them immediately in two special cases:
        # - if they never played before
        # - if arena hes exactly 2 free players only (duel)

        if nb_waiting_players == 2:
            x = waiting_players[0]
            y = waiting_players[1]

            if y.username not in (
                (g.wplayer.username if g.bplayer.username == x.username else g.bplayer.username)
                for g in self.players[x].games
            ):
                print("   find OK opp (they never played before!)", y.username)
                pair_them(x, y)
            elif len(self.ongoing_games) == 0:
                print("   find OK opp (duel!)", y.username)
                pair_them(x, y)

            return pairing

        rxg = rx.PyGraph()
        rx_nodes = [rxg.add_node(p.username) for p in waiting_players]
        # print(rx_nodes)
        # print("---")

        sorted_usernames = [p.username for p in self.leaderboard]
        ranks = [sorted_usernames.index(p.username) + 1 for p in waiting_players]
        rank_max = max(ranks)

        # https://github.com/lichess-org/lila/blob/master/modules/tournament/src/main/arena/PairingSystem.scala
        def rank_factor(rank_a, rank_b):
            return 300 + 1700 * round((rank_max - min(rank_a, rank_b)) / rank_max)

        for pair in product(rx_nodes, rx_nodes):
            player_a = waiting_players[pair[0]]
            player_b = waiting_players[pair[1]]
            if (
                pair[0] != pair[1]
                and (not self.just_played_together(player_a, player_b))
                and (not self.color_balance_problem(player_a, player_b))
            ):
                rank_a = ranks[pair[0]]
                rank_b = ranks[pair[1]]
                rating_a = self.players[player_a].rating
                rating_b = self.players[player_b].rating

                # https://github.com/lichess-org/lila/blob/master/modules/tournament/src/main/arena/AntmaPairing.scala
                weight = abs(rank_a - rank_b) * rank_factor(rank_a, rank_b) + abs(
                    rating_a - rating_b
                )

                rxg.add_edge(pair[0], pair[1], weight)

        # print(rxg.edge_index_map())
        # print("---")

        matching = rx.max_weight_matching(
            rxg, max_cardinality=True, weight_fn=lambda x: x, verify_optimum=True
        )

        edges = list(rxg.edge_list())
        weights = rxg.edges()
        sum_weight = 0
        for pair in matching:
            try:
                ind = edges.index(pair)
            except ValueError:
                ind = edges.index((pair[1], pair[0]))
            sum_weight += weights[ind]
            print(rxg[pair[0]], rxg[pair[1]], weights[ind])

            pair_them(waiting_players[pair[0]], waiting_players[pair[1]])

        print("len:%s weight_sum:%s" % (len(matching), sum_weight))

        print("=== PAIRINGS ===")
        for p in pairing:
            print(p[0].username, p[1].username)
        print("======================")

        end = time.time()
        print("PAIRING TIME:", end - start)
        return pairing
