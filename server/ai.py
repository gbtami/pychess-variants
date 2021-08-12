import asyncio
import json
import logging
import random
import string
from time import monotonic

from const import MOVE, STARTED
from utils import play_move

log = logging.getLogger(__name__)


async def BOT_task(bot, app):
    async def game_task(bot, game, level, random_mover):
        while game.status <= STARTED:
            try:
                line = await bot.game_queues[game.id].get()
                bot.game_queues[game.id].task_done()
            except ValueError:
                log.error("task_done() called more times than there were items placed in the queue in ai.py game_task()")
            except KeyError:
                log.error("Break in BOT_task() game_task(). %s not in ai.game_queues", game.id)
                if game.status <= STARTED:
                    await game.abort()
                break

            event = json.loads(line)
            if event["type"] != "gameState":
                continue
            # print("   +++ game_queues get()", event)
            if random_mover:
                await play_move(app, bot, game, game.random_move)
            elif len(app["workers"]) > 0:
                AI_move(game, level)

    def AI_move(game, level):
        work_id = "".join(random.choice(string.ascii_letters + string.digits) for x in range(6))
        work = {
            "work": {
                "type": "move",
                "id": work_id,
                "level": level,
            },
            "time": monotonic(),
            "game_id": game.id,  # optional
            "position": game.board.initial_fen,  # start position (X-FEN)
            "variant": game.variant,
            "chess960": game.chess960,
            "moves": " ".join(game.board.move_stack),  # moves of the game (UCI)
        }
        app["works"][work_id] = work
        app["fishnet"].put_nowait((MOVE, work_id))

    random_mover = bot.username == "Random-Mover"

    while not app["data"]["kill"]:
        line = await bot.event_queue.get()
        try:
            bot.event_queue.task_done()
        except ValueError:
            log.error("task_done() called more times than there were items placed in the queue in ai.py AI_move()")

        event = json.loads(line)
        # print("+++ AI event_queue.get()", event)

        if event["type"] != "gameStart":
            continue

        gameId = event["game"]["id"]
        level = int(event["game"]["skill_level"])
        if gameId not in app["games"]:
            continue
        game = app["games"][gameId]

        if len(app["workers"]) == 0 and not random_mover:
            log.error("ERROR: No fairyfisnet worker alive!")
            # TODO: send msg to player
            await game.abort()
            continue

        starting_color = game.initial_fen.split()[1]
        if starting_color == "b":
            starting_player = game.bplayer.username
        else:
            starting_player = game.wplayer.username

        if starting_player == bot.username:
            if random_mover:
                await play_move(app, bot, game, game.random_move)
            else:
                AI_move(game, level)

        asyncio.create_task(game_task(bot, game, level, random_mover))
