import asyncio
from datetime import datetime

from motor import motor_asyncio as ma
from settings import MONGO_HOST, MONGO_DB_NAME


async def main():
    client = ma.AsyncIOMotorClient(MONGO_HOST)
    db = client[MONGO_DB_NAME]

    # Not 100% accurate hack to detect early makpong games saved as chess ("n")
    filter_cond = {}
    filter_cond["$and"] = [
        {"v": "n"},
        {"d": {"$gt": datetime(2020, 4, 20)}},
        {
            "$or": [
                {"$expr": {"$gt": [{"$indexOfBytes": ["$f", "m"]}, -1]}},
                {"$expr": {"$gt": [{"$indexOfBytes": ["$f", "M"]}, -1]}},
                {"$expr": {"$gt": [{"$indexOfBytes": ["$f", "s"]}, -1]}},
                {"$expr": {"$gt": [{"$indexOfBytes": ["$f", "S"]}, -1]}},
            ]
        },
    ]

    cursor = db.game.find(filter_cond)
    async for doc in cursor:
        print(doc["d"], doc["v"], doc["us"], doc["f"])

    await db.game.update_many(filter_cond, {"$set": {"v": "l"}})


if __name__ == "__main__":
    asyncio.run(main())
