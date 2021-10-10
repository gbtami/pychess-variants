from typing import TypedDict

class ChatResponse(TypedDict):
    type: str
    user: str
    message: str
    room: str

def chat_response(type: str, username: str, message: str, room: str = "") -> ChatResponse:
    return {
        "type": type,
        "user": username,
        "message": message,
        "room": room,
    }
