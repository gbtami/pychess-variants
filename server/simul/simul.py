import random
from datetime import datetime, timezone

from const import T_ABORTED, T_CREATED, T_FINISHED, T_STARTED, T_ARCHIVED, TPairing
from tournament.tournament import Tournament


class Simul(Tournament):
    """
    Simul class
    """

    system = TPairing.SIMUL

    def __init__(self, *args, **kwargs):
        print("Simul created")
        super().__init__(*args, **kwargs)
        self.rounds = 1
        self.host_color = kwargs.get("host_color", "random")

    def create_pairing(self, waiting_players):
        print(f"Creating pairings for simul {self.id} with {len(waiting_players)} waiting players.")
        host = None
        opponents = []
        for p in waiting_players:
            if p.username == self.created_by:
                host = p
            else:
                opponents.append(p)

        if host is None:
            print(f"Host {self.created_by} not found in waiting_players for simul {self.id}")
            return []

        print(f"Host: {host.username}, Opponents: {[p.username for p in opponents]}")

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
                    pairing.append((host, opponent))
                else:
                    pairing.append((opponent, host))

        print(f"Created {len(pairing)} pairings for simul {self.id}")
        return pairing

    async def clock(self):
        print(f"Simul {self.id} clock started")
        try:
            while self.status not in (T_ABORTED, T_FINISHED, T_ARCHIVED):
                print(f"Simul {self.id} clock loop, status: {self.status}, current_round: {self.current_round}")
                now = datetime.now(timezone.utc)

                if self.status == T_CREATED:
                    pass

                elif self.status == T_STARTED:
                    if self.current_round == 0:
                        self.current_round += 1
                        print(f"Do simul pairing for {self.id}")
                        waiting_players = self.waiting_players()
                        await self.create_new_pairings(waiting_players)
                    elif len(self.ongoing_games) == 0:
                        await self.finish()
                        print(f"T_FINISHED: all simul games finished for {self.id}")
                        break
                    else:
                        print(f"Simul {self.id} has {len(self.ongoing_games)} ongoing game(s)...")

                await asyncio.sleep(1)
        except Exception as exc:
            print(f"Exception in simul clock for {self.id}: {exc}")

    async def start_simul(self):
        if self.status == T_CREATED:
            if len(self.players) < 2:
                await self.abort()
                return

            host_present = False
            for p in self.players:
                if p.username == self.created_by:
                    host_present = True
                    break

            if not host_present:
                await self.abort()
                return

            await self.start(datetime.now(timezone.utc))
