import os
import asyncio

from motor import motor_asyncio as ma

MONGO_HOST_PUZZLE = os.getenv("MONGO_HOST_PUZZLE")


async def main():
    client = ma.AsyncIOMotorClient(MONGO_HOST_PUZZLE)
    db = client["pychess-variants"]

    n = await db.puzzle.count_documents({})
    print("%s documents before calling delete_many()" % n)

    counter = 0
    with open("bad_xiangqi_puzzles_id.txt") as f:
        for line in f:
            _id = line.strip()
            print(counter, _id)
            counter += 1

            doc = await db.puzzle.find_one({"_id": _id})
            if (doc is not None) and doc["variant"] != "xiangqi":
                print("NOT xiangqi puzzle", doc["_id"])
                break

            await db.puzzle.delete_one({"_id": _id})

    print("%s documents after" % (await db.puzzle.count_documents({})))

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
