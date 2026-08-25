from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Any

from database.indexes import (
    IndexCheckResult,
    IndexCreationResult,
    audit_indexes,
    create_missing_indexes,
)
from database.schema import (
    COLLECTIONS,
    INDEXES,
    LEGACY_OPTIONAL_INDEXES,
    CollectionSpec,
    IndexSpec,
    StartupPolicy,
)


class StartupMode(Enum):
    FRESH = "fresh"
    LOCAL = "local"
    PRODUCTION = "production"


@dataclass(frozen=True)
class StartupSchemaResult:
    mode: StartupMode
    initial_collections: frozenset[str]
    created_collections: tuple[str, ...]
    created_indexes: tuple[IndexCreationResult, ...]


def _conflict_message(checks: list[IndexCheckResult]) -> str:
    conflicts = [check for check in checks if check.status == "conflict"]
    return "; ".join(
        f"{check.spec.collection}.{check.spec.name}: {check.details}" for check in conflicts
    )


async def ensure_indexes(db: Any, specs: Sequence[IndexSpec]) -> tuple[IndexCreationResult, ...]:
    if not specs:
        return ()

    checks = await audit_indexes(db, specs)
    conflict_message = _conflict_message(checks)
    if conflict_message:
        raise RuntimeError(f"Conflicting MongoDB indexes: {conflict_message}")
    return tuple(await create_missing_indexes(db, checks))


async def _create_collection(db: Any, spec: CollectionSpec) -> None:
    options = spec.pymongo_options()
    try:
        await db.create_collection(spec.name, **options)
    except NotImplementedError:
        if not spec.fallback_to_default_options or not options:
            raise
        await db.create_collection(spec.name)


async def prepare_database_schema(db: Any, *, local_development: bool) -> StartupSchemaResult:
    """Create collections and the startup-safe subset of declared indexes."""
    initial_collections = frozenset(await db.list_collection_names())
    required_names = {spec.name for spec in COLLECTIONS}
    if initial_collections.isdisjoint(required_names):
        mode = StartupMode.FRESH
    elif local_development:
        mode = StartupMode.LOCAL
    else:
        mode = StartupMode.PRODUCTION

    created_collections: list[str] = []
    actual_collections = set(initial_collections)
    for spec in COLLECTIONS:
        if spec.name in actual_collections:
            continue
        await _create_collection(db, spec)
        actual_collections.add(spec.name)
        created_collections.append(spec.name)

    created_names = set(created_collections)
    if mode in (StartupMode.FRESH, StartupMode.LOCAL):
        startup_specs = list(INDEXES)
    else:
        startup_specs = [
            spec
            for spec in INDEXES
            if spec.startup_policy is StartupPolicy.BLOCKING or spec.collection in created_names
        ]

    startup_specs.extend(
        spec for spec in LEGACY_OPTIONAL_INDEXES if spec.collection in initial_collections
    )
    created_indexes = await ensure_indexes(db, startup_specs)
    return StartupSchemaResult(
        mode=mode,
        initial_collections=initial_collections,
        created_collections=tuple(created_collections),
        created_indexes=created_indexes,
    )


async def ensure_after_startup_indexes(
    db: Any, *, delay_seconds: float
) -> tuple[IndexCreationResult, ...]:
    specs = [spec for spec in INDEXES if spec.startup_policy is StartupPolicy.AFTER_STARTUP]
    checks = await audit_indexes(db, specs)
    conflict_message = _conflict_message(checks)
    if conflict_message:
        raise RuntimeError(f"Conflicting MongoDB indexes: {conflict_message}")
    if any(check.status == "missing" for check in checks):
        await asyncio.sleep(delay_seconds)
    return tuple(await create_missing_indexes(db, checks))
