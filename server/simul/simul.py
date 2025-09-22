import random
from datetime import datetime, timezone

from const import T_ABORTED, T_CREATED, T_FINISHED, T_STARTED, TPairing
from logger import log
from tournament.tournament import Tournament


class Simul(Tournament):
    """
    Simul class
    """

    system = TPairing.SIMUL

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.rounds = 1
        # In simuls, the host can choose their color, so we'll need a way to specify this.
        # For now, we'll just assign randomly.
        # We also need to store who the host is. `created_by` is the username.
        self.host_color = kwargs.get("host_color", "random") # "white", "black", or "random"

    def create_pairing(self, waiting_players):
        host = None
        opponents = []
        for p in waiting_players:
            if p.username == self.created_by:
                host = p
            else:
                opponents.append(p)

        if host is None:
            # Host is not in the waiting players, something is wrong
            log.error(f"Host {self.created_by} not found in waiting_players for simul {self.id}")
            return []

        random.shuffle(opponents)
        pairing = []

        if self.host_color == "white":
            for opponent in opponents:
                pairing.append((host, opponent))
        elif self.host_color == "black":
            for opponent in opponents:
                pairing.append((opponent, host))
        else: # random
            half = len(opponents) // 2
            for i, opponent in enumerate(opponents):
                if i < half:
                    # Host plays white
                    pairing.append((host, opponent))
                else:
                    # Host plays black
                    pairing.append((opponent, host))

        return pairing

    async def clock(self):
        try:
            while self.status not in (T_ABORTED, T_FINISHED, T_ARCHIVED):
                now = datetime.now(timezone.utc)

                if self.status == T_CREATED:
                    # In manual start mode, we don't do anything in the clock
                    # until the simul is started by the host.
                    pass

                elif self.status == T_STARTED:
                    if self.current_round == 0:
                        self.current_round += 1
                        log.debug(f"Do simul pairing for {self.id}")
                        waiting_players = self.waiting_players()
                        await self.create_new_pairings(waiting_players)
                    elif len(self.ongoing_games) == 0:
                        await self.finish()
                        log.debug(f"T_FINISHED: all simul games finished for {self.id}")
                        break
                    else:
                        log.debug(f"Simul {self.id} has {len(self.ongoing_games)} ongoing game(s)...")

                await asyncio.sleep(1)
        except Exception as exc:
            log.critical(f"Exception in simul clock for {self.id}: {exc}", exc_info=True)

    async def start_simul(self):
        if self.status == T_CREATED:
            # A simul needs at least the host and one opponent
            if len(self.players) < 2:
                log.info(f"T_ABORTED: less than 2 players joined simul {self.id}")
                await self.abort()
                return

            # Check if host is present
            host_present = False
            for p in self.players:
                if p.username == self.created_by:
                    host_present = True
                    break

            if not host_present:
                log.info(f"T_ABORTED: host not present for simul {self.id}")
                await self.abort()
                return

            await self.start(datetime.now(timezone.utc))
