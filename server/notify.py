import json
from datetime import datetime, timezone

from const import NOTIFY_PAGE_SIZE, NOTIFY_EXPIRE_WEEKS
from newid import new_id


async def notify(db, user, notif_type, content):
    _id = await new_id(None if db is None else db.notify)
    now = datetime.now(timezone.utc)
    document = {
        "_id": _id,
        "notifies": user.username,
        "type": notif_type,
        "read": False,
        "createdAt": now,
        "expireAt": (now + NOTIFY_EXPIRE_WEEKS).isoformat(),
        "content": content,
    }

    if user.notifications is None:
        cursor = db.notify.find({"notifies": user.username})
        user.notifications = await cursor.to_list(length=100)

    user.notifications.append(document)

    for queue in user.notify_channels:
        await queue.put(
            json.dumps(user.notifications[-NOTIFY_PAGE_SIZE:], default=datetime.isoformat)
        )

    if db is not None:
        await db.notify.insert_one(document)
