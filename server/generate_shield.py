from typedefs import db_key, shield_key, shield_owners_key
from const import SHIELD, VARIANTS, T_STARTED
from compress import V2C


async def generate_shield(app):
    db = app[db_key]
    for variant in VARIANTS:
        variant960 = variant.endswith("960")
        variant_name = variant[:-3] if variant960 else variant

        v = V2C[variant_name]
        z = 1 if variant960 else 0

        app[shield_key][variant] = []

        cursor = db.tournament.find(
            {"v": v, "z": z, "fr": SHIELD}, sort=[("startsAt", -1)], limit=5
        )
        async for doc in cursor:
            if doc["status"] > T_STARTED:
                app[shield_key][variant].append((doc["winner"], doc["startsAt"], doc["_id"]))

        if len(app[shield_key][variant]) > 0:
            app[shield_owners_key][variant] = app[shield_key][variant][0][0]
        else:
            app[shield_owners_key][variant] = "Fairy-Stockfish"
