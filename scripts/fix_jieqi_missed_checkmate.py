from __future__ import annotations

import argparse
import asyncio
from typing import Any

from compress import R2C, decode_move_standard
from const import MATE, STARTED
from convert import zero2grand
from fairy import FairyBoard
from pymongo import AsyncMongoClient
from settings import MONGO_DB_NAME, MONGO_HOST

GAME_ID = "EIZenrcV"
VARIANT_CODE = "V"
EXPECTED_PLY = 27
EXPECTED_FEN = (
    "2b~a~1a~b~n~r~/2n1k1R2/n1r1bN3/8p~/9/1aB1P4/8P~/1C~N1P2C~1/9/1N~B~1K1B~pR~ b - - 0 1"
)
EXPECTED_STATUS = int(STARTED)
EXPECTED_RESULT = R2C["*"]
CORRECT_STATUS = int(MATE)
CORRECT_RESULT = R2C["1-0"]


def verify_checkmate(doc: dict[str, Any]) -> None:
    """Confirm the stored Jieqi history reaches this checked, terminal position."""
    if doc.get("v") != VARIANT_CODE:
        raise RuntimeError(f"Game {GAME_ID} is no longer a Jieqi game.")
    if doc.get("f") != EXPECTED_FEN:
        raise RuntimeError(f"Game {GAME_ID} no longer has the expected final position.")

    encoded_moves = doc.get("m")
    if not isinstance(encoded_moves, list) or len(encoded_moves) != EXPECTED_PLY:
        raise RuntimeError(f"Game {GAME_ID} no longer has the expected {EXPECTED_PLY}-ply history.")
    black_pieces = doc.get("bj")
    white_pieces = doc.get("wj")
    if not isinstance(black_pieces, str) or len(black_pieces) != 15:
        raise RuntimeError("Game is missing its 15-piece black Jieqi mapping.")
    if not isinstance(white_pieces, str) or len(white_pieces) != 15:
        raise RuntimeError("Game is missing its 15-piece white Jieqi mapping.")

    board = FairyBoard("jieqi")
    board.set_jieqi_initial_pieces(black_pieces, white_pieces)
    for ply, encoded_move in enumerate(encoded_moves, start=1):
        if not isinstance(encoded_move, str):
            raise TypeError(f"Game has a non-string move at ply {ply}.")
        move = zero2grand(decode_move_standard(encoded_move))
        if not board.push(move, raise_on_error=False):
            raise RuntimeError(f"Stored move {move} is invalid at ply {ply}.")

    if board.fen != EXPECTED_FEN:
        raise RuntimeError("Replayed Jieqi moves do not reproduce the expected final position.")
    if not board.is_checked():
        raise RuntimeError("The side to move is not in check; refusing to record checkmate.")
    if board.has_legal_move():
        raise RuntimeError("The side to move has a legal reply; refusing to record checkmate.")


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            f"Record game {GAME_ID} as checkmate (1-0). Dry-run by default; "
            "use --apply to write status and result to MongoDB."
        )
    )
    parser.add_argument("--mongo-host", default=MONGO_HOST)
    parser.add_argument("--mongo-db", default=MONGO_DB_NAME)
    parser.add_argument("--apply", action="store_true", help="Write the correction to MongoDB.")
    args = parser.parse_args()

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    collection = client[args.mongo_db].game
    try:
        doc = await collection.find_one({"_id": GAME_ID})
        if doc is None:
            raise RuntimeError(f"Game {GAME_ID} was not found.")

        if doc.get("s") == CORRECT_STATUS and doc.get("r") == CORRECT_RESULT:
            print(f"Game {GAME_ID} is already recorded as checkmate, 1-0.")
            return

        if doc.get("s") != EXPECTED_STATUS or doc.get("r") != EXPECTED_RESULT:
            raise RuntimeError(
                f"Game status/result changed (s={doc.get('s')!r}, r={doc.get('r')!r}); "
                "refusing to overwrite it."
            )

        verify_checkmate(doc)
        print(f"Verified {GAME_ID}: checkmate, white wins (1-0).")
        print(f"Mode: {'apply' if args.apply else 'dry-run'}")
        if not args.apply:
            print("No changes written. Rerun with --apply to update MongoDB.")
            return

        result = await collection.update_one(
            {
                "_id": GAME_ID,
                "v": VARIANT_CODE,
                "f": EXPECTED_FEN,
                "m": doc["m"],
                "s": EXPECTED_STATUS,
                "r": EXPECTED_RESULT,
            },
            {"$set": {"s": CORRECT_STATUS, "r": CORRECT_RESULT}},
        )
        if result.matched_count != 1 or result.modified_count != 1:
            raise RuntimeError("Game changed after verification; no correction was applied.")
        print(f"Updated {GAME_ID}: status=MATE, result=1-0.")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
