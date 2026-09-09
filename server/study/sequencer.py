from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState


def _cleanup_study_sequence(app_state: PychessGlobalAppState, study_id: str) -> None:
    """Drop an idle sequencer only when no room or queued operation can still use it."""

    if app_state.study_mutation_lock_refs.get(study_id, 0) != 0:
        return
    if app_state.study_sockets.get(study_id):
        return
    app_state.study_mutation_locks.pop(study_id, None)
    app_state.study_mutation_lock_refs.pop(study_id, None)


@asynccontextmanager
async def sequence_study(
    app_state: PychessGlobalAppState,
    study_id: str,
) -> AsyncIterator[None]:
    """Serialize operations that must observe one authoritative Study state.

    The reference count is incremented synchronously before awaiting the lock. This
    keeps a queued waiter attached to the same lock even if the last websocket leaves
    while that waiter is suspended.
    """

    lock = app_state.study_mutation_locks.setdefault(study_id, asyncio.Lock())
    app_state.study_mutation_lock_refs[study_id] = (
        app_state.study_mutation_lock_refs.get(study_id, 0) + 1
    )
    try:
        async with lock:
            yield
    finally:
        remaining = app_state.study_mutation_lock_refs.get(study_id, 1) - 1
        if remaining > 0:
            app_state.study_mutation_lock_refs[study_id] = remaining
        else:
            app_state.study_mutation_lock_refs.pop(study_id, None)
        _cleanup_study_sequence(app_state, study_id)


def cleanup_study_sequence(app_state: PychessGlobalAppState, study_id: str) -> None:
    """Clean up a Study sequencer after room membership changes."""

    _cleanup_study_sequence(app_state, study_id)
