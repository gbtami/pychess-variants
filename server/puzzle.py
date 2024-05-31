from __future__ import annotations
import random
from datetime import datetime, timezone

import aiohttp_session
import pyffish as sf
from pymongo.errors import DuplicateKeyError
from aiohttp import web

from const import VARIANTS
from glicko2.glicko2 import MU, gl2, Rating, rating
from pychess_global_app_state_utils import get_app_state

# variants having 0 puzzle so far
NO_PUZZLE_VARIANTS = (
    "ataxx",
    "3check",
    "placement",
    "minishogi",
    "gorogoroplus",
    "manchu",
    "grandhouse",
    "shinobi",
    "shinobiplus",
    "cannonshogi",
)

PUZZLE_VARIANTS = [v for v in VARIANTS if (not v.endswith("960") and (v not in NO_PUZZLE_VARIANTS))]

NOT_VOTED = 0
UP = 1
DOWN = -1


def empty_puzzle(variant):
    puzzle = {
        "_id": "0",
        "variant": variant,
        "fen": sf.start_fen(variant),
        "type": "",
        "moves": "",
        "eval": "",
    }
    return puzzle


async def get_puzzle(request, puzzleId):
    puzzle = await get_app_state(request.app).db.puzzle.find_one({"_id": puzzleId})
    return puzzle


async def get_daily_puzzle(request):
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return empty_puzzle("chess")

    db_collections = await app_state.db.list_collection_names()
    if "puzzle" not in db_collections:
        return empty_puzzle("chess")

    today = datetime.now(timezone.utc).date().isoformat()
    daily_puzzle_ids = app_state.daily_puzzle_ids
    if today in daily_puzzle_ids:
        puzzle = await get_puzzle(request, daily_puzzle_ids[today])
    else:
        user = app_state.users["PyChess"]

        # skip previous daily puzzles
        user.puzzles = {puzzle_id: NOT_VOTED for puzzle_id in daily_puzzle_ids.values()}
        # print(user.puzzles)

        puzzleId = "0"
        while puzzleId == "0":
            # randomize daily puzzle variant
            user.puzzle_variant = random.choice(PUZZLE_VARIANTS)
            puzzle = await next_puzzle(request, user)
            if puzzle.get("eval") != "#1":
                puzzleId = puzzle["_id"]

        try:
            await app_state.db.dailypuzzle.insert_one({"_id": today, "puzzleId": puzzleId})
            app_state.daily_puzzle_ids[today] = puzzle["_id"]
        except DuplicateKeyError:
            # I have no idea how this can happen though...
            daily_puzzle_doc = await app_state.db.dailypuzzle.find_one({"_id": today})
            puzzleId = daily_puzzle_doc["puzzleId"]
            try:
                await app_state.db.dailypuzzle.insert_one({"_id": today, "puzzleId": puzzleId})
                app_state.daily_puzzle_ids[today] = puzzleId
                puzzle = await get_puzzle(request, puzzleId)
            except Exception:
                return empty_puzzle("chess")
    return puzzle


async def next_puzzle(request, user):
    app_state = get_app_state(request.app)
    skipped = list(user.puzzles.keys())
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

    if app_state.db is not None:
        pipeline = [
            {"$match": {"$and": filters}},
            {"$sample": {"size": 1}},
        ]
        cursor = app_state.db.puzzle.aggregate(pipeline)

        async for doc in cursor:
            puzzle = {
                "_id": doc["_id"],
                "variant": doc["variant"],
                "fen": doc["fen"],
                "moves": doc["moves"],
                "type": doc["type"],
                "eval": doc["eval"],
                "site": doc.get("site", ""),
                "gameId": doc.get("gameId", ""),
                "played": doc.get("played", 0),
                "lm": doc.get("lm", ""),
            }
            break

    if puzzle is None:
        puzzle = empty_puzzle(variant)

    return puzzle


