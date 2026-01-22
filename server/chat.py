from __future__ import annotations
from typing import TYPE_CHECKING, Literal, overload
from time import time

if TYPE_CHECKING:
    from ws_types import ChatMessage, LobbyChatMessage


@overload
def chat_response(
    msg_type: Literal["lobbychat"], username: str, message: str, room: str = ""
) -> LobbyChatMessage: ...


@overload
def chat_response(msg_type: str, username: str, message: str, room: str = "") -> ChatMessage: ...


def chat_response(msg_type: str, username: str, message: str, room: str = "") -> ChatMessage:
    return {
        "type": msg_type,
        "user": username,
        "message": message,
        "room": room,
        "time": int(time()),
    }
