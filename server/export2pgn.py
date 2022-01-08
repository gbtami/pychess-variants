import asyncio
import bz2
import logging

from motor import motor_asyncio as ma
from settings import MONGO_HOST, MONGO_DB_NAME
from utils import pgn
from compress import C2V

log = logging.getLogger(__name__)

YEAR = 2022
MONTHS = (6, 7, 8, 9, 10, 11)


async def main():
    client = ma.AsyncIOMotorClient(MONGO_HOST)
    db = client[MONGO_DB_NAME]

    for month in MONTHS:
        yearmonth = "%s%02d" % (YEAR, month)

        game_list = []
        game_counter = 0
        failed = 0
        cursor = None

        print("---", yearmonth[:4], yearmonth[4:])
        filter_cond = {}
        filter_cond["$and"] = [
            {"$expr": {"$eq": [{"$year": "$d"}, int(yearmonth[:4])]}},
            {"$expr": {"$eq": [{"$month": "$d"}, int(yearmonth[4:])]}},
        ]
        cursor = db.game.find(filter_cond)

        if cursor is not None:
            async for doc in cursor:
                try:
                    # print(game_counter)
                    # log.info("%s %s %s" % (doc["d"].strftime("%Y.%m.%d"), doc["_id"], C2V[doc["v"]]))
                    pgn_text = pgn(doc)
                    if pgn_text is not None:
                        game_list.append(pgn_text)
                    game_counter += 1
                except Exception:
                    failed += 1
                    log.error("Failed to load game %s %s %s (early games may contain invalid moves)", doc["_id"], C2V[doc["v"]], doc["d"].strftime("%Y.%m.%d"))
                    continue
            print('failed/all:', failed, game_counter)
        pgn_text = "\n".join(game_list)

        with bz2.open(yearmonth + ".pgn", "wt") as f:
            f.write(pgn_text)


if __name__ == "__main__":
    asyncio.run(main())
