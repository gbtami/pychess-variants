from collections import deque

from const import MAX_CHAT_LINES


def silence(message, lobbychat, users):
    response = None
    spammer = message.split()[-1]
    if spammer in users:
        users[spammer].set_silence()
        lobbychat = deque(filter(lambda x: x["user"] != spammer, lobbychat), MAX_CHAT_LINES)
        lobbychat.append({"type": "lobbychat", "user": "", "message": "%s was timed out 10 minutes for spamming the chat." % spammer})
        response = {"type": "fullchat", "lines": list(lobbychat)}
    return response
