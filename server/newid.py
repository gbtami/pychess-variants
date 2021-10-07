import random
import string

ID_CHARS: str = string.ascii_letters + string.digits


def id8() -> str:
    return "".join(random.choice(ID_CHARS) for x in range(8))


async def new_id(table):
    if table is None:
        return id8()

    while True:
        new_id = id8()
        existing = await table.find_one({"_id": {"$eq": new_id}})
        if not existing:
            return new_id
