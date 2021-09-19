def silence(message, lobbychat, users):
    response = None
    spammer = message.split()[-1]
    if spammer in users:
        users[spammer].set_silence()

        # delete all the spammer messages in place
        i = len(lobbychat)
        while i > 0:
            if lobbychat[i - 1]["user"] == spammer:
                del lobbychat[i - 1]
            i -= 1

        lobbychat.append({"type": "lobbychat", "user": "", "message": "%s was timed out 10 minutes for spamming the chat." % spammer})
        response = {"type": "fullchat", "lines": list(lobbychat)}
    return response
