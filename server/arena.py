import time

from const import ARENA
from tournament import Tournament


class ArenaTournament(Tournament):
    system = ARENA

    def just_played_together(self, x, y):
        return y.username == self.players[x].prev_opp or x.username == self.players[y].prev_opp

    def create_pairing(self, waiting_players):
        start = time.time()
        pairing = []

        nb_waiting_players = len(waiting_players)

        print("=== WAITING PLAYERS ===", nb_waiting_players)
        for p in waiting_players:
            print("%20s %s" % (p.username, self.leaderboard[p]))
        print("======================")

        failed = 0
        failed_limit = nb_waiting_players
        while True:
            if len(waiting_players) <= 1:
                if len(waiting_players) == 1:
                    self.players[waiting_players[0]].nb_not_paired += 1
                break
            elif failed >= failed_limit:
                print("!!! TOO MUCH fail, STOP PAIRING !!!", failed)
                break

            def pair_them(x, y):
                if self.players[x].color_balance < self.players[y].color_balance:
                    wp, bp = x, y
                else:
                    wp, bp = y, x

                waiting_players.remove(wp)
                waiting_players.remove(bp)

                pairing.append((wp, bp))

            def find_opp(color_balance_limit):
                find = False

                # If we started the pairing with exactly 2 free players only
                # and they never played before, pair them!
                if nb_waiting_players == 2:
                    y = waiting_players[1]

                    if y.username not in (g.wplayer.username if g.bplayer.username == x.username else g.bplayer.username for g in self.players[x].games):
                        print("   find OK opp (they never played before!)", y.username)
                        pair_them(x, y)
                        return True
                    else:
                        return False

                if len(waiting_players) == 3:
                    a = waiting_players[-1]
                    b = waiting_players[-2]

                    y = a if self.players[a].nb_not_paired > self.players[b].nb_not_paired else b

                    if not self.just_played_together(x, y):
                        print("   find OK opp from other remaining 2", y.username)
                        pair_them(x, y)
                        return True

                for y in waiting_players:
                    print("   try", y.username)
                    if y.username == x.username:
                        print("   SKIP the same")
                        continue
                    if self.just_played_together(x, y):
                        print("   FAIL, same prev_opp")
                        continue

                    if self.players[x].color_balance < color_balance_limit:
                        # player x played more black games
                        if self.players[x].color_balance >= self.players[y].color_balance:
                            print("   FAILED color_balance x vs y", self.players[x].color_balance, self.players[y].color_balance)
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

            x = waiting_players[0]
            print("pairing...", x.username)

            find = find_opp(0)

            if not find:
                failed += 1
                find = find_opp(-1)
                if not find:
                    failed += 1
                    print("   1. OH NO, I can't find an opp for %s :(" % x.username)

                    waiting_players.remove(x)

                    if len(waiting_players) > 1:
                        # OK try the second player now
                        x = waiting_players[0]
                        print("pairing...", x.username)

                        find = find_opp(0)

                        if not find:
                            failed += 1
                            find = find_opp(-1)
                            if not find:
                                failed += 1
                                print("   2. OH NO, I can't find an opp for %s :(" % x.username)

        print("=== PAIRINGS === failed", failed)
        for p in pairing:
            print(p[0].username, p[1].username)
        print("======================")

        end = time.time()
        print("PAIRING TIME:", end - start)
        return pairing
