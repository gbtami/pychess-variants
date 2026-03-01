from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict, dataclass
from typing import Any

from pymongo import AsyncMongoClient

from settings import MONGO_DB_NAME, MONGO_HOST
from variants import get_server_variant

GAME_PAGE_SIZE = 12


@dataclass
class ExplainSummary:
    query_name: str
    n_returned: int | None
    total_keys_examined: int | None
    total_docs_examined: int | None
    execution_time_ms: int | None
    stages: list[str]
    indexes: list[str]
    has_sort_stage: bool
    has_collscan_stage: bool
    error: str | None = None


def _walk_plan(node: Any, stages: list[str], indexes: set[str]) -> None:
    if isinstance(node, dict):
        stage = node.get("stage")
        if isinstance(stage, str):
            stages.append(stage)
        index_name = node.get("indexName")
        if isinstance(index_name, str):
            indexes.add(index_name)
        for value in node.values():
            _walk_plan(value, stages, indexes)
    elif isinstance(node, list):
        for item in node:
            _walk_plan(item, stages, indexes)


def _build_filter(
    kind: str, profile_id: str, session_user: str, variant: str, is_960: bool
) -> dict[str, Any]:
    if kind == "all":
        filter_cond: dict[str, Any] = {"us": profile_id}
    elif kind == "win":
        filter_cond = {
            "$or": [
                {"r": "a", "us.0": profile_id},
                {"r": "b", "us.1": profile_id},
            ]
        }
    elif kind == "loss":
        filter_cond = {
            "$or": [
                {"r": "a", "us.1": profile_id},
                {"r": "b", "us.0": profile_id},
            ]
        }
    elif kind == "rated":
        filter_cond = {"$or": [{"y": 1, "us.1": profile_id}, {"y": 1, "us.0": profile_id}]}
    elif kind == "playing":
        filter_cond = {
            "$and": [
                {"$or": [{"c": True, "us.1": profile_id}, {"c": True, "us.0": profile_id}]},
                {"s": 0},
            ]
        }
    elif kind == "me":
        filter_cond = {
            "$or": [
                {"us.0": session_user, "us.1": profile_id},
                {"us.1": session_user, "us.0": profile_id},
            ]
        }
    elif kind == "perf":
        server_variant = get_server_variant(variant, is_960)
        filter_cond = {
            "$or": [
                {"v": server_variant.code, "z": int(is_960), "us.1": profile_id},
                {"v": server_variant.code, "z": int(is_960), "us.0": profile_id},
            ]
        }
    else:
        raise ValueError(f"Unknown query kind: {kind}")

    return {"$and": [filter_cond, {"y": {"$ne": 2}}]}


async def _run_explain(
    db: Any,
    *,
    query_name: str,
    filter_cond: dict[str, Any],
    page: int,
    page_size: int,
    verbosity: str,
    max_time_ms: int,
    client_timeout_sec: float,
) -> ExplainSummary:
    command = {
        "find": "game",
        "filter": filter_cond,
        "sort": {"d": -1},
        "skip": page * page_size,
        "limit": page_size,
        "maxTimeMS": max_time_ms,
    }
    try:
        explain = await asyncio.wait_for(
            db.command("explain", command, verbosity=verbosity),
            timeout=client_timeout_sec,
        )
    except Exception as exc:  # pragma: no cover - diagnostic script
        return ExplainSummary(
            query_name=query_name,
            n_returned=None,
            total_keys_examined=None,
            total_docs_examined=None,
            execution_time_ms=None,
            stages=[],
            indexes=[],
            has_sort_stage=False,
            has_collscan_stage=False,
            error=str(exc),
        )

    query_planner = explain.get("queryPlanner", {})
    winning_plan = query_planner.get("winningPlan", {})
    execution_stats = explain.get("executionStats", {})

    stages: list[str] = []
    indexes: set[str] = set()
    _walk_plan(winning_plan, stages, indexes)

    return ExplainSummary(
        query_name=query_name,
        n_returned=execution_stats.get("nReturned"),
        total_keys_examined=execution_stats.get("totalKeysExamined"),
        total_docs_examined=execution_stats.get("totalDocsExamined"),
        execution_time_ms=execution_stats.get("executionTimeMillis"),
        stages=stages,
        indexes=sorted(indexes),
        has_sort_stage="SORT" in stages,
        has_collscan_stage="COLLSCAN" in stages,
        error=None,
    )


