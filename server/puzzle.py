def filter_expr(reviewed: bool, skipped: list, variant: str):
    f = {
        "$and": [
            {"review": {"$exists": reviewed}},
            {"variant": variant},
        ]
    }
    if skipped:
        f["$and"] += [{"_id": {"$ne": _id}} for _id in skipped]
    return f


async def get_puzzle(db, puzzleId):
    puzzle = await db.puzzle.find_one({"_id": puzzleId})
    return puzzle


async def next_puzzle(db, variant):
    # TODO: save user solved/skipped puzzles
    skipped = []
    # puzzle_filter = filter_expr(True, skipped, variant)
    # puzzle = await db.puzzle.find_one(puzzle_filter, sort=[("$natural", -1)])

    pipeline = [{"$match": {"_id": {"$nin": skipped}}}, {"$sample": {"size": 1}}]
    cursor = db.puzzle.aggregate(pipeline)

    puzzle = None
    async for doc in cursor:
        puzzle = doc
        break

    return puzzle
