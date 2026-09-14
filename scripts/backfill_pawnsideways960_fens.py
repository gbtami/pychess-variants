"""Recover missing initial FENs from historical pawnsideways960 games.

The old community-variant implementation randomized ``pawnsideways960`` by
using the built-in ``pawnsideways`` variant with Chess960 enabled, but did not
persist the resulting initial FEN.  This script identifies the unique
Chess960 starting position that reproduces the stored final FEN.

    PYTHONPATH=server uv run python scripts/backfill_pawnsideways960_fens.py
    PYTHONPATH=server uv run python scripts/backfill_pawnsideways960_fens.py --apply
    PYTHONPATH=server uv run python scripts/backfill_pawnsideways960_fens.py --game-id 0xGANyqX

The default is a dry run.  ``--apply`` only updates documents where ``if`` is
absent, null, or empty; existing initial FENs are never overwritten.
Recoverable documents receive both ``if`` and ``z: 1`` because the old bug
also persisted the Chess960 flag as false.
"""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Iterator, Mapping
from typing import Any

from compress import decode_move_standard
from fairy import FairyBoard
from fairy.chess960 import CHESS960_FENS
from fairy.fairy_board import FILES
from pymongo import AsyncMongoClient
from settings import MONGO_DB_NAME, MONGO_HOST

VARIANT = "pawnsideways960"
OLD_ENGINE_VARIANT = "pawnsideways"
MISSING_INITIAL_FEN = {
    "$or": [
        {"if": {"$exists": False}},
        {"if": None},
        {"if": ""},
    ]
}


class ReconstructionError(RuntimeError):
    """The starting position cannot be recovered safely."""


def _old_chess960_fens() -> Iterator[str]:
    default_fen = FairyBoard.start_fen(OLD_ENGINE_VARIANT)
    fields = default_fen.split()
    if len(fields) < 6:
        raise ReconstructionError(f"unexpected default FEN: {default_fen!r}")

    placement, bracket, pockets = fields[0].partition("[")
    rows = placement.split("/")
    if len(rows) != 8 or rows[0] != "rnbqkbnr" or rows[-1] != "RNBQKBNR" or bracket or pockets:
        raise ReconstructionError(
            f"pawnsideways no longer has the standard 8x8 starting layout; got {default_fen!r}"
        )

    for rank in CHESS960_FENS:
        candidate_rows = [*rows]
        candidate_rows[0] = rank
        candidate_rows[-1] = rank.upper()
        candidate_fields = [*fields]
        candidate_fields[0] = "/".join(candidate_rows)
        rook_files = FILES[rank.rindex("r")] + FILES[rank.index("r")]
        candidate_fields[2] = rook_files.upper() + rook_files
        yield " ".join(candidate_fields)


def _moves(doc: Mapping[str, Any]) -> list[str]:
    raw_moves = doc.get("m")
    if not isinstance(raw_moves, list) or not raw_moves:
        raise ReconstructionError("document has no move list")
    if not all(isinstance(move, str) for move in raw_moves):
        raise ReconstructionError("move list contains a non-string value")
    try:
        return [decode_move_standard(move) for move in raw_moves]
    except (IndexError, KeyError) as exc:
        raise ReconstructionError(f"invalid compressed move list: {exc}") from exc


def reconstruct_initial_fen(doc: Mapping[str, Any]) -> str:
    """Return the unique historical start FEN matching a game document."""
    final_fen = doc.get("f")
    if not isinstance(final_fen, str) or not final_fen:
        raise ReconstructionError("document has no final FEN")

    moves = _moves(doc)
    matches: list[str] = []
    for initial_fen in _old_chess960_fens():
        board = FairyBoard(OLD_ENGINE_VARIANT, initial_fen, chess960=True)
        if all(board.push(move, raise_on_error=False) for move in moves) and board.fen == final_fen:
            matches.append(initial_fen)
            if len(matches) > 1:
                raise ReconstructionError("more than one Chess960 start reproduces the final FEN")

    if not matches:
        raise ReconstructionError("no Chess960 start reproduces the final FEN")
    return matches[0]


def _query(variant: str, game_ids: list[str]) -> dict[str, Any]:
    query: dict[str, Any] = {"v": variant, **MISSING_INITIAL_FEN}
    if game_ids:
        query["_id"] = {"$in": game_ids}
    return query


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--game-id", action="append", default=[])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--mongo-host", default=MONGO_HOST)
    parser.add_argument("--db", default=MONGO_DB_NAME)
    args = parser.parse_args()

    client = AsyncMongoClient(args.mongo_host)
    try:
        collection = client[args.db].game
        query = _query(VARIANT, args.game_id)
        processed = repaired = applied = skipped = 0
        async for doc in collection.find(query).sort("_id", 1):
            processed += 1
            game_id = str(doc.get("_id", "?"))
            try:
                initial_fen = reconstruct_initial_fen(doc)
            except ReconstructionError as exc:
                skipped += 1
                print(f"SKIP {game_id}: {exc}", flush=True)
            else:
                repaired += 1
                if args.apply:
                    result = await collection.update_one(
                        {"_id": doc["_id"], "v": VARIANT, **MISSING_INITIAL_FEN},
                        {"$set": {"if": initial_fen, "z": 1}},
                    )
                    if result.modified_count == 1:
                        applied += 1
                        print(f"UPDATED {game_id}: z=1 if={initial_fen}", flush=True)
                    else:
                        print(f"UNCHANGED {game_id}: document changed during scan", flush=True)
                else:
                    print(f"WOULD UPDATE {game_id}: z=1 if={initial_fen}", flush=True)

            if args.limit > 0 and processed >= args.limit:
                break

        action = "Applied" if args.apply else "Dry-run"
        print(
            f"{action}: scanned={processed} recoverable={repaired} "
            f"updated={applied} skipped={skipped}"
        )
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
