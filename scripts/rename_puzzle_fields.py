import os
import asyncio

from motor import motor_asyncio as ma

MONGO_HOST = os.getenv("MONGO_HOST", "mongodb://localhost:27017")

FIELD_MAPPING = {
    "fen": "f",
    "variant": "v",
    "moves": "m",
    "eval": "e",
    "type": "t",
    "uploadedBy": "b",
    "site": "s",
    "review": "r",
    "played": "p",
    "up": "u",
    "down": "d",
}


async def rename_puzzle_fields():
    client = ma.AsyncIOMotorClient(MONGO_HOST)
    db = client["pychess-variants"]

    print("Starting puzzle field rename migration...")
    try:
        await db.puzzle.update_many(
            {},
            {"$rename": FIELD_MAPPING},
        )
        print("Migration completed successfully.")
    except Exception as e:
        print(f"An error occurred: {e}")

    client.close()


if __name__ == "__main__":
    asyncio.run(rename_puzzle_fields())
