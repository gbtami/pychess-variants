from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

from bson import BSON
from fairy import FairyBoard

from study.builder import StudyChapterDraft
from study.constants import (
    STUDY_CHAPTER_MAX_BSON_BYTES,
    STUDY_CHAPTER_NAME_MAX_LENGTH,
    STUDY_MAX_CHAPTERS,
    STUDY_NAME_MAX_LENGTH,
)
from study.models import Study, StudyChapter, make_chapter, make_study


class StudyStorageError(ValueError):
    pass


def _clean_name(value: object, *, fallback: str, max_length: int) -> str:
    name = str(value or "").strip()
    if not name:
        return fallback
    return name[:max_length]


def _ensure_chapter_size(chapter: StudyChapter) -> None:
    try:
        encoded_size = len(BSON.encode(chapter.to_document()))
    except Exception as exc:
        raise StudyStorageError("Study chapter could not be encoded") from exc
    if encoded_size > STUDY_CHAPTER_MAX_BSON_BYTES:
        raise StudyStorageError("Study chapter is too large")


async def studies_for_owner(app_state: Any, owner: str, *, limit: int = 100) -> list[Study]:
    cursor = app_state.db.study.find({"owner": owner}).sort("updatedAt", -1).limit(limit)
    return [Study.from_document(doc) async for doc in cursor]


async def load_owned_study(app_state: Any, study_id: str, owner: str) -> Study | None:
    doc = await app_state.db.study.find_one({"_id": study_id, "owner": owner})
    return Study.from_document(doc) if doc is not None else None


async def load_owned_chapter(
    app_state: Any,
    study_id: str,
    chapter_id: str,
    owner: str,
) -> StudyChapter | None:
    doc = await app_state.db.study_chapter.find_one(
        {"_id": chapter_id, "studyId": study_id, "owner": owner}
    )
    return StudyChapter.from_document(doc) if doc is not None else None


async def chapter_previews(app_state: Any, study_id: str) -> list[dict[str, object]]:
    cursor = app_state.db.study_chapter.find(
        {"studyId": study_id},
        projection={"_id": 1, "name": 1, "order": 1},
    ).sort("order", 1)
    return [
        {"id": str(doc["_id"]), "name": str(doc["name"]), "order": int(doc["order"])}
        async for doc in cursor
    ]


async def create_study_from_draft(
    app_state: Any,
    owner: str,
    draft: StudyChapterDraft,
    *,
    name: str | None = None,
) -> tuple[Study, StudyChapter]:
    study = await make_study(
        app_state.db.study,
        owner=owner,
        name=_clean_name(name, fallback=f"{owner}'s Study", max_length=STUDY_NAME_MAX_LENGTH),
        source=draft.source,
    )
    chapter = await make_chapter(
        app_state.db.study_chapter,
        study_id=study.id,
        owner=owner,
        variant=draft.variant,
        chess960=draft.chess960,
        initial_fen=draft.initial_fen,
        orientation=draft.orientation,
        variant_ini=draft.variant_ini,
        root=draft.root,
        order=1,
        name=_clean_name(
            draft.name, fallback="Chapter 1", max_length=STUDY_CHAPTER_NAME_MAX_LENGTH
        ),
    )
    _ensure_chapter_size(chapter)
    study = replace(study, current_chapter=chapter.id)
    await app_state.db.study.insert_one(study.to_document())
    try:
        await app_state.db.study_chapter.insert_one(chapter.to_document())
    except Exception:
        await app_state.db.study.delete_one({"_id": study.id, "owner": owner})
        raise
    return study, chapter


async def create_study_with_chapter(
    app_state: Any,
    owner: str,
    *,
    name: str | None = None,
) -> tuple[Study, StudyChapter]:
    return await create_study_from_draft(
        app_state,
        owner,
        StudyChapterDraft(
            variant="chess",
            initial_fen=FairyBoard.start_fen("chess"),
        ),
        name=name,
    )


async def add_chapter_from_draft(
    app_state: Any,
    study: Study,
    draft: StudyChapterDraft,
) -> StudyChapter:
    count = await app_state.db.study_chapter.count_documents({"studyId": study.id})
    if count >= STUDY_MAX_CHAPTERS:
        raise StudyStorageError(f"A Study can have at most {STUDY_MAX_CHAPTERS} chapters")

    last = await app_state.db.study_chapter.find_one(
        {"studyId": study.id}, projection={"order": 1}, sort=[("order", -1)]
    )
    order = int(last["order"]) + 1 if last is not None else 1
    chapter = await make_chapter(
        app_state.db.study_chapter,
        study_id=study.id,
        owner=study.owner,
        variant=draft.variant,
        chess960=draft.chess960,
        initial_fen=draft.initial_fen,
        orientation=draft.orientation,
        variant_ini=draft.variant_ini,
        root=draft.root,
        order=order,
        name=_clean_name(
            draft.name, fallback=f"Chapter {order}", max_length=STUDY_CHAPTER_NAME_MAX_LENGTH
        ),
    )
    _ensure_chapter_size(chapter)
    await app_state.db.study_chapter.insert_one(chapter.to_document())
    now = datetime.now(UTC)
    await app_state.db.study.update_one(
        {"_id": study.id, "owner": study.owner},
        {"$set": {"currentChapter": chapter.id, "updatedAt": now}, "$inc": {"revision": 1}},
    )
    return chapter


