from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from newid import id8

from study.constants import (
    STUDY_ANALYSIS_MAX_PER_DAY,
    STUDY_ANALYSIS_MAX_PER_WEEK,
    STUDY_CREATION_CREDITS_PER_24H,
)

STUDY_CREATION_WINDOW = timedelta(hours=24)
STUDY_ANALYSIS_DAY_WINDOW = timedelta(days=1)
STUDY_ANALYSIS_WEEK_WINDOW = timedelta(days=7)


@dataclass(frozen=True, slots=True)
class StudyQuotaExceeded(Exception):
    code: str
    message: str
    retry_after_seconds: int

    def __str__(self) -> str:
        return self.message


def _entry_at(entry: object) -> datetime | None:
    if not isinstance(entry, dict):
        return None
    value = entry.get("at")
    return value if isinstance(value, datetime) else None


def _entry_cost(entry: object) -> int:
    if not isinstance(entry, dict):
        return 0
    value = entry.get("cost", 1)
    return value if isinstance(value, int) and value > 0 else 1


def _is_after(value: datetime, cutoff: datetime) -> bool:
    try:
        return value > cutoff
    except TypeError:
        return False


def _retry_after_seconds(
    entries: list[dict[str, object]], cutoff: datetime, credits_to_free: int
) -> int:
    relevant = sorted(
        (at, _entry_cost(entry))
        for entry in entries
        if (at := _entry_at(entry)) is not None and _is_after(at, cutoff)
    )
    freed = 0
    for expires_from, entry_cost in relevant:
        freed += entry_cost
        if freed >= credits_to_free:
            return max(1, int((expires_from - cutoff).total_seconds()) + 1)
    return 1


async def _claim_history_slot(
    app_state: Any,
    username: str,
    *,
    field: str,
    now: datetime,
    keep_window: timedelta,
    checks: tuple[tuple[timedelta, int, str, str], ...],
    cost: int = 1,
) -> str:
    if app_state.db is None:
        raise RuntimeError("Study quota requires database access")
    if cost < 1:
        raise ValueError("Study quota cost must be positive")

    claim_id = id8()
    keep_cutoff = now - keep_window
    while True:
        account = await app_state.db.user.find_one({"_id": username}, {field: 1})
        if account is None:
            raise StudyQuotaExceeded(
                "account_missing",
                "Study actions require a registered account.",
                1,
            )

        raw_history = account.get(field)
        history_exists = field in account
        current_history = list(raw_history) if isinstance(raw_history, list) else []
        recent_history = [
            entry
            for entry in current_history
            if isinstance(entry, dict)
            and (at := _entry_at(entry)) is not None
            and _is_after(at, keep_cutoff)
        ]

        for window, limit, code, message in checks:
            if limit < 1:
                raise RuntimeError(f"Study quota limit for {field} must be at least 1")
            cutoff = now - window
            used = sum(
                _entry_cost(entry)
                for entry in recent_history
                if (at := _entry_at(entry)) is not None and _is_after(at, cutoff)
            )
            if used + cost > limit:
                raise StudyQuotaExceeded(
                    code,
                    message,
                    _retry_after_seconds(
                        recent_history,
                        cutoff,
                        used + cost - limit,
                    ),
                )

        new_history = [*recent_history, {"at": now, "id": claim_id, "cost": cost}]
        quota_filter: dict[str, object] = {"_id": username}
        quota_filter[field] = raw_history if history_exists else {"$exists": False}
        result = await app_state.db.user.update_one(
            quota_filter,
            {"$set": {field: new_history}},
        )
        if result.modified_count == 1:
            return claim_id
        # Another request changed this account's quota history between our read
        # and write. Re-read and either claim the remaining capacity or reject.


async def _release_history_slot(app_state: Any, username: str, field: str, claim_id: str) -> None:
    if app_state.db is None:
        return
    await app_state.db.user.update_one(
        {"_id": username},
        {"$pull": {field: {"id": claim_id}}},
    )


async def claim_study_creation_slot(
    app_state: Any,
    username: str,
    *,
    cost: int = 1,
    now: datetime | None = None,
) -> str:
    requested_at = now or datetime.now(UTC)
    return await _claim_history_slot(
        app_state,
        username,
        field="studyCreationHistory",
        now=requested_at,
        keep_window=STUDY_CREATION_WINDOW,
        checks=(
            (
                STUDY_CREATION_WINDOW,
                STUDY_CREATION_CREDITS_PER_24H,
                "creation_limit",
                "Study creation limit reached. Please try again later.",
            ),
        ),
        cost=cost,
    )


async def release_study_creation_slot(app_state: Any, username: str, claim_id: str) -> None:
    await _release_history_slot(app_state, username, "studyCreationHistory", claim_id)


async def claim_study_analysis_slot(
    app_state: Any,
    username: str,
    *,
    now: datetime | None = None,
) -> str:
    requested_at = now or datetime.now(UTC)
    return await _claim_history_slot(
        app_state,
        username,
        field="studyAnalysisHistory",
        now=requested_at,
        keep_window=STUDY_ANALYSIS_WEEK_WINDOW,
        checks=(
            (
                STUDY_ANALYSIS_DAY_WINDOW,
                STUDY_ANALYSIS_MAX_PER_DAY,
                "daily_limit",
                "You have reached the daily Study analysis limit.",
            ),
            (
                STUDY_ANALYSIS_WEEK_WINDOW,
                STUDY_ANALYSIS_MAX_PER_WEEK,
                "weekly_limit",
                "You have reached the weekly Study analysis limit.",
            ),
        ),
    )


async def release_study_analysis_slot(app_state: Any, username: str, claim_id: str) -> None:
    await _release_history_slot(app_state, username, "studyAnalysisHistory", claim_id)
