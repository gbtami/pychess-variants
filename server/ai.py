from __future__ import annotations
from typing import TYPE_CHECKING
import asyncio
import json
import random
import string
from time import monotonic

from const import MOVE, STARTED
from fairy import WHITE

if TYPE_CHECKING:
    from game import Game
    from pychess_global_app_state import PychessGlobalAppState
    from user import User
from utils import play_move
import logging

log = logging.getLogger(__name__)

bot_game_tasks: set[asyncio.Task[None]] = set()
# Poll interval for bot queues when no messages are arriving; this prevents
# stuck bot-game tasks from keeping finished games and players alive forever.
BOT_QUEUE_POLL_SECS = 5


async def BOT_task(bot: User, app_state: PychessGlobalAppState) -> None:
    async def game_task(bot: User, game: Game, level: int, random_mover: bool) -> None:
        while game.status <= STARTED:
            try:
                queue = bot.game_queues.get(game.id)
                if queue is None:
                    # The queue was removed during cleanup; exit so this task
                    # does not keep the game referenced.
                    break
                line = await asyncio.wait_for(queue.get(), timeout=BOT_QUEUE_POLL_SECS)
                queue.task_done()
            except asyncio.TimeoutError:
                # Periodically re-check game status so we can exit even if no
                # further messages are enqueued (e.g., clock/abort endings).
                if game.status > STARTED:
                    break
                continue
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
            try:
                if random_mover:
                    async with game.move_lock:
                        await play_move(app_state, bot, game, random.choice(game.legal_moves))
                elif len(app_state.workers) > 0:
                    AI_move(game, level)
            except Exception:
                log.error(
                    "Break in BOT_task() game_task(). %s BOT play_move/AI_move failed", game.id
                )
                break

    def AI_move(game: Game, level: int) -> None:
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

    # After server restart we may have to wait for fairyfishnet workers to join...
    while not bot.online:
        await asyncio.sleep(3)

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

        turn_player = game.wplayer.username if game.board.color == WHITE else game.bplayer.username

        if turn_player == bot.username:
            if random_mover:
                async with game.move_lock:
                    await play_move(app_state, bot, game, random.choice(game.legal_moves))
            else:
                AI_move(game, level)

        task = asyncio.create_task(
            game_task(bot, game, level, random_mover), name="bot-game-%s" % game.id
        )
        bot_game_tasks.add(task)
        task.add_done_callback(bot_game_tasks.discard)
