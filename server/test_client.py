import asyncio
import json
import random

import pstats
import cProfile

import aiohttp

from newid import id8
from settings import URI


LOBBY_URL = f'{URI}/wsl'
ROUND_URL = f'{URI}/wsr'
URLS = ("about", "players", "games", "tv", "variant")


def profile_me(fn):
    def profiled_fn(*args, **kwargs):
        prof = cProfile.Profile()
        ret = prof.runcall(fn, *args, **kwargs)
        ps = pstats.Stats(prof)
        ps.sort_stats('cumulative')
        ps.print_stats(60)
        return ret
    return profiled_fn


class TestUser:
    def __init__(self):
        self.username = "Anon-" + id8()
        self.seeks = []
        self.playing = False

    async def get(self, url=None):
        async with aiohttp.ClientSession() as session:
            if url is not None:
                async with session.get(url) as resp:
                    print(resp.status)
                    text = await resp.text()
                    print(text[:80])
            else:
                while True:
                    await asyncio.sleep(random.choice((1, 2, 3, 4, 5)))
                    if url is None:
                        url = URI + "/" + random.choice(URLS)

                    async with session.get(url) as resp:
                        print(resp.status)
                        text = await resp.text()
                        print(text[:80])

    async def go_to_lobby(self):
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(LOBBY_URL) as wsl:

                await wsl.send_json({"type": "lobby_user_connected", "username": self.username})
                await self.send_lobby_chat(wsl, "Hi all!")
                await wsl.send_json({"type": "get_seeks"})

                async for msg in wsl:
                    # print('Lobby message received from server:', msg)

                    if msg.type == aiohttp.WSMsgType.TEXT:
                        data = json.loads(msg.data)
                        # print('Lobby message received from server:', data["type"])
                        if data["type"] == "ping":
                            await wsl.send_json({"type": "pong"})

                        elif data["type"] == "get_seeks":
                            self.seeks = data["seeks"]
                            if len(self.seeks) > 0 and not self.playing:
                                self.playing = True
                                idx = random.choice(range(len(self.seeks)))
                                await wsl.send_json({
                                    "type": "accept_seek",
                                    "seekID": self.seeks[idx]["seekID"],
                                    "player": self.username
                                })

                        elif data["type"] == "new_game":
                            self.spectators = await spectators(data["gameId"])

                            asyncio.create_task(self.go_to_round(session, wsl, data["gameId"], data["wplayer"], data["bplayer"]))

                        elif data["type"] == "lobby_user_connected":
                            print("Connected as %s" % data["username"])

                    elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                        break
                await wsl.close()

    # @profile
    async def go_to_round(self, session, wsl, game_id, wplayer, bplayer):
        print("---------ROUND baby")
        async with session.ws_connect(ROUND_URL, timeout=20.0) as wsr:

            # TODO: am I player or am I spectator ???
            await wsr.send_json({"type": "game_user_connected", "username": self.username, "gameId": game_id})

            mycolor = "w" if self.username == wplayer else "b"

            # TODO: spectator or player chat?
            await self.send_round_chat(wsr, "Hi!", game_id, "spectator")

            async for msg in wsr:
                # print('Round message received from server:', msg)

                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    try:
                        if "type" not in data:
                            pass

                        elif data["type"] == "game_user_connected":
                            await wsr.send_json({"type": "ready", "gameId": game_id})
                            await wsr.send_json({"type": "board", "gameId": game_id})

                        elif data["type"] == "board":
                            if data["result"] != "*":
                                print("END", game_id, data["result"], data["status"])
                                self.playing = False
                                await wsr.send_json({"type": "logout"})
                                await wsl.send_json({"type": "logout"})
                                break

                            await asyncio.sleep(random.uniform(0, 0.1))
                            parts = data["fen"].split(" ")
                            turn_color = parts[1]
                            if data["rm"] and turn_color == mycolor:
                                await wsr.send_json({"type": "move", "gameId": game_id, "move": data["rm"], "clocks": data["clocks"], "ply": data["ply"] + 1})

                        elif data["type"] == "setup":
                            response = {"type": "setup", "gameId": game_id, "color": mycolor, "fen": data["fen"]}
                            await wsr.send_json(response)

                        elif data["type"] == "gameStart":
                            print("START", game_id)

                        elif data["type"] == "gameEnd":
                            print("END", game_id, data["result"], data["status"])
                            self.playing = False
                            await wsr.send_json({"type": "logout"})
                            await wsl.send_json({"type": "logout"})
                            break
                    except Exception:
                        print("FAILED wsr msg", msg)

                elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break
            await wsr.close()

    async def send_lobby_chat(self, ws, message):
        await ws.send_json({"type": "lobbychat", "user": self.username, "message": message})

    async def send_round_chat(self, ws, message, game_id, room):
        await ws.send_json({"type": "roundchat", "message": message, "gameId": game_id, "user": self.username, "room": room})


async def spectators(game_id):
    spectators = (TestUser() for i in range(10))
    tasks = (spectator.get(URI + "/" + game_id) for spectator in spectators)
    await asyncio.gather(*tasks)
    return spectators


async def main(users):
    tasks = (user.go_to_lobby() for user in users)
    await asyncio.gather(*tasks)


if __name__ == '__main__':
    users = (TestUser() for i in range(10))

    asyncio.run(main(users))