async def add_chapter(
    app_state: Any,
    study: Study,
    source_chapter: StudyChapter,
    *,
    name: str | None = None,
) -> StudyChapter:
    count = await app_state.db.study_chapter.count_documents({"studyId": study.id})
    if count >= STUDY_MAX_CHAPTERS:
        raise StudyStorageError(f"A Study can have at most {STUDY_MAX_CHAPTERS} chapters")

    last = await app_state.db.study_chapter.find_one(
        {"studyId": study.id}, projection={"order": 1}, sort=[("order", -1)]
    )
    order = int(last["order"]) + 1 if last is not None else 1
    chapter = await make_chapter(
        app_state.db.study_chapter,
        study_id=study.id,
        owner=study.owner,
        variant=source_chapter.variant,
        chess960=source_chapter.chess960,
        initial_fen=source_chapter.initial_fen,
        orientation=source_chapter.orientation,
        variant_ini=source_chapter.variant_ini,
        order=order,
        name=_clean_name(
            name, fallback=f"Chapter {order}", max_length=STUDY_CHAPTER_NAME_MAX_LENGTH
        ),
    )
    await app_state.db.study_chapter.insert_one(chapter.to_document())
    now = datetime.now(UTC)
    await app_state.db.study.update_one(
        {"_id": study.id, "owner": study.owner},
        {"$set": {"currentChapter": chapter.id, "updatedAt": now}, "$inc": {"revision": 1}},
    )
    return chapter


async def select_chapter(app_state: Any, study: Study, chapter: StudyChapter) -> None:
    if study.current_chapter == chapter.id:
        return
    await app_state.db.study.update_one(
        {"_id": study.id, "owner": study.owner},
        {"$set": {"currentChapter": chapter.id}, "$inc": {"revision": 1}},
    )


async def rename_study(app_state: Any, study: Study, name: object) -> str:
    clean = _clean_name(name, fallback=study.name, max_length=STUDY_NAME_MAX_LENGTH)
    now = datetime.now(UTC)
    await app_state.db.study.update_one(
        {"_id": study.id, "owner": study.owner},
        {"$set": {"name": clean, "updatedAt": now}, "$inc": {"revision": 1}},
    )
    return clean


async def rename_chapter(app_state: Any, chapter: StudyChapter, name: object) -> str:
    clean = _clean_name(name, fallback=chapter.name, max_length=STUDY_CHAPTER_NAME_MAX_LENGTH)
    now = datetime.now(UTC)
    await app_state.db.study_chapter.update_one(
        {"_id": chapter.id, "studyId": chapter.study_id, "owner": chapter.owner},
        {"$set": {"name": clean, "updatedAt": now}},
    )
    await app_state.db.study.update_one(
        {"_id": chapter.study_id, "owner": chapter.owner},
        {"$set": {"updatedAt": now}, "$inc": {"revision": 1}},
    )
    return clean


async def delete_chapter(app_state: Any, study: Study, chapter: StudyChapter) -> str:
    docs = (
        await app_state.db.study_chapter.find(
            {"studyId": study.id}, projection={"_id": 1, "order": 1}
        )
        .sort("order", 1)
        .to_list(length=STUDY_MAX_CHAPTERS + 1)
    )
    if len(docs) <= 1:
        raise StudyStorageError("A Study must keep at least one chapter")

    await app_state.db.study_chapter.delete_one(
        {"_id": chapter.id, "studyId": study.id, "owner": study.owner}
    )
    deleted_index = next(index for index, doc in enumerate(docs) if str(doc["_id"]) == chapter.id)
    remaining = [doc for doc in docs if str(doc["_id"]) != chapter.id]
    for order, doc in enumerate(remaining, start=1):
        if int(doc["order"]) != order:
            await app_state.db.study_chapter.update_one(
                {"_id": doc["_id"]}, {"$set": {"order": order}}
            )

    if study.current_chapter == chapter.id or not study.current_chapter:
        adjacent_index = min(deleted_index, len(remaining) - 1)
        next_chapter_id = str(remaining[adjacent_index]["_id"])
    else:
        next_chapter_id = study.current_chapter
    now = datetime.now(UTC)
    await app_state.db.study.update_one(
        {"_id": study.id, "owner": study.owner},
        {"$set": {"currentChapter": next_chapter_id, "updatedAt": now}, "$inc": {"revision": 1}},
    )
    return next_chapter_id


async def delete_study(app_state: Any, study: Study) -> None:
    await app_state.db.study_chapter.delete_many({"studyId": study.id, "owner": study.owner})
    await app_state.db.study.delete_one({"_id": study.id, "owner": study.owner})
