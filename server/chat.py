from time import time


def chat_response(msg_type: str, username: str, message: str, room: str = "") -> dict:
    return {
        "type": msg_type,
        "user": username,
        "message": message,
        "room": room,
        "time": int(time()),
    }
