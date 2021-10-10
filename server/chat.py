from time import time


def chat_response(type: str, username: str, message: str, room: str = "") -> dict:
    return {
        "type": type,
        "user": username,
        "message": message,
        "room": room,
        "time": int(time()),
    }
