from time import time
from typing import TypedDict

class ChatResponse(TypedDict):
    type: str
    user: str
    message: str
    room: str
    time: int

def chat_response(type: str, username: str, message: str, room: str = "") -> ChatResponse:
    return {
        "type": type,
        "user": username,
        "message": message,
        "room": room,
        "time": int(time()),
    }
