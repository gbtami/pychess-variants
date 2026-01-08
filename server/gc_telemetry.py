from __future__ import annotations

import asyncio
import gc
import logging
import os
from typing import Callable, Optional

log = logging.getLogger(__name__)


def _parse_bool(value: str) -> bool:
    """Parse a bool from env-style strings to avoid fragile comparisons."""
    return value.lower() in ("1", "true", "yes")


# These settings are read once at import time so the behavior is stable
# throughout the process lifetime and does not depend on reloading settings.
GC_STATS_INTERVAL = int(os.getenv("GC_STATS_INTERVAL", "0"))
GC_STATS_FORCE_COLLECT = _parse_bool(os.getenv("GC_STATS_FORCE_COLLECT", ""))
GC_STATS_WARN_RATIO = float(os.getenv("GC_STATS_WARN_RATIO", "0.9"))
GC_STATS_WARN_STREAK = int(os.getenv("GC_STATS_WARN_STREAK", "3"))


async def _gc_stats_logger(shutdown_flag: Callable[[], bool]) -> None:
    """
    Periodically log GC counters and optionally force a collection.

    The warnings are designed to highlight a low-churn scenario where allocation
    counters hover near a threshold without triggering collections, which can
    leave cyclic garbage around indefinitely.
    """
    prev_collections = [None, None, None]
    warn_streaks = [0, 0, 0]

    while not shutdown_flag():
        await asyncio.sleep(GC_STATS_INTERVAL)
        counts = gc.get_count()
        thresholds = gc.get_threshold()
        stats = gc.get_stats()

        for gen in range(3):
            threshold = thresholds[gen]
            if threshold <= 0:
                warn_streaks[gen] = 0
                continue

            near_threshold = counts[gen] >= (threshold * GC_STATS_WARN_RATIO)
            no_collection = (
                prev_collections[gen] is not None
                and stats[gen]["collections"] == prev_collections[gen]
            )

            if near_threshold and no_collection:
                warn_streaks[gen] += 1
            else:
                warn_streaks[gen] = 0

            if warn_streaks[gen] >= GC_STATS_WARN_STREAK:
                # Log once per streak to avoid flooding logs; if the condition
                # persists, another streak will trigger later.
                log.warning(
                    "gc near threshold without collection gen=%s count=%s threshold=%s ratio=%.2f streak=%s",
                    gen,
                    counts[gen],
                    threshold,
                    GC_STATS_WARN_RATIO,
                    warn_streaks[gen],
                )
                warn_streaks[gen] = 0

        collected = None
        if GC_STATS_FORCE_COLLECT:
            # Optional forced collection makes it easy to see whether cycles
            # are accumulating; keep this off in production to avoid pauses.
            collected = gc.collect()

        log.info(
            "gc stats enabled=%s thresholds=%s counts=%s gen0=%s gen1=%s gen2=%s collected=%s",
            gc.isenabled(),
            thresholds,
            counts,
            stats[0],
            stats[1],
            stats[2],
            collected,
        )

        prev_collections = [
            stats[0]["collections"],
            stats[1]["collections"],
            stats[2]["collections"],
        ]


def start_gc_telemetry(shutdown_flag: Callable[[], bool]) -> Optional[asyncio.Task]:
    """
    Start the GC telemetry task if enabled.

    Returns the created task, or None when telemetry is disabled, so callers can
    store the reference if they want to manage task lifetime explicitly.
    """
    if GC_STATS_INTERVAL <= 0:
        return None
    return asyncio.create_task(_gc_stats_logger(shutdown_flag), name="gc-stats-logger")
