import pyffish as sf


async def get_puzzle(request, puzzleId):
    puzzle = await request.app["db"].puzzle.find_one({"_id": puzzleId})
    return puzzle


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

    pipeline = [
        {"$match": {"$and": filters}},
        {"$sample": {"size": 1}},
    ]

    cursor = request.app["db"].puzzle.aggregate(pipeline)

    puzzle = None
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
