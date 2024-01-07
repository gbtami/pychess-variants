from __future__ import annotations
from compress import V2C
from const import SHIELD, VARIANTS, T_STARTED, TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState


async def generate_shield(app_state: PychessGlobalAppState):
    for variant in VARIANTS:
        variant960 = variant.endswith("960")
        variant_name = variant[:-3] if variant960 else variant

        v = V2C[variant_name]
        z = 1 if variant960 else 0

        app_state.shield[variant] = []

        cursor = app_state.db.tournament.find(
            {"v": v, "z": z, "fr": SHIELD}, sort=[("startsAt", -1)], limit=5
        )
        async for doc in cursor:
            if doc["status"] > T_STARTED:
                app_state.shield[variant].append((doc["winner"], doc["startsAt"], doc["_id"]))

        if len(app_state.shield[variant]) > 0:
            app_state.shield_owners[variant] = app_state.shield[variant][0][0]
        else:
            app_state.shield_owners[variant] = "Fairy-Stockfish"
