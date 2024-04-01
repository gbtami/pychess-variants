from __future__ import annotations
from decimal import Decimal
from operator import neg

from sortedcollections import ValueSortedDict

from const import VARIANTS, HIGHSCORE_MIN_GAMES, MAX_HIGHSCORE_ITEM_LIMIT


async def generate_highscore(app_state, one_variant=None):
    variants = VARIANTS if one_variant is None else (one_variant,)
    db = app_state.db

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
        cursor = db.user.find(filt, sort=[(r, -1)], limit=MAX_HIGHSCORE_ITEM_LIMIT)
        async for doc in cursor:
            scores[doc["_id"]] = int(round(Decimal(doc["perfs"][variant]["gl"]["r"]), 0))

        if len(scores) > 0:
            # update app_state
            app_state.highscore[variant] = ValueSortedDict(neg, scores)

            # insert/update to db.highscore
            await db.highscore.find_one_and_update(
                {"_id": variant}, {"$set": {"scores": scores}}, upsert=True
            )
