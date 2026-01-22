from __future__ import annotations
from typing import TYPE_CHECKING
from time import time

if TYPE_CHECKING:
    from ws_types import ChatMessage


def chat_response(msg_type: str, username: str, message: str, room: str = "") -> ChatMessage:
    return {
        "type": msg_type,
        "user": username,
        "message": message,
        "room": room,
        "time": int(time()),
    }
