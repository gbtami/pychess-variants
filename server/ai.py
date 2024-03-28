from __future__ import annotations
import asyncio
import json
import logging
import random
import string
from time import monotonic

from const import MOVE, STARTED
from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
from utils import play_move

log = logging.getLogger(__name__)


async def BOT_task(bot, app_state: PychessGlobalAppState):
    async def game_task(bot, game, level, random_mover):
        while game.status <= STARTED:
            try:
                line = await bot.game_queues[game.id].get()
                bot.game_queues[game.id].task_done()
            except ValueError:
                log.error(
                    "task_done() called more times than there were items placed in the queue in ai.py game_task()"
                )
            except KeyError:
                log.error("Break in BOT_task() game_task(). %s not in ai.game_queues", game.id)
                if game.status <= STARTED:
                    await game.abort_by_server()
                break

            event = json.loads(line)
            if event["type"] != "gameState":
                continue
            # print("   +++ game_queues get()", event)
            if random_mover:
                await play_move(app_state, bot, game, random.choice(game.legal_moves))
            elif len(app_state.workers) > 0:
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
            "nnue": game.board.nnue,
        }
        app_state.fishnet_works[work_id] = work
        app_state.fishnet_queue.put_nowait((MOVE, work_id))

    random_mover = bot.username == "Random-Mover"

    while not app_state.shutdown:
        line = await bot.event_queue.get()
        try:
            bot.event_queue.task_done()
        except ValueError:
            log.error(
                "task_done() called more times than there were items placed in the queue in ai.py AI_move()"
            )

        event = json.loads(line)
        # print("+++ AI event_queue.get()", event)

        if event["type"] != "gameStart":
            continue

        gameId = event["game"]["id"]
        level = int(event["game"]["skill_level"])
        if gameId not in app_state.games:
            continue
        game = app_state.games[gameId]

        if len(app_state.workers) == 0 and not random_mover:
            log.error("ERROR: No fairyfisnet worker alive!")
            # TODO: send msg to player
            await game.abort_by_server()
            continue

        starting_color = game.board.initial_fen.split()[1]
        if starting_color == "b":
            starting_player = game.bplayer.username
        else:
            starting_player = game.wplayer.username

        if starting_player == bot.username:
            if random_mover:
                await play_move(app_state, bot, game, random.choice(game.legal_moves))
            else:
                AI_move(game, level)

        asyncio.create_task(game_task(bot, game, level, random_mover))
