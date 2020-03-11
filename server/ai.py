import asyncio
import json
import logging
import random
import string
from time import monotonic

from const import MOVE, STARTED

log = logging.getLogger(__name__)


async def AI_task(ai, app):
    async def game_task(ai, game, gameId, level):
        while game.status <= STARTED:
            try:
                line = await ai.game_queues[gameId].get()
            except KeyError:
                log.error("Break in AI_task() game_task(). %s not in ai.game_queues" % gameId)
                if game.status <= STARTED:
                    await game.abort()
                break

            event = json.loads(line)
            if event["type"] != "gameState":
                continue
            # print("   +++ game_queues get()", event)
            if len(app["workers"]) > 0:
                AI_move(game, gameId, level)

    def AI_move(game, gameId, level):
        game = app["games"][gameId]
        work_id = "".join(random.choice(string.ascii_letters + string.digits) for x in range(6))
        work = {
            "work": {
                "type": "move",
                "id": work_id,
                "level": level,
            },
            "time": monotonic(),
            "game_id": gameId,  # optional
            "position": game.board.initial_fen,  # start position (X-FEN)
            "variant": game.variant,
            "chess960": game.chess960,
            "moves": " ".join(game.board.move_stack),  # moves of the game (UCI)
        }
        app["works"][work_id] = work
        app["fishnet"].put_nowait((MOVE, work_id))

    while not app["data"]["kill"]:
        line = await ai.event_queue.get()
        event = json.loads(line)
        # print("+++ AI event_queue.get()", event)

        if event["type"] != "gameStart":
            continue

        gameId = event["game"]["id"]
        level = int(event["game"]["skill_level"])
        game = app["games"][gameId]

        if len(app["workers"]) == 0:
            log.error("ERROR: No fairyfisnet worker alive!")
            # TODO: send msg to player
            await game.abort()
            continue

        starting_color = game.initial_fen.split()[1]
        if starting_color == "b":
            starting_player = game.bplayer.username
        else:
            starting_player = game.wplayer.username
        if starting_player == ai.username:
            AI_move(game, gameId, level)

        loop = asyncio.get_event_loop()
        loop.create_task(game_task(ai, game, gameId, level))
