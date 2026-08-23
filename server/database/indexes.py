from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from time import monotonic
from typing import Any, Literal

from database.schema import IndexKey, IndexSpec

IndexStatus = Literal["ok", "missing", "conflict"]
BeforeCreateCallback = Callable[[int, int, IndexSpec], None]
AfterCreateCallback = Callable[[int, int, "IndexCreationResult"], None]


@dataclass(frozen=True)
class IndexCheckResult:
    spec: IndexSpec
    status: IndexStatus
    details: str


@dataclass(frozen=True)
class IndexCreationResult:
    spec: IndexSpec
    created_name: str
    duration_ms: float


def index_key(index_doc: dict[str, Any]) -> IndexKey:
    """Return a normalized key pattern from a MongoDB listIndexes document."""
    key_doc = index_doc.get("key", {})
    weights = index_doc.get("weights")
    if (
        isinstance(key_doc, Mapping)
        and set(key_doc) == {"_fts", "_ftsx"}
        and isinstance(weights, Mapping)
    ):
        return tuple((str(field), "text") for field in weights)
    return tuple(
        (str(field), int(direction) if isinstance(direction, int) else str(direction))
        for field, direction in key_doc.items()
    )


def index_options_match(spec: IndexSpec, index_doc: dict[str, Any]) -> bool:
    return (
        bool(index_doc.get("sparse", False)) == spec.sparse
        and bool(index_doc.get("unique", False)) == spec.unique
        and index_doc.get("expireAfterSeconds") == spec.expire_after_seconds
        and index_doc.get("partialFilterExpression") == spec.partial_filter
        and not bool(index_doc.get("hidden", False))
        and "collation" not in index_doc
    )


def describe_index(index_doc: dict[str, Any]) -> dict[str, Any]:
    definition: dict[str, Any] = {"key": list(index_key(index_doc))}
    for option in (
        "sparse",
        "unique",
        "expireAfterSeconds",
        "partialFilterExpression",
        "hidden",
        "collation",
    ):
        if option in index_doc:
            definition[option] = index_doc[option]
    return definition


def check_collection_indexes(
    specs: Sequence[IndexSpec], actual_indexes: Sequence[dict[str, Any]]
) -> list[IndexCheckResult]:
    by_name = {
        index_doc.get("name"): index_doc
        for index_doc in actual_indexes
        if isinstance(index_doc.get("name"), str)
    }
    results: list[IndexCheckResult] = []

    for spec in specs:
        named = by_name.get(spec.name)
        if named is not None and index_key(named) == spec.key and index_options_match(spec, named):
            results.append(IndexCheckResult(spec, "ok", "exact match"))
            continue

        if named is not None:
            results.append(
                IndexCheckResult(
                    spec,
                    "conflict",
                    f"expected name is used by {json.dumps(describe_index(named), sort_keys=True)}",
                )
            )
            continue

        equivalent = next(
            (
                index_doc
                for index_doc in actual_indexes
                if index_key(index_doc) == spec.key and index_options_match(spec, index_doc)
            ),
            None,
        )
        if equivalent is not None:
            results.append(
                IndexCheckResult(
                    spec,
                    "ok",
                    f"equivalent index exists as {equivalent.get('name')!r}",
                )
            )
            continue

        conflicting = next(
            (index_doc for index_doc in actual_indexes if index_key(index_doc) == spec.key),
            None,
        )
        if conflicting is not None:
            results.append(
                IndexCheckResult(
                    spec,
                    "conflict",
                    f"found {conflicting.get('name')!r} with "
                    f"{json.dumps(describe_index(conflicting), sort_keys=True)}",
                )
            )
        else:
            results.append(
                IndexCheckResult(
                    spec,
                    "missing",
                    "no index has the expected key and options",
                )
            )

    return results


async def load_indexes(collection: Any) -> list[dict[str, Any]]:
    cursor = await collection.list_indexes()
    return [index_doc async for index_doc in cursor]


async def audit_indexes(db: Any, specs: Sequence[IndexSpec]) -> list[IndexCheckResult]:
    actual_by_collection: dict[str, list[dict[str, Any]]] = {}
    results: list[IndexCheckResult] = []
    for spec in specs:
        if spec.collection not in actual_by_collection:
            actual_by_collection[spec.collection] = await load_indexes(db[spec.collection])
        results.extend(check_collection_indexes((spec,), actual_by_collection[spec.collection]))
    return results


async def create_missing_indexes(
    db: Any,
    checks: Sequence[IndexCheckResult],
    *,
    before_create: BeforeCreateCallback | None = None,
    after_create: AfterCreateCallback | None = None,
) -> list[IndexCreationResult]:
    """Create only indexes confirmed missing; never alter conflicts."""
    missing = [check for check in checks if check.status == "missing"]
    results: list[IndexCreationResult] = []
    total = len(missing)

    for position, check in enumerate(missing, start=1):
        if before_create is not None:
            before_create(position, total, check.spec)
        started = monotonic()
        created_name = await db[check.spec.collection].create_index(
            list(check.spec.key), **check.spec.pymongo_options()
        )
        result = IndexCreationResult(
            spec=check.spec,
            created_name=created_name,
            duration_ms=(monotonic() - started) * 1000.0,
        )
        results.append(result)
        if after_create is not None:
            after_create(position, total, result)

    return results
