async def get_puzzle(request, puzzleId):
    puzzle = await request.app["db"].puzzle.find_one({"_id": puzzleId})
    return puzzle


async def next_puzzle(request, user):
    skipped = user.puzzles
    if user.puzzle_variant is None:
        pipeline = [{"$match": {"_id": {"$nin": skipped}}}, {"$sample": {"size": 1}}]
    else:
        pipeline = [
            {"$match": {"$and": [{"_id": {"$nin": skipped}}, {"variant": user.puzzle_variant}]}},
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
            "variant": "chess",
            "fen": "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR[] b KQkq - 0 1",
            "moves": "d8h4",
        }

    user.puzzles.append(puzzle["_id"])
    return puzzle