async def _tv_explain(
    db: Any,
    profile_id: str,
    *,
    verbosity: str,
    max_time_ms: int,
    client_timeout_sec: float,
) -> ExplainSummary:
    command = {
        "find": "game",
        "filter": {"us": profile_id},
        # Match server/utils.tv_game_user() query shape.
        "sort": {"d": -1},
        "limit": 1,
        "maxTimeMS": max_time_ms,
    }
    try:
        explain = await asyncio.wait_for(
            db.command("explain", command, verbosity=verbosity),
            timeout=client_timeout_sec,
        )
    except Exception as exc:  # pragma: no cover - diagnostic script
        return ExplainSummary(
            query_name="tv_game_user",
            n_returned=None,
            total_keys_examined=None,
            total_docs_examined=None,
            execution_time_ms=None,
            stages=[],
            indexes=[],
            has_sort_stage=False,
            has_collscan_stage=False,
            error=str(exc),
        )

    query_planner = explain.get("queryPlanner", {})
    winning_plan = query_planner.get("winningPlan", {})
    execution_stats = explain.get("executionStats", {})

    stages: list[str] = []
    indexes: set[str] = set()
    _walk_plan(winning_plan, stages, indexes)

    return ExplainSummary(
        query_name="tv_game_user",
        n_returned=execution_stats.get("nReturned"),
        total_keys_examined=execution_stats.get("totalKeysExamined"),
        total_docs_examined=execution_stats.get("totalDocsExamined"),
        execution_time_ms=execution_stats.get("executionTimeMillis"),
        stages=stages,
        indexes=sorted(indexes),
        has_sort_stage="SORT" in stages,
        has_collscan_stage="COLLSCAN" in stages,
        error=None,
    )


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only Mongo diagnostics for game/profile query performance. "
            "Run with PYTHONPATH=server."
        )
    )
    parser.add_argument("--profile-id", required=True, help="Profile username, e.g. chezz")
    parser.add_argument(
        "--session-user",
        default=None,
        help="Session username used for the '/me' query shape (defaults to --profile-id)",
    )
    parser.add_argument(
        "--variant",
        default="chess",
        help="Variant key for '/perf/{variant}' query shape (default: chess)",
    )
    parser.add_argument(
        "--variant-960",
        action="store_true",
        help="Use 960 variant flag when building '/perf/{variant}' query shape",
    )
    parser.add_argument("--page", type=int, default=0, help="Page number for paginated queries")
    parser.add_argument("--page-size", type=int, default=GAME_PAGE_SIZE, help="Page size to test")
    parser.add_argument(
        "--verbosity",
        default="queryPlanner",
        choices=("queryPlanner", "executionStats", "allPlansExecution"),
        help=(
            "Mongo explain verbosity. Use 'queryPlanner' for fast index diagnostics; "
            "'executionStats' can be slow on unindexed queries."
        ),
    )
    parser.add_argument(
        "--max-time-ms",
        type=int,
        default=5000,
        help="Per-query server maxTimeMS for the explained find command (default: 5000).",
    )
    parser.add_argument(
        "--client-timeout-sec",
        type=float,
        default=10.0,
        help="Client-side timeout for each explain command (default: 10s).",
    )
    parser.add_argument(
        "--mongo-host",
        default=MONGO_HOST,
        help="Mongo connection URI (defaults to settings.MONGO_HOST)",
    )
    parser.add_argument(
        "--mongo-db",
        default=MONGO_DB_NAME,
        help="Mongo database name (defaults to settings.MONGO_DB_NAME)",
    )
    parser.add_argument(
        "--json-out",
        default=None,
        help="Optional path to write all results as JSON",
    )
    args = parser.parse_args()

    session_user = args.session_user or args.profile_id

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    db = client[args.mongo_db]

    try:
        game_collection = db.game
        indexes = []
        indexes_cursor = await game_collection.list_indexes()
        async for idx in indexes_cursor:
            indexes.append(idx)

        print("== game indexes ==")
        for idx in indexes:
            print(json.dumps(idx, default=str, sort_keys=True))

        print("\n== explain summaries ==")
        query_kinds = ("all", "win", "loss", "rated", "playing", "me", "perf")
        summaries: list[ExplainSummary] = []
        for kind in query_kinds:
            filter_cond = _build_filter(
                kind=kind,
                profile_id=args.profile_id,
                session_user=session_user,
                variant=args.variant,
                is_960=args.variant_960,
            )
            summary = await _run_explain(
                db,
                query_name=kind,
                filter_cond=filter_cond,
                page=args.page,
                page_size=args.page_size,
                verbosity=args.verbosity,
                max_time_ms=args.max_time_ms,
                client_timeout_sec=args.client_timeout_sec,
            )
            summaries.append(summary)

        tv_summary = await _tv_explain(
            db,
            args.profile_id,
            verbosity=args.verbosity,
            max_time_ms=args.max_time_ms,
            client_timeout_sec=args.client_timeout_sec,
        )
        summaries.append(tv_summary)

        for summary in summaries:
            print(json.dumps(asdict(summary), sort_keys=True))

        if args.json_out:
            payload = {
                "profile_id": args.profile_id,
                "session_user": session_user,
                "variant": args.variant,
                "variant_960": args.variant_960,
                "page": args.page,
                "page_size": args.page_size,
                "verbosity": args.verbosity,
                "max_time_ms": args.max_time_ms,
                "client_timeout_sec": args.client_timeout_sec,
                "indexes": indexes,
                "summaries": [asdict(s) for s in summaries],
            }
            with open(args.json_out, "w", encoding="utf-8") as fp:
                json.dump(payload, fp, ensure_ascii=True, indent=2, default=str, sort_keys=True)
            print(f"\nWrote JSON diagnostics to {args.json_out}")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
