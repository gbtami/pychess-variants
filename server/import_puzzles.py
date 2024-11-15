import os
import json
import sys
import asyncio

from motor import motor_asyncio as ma

MONGO_HOST = os.getenv("MONGO_HOST")


async def upsert_from_json(json_file):
    client = ma.AsyncIOMotorClient(MONGO_HOST)
    db = client["pychess-variants"]

    i = 0
    with open(json_file) as p:
        for line in p:
            i += 1
            doc = json.loads(line)
            if "uploaded_by" in doc:
                print(i)
                try:
                    # puzzle = await db.puzzle.find_one({"_id": doc["_id"]})
                    # if puzzle is not None:
                    #    print("EXISTS!", doc["_id"])

                    await db.puzzle.find_one_and_update(
                        {"_id": doc["_id"]}, {"$set": doc}, upsert=True
                    )
                except Exception:
                    print("   ERROR", doc["_id"])

    client.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Missing json file name")
        sys.exit()
    elif not sys.argv[1].endswith(".json"):
        print("*.json needed")
        sys.exit()
    asyncio.run(upsert_from_json(sys.argv[1]))
