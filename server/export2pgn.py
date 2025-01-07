from __future__ import annotations
import asyncio
import bz2

from motor import motor_asyncio as ma

from settings import MONGO_HOST, MONGO_DB_NAME
from utils import pgn
from compress import C2V
from logger import log

YEARS = (2019, 2020, 2021, 2022, 2023, 2024)
MONTHS = range(1, 13)


async def main():
    client = ma.AsyncIOMotorClient(MONGO_HOST)
    db = client[MONGO_DB_NAME]

    for year in YEARS:
        for month in MONTHS:
            if year == 2019 and month < 7:
                continue

            yearmonth = "%s%02d" % (year, month)

            game_list = []
            game_counter = 0
            failed = 0
            cursor = None

            print("---", yearmonth[:4], yearmonth[4:])
            filter_cond = {
                "$and": [
                    {"$expr": {"$eq": [{"$year": "$d"}, int(yearmonth[:4])]}},
                    {"$expr": {"$eq": [{"$month": "$d"}, int(yearmonth[4:])]}},
                ]
            }
            cursor = db.game.find(filter_cond)

            if cursor is None:
                continue

            async for doc in cursor:
                try:
                    # print(game_counter)
                    # print("%s %s %s %s" % (doc["us"][0], doc["us"][1], doc["_id"], C2V[doc["v"]]))
                    pgn_text = pgn(doc)
                    if pgn_text is not None:
                        game_list.append(pgn_text)
                    game_counter += 1
                except Exception:
                    failed += 1
                    log.error(
                        "Failed to load game %s %s %s (early games may contain invalid moves)",
                        doc["_id"],
                        C2V[doc["v"]],
                        doc["d"].strftime("%Y.%m.%d"),
                    )
                    continue

            print("failed/all:", failed, game_counter)
            pgn_text = "\n".join(game_list)

            filename = "pgn_export/pychess_db_%s-%s.pgn.bz2" % (yearmonth[:4], yearmonth[4:])
            with bz2.open(filename, "wt") as f:
                f.write(pgn_text)


if __name__ == "__main__":
    asyncio.run(main())
