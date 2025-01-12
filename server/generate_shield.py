from __future__ import annotations
from const import SHIELD, T_STARTED, TYPE_CHECKING
from variants import get_server_variant, VARIANTS

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState


async def generate_shield(app_state: PychessGlobalAppState):
    for variant in VARIANTS:
        variant960 = variant.endswith("960")
        uci_variant = variant[:-3] if variant960 else variant

        v = get_server_variant(uci_variant, variant960)
        z = 1 if variant960 else 0

        app_state.shield[variant] = []

        cursor = app_state.db.tournament.find(
            {"v": v.code, "z": z, "fr": SHIELD}, sort=[("startsAt", -1)], limit=5
        )
        async for doc in cursor:
            if doc["status"] > T_STARTED:
                app_state.shield[variant].append((doc["winner"], doc["startsAt"], doc["_id"]))

        if len(app_state.shield[variant]) > 0:
            app_state.shield_owners[variant] = app_state.shield[variant][0][0]
        else:
            app_state.shield_owners[variant] = "Fairy-Stockfish"
