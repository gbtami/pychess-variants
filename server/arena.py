import time

from const import ARENA
from tournament import Tournament


class ArenaTournament(Tournament):
    system = ARENA

    def create_pairing(self, waiting_players):
        start = time.time()
        pairing = []

        print("=== WAITING PLAYERS ===", len(waiting_players))
        for p in waiting_players:
            print("%20s %s" % (p.username, self.leaderboard[p]))
        print("======================")

        failed = 0
        failed_limit = len(waiting_players)
        while True:
            if len(waiting_players) <= 1:
                if len(waiting_players) == 1:
                    self.players[waiting_players[0]].nb_not_paired += 1
                break
            elif failed >= failed_limit:
                print("!!! TOO MUCH fail, STOP PAIRING !!!", failed)
                break

            x = waiting_players[0]
            print("pairing...", x.username)

            def find_opp(max_color_diff):
                find = False

                if len(waiting_players) == 3:
                    a = waiting_players[-1]
                    b = waiting_players[-2]

                    if self.players[a].nb_not_paired > self.players[b].nb_not_paired:
                        y = a
                    else:
                        y = a if b.username == x.username else b

                    if self.players[x].color_diff < self.players[y].color_diff:
                        wp, bp = x, y
                    else:
                        wp, bp = y, x

                    find = True
                    print("   find OK opp (a brand NEW player!)", y.username)
                    waiting_players.remove(wp)
                    waiting_players.remove(bp)

                    pairing.append((wp, bp))
                    return find

                for y in waiting_players:
                    print("   try", y.username)
                    if y.username == x.username:
                        print("   SKIP the same")
                        continue
                    if y.username == self.players[x].prev_opp:
                        print("   FAIL, prev_opp")
                        continue

                    if max_color_diff < -1:
                        # this will be our second try after all possible y opp player played more black games then player x
                        find = True
                        wp, bp = y, x

                    elif self.players[x].color_diff < max_color_diff:
                        # player x played more black games
                        if self.players[x].color_diff >= self.players[y].color_diff:
                            print("   FAILED color_diff x vs y", self.players[x].color_diff, self.players[y].color_diff)
                            continue
                        else:
                            find = True
                            wp, bp = x, y
                    else:
                        find = True
                        wp, bp = y, x

                    print("   find OK opp!", y.username)
                    waiting_players.remove(wp)
                    waiting_players.remove(bp)

                    pairing.append((wp, bp))
                    break
                return find

            find = find_opp(0)

            if not find:
                failed += 1
                find = find_opp(-1)
                if not find:
                    failed += 1
                    print("   OH NO, I can't find an opp :(")

        print("=== PAIRINGS === failed", failed)
        for p in pairing:
            print(p[0].username, p[1].username)
        print("======================")

        end = time.time()
        print("PAIRING TIME:", end - start)
        return pairing
