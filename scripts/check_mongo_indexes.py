from __future__ import annotations

import argparse
import asyncio
import json
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
)
from pymongo import AsyncMongoClient
from settings import MONGO_DB_NAME, MONGO_HOST

INDEXES_BY_ID = {f"{spec.collection}.{spec.name}": spec for spec in ALL_KNOWN_INDEXES}


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
        f"[{position}/{total}] creating {_index_id(spec)} {_format_key(spec.key)}"
        f"{_expected_options(spec)} ...",
        flush=True,
    )


def _after_create(position: int, total: int, result: IndexCreationResult) -> None:
    del position, total
    print(
        f"    created as {result.created_name!r} in {result.duration_ms / 1000.0:.1f} seconds",
        flush=True,
    )


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
    print(f"MongoDB schema check for database {database_name!r} ({mode})")
    for collection_name in missing_collections:
        print(f"[MISSING ] collection {collection_name}")
    for result in checks:
        spec = result.spec
        print(
            f"[{result.status.upper():8}] {_index_id(spec)} "
            f"{_format_key(spec.key)}{_expected_options(spec)} - {result.details}"
        )

    missing_indexes = sum(result.status == "missing" for result in checks)
    conflicting_indexes = sum(result.status == "conflict" for result in checks)
    ok_indexes = len(checks) - missing_indexes - conflicting_indexes
    missing_collection_names = set(missing_collections)
    skipped_indexes = sum(spec.collection in missing_collection_names for spec in selected_specs)
    print(
        f"Collections: {len(required_names) - len(missing_collections)} present, "
        f"{len(missing_collections)} missing"
    )
    print(
        f"Indexes: {ok_indexes} ok, {missing_indexes} missing, "
        f"{conflicting_indexes} conflicting, {skipped_indexes} not checked"
    )
    if create_mode:
        print(f"Created {created_count} missing index(es).")

    if missing_collections or missing_indexes or conflicting_indexes:
        if create_mode:
            print("Unresolved schema issues remain; no conflicting index was changed.")
        else:
            print("No changes were made. Create or repair the reported schema separately.")
        return 1

    if create_mode:
        print("All selected indexes are present; no conflicting index was changed.")
    else:
        print("All expected collections and indexes are present. No changes were made.")
    return 0


async def async_main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
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
