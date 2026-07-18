from datetime import datetime, timezone

from const import NOTIFY_PAGE_SIZE, NOTIFY_EXPIRE_WEEKS
from json_utils import json_dumps
from newid import new_id
from typing_defs import NotificationContent, NotificationDocument

NOTIFICATION_CACHE_LIMIT = 100


async def _notification_document(
    db, username: str, notif_type: str, content: NotificationContent
) -> NotificationDocument:
    _id = await new_id(None if db is None else db.notify)
    now = datetime.now(timezone.utc)
    return {
        "_id": _id,
        "notifies": username,
        "type": notif_type,
        "read": False,
        "createdAt": now,
        "expireAt": (now + NOTIFY_EXPIRE_WEEKS).isoformat(),
        "content": content,
    }


async def notify(db, user, notif_type: str, content: NotificationContent) -> None:
    document = await _notification_document(db, user.username, notif_type, content)

    if user.notifications is None:
        if db is None:
            user.notifications = []
        else:
            cursor = db.notify.find({"notifies": user.username})
            user.notifications = await cursor.to_list(length=NOTIFICATION_CACHE_LIMIT)

    user.notifications.append(document)
    if len(user.notifications) > NOTIFICATION_CACHE_LIMIT:
        del user.notifications[:-NOTIFICATION_CACHE_LIMIT]

    for queue in tuple(user.notify_channels):
        await queue.put(json_dumps(user.notifications[-NOTIFY_PAGE_SIZE:]))

    if db is not None:
        await db.notify.insert_one(document)


async def notify_by_username(
    app_state, username: str, notif_type: str, content: NotificationContent
) -> None:
    """Persist a notification without materializing an offline User in the global cache."""
    user = app_state.users.data.get(username)
    if user is not None:
        await notify(app_state.db, user, notif_type, content)
        return

    if app_state.db is not None:
        document = await _notification_document(app_state.db, username, notif_type, content)
        await app_state.db.notify.insert_one(document)
