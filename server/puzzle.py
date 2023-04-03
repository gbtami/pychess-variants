import random
from datetime import datetime, timezone

from aiohttp import web
import aiohttp_session

import pyffish as sf

from glicko2.glicko2 import DEFAULT_PERF, gl2, Rating

# TODO: query the database for variants having puzzles
PUZZLE_VARIANTS = (
    "xiangqi",
    "atomic",
    "makruk",
    "chess",
    "janggi",
    "shogi",
    "crazyhouse",
    "chak",
    "empire",
    "orda",
    "capablanca",
    "hoppelpoppel",
    "ordamirror",
    "dobutsu",
    "cambodian",
    "makpong",
    "grand",
    "synochess",
    "seirawan",
    "torishogi",
    "shinobi",
    "duck",
    "shako",
)


async def get_puzzle(request, puzzleId):
    puzzle = await request.app["db"].puzzle.find_one({"_id": puzzleId})
    return puzzle


async def get_daily_puzzle(request):
    today = datetime.now(timezone.utc).date().isoformat()
    daily_puzzle_ids = request.app["daily_puzzle_ids"]
    if today in daily_puzzle_ids:
        puzzle = await get_puzzle(request, daily_puzzle_ids[today])
    else:
        user = request.app["users"]["PyChess"]

        # skip previous daily puzzles
        user.puzzles = list(daily_puzzle_ids.values())

        puzzleId = "0"
        while puzzleId == "0":
            # randomize daily puzzle variant
            user.puzzle_variant = random.choice(PUZZLE_VARIANTS)
            puzzle = await next_puzzle(request, user)
            puzzleId = puzzle["_id"]

        await request.app["db"].dailypuzzle.insert_one({"_id": today, "puzzleId": puzzleId})
        request.app["daily_puzzle_ids"][today] = puzzle["_id"]
    return puzzle


async def next_puzzle(request, user):
    skipped = user.puzzles
    filters = [
        {"_id": {"$nin": skipped}},
        {"cooked": {"$ne": True}},
        {"review": {"$ne": False}},
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
            puzzle = {
                "_id": doc["_id"],
                "variant": doc["variant"],
                "fen": doc["fen"],
                "moves": doc["moves"],
                "site": doc.get("site", ""),
                "played": doc.get("played", 0),
            }
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


async def puzzle_complete(request):
    puzzleId = request.match_info.get("puzzleId")
    post_data = await request.post()
    print(puzzleId, post_data)
    rated = post_data["rated"] == "true"

    puzzle_data = await get_puzzle(request, puzzleId)
    puzzle = Puzzle(request.app["db"], puzzle_data)

    await puzzle.set_played()

    if not rated:
        return

    users = request.app["users"]
    session = await aiohttp_session.get_session(request)
    user = users[session.get("user_name")]

    variant = post_data["variant"]
    chess960 = False  # TODO: add chess960 to xxx960 variant puzzles
    color = post_data["color"]
    win = post_data["win"] == "true"

    if color[0] == "w":
        wplayer, bplayer = user, puzzle
        white_rating = user.get_rating(variant, chess960)
        black_rating = puzzle.get_rating(variant, chess960)
        result = "1-0" if win else "0-1"
    else:
        wplayer, bplayer = puzzle, user
        white_rating = puzzle.get_rating(variant, chess960)
        black_rating = user.get_rating(variant, chess960)
        result = "0-1" if win else "1-0"

    perfs = await update_ratings(
        wplayer, bplayer, white_rating, black_rating, variant, chess960, result
    )
    print(perfs)
    response = {
        "rdiff": 0,
        "bdiff": 1,
    }
    return web.json_response(response)


async def update_ratings(wplayer, bplayer, white_rating, black_rating, variant, chess960, result):
    if result == "1-0":
        (white_score, black_score) = (1.0, 0.0)
    elif result == "0-1":
        (white_score, black_score) = (0.0, 1.0)
    else:
        raise RuntimeError("game.result: unexpected result code")

    wr = gl2.rate(white_rating, [(white_score, black_rating)])
    br = gl2.rate(black_rating, [(black_score, white_rating)])

    await wplayer.set_prating(variant, chess960, wr)
    await bplayer.set_prating(variant, chess960, br)

    wrdiff = int(round(wr.mu - white_rating.mu, 0))
    p0 = {"e": white_rating, "d": wrdiff}

    brdiff = int(round(br.mu - black_rating.mu, 0))
    p1 = {"e": black_rating, "d": brdiff}

    return (p0, p1)


class Puzzle:
    def __init__(self, db, puzzle_data):
        self.db = db
        self.puzzle_data = puzzle_data
        self.puzzleId = puzzle_data["_id"]
        self.perf = puzzle_data.get("perf", DEFAULT_PERF)

    def get_rating(self, variant: str, chess960: bool) -> Rating:
        gl = self.perf["gl"]
        la = self.perf["la"]
        return gl2.create_rating(gl["r"], gl["d"], gl["v"], la)

    async def set_prating(self, _variant: str, _chess960: bool, rating: Rating):
        gl = {"r": rating.mu, "d": rating.phi, "v": rating.sigma}
        la = datetime.now(timezone.utc)
        nb = self.perf.get("nb", 0)
        self.perf = {
            "gl": gl,
            "la": la,
            "nb": nb + 1,
        }

        if self.db is not None:
            await self.db.puzzle.find_one_and_update(
                {"_id": self.puzzleId}, {"$set": {"perf": self.perf}}
            )

    async def set_played(self):
        if self.db is not None:
            await self.db.puzzle.find_one_and_update(
                {"_id": self.puzzleId}, {"$set": {"played": self.puzzle_data.get("played", 0) + 1}}
            )
