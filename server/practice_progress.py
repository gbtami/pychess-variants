from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

PRACTICE_PROGRESS_COLLECTION = "practice"


@dataclass(frozen=True, slots=True)
class PracticeChapterProgress:
    completed_at: datetime
    best_moves: int | None = None


@dataclass(frozen=True, slots=True)
class PracticeStudyProgress:
    completed_chapter_ids: tuple[str, ...]
    done: int
    total: int

    @property
    def state(self) -> str:
        if self.done == 0:
            return "untouched"
        if self.done >= self.total:
            return "done"
        return "ongoing"


@dataclass(frozen=True, slots=True)
class PracticeProgress:
    chapters: dict[str, PracticeChapterProgress]

    def is_complete(self, study_id: str, chapter_id: str) -> bool:
        return practice_progress_key(study_id, chapter_id) in self.chapters

    def for_study(self, study_id: str, chapter_ids: tuple[str, ...]) -> PracticeStudyProgress:
        completed = tuple(
            chapter_id for chapter_id in chapter_ids if self.is_complete(study_id, chapter_id)
        )
        return PracticeStudyProgress(
            completed_chapter_ids=completed,
            done=len(completed),
            total=len(chapter_ids),
        )

    def first_unfinished(self, study_id: str, chapter_ids: tuple[str, ...]) -> str | None:
        for chapter_id in chapter_ids:
            if not self.is_complete(study_id, chapter_id):
                return chapter_id
        return None


EMPTY_PRACTICE_PROGRESS = PracticeProgress(chapters={})


def practice_progress_key(study_id: str, chapter_id: str) -> str:
    return f"{study_id}:{chapter_id}"


def _as_utc_datetime(value: object) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _chapter_progress(raw: object) -> PracticeChapterProgress | None:
    if not isinstance(raw, dict):
        return None
    completed_at = _as_utc_datetime(raw.get("completedAt"))
    if completed_at is None:
        return None
    raw_best_moves = raw.get("bestMoves")
    best_moves = (
        raw_best_moves
        if isinstance(raw_best_moves, int)
        and not isinstance(raw_best_moves, bool)
        and raw_best_moves >= 0
        else None
    )
    return PracticeChapterProgress(completed_at=completed_at, best_moves=best_moves)


async def load_practice_progress(app_state: Any, username: str) -> PracticeProgress:
    doc = await app_state.db[PRACTICE_PROGRESS_COLLECTION].find_one({"_id": username})
    if doc is None:
        return EMPTY_PRACTICE_PROGRESS

    raw_chapters = doc.get("chapters")
    if not isinstance(raw_chapters, dict):
        return EMPTY_PRACTICE_PROGRESS

    chapters: dict[str, PracticeChapterProgress] = {}
    for key, raw in raw_chapters.items():
        if not isinstance(key, str):
            continue
        progress = _chapter_progress(raw)
        if progress is not None:
            chapters[key] = progress
    return PracticeProgress(chapters=chapters)


async def record_practice_completion(
    app_state: Any,
    username: str,
    study_id: str,
    chapter_id: str,
    *,
    best_moves: int | None = None,
) -> None:
    now = datetime.now(UTC)
    key = practice_progress_key(study_id, chapter_id)
    update: dict[str, dict[str, object]] = {
        "$set": {
            f"chapters.{key}.completedAt": now,
            "updatedAt": now,
        },
        "$setOnInsert": {"createdAt": now},
    }
    if best_moves is not None:
        update["$min"] = {f"chapters.{key}.bestMoves": max(0, best_moves)}
    await app_state.db[PRACTICE_PROGRESS_COLLECTION].update_one(
        {"_id": username}, update, upsert=True
    )


async def reset_practice_chapters(
    app_state: Any,
    username: str,
    chapter_keys: tuple[str, ...],
) -> None:
    if not chapter_keys:
        return
    now = datetime.now(UTC)
    await app_state.db[PRACTICE_PROGRESS_COLLECTION].update_one(
        {"_id": username},
        {
            "$unset": {f"chapters.{key}": "" for key in chapter_keys},
            "$set": {"updatedAt": now},
        },
    )
