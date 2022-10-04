import random
from datetime import datetime, timezone

import pyffish as sf


async def get_puzzle(request, puzzleId):
    puzzle = await request.app["db"].puzzle.find_one({"_id": puzzleId})
    return puzzle


async def get_daily_puzzle(request):
    today = datetime.now(timezone.utc).date()
    daily_puzzles = request.app["daily-puzzles"]
    if today not in daily_puzzles:
        user = request.app["users"]["PyChess"]
        # skip previous daily puzzles TODO: save/restore from mongodb
        user.puzzles = [puzzle["_id"] for puzzle in daily_puzzles.values()]
        # TODO: random
        user.puzzle_variant = random.choice(("xiangqi", "shogi", "chess", "crazyhouse"))
        request.app["daily-puzzles"][today] = await next_puzzle(request, user)
    return request.app["daily-puzzles"][today]


async def next_puzzle(request, user):
    skipped = user.puzzles
    filters = [
        {"_id": {"$nin": skipped}},
        {"cooked": {"$ne": True}},
    ]
    if user.puzzle_variant is not None:
        variant = user.puzzle_variant
        filters.append({"variant": variant})
    else:
        variant = "chess"

    puzzle = None

    if request.app["db"] is not None:
        pipeline = [
            {"$match": {"$and": filters}},
            {"$sample": {"size": 1}},
        ]

        cursor = request.app["db"].puzzle.aggregate(pipeline)

        async for doc in cursor:
            puzzle = doc
            break

    if puzzle is None:
        puzzle = {
            "_id": "0",
            "variant": variant,
            "fen": sf.start_fen(variant),
            "moves": "",
        }

    user.puzzles.append(puzzle["_id"])
    return puzzle
