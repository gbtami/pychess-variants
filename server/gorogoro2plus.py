import asyncio

from motor import motor_asyncio as ma
from settings import MONGO_HOST, MONGO_DB_NAME


async def main():
    client = ma.AsyncIOMotorClient(MONGO_HOST)
    db = client[MONGO_DB_NAME]

    # Add starting FEN to original gorogoro games before we make gorogoropus default
    filter_cond = {}
    filter_cond["$and"] = [
        {"v": "G"},
        {"if": {"$exists": False}},
    ]

    cursor = db.game.find(filter_cond)
    async for doc in cursor:
        print(doc["d"], doc["v"], doc["us"], "---", doc["f"])

    await db.game.update_many(filter_cond, {"$set": {"if": "sgkgs/5/1ppp1/1PPP1/5/SGKGS[-] w 0 1"}})

    await db.user.update_many({}, {"$rename": {"perfs.gorogoro": "perfs.gorogoroplus"}})

if __name__ == "__main__":
    asyncio.run(main())
