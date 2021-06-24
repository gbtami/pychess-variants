import random

from const import SWISS
from tournament import Tournament


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
            self.players[waiting_players[0]].games.append(None)
            self.players[waiting_players[0]].points.append("-")

        return pairing
