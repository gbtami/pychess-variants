from __future__ import annotations
from typing import TYPE_CHECKING
import time
import logging
from const import ARENA
from tournament.tournament import Tournament

if TYPE_CHECKING:
    from user import User

log = logging.getLogger(__name__)


class ArenaTournament(Tournament):
    system = ARENA

    def just_played_together(self, x: User, y: User) -> bool:
        x_data = self.player_data_by_name(x.username)
        y_data = self.player_data_by_name(y.username)
        if x_data is None or y_data is None:
            return False
        return y.username == x_data.prev_opp or x.username == y_data.prev_opp

    def create_pairing(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        start = time.time()
        pairing = []

        nb_waiting_players = len(waiting_players)

        log.info("WAITING PLAYERS: %s", nb_waiting_players)
        for p in waiting_players:
            log.debug("%20s %s" % (p.username, self.leaderboard[p]))

        failed = 0
        failed_limit = nb_waiting_players
        while True:
            if len(waiting_players) <= 1:
                if len(waiting_players) == 1:
                    player_data = self.player_data_by_name(waiting_players[0].username)
                    if player_data is not None:
                        player_data.nb_not_paired += 1
                break
            elif failed >= failed_limit:
                log.error("!!! TOO MUCH fail, STOP PAIRING !!! %s", failed)
                break

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
                    return False

                if x_data.color_balance < y_data.color_balance:
                    wp, bp = x, y
                else:
                    wp, bp = y, x

                waiting_players.remove(wp)
                waiting_players.remove(bp)

                pairing.append((wp, bp))
                return True

            def find_opp(color_balance_limit):
                find = False

                # If we started the pairing with exactly 2 free players only
                # and they never played before, pair them!
                if nb_waiting_players == 2:
                    y = waiting_players[1]
                    x_data = self.player_data_by_name(x.username)
                    if x_data is None:
                        return False

                    if y.username not in (
                        (
                            g.wplayer.username
                            if g.bplayer.username == x.username
                            else g.bplayer.username
                        )
                        for g in x_data.games
                    ):
                        log.info("Find OK opp (they never played before!): %s", y.username)
                        return pair_them(x, y)
                    elif self.ongoing_games == 0:
                        log.info("Find OK opp (duel!): %s", y.username)
                        return pair_them(x, y)
                    else:
                        return False

                if len(waiting_players) == 3:
                    a = waiting_players[-1]
                    b = waiting_players[-2]

                    a_data = self.player_data_by_name(a.username)
                    b_data = self.player_data_by_name(b.username)
                    if a_data is None or b_data is None:
                        return False
                    y = a if a_data.nb_not_paired > b_data.nb_not_paired else b

                    if not self.just_played_together(x, y):
                        log.info("Find OK opp from other remaining 2: %s", y.username)
                        return pair_them(x, y)

                for y in waiting_players:
                    log.info("try %s", y.username)
                    if y.username == x.username:
                        log.info("SKIP the same")
                        continue
                    if self.just_played_together(x, y):
                        log.info("FAIL, same prev_opp")
                        continue

                    x_data = self.player_data_by_name(x.username)
                    y_data = self.player_data_by_name(y.username)
                    if x_data is None or y_data is None:
                        continue

                    if x_data.color_balance < color_balance_limit:
                        # player x played more black games
                        if x_data.color_balance >= y_data.color_balance:
                            log.info(
                                "FAILED color_balance x vs y %s %s",
                                x_data.color_balance,
                                y_data.color_balance,
                            )
                            continue
                        else:
                            find = True
                            wp, bp = x, y
                    else:
                        find = True
                        wp, bp = y, x

                    log.info("Find OK opp! %s", y.username)
                    waiting_players.remove(wp)
                    waiting_players.remove(bp)

                    pairing.append((wp, bp))
                    break
                return find

            x = waiting_players[0]
            log.info("pairing... %s", x.username)

            find = find_opp(0)

            if not find:
                failed += 1
                find = find_opp(-1)
                if not find:
                    failed += 1
                    log.info("1. OH NO, I can't find an opp for %s :(" % x.username)

                    waiting_players.remove(x)

                    if len(waiting_players) > 1:
                        # OK try the second player now
                        x = waiting_players[0]
                        log.info("pairing... %s", x.username)

                        find = find_opp(0)

                        if not find:
                            failed += 1
                            find = find_opp(-1)
                            if not find:
                                failed += 1
                                log.info("2. OH NO, I can't find an opp for %s :(" % x.username)

        log.info("PAIRINGS failed: %s", failed)
        for p in pairing:
            log.info("%s %s", p[0].username, p[1].username)

        end = time.time()
        log.info("PAIRING TIME: %s", end - start)
        return pairing
