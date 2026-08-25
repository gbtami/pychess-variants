from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections.abc import Sequence

from database.indexes import (
    IndexCheckResult,
    IndexCreationResult,
    audit_indexes,
    create_missing_indexes,
)
from database.schema import (
    ALL_KNOWN_INDEXES,
    COLLECTIONS,
    INDEXES,
    LEGACY_OPTIONAL_COLLECTIONS,
    LEGACY_OPTIONAL_INDEXES,
    IndexKey,
    IndexSpec,
    StartupPolicy,
)
from pymongo import AsyncMongoClient
from settings import MONGO_DB_NAME, MONGO_HOST

INDEXES_BY_ID = {f"{spec.collection}.{spec.name}": spec for spec in ALL_KNOWN_INDEXES}

ANSI_RESET = "\033[0m"
ANSI_BOLD = "\033[1m"
ANSI_DIM = "\033[2m"
ANSI_RED = "\033[31m"
ANSI_GREEN = "\033[32m"
ANSI_YELLOW = "\033[33m"
ANSI_MAGENTA = "\033[35m"
ANSI_CYAN = "\033[36m"

_COLOR_ENABLED = False


def _configure_color(mode: str) -> None:
    global _COLOR_ENABLED
    if mode == "always":
        _COLOR_ENABLED = True
    elif mode == "never":
        _COLOR_ENABLED = False
    else:
        _COLOR_ENABLED = (
            sys.stdout.isatty() and "NO_COLOR" not in os.environ and os.getenv("TERM") != "dumb"
        )


def _paint(text: str, *styles: str) -> str:
    if not _COLOR_ENABLED:
        return text
    return f"{''.join(styles)}{text}{ANSI_RESET}"


def _format_key(key: IndexKey) -> str:
    return "{" + ", ".join(f"{field!r}: {direction!r}" for field, direction in key) + "}"


def _expected_options(spec: IndexSpec) -> str:
    options: list[str] = []
    if spec.sparse:
        options.append("sparse=true")
    if spec.unique:
        options.append("unique=true")
    if spec.expire_after_seconds is not None:
        options.append(f"expireAfterSeconds={spec.expire_after_seconds}")
    if spec.partial_filter is not None:
        options.append(f"partialFilterExpression={json.dumps(spec.partial_filter, sort_keys=True)}")
    return f" ({', '.join(options)})" if options else ""


def _index_id(spec: IndexSpec) -> str:
    return f"{spec.collection}.{spec.name}"


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    collection_choices = tuple(spec.name for spec in COLLECTIONS)
    parser = argparse.ArgumentParser(
        description=(
            "Check the MongoDB collections and indexes declared by the server. "
            "The command is read-only unless --create-missing is explicitly supplied. "
            "Run with PYTHONPATH=server."
        )
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
        "--create-missing",
        action="store_true",
        help="Create missing indexes in the explicit scope; never drops or replaces indexes",
    )
    parser.add_argument(
        "--color",
        choices=("auto", "always", "never"),
        default="auto",
        help="Colorize output (default: auto, which honors NO_COLOR and output redirection)",
    )
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument(
        "--collection",
        choices=collection_choices,
        action="append",
        dest="collections",
        help="Only check/create this required collection; repeat to select several",
    )
    scope.add_argument(
        "--index",
        action="append",
        dest="index_ids",
        metavar="COLLECTION.INDEX",
        help="Only check/create this qualified index; repeat to select several",
    )
    scope.add_argument(
        "--all-indexes",
        action="store_true",
        help="Explicitly select every required collection and index",
    )
    args = parser.parse_args(argv)

    invalid_index_ids = [
        index_id for index_id in args.index_ids or () if index_id not in INDEXES_BY_ID
    ]
    if invalid_index_ids:
        parser.error(
            "unknown --index value(s): %s" % ", ".join(repr(value) for value in invalid_index_ids)
        )
    if args.create_missing and not (args.collections or args.index_ids or args.all_indexes):
        parser.error(
            "--create-missing requires an explicit --index, --collection, or --all-indexes scope"
        )
    return args


def _selected_schema(args: argparse.Namespace) -> tuple[list[str], list[IndexSpec]]:
    if args.index_ids:
        specs = [INDEXES_BY_ID[index_id] for index_id in dict.fromkeys(args.index_ids)]
        collection_names = list(dict.fromkeys(spec.collection for spec in specs))
        return collection_names, specs

    if args.collections:
        selected_names = set(args.collections)
        collection_names = [spec.name for spec in COLLECTIONS if spec.name in selected_names]
        specs = [spec for spec in INDEXES if spec.collection in selected_names]
        return collection_names, specs

    return [spec.name for spec in COLLECTIONS], list(INDEXES)


def _before_create(position: int, total: int, spec: IndexSpec) -> None:
    print(
        _paint(
            f"[{position}/{total}] creating {_index_id(spec)} {_format_key(spec.key)}"
            f"{_expected_options(spec)} ...",
            ANSI_CYAN,
        ),
        flush=True,
    )


def _after_create(position: int, total: int, result: IndexCreationResult) -> None:
    del position, total
    print(
        _paint(
            f"    created as {result.created_name!r} in {result.duration_ms / 1000.0:.1f} seconds",
            ANSI_GREEN,
        ),
        flush=True,
    )


