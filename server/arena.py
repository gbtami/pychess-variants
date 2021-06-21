from const import ARENA
from tournament import Tournament


class ArenaTournament(Tournament):
    system = ARENA

    def create_pairing(self):
        pairing = []

        waiting_players = [
            p for p in self.leaderboard if
            self.players[p].free and
            len(p.tournament_sockets) > 0 and
            not self.players[p].paused
        ]

        print("=== WITING PLAYERS ===", len(waiting_players))
        for p in waiting_players:
            print("%20s %s" % (p.username, self.leaderboard[p]))
        print("======================")

        failed = 0
        while len(waiting_players) > 1 and failed < len(waiting_players):
            x = waiting_players[0]
            for y in waiting_players:
                if y.username == x.username:
                    continue
                if y.username == self.players[x].prev_opp:
                    failed += 1
                    continue

                if self.players[x].color_diff < 0:
                    if self.players[x].color_diff >= self.players[y].color_diff:
                        failed += 1
                        continue
                    else:
                        wp, bp = x, y
                else:
                    wp, bp = y, x

                waiting_players.remove(wp)
                waiting_players.remove(bp)

                pairing.append((wp, bp))
                break

        print("=== PAIRINGS === failed", failed)
        for p in pairing:
            print(p[0].username, p[1].username)
        print("======================")

        return pairing
