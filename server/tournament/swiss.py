from __future__ import annotations
import random

from const import SWISS
from tournament.tournament import Tournament, ByeGame


class SwissTournament(Tournament):
    system = SWISS

    def create_pairing(self, waiting_players):
        pairing = []

        # TODO: use bbpPairings instead of random pairings
        while len(waiting_players) > 1:
            wp = random.choice(waiting_players)
            waiting_players.remove(wp)

            bp = random.choice(waiting_players)
            waiting_players.remove(bp)

            pairing.append((wp, bp))

        if len(waiting_players) == 1:
            player = waiting_players[0]
            self.players[player].games.append(ByeGame())
            self.players[player].points.append("-")
            self.bye_players.append(player)

        return pairing