def _format_index_result(result: IndexCheckResult) -> str:
    spec = result.spec
    status = f"[{result.status.upper():8}]"
    line = (
        f"{status} {_index_id(spec)} "
        f"{_format_key(spec.key)}{_expected_options(spec)} - {result.details}"
    )
    if result.status == "conflict":
        return _paint(line, ANSI_BOLD, ANSI_RED)
    if result.status == "missing":
        if spec.startup_policy is StartupPolicy.MANUAL:
            return _paint(line, ANSI_BOLD, ANSI_MAGENTA)
        return _paint(line, ANSI_BOLD, ANSI_YELLOW)
    return line.replace(status, _paint(status, ANSI_GREEN), 1)


def _print_report(
    *,
    database_name: str,
    create_mode: bool,
    required_names: Sequence[str],
    missing_collections: Sequence[str],
    checks: Sequence[IndexCheckResult],
    selected_specs: Sequence[IndexSpec],
    created_count: int,
) -> int:
    mode = "create missing indexes" if create_mode else "read-only"
    print(
        _paint(
            f"MongoDB schema check for database {database_name!r} ({mode})",
            ANSI_BOLD,
            ANSI_CYAN,
        )
    )
    for collection_name in missing_collections:
        print(_paint(f"[MISSING ] collection {collection_name}", ANSI_BOLD, ANSI_YELLOW))
    for result in checks:
        print(_format_index_result(result))

    missing_indexes = sum(result.status == "missing" for result in checks)
    missing_manual_indexes = sum(
        result.status == "missing" and result.spec.startup_policy is StartupPolicy.MANUAL
        for result in checks
    )
    conflicting_indexes = sum(result.status == "conflict" for result in checks)
    ok_indexes = len(checks) - missing_indexes - conflicting_indexes
    missing_collection_names = set(missing_collections)
    skipped_indexes = sum(spec.collection in missing_collection_names for spec in selected_specs)
    collection_summary = (
        f"Collections: {len(required_names) - len(missing_collections)} present, "
        f"{len(missing_collections)} missing"
    )
    print(
        _paint(
            collection_summary,
            ANSI_YELLOW if missing_collections else ANSI_GREEN,
        )
    )
    index_summary = f"Indexes: {_paint(f'{ok_indexes} ok', ANSI_GREEN)}, "
    if missing_indexes:
        index_summary += _paint(f"{missing_indexes} missing", ANSI_YELLOW)
    else:
        index_summary += _paint("0 missing", ANSI_GREEN)
    index_summary += ", "
    if conflicting_indexes:
        index_summary += _paint(f"{conflicting_indexes} conflicting", ANSI_BOLD, ANSI_RED)
    else:
        index_summary += _paint("0 conflicting", ANSI_GREEN)
    index_summary += f", {_paint(f'{skipped_indexes} not checked', ANSI_DIM)}"
    print(index_summary)
    if missing_manual_indexes:
        print(
            _paint(
                f"Manual indexes: {missing_manual_indexes} missing",
                ANSI_BOLD,
                ANSI_MAGENTA,
            )
        )
    if create_mode:
        print(_paint(f"Created {created_count} missing index(es).", ANSI_CYAN))

    if missing_collections or missing_indexes or conflicting_indexes:
        if create_mode:
            message = "Unresolved schema issues remain; no conflicting index was changed."
        else:
            message = "No changes were made. Create or repair the reported schema separately."
        styles = (ANSI_BOLD, ANSI_RED) if conflicting_indexes else (ANSI_BOLD, ANSI_YELLOW)
        print(_paint(message, *styles))
        return 1

    if create_mode:
        message = "All selected indexes are present; no conflicting index was changed."
    else:
        message = "All expected collections and indexes are present. No changes were made."
    print(_paint(message, ANSI_BOLD, ANSI_GREEN))
    return 0


async def async_main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    _configure_color(args.color)
    required_names, selected_specs = _selected_schema(args)
    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    created_count = 0

    try:
        db = client[args.mongo_db]
        actual_names = set(await db.list_collection_names())

        if args.collections is None and args.index_ids is None and not args.all_indexes:
            optional_names = [
                spec.name for spec in LEGACY_OPTIONAL_COLLECTIONS if spec.name in actual_names
            ]
            selected_specs.extend(
                spec for spec in LEGACY_OPTIONAL_INDEXES if spec.collection in optional_names
            )
        else:
            optional_names = []

        missing_collections = [name for name in required_names if name not in actual_names]
        present_names = (set(required_names) - set(missing_collections)) | set(optional_names)
        checkable_specs = [spec for spec in selected_specs if spec.collection in present_names]
        checks = await audit_indexes(db, checkable_specs)

        if args.create_missing:
            creation_results = await create_missing_indexes(
                db,
                checks,
                before_create=_before_create,
                after_create=_after_create,
            )
            created_count = len(creation_results)
            checks = await audit_indexes(db, checkable_specs)
    finally:
        await client.close()

    return _print_report(
        database_name=args.mongo_db,
        create_mode=args.create_missing,
        required_names=required_names,
        missing_collections=missing_collections,
        checks=checks,
        selected_specs=selected_specs,
        created_count=created_count,
    )


if __name__ == "__main__":
    raise SystemExit(asyncio.run(async_main()))
