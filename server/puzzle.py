import json
import logging
import random
from datetime import datetime, timezone
from functools import partial

from aiohttp import web
import aiohttp_session
import pymongo

import pyffish as sf

from const import VARIANTS
from glicko2.glicko2 import MU, gl2, Rating, rating

log = logging.getLogger(__name__)

PUZZLE_PAGE_SIZE = 12

# variants having 0 puzzle so far
NO_PUZZLE_VARIANTS = (
    "3check",
    "placement",
    "sittuyin",
    "minishogi",
    "kyotoshogi",
    "gorogoroplus",
    "manchu",
    "minixiangqi",
    "grandhouse",
    "shinobi",
    "shinobiplus",
)

PUZZLE_VARIANTS = [v for v in VARIANTS if (not v.endswith("960") and (v not in NO_PUZZLE_VARIANTS))]

NOT_VOTED = 0
UP = 1
DOWN = -1

ID_SEPARATOR = ":"


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
    puzzle = await request.app["db"].puzzle.find_one({"_id": puzzleId})
    return puzzle


async def get_daily_puzzle(request):
    if request.app["db"] is None:
        return empty_puzzle("chess")

    db_collections = await request.app["db"].list_collection_names()
    if "puzzle" not in db_collections:
        return empty_puzzle("chess")

    today = datetime.now(timezone.utc).date().isoformat()
    daily_puzzle_ids = request.app["daily_puzzle_ids"]
    if today in daily_puzzle_ids:
        puzzle = await get_puzzle(request, daily_puzzle_ids[today])
    else:
        user = request.app["users"]["PyChess"]

        # skip previous daily puzzles
        user.puzzles = {puzzle_id: NOT_VOTED for puzzle_id in daily_puzzle_ids.values()}
        print(user.puzzles)

        puzzleId = "0"
        while puzzleId == "0":
            # randomize daily puzzle variant
            user.puzzle_variant = random.choice(PUZZLE_VARIANTS)
            puzzle = await next_puzzle(request, user)
            if puzzle.get("eval") != "#1":
                puzzleId = puzzle["_id"]

        await request.app["db"].dailypuzzle.insert_one({"_id": today, "puzzleId": puzzleId})
        request.app["daily_puzzle_ids"][today] = puzzle["_id"]

    return puzzle


async def next_puzzle(request, user):
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
                "type": doc["type"],
                "eval": doc["eval"],
                "site": doc.get("site", ""),
                "gameId": doc.get("gameId", ""),
                "played": doc.get("played", 0),
            }
            break

    if puzzle is None:
        puzzle = empty_puzzle(variant)

    return puzzle


async def puzzle_complete(request):
    db = request.app["db"]
    puzzleId = request.match_info.get("puzzleId")

    puzzle_data = await get_puzzle(request, puzzleId)
    puzzle = Puzzle(db, puzzle_data)

    await puzzle.set_played()

    users = request.app["users"]
    session = await aiohttp_session.get_session(request)
    user = users[session.get("user_name")]

    if user.anon:
        return web.json_response({})

    post_data = await request.post()

    roundId = "%s%s%s" % (user.username, ID_SEPARATOR, puzzleId)
    date = datetime.now(timezone.utc).date().strftime("%y%m%d")
    win = post_data["win"] == "true"

    already_played = False
    try:
        await db.puzzle_round.insert_one({"_id": roundId, "win": win, "date": date})
        user.puzzles[puzzleId] = NOT_VOTED
    except pymongo.errors.DuplicateKeyError:
        already_played = True
        await db.puzzle_round.find_one_and_update({"_id": roundId}, {"$set": {"win": win}})

    if already_played:
        return web.json_response({})

    rated = post_data["rated"] == "true"
    if not rated:
        return web.json_response({})

    variant = post_data["variant"]
    chess960 = False  # TODO: add chess960 to xxx960 variant puzzles
    color = post_data["color"]

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
    puzzleId = request.match_info.get("puzzleId")
    post_data = await request.post()
    good = post_data["vote"] == "true"
    up_or_down = "up" if good else "down"

    users = request.app["users"]
    session = await aiohttp_session.get_session(request)
    user = users[session.get("user_name")]

    if user.puzzles.get("puzzleId"):
        return web.json_response({})
    else:
        user.puzzles["puzzleId"] = UP if good else DOWN

    db = request.app["db"]
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
    if len(puzzle_eval) > 0 and puzzle_eval[0] == "#":
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


async def get_user_puzzles(request):
    db = request.app["db"]
    profileId = request.match_info.get("profileId")

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    if profileId != session_user:
        return web.json_response({})

    filter_cond = {}
    # print("URL", request.rel_url)
    filter_cond = {"_id": {"$gt": "%s%s" % (profileId, ID_SEPARATOR)}}

    page_num = request.rel_url.query.get("p", 0)

    puzzle_round_docs = {}

    cursor = db.puzzle_round.find(filter_cond)
    cursor.sort("date", -1).skip(int(page_num) * PUZZLE_PAGE_SIZE).limit(PUZZLE_PAGE_SIZE)

    async for doc in cursor:
        puzzle_id = doc["_id"].split(ID_SEPARATOR)[1]
        puzzle_round_docs[puzzle_id] = doc

    cursor = db.puzzle.find({"_id": {"$in": list(puzzle_round_docs.keys())}})
    async for doc in cursor:
        puzzle_round_docs[doc["_id"]]["variant"] = doc["variant"]
        puzzle_round_docs[doc["_id"]]["fen"] = doc["fen"]

    return web.json_response(
        list(puzzle_round_docs.values()), dumps=partial(json.dumps, default=datetime.isoformat)
    )
