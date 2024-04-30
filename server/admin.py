from __future__ import annotations
import collections

from broadcast import broadcast_streams
from const import TYPE_CHECKING, VARIANTS
from generate_highscore import generate_highscore
from login import logout
from settings import ADMINS, FISHNET_KEYS

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState


def silence(app_state: PychessGlobalAppState, message):
    response = None
    spammer = message.split()[-1]
    if spammer in app_state.users:
        lobbychat = app_state.lobby.lobbychat
        users = app_state.users

        users[spammer].set_silence()

        # delete all the spammer messages in place
        i = len(lobbychat)
        while i > 0:
            if lobbychat[i - 1]["user"] == spammer:
                del lobbychat[i - 1]
            i -= 1

        lobbychat.append(
            {
                "type": "lobbychat",
                "user": "",
                "message": "%s was timed out 10 minutes for spamming the chat." % spammer,
            }
        )
        response = {"type": "fullchat", "lines": list(lobbychat)}
    return response


def disable_new_anons(app_state: PychessGlobalAppState, message):
    parts = message.split()
    if len(parts) > 1:
        app_state.disable_new_anons = parts[1].lower() in ("1", "true", "yes")


async def stream(app_state: PychessGlobalAppState, message):
    parts = message.split()
    if len(parts) >= 3:
        if parts[1] == "add":
            if len(parts) >= 5:
                app_state.youtube.add(parts[2], parts[3], parts[4])
            elif len(parts) >= 4:
                app_state.youtube.add(parts[2], parts[3])
            else:
                app_state.youtube.add(parts[2])
        elif parts[1] == "remove":
            app_state.youtube.remove(parts[2])
        await broadcast_streams(app_state)


async def delete_puzzle(app_state: PychessGlobalAppState, message):
    parts = message.split()
    if len(parts) == 2 and len(parts[1]) == 5:
        await app_state.db.puzzle.delete_one({"_id": parts[1]})


async def ban(app_state: PychessGlobalAppState, message):
    parts = message.split()
    if len(parts) == 2 and parts[1] in app_state.users and parts[1] not in ADMINS:
        banned_user = await app_state.users.get(parts[1])
        banned_user.enabled = False
        await app_state.db.user.find_one_and_update({"_id": parts[1]}, {"$set": {"enabled": False}})
        await logout(None, banned_user)


async def highscore(app_state: PychessGlobalAppState, message):
    parts = message.split()
    if len(parts) == 2 and parts[1] in VARIANTS:
        variant = parts[1]
        await generate_highscore(app_state, variant)


async def fishnet(app_state: PychessGlobalAppState, message):
    parts = message.split()
    if len(parts) >= 3:
        key = parts[2]
        if parts[1] == "add":
            if len(parts) == 4:
                name = parts[3]
                await app_state.db.fishnet.find_one_and_update(
                    {"_id": key},
                    {"$set": {"name": name}},
                    upsert=True,
                )
                FISHNET_KEYS[key] = name
                app_state.fishnet_monitor[name] = collections.deque([], 50)
        elif parts[1] == "remove":
            if key in FISHNET_KEYS:
                name = FISHNET_KEYS[key]
                await app_state.db.fishnet.delete_one({"_id": key})
                del FISHNET_KEYS[key]
                del app_state.fishnet_monitor[name]
                app_state.workers.remove(key)
