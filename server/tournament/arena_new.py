from __future__ import annotations
from typing import TYPE_CHECKING
import time
from itertools import product

import rustworkx as rx

from const import ARENA
from tournament.tournament import Tournament

import logging

if TYPE_CHECKING:
    from user import User

log = logging.getLogger(__name__)


class ArenaTournament(Tournament):
    system = ARENA
    color_balance_limit = 3

    def just_played_together(self, x: User, y: User) -> bool:
        # Players can play consecutive games with each other
        # only in case when they are the only active players (duel)
        x_data = self.player_data_by_name(x.username)
        y_data = self.player_data_by_name(y.username)
        if x_data is None or y_data is None:
            return False
        return y.username == x_data.prev_opp or x.username == y_data.prev_opp

    def color_balance_problem(self, x, y):
        # Players are not allowed to play more than 3 conseutive games with the same color
        x_data = self.player_data_by_name(x.username)
        y_data = self.player_data_by_name(y.username)
        if x_data is None or y_data is None:
            return False
        color_balance_a = x_data.color_balance
        color_balance_b = y_data.color_balance
        return (color_balance_a == color_balance_b == self.color_balance_limit) or (
            color_balance_a == color_balance_b == -self.color_balance_limit
        )

    def create_pairing(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        start = time.time()
        pairing = []

        nb_waiting_players = len(waiting_players)

        log.info("Waiting players: %s", nb_waiting_players)
        for p in waiting_players:
            log.debug("%20s %s", p.username, self.leaderboard[p])

        def pair_them(x, y):
            x_data = self.player_data_by_name(x.username)
            y_data = self.player_data_by_name(y.username)
            if x_data is None or y_data is None:
                log.warning(
                    "Skipping pairing in %s due missing player data: %s vs %s",
                    self.id,
                    x.username,
                    y.username,
                )
                return

            if x_data.color_balance < y_data.color_balance:
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
            x_data = self.player_data_by_name(x.username)
            if x_data is None:
                return pairing

            if y.username not in (
                (g.wplayer.username if g.bplayer.username == x.username else g.bplayer.username)
                for g in x_data.games
            ):
                log.info("find OK opp (they never played before!): %s", y.username)
                pair_them(x, y)
            elif len(self.ongoing_games) == 0:
                log.info("find OK opp (duel!): %s", y.username)
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
                player_a_data = self.player_data_by_name(player_a.username)
                player_b_data = self.player_data_by_name(player_b.username)
                if player_a_data is None or player_b_data is None:
                    continue
                rating_a = player_a_data.rating
                rating_b = player_b_data.rating

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
            log.debug("%r %r %r", rxg[pair[0]], rxg[pair[1]], weights[ind])

            pair_them(waiting_players[pair[0]], waiting_players[pair[1]])

        log.debug("len:%s weight_sum:%s", len(matching), sum_weight)

        for p in pairing:
            log.debug("Pairing: %s %s", p[0].username, p[1].username)

        end = time.time()
        log.info("Pairing time: %r", end - start)
        return pairing
