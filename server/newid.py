from __future__ import annotations
from typing import Any, TYPE_CHECKING
import random
import string

ID_CHARS = string.ascii_letters + string.digits


if TYPE_CHECKING:
    from typing import Protocol
    from typing import Any

    class SupportsFindOne(Protocol):
        async def find_one(
            self, filter: dict[str, object] | None = None, *args: Any, **kwargs: Any
        ) -> dict[str, object] | None: ...


def id8() -> str:
    return "".join(random.choice(ID_CHARS) for x in range(8))


async def new_id(table: Any | None) -> str:
    if table is None:
        return id8()

    while True:
        new_id = id8()
        existing = await table.find_one({"_id": {"$eq": new_id}})
        if not existing:
            return new_id