async def puzzle_complete(request):
    app_state = get_app_state(request.app)
    puzzleId = request.match_info.get("puzzleId")
    post_data = await request.post()
    rated = post_data["rated"] == "true"

    puzzle_data = await get_puzzle(request, puzzleId)
    puzzle = Puzzle(app_state.db, puzzle_data)

    await puzzle.set_played()

    users = app_state.users
    session = await aiohttp_session.get_session(request)
    try:
        user = users[session.get("user_name")]
    except KeyError:
        return web.json_response({})

    if puzzleId in user.puzzles:
        return web.json_response({})
    else:
        user.puzzles[puzzleId] = NOT_VOTED

    if user.anon or (not rated):
        return web.json_response({})

    variant = post_data["variant"]
    chess960 = False  # TODO: add chess960 to xxx960 variant puzzles
    color = post_data["color"]
    win = post_data["win"] == "true"

    if color[0] == "w":
        wplayer, bplayer = user, puzzle
        white_rating = user.get_puzzle_rating(variant, chess960)
        black_rating = puzzle.get_rating(variant, chess960)
        result = "1-0" if win else "0-1"
    else:
        wplayer, bplayer = puzzle, user
        white_rating = puzzle.get_rating(variant, chess960)
        black_rating = user.get_puzzle_rating(variant, chess960)
        result = "0-1" if win else "1-0"

    ratings = await update_puzzle_ratings(
        wplayer, bplayer, white_rating, black_rating, variant, chess960, result
    )
    return web.json_response(ratings)


async def puzzle_vote(request):
    app_state = get_app_state(request.app)
    puzzleId = request.match_info.get("puzzleId")
    post_data = await request.post()
    good = post_data["vote"] == "true"
    up_or_down = "up" if good else "down"

    users = app_state.users
    session = await aiohttp_session.get_session(request)
    try:
        user = users[session.get("user_name")]
    except KeyError:
        return web.json_response({})

    if user.puzzles.get("puzzleId"):
        return web.json_response({})
    else:
        user.puzzles["puzzleId"] = UP if good else DOWN

    db = app_state.db
    if db is not None:
        await db.puzzle.find_one_and_update({"_id": puzzleId}, {"$inc": {up_or_down: 1}})

    return web.json_response({})


async def update_puzzle_ratings(
    wplayer, bplayer, white_rating, black_rating, variant, chess960, result
):
    if result == "1-0":
        (white_score, black_score) = (1.0, 0.0)
    elif result == "0-1":
        (white_score, black_score) = (0.0, 1.0)
    else:
        raise RuntimeError("game.result: unexpected result code")

    wr = gl2.rate(white_rating, [(white_score, black_rating)])
    br = gl2.rate(black_rating, [(black_score, white_rating)])

    await wplayer.set_puzzle_rating(variant, chess960, wr)
    await bplayer.set_puzzle_rating(variant, chess960, br)

    wrdiff = int(round(wr.mu - white_rating.mu, 0))
    brdiff = int(round(br.mu - black_rating.mu, 0))
    return (wrdiff, brdiff)


def default_puzzle_perf(puzzle_eval):
    perf = {
        "gl": {"r": rating.mu, "d": rating.phi, "v": rating.sigma},
        "la": datetime.now(timezone.utc),
        "nb": 0,
    }
    if len(puzzle_eval) > 1 and puzzle_eval[0] == "#":
        perf["gl"]["r"] = MU + 200 * (int(puzzle_eval[1:]) - 2)
    return perf


class Puzzle:
    def __init__(self, db, puzzle_data):
        self.db = db
        self.puzzle_data = puzzle_data
        self.puzzleId = puzzle_data["_id"]
        self.perf = puzzle_data.get("perf", default_puzzle_perf(puzzle_data["eval"]))

    def get_rating(self, variant: str, chess960: bool) -> Rating:
        gl = self.perf["gl"]
        la = self.perf["la"]
        return gl2.create_rating(gl["r"], gl["d"], gl["v"], la)

    async def set_puzzle_rating(self, _variant: str, _chess960: bool, rating: Rating):
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
