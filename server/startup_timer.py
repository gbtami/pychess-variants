from __future__ import annotations

from contextlib import contextmanager
import logging
from time import perf_counter
from typing import Iterator


class StartupTimer:
    """Collect and log startup phase timings in a consistent format."""

    def __init__(self, logger: logging.Logger, scope: str) -> None:
        self._logger = logger
        self._scope = scope
        self._started_at = perf_counter()
        self._phases: list[tuple[str, float]] = []
        self._logger.debug("[startup] %s started", self._scope)

    @contextmanager
    def phase(self, label: str) -> Iterator[None]:
        started_at = perf_counter()
        self._logger.debug("[startup] %s -> %s started", self._scope, label)
        try:
            yield
        finally:
            elapsed_ms = (perf_counter() - started_at) * 1000.0
            self._phases.append((label, elapsed_ms))
            self._logger.debug(
                "[startup] %s -> %s finished in %.1f ms",
                self._scope,
                label,
                elapsed_ms,
            )

    def log_summary(self) -> None:
        total_ms = (perf_counter() - self._started_at) * 1000.0
        if len(self._phases) == 0:
            self._logger.info("[startup] %s completed in %.1f ms", self._scope, total_ms)
            return

        summary = ", ".join(
            f"{label}={elapsed_ms:.1f} ms ({elapsed_ms / total_ms * 100:.1f}%)"
            for label, elapsed_ms in sorted(self._phases, key=lambda item: item[1], reverse=True)
        )
        self._logger.info(
            "[startup] %s completed in %.1f ms | %s",
            self._scope,
            total_ms,
            summary,
        )
