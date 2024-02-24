from __future__ import annotations
from decimal import Decimal

from const import VARIANTS, HIGHSCORE_MIN_GAMES


async def generate_highscore(db, one_variant=None):
    limit = 50
    hs = []
    variants = VARIANTS if one_variant is None else (one_variant,)

    for variant in variants:
        # print(variant)
        d = "perfs.%s.gl.d" % variant
        r = "perfs.%s.gl.r" % variant
        nb = "perfs.%s.nb" % variant
        filt = {
            d: {"$lt": 350},
            "enabled": {"$ne": False},
            nb: {"$gte": HIGHSCORE_MIN_GAMES},
        }

        scores = {}
        cursor = db.user.find(filt, sort=[(r, -1)], limit=limit)
        async for doc in cursor:
            scores[doc["_id"]] = int(round(Decimal(doc["perfs"][variant]["gl"]["r"]), 0))

        if one_variant is None:
            hs.append({"_id": variant, "scores": scores})
        else:
            hs = scores

    # bulk insert/upsert to highscore
    if len(hs) > 0:
        if one_variant is None:
            await db.highscore.drop()
            await db.highscore.insert_many(hs)
        else:
            await db.highscore.find_one_and_update(
                {"_id": variant}, {"$set": {"scores": hs}}, upsert=True
            )
