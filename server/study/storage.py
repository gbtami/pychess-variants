from __future__ import annotations

import re
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any, Literal, cast

from bson import BSON
from fairy import FairyBoard

from study.builder import StudyChapterDraft
from study.constants import (
    STUDY_CHAPTER_MAX_BSON_BYTES,
    STUDY_CHAPTER_NAME_MAX_LENGTH,
    STUDY_MAX_CHAPTERS,
    STUDY_MAX_MEMBERS,
    STUDY_NAME_MAX_LENGTH,
)
from study.models import (
    Study,
    StudyChapter,
    StudyMemberRole,
    StudyOrientation,
    StudySource,
    StudyVisibility,
    make_chapter,
    make_study,
    study_member_role,
    study_search_query_tokens,
    study_search_tokens,
    study_visibility,
)
from study.permissions import can_write_study


class StudyStorageError(ValueError):
    pass


STUDY_LIST_PAGE_SIZE = 16
StudyListOrder = Literal["updated", "newest", "oldest", "alphabetical"]
_STUDY_LIST_ORDERS = frozenset(("updated", "newest", "oldest", "alphabetical"))
_STUDY_SEARCH_USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]{3,20}$")
_STUDY_SEARCH_QUERY_MAX_LENGTH = 100


def study_list_order(value: object) -> StudyListOrder:
    order = str(value or "updated")
    if order not in _STUDY_LIST_ORDERS:
        return "updated"
    return cast(StudyListOrder, order)


def _study_list_sort(order: StudyListOrder) -> list[tuple[str, int]]:
    if order == "newest":
        return [("createdAt", -1), ("_id", -1)]
    if order == "oldest":
        return [("createdAt", 1), ("_id", 1)]
    if order == "alphabetical":
        return [("name", 1), ("_id", 1)]
    return [("updatedAt", -1), ("_id", 1)]


async def _studies_page(
    app_state: Any,
    query: dict[str, object],
    *,
    order: StudyListOrder = "updated",
    page: int = 1,
) -> dict[str, object]:
    page = max(1, page)
    total = await app_state.db.study.count_documents(query)
    pages = max(1, (total + STUDY_LIST_PAGE_SIZE - 1) // STUDY_LIST_PAGE_SIZE)
    page = min(page, pages)
    skip = (page - 1) * STUDY_LIST_PAGE_SIZE
    cursor = (
        app_state.db.study.find(query)
        .sort(_study_list_sort(order))
        .skip(skip)
        .limit(STUDY_LIST_PAGE_SIZE)
    )
    studies = [Study.from_document(doc) async for doc in cursor]
    return {
        "studies": studies,
        "order": order,
        "page": page,
        "pages": pages,
        "total": total,
        "prev_page": page - 1 if page > 1 else None,
        "next_page": page + 1 if page < pages else None,
    }


async def owner_studies_page(
    app_state: Any,
    owner: str,
    *,
    visibility: StudyVisibility | Literal["private-or-unlisted"] | None = None,
    order: StudyListOrder = "updated",
    page: int = 1,
) -> dict[str, object]:
    query: dict[str, object] = {"owner": owner}
    if visibility == "private-or-unlisted":
        query["visibility"] = {"$in": ["private", "unlisted"]}
    elif visibility is not None:
        query["visibility"] = visibility
    return await _studies_page(app_state, query, order=order, page=page)


async def contributed_studies_page(
    app_state: Any,
    username: str,
    *,
    order: StudyListOrder = "updated",
    page: int = 1,
) -> dict[str, object]:
    # memberIds is a bounded indexed array maintained with the member map.
    # Like Lichess's member list, this includes read-only memberships as well
    # as contributors; excluding owned Studies avoids duplicating My studies.
    return await _studies_page(
        app_state,
        {
            "owner": {"$ne": username},
            "$or": [
                {"memberIds": username},
                {
                    "memberIds": {"$exists": False},
                    f"members.{username}": {"$exists": True},
                },
            ],
        },
        order=order,
        page=page,
    )


async def favorite_studies_page(
    app_state: Any,
    username: str,
    *,
    order: StudyListOrder = "updated",
    page: int = 1,
) -> dict[str, object]:
    """Return Studies explicitly liked by ``username`` and still accessible.

    Lichess excludes owned Studies from this list because every new Study starts
    with the owner's like. Public and unlisted Studies remain link-accessible; a
    private favorite is listed only while the user is still a member.
    """

    return await _studies_page(
        app_state,
        {
            "$and": [
                {"owner": {"$ne": username}},
                {"likers": username},
                {
                    "$or": [
                        {"visibility": {"$in": ["public", "unlisted"]}},
                        _member_query(username),
                    ]
                },
            ]
        },
        order=order,
        page=page,
    )


def _study_search_parts(value: object) -> tuple[str, tuple[str, ...], str | None, str | None, bool]:
    clean_query = " ".join(str(value or "").split())[:_STUDY_SEARCH_QUERY_MAX_LENGTH]
    owner: str | None = None
    member: str | None = None
    free_parts: list[str] = []
    for part in clean_query.split():
        key, separator, raw_value = part.partition(":")
        if separator and key.casefold() in {"owner", "member"}:
            if _STUDY_SEARCH_USERNAME_RE.fullmatch(raw_value):
                if key.casefold() == "owner":
                    owner = raw_value
                else:
                    member = raw_value
            else:
                free_parts.append(part)
        else:
            free_parts.append(part)

    free_query = " ".join(free_parts)
    tokens = study_search_query_tokens(free_query)
    query_too_short = bool(free_query and not tokens and owner is None and member is None)
    return clean_query, tokens, owner, member, query_too_short


def _member_query(username: str) -> dict[str, object]:
    # New Study documents keep the bounded memberIds array indexed. The safe
    # dotted-field fallback preserves membership discovery for pre-Phase-5 docs.
    return {
        "$or": [
            {"memberIds": username},
            {
                "memberIds": {"$exists": False},
                f"members.{username}": {"$exists": True},
            },
        ]
    }


def _study_search_access_query(viewer: str | None) -> dict[str, object]:
    # Unlisted Studies are link-viewable, but must not become discoverable merely
    # because somebody searches for their chapter text. Only public Studies and
    # the viewer's own/member Studies belong in search results.
    if viewer is None:
        return {"visibility": "public"}
    return {
        "$or": [
            {"visibility": "public"},
            {"owner": viewer},
            _member_query(viewer),
        ]
    }


async def study_search_page(
    app_state: Any,
    *,
    q: str,
    viewer: str | None,
    order: StudyListOrder = "updated",
    page: int = 1,
) -> dict[str, object]:
    """Search discoverable Studies using text plus Lichess-style owner/member filters."""

    clean_query, tokens, owner, member, query_too_short = _study_search_parts(q)
    if query_too_short:
        return {
            "studies": [],
            "q": clean_query,
            "order": order,
            "page": 1,
            "pages": 1,
            "total": 0,
            "prev_page": None,
            "next_page": None,
            "query_too_short": True,
        }

    clauses: list[dict[str, object]] = [_study_search_access_query(viewer)]
    if owner is not None:
        clauses.append({"owner": owner})
    if member is not None:
        clauses.append(_member_query(member))
    for token in tokens:
        clauses.append({"searchTokens": token})

    # Empty /study/search requests behave like All studies rather than exposing
    # every private membership to an accidental blank search.
    if not clean_query:
        result = await public_studies_page(app_state, order=order, page=page)
    else:
        result = await _studies_page(
            app_state,
            {"$and": clauses},
            order=order,
            page=page,
        )
    result["q"] = clean_query
    result["query_too_short"] = False
    result["owner_filter"] = owner
    result["member_filter"] = member
    return result


async def refresh_study_search_tokens(app_state: Any, study_id: str) -> None:
    """Rebuild the bounded denormalized search vocabulary for one Study."""

    study_doc = await app_state.db.study.find_one(
        {"_id": study_id}, projection={"name": 1, "owner": 1}
    )
    if study_doc is None:
        return

    metadata: list[str] = []
    descriptions: list[str] = []
    cursor = app_state.db.study_chapter.find(
        {"studyId": study_id},
        projection={
            "name": 1,
            "variant": 1,
            "chess960": 1,
            "description": 1,
            "tags": 1,
            "order": 1,
        },
    ).sort("order", 1)
    async for chapter in cursor:
        metadata.append(str(chapter.get("name") or ""))
        metadata.append(str(chapter.get("variant") or ""))
        if chapter.get("chess960") is True:
            metadata.append("chess960")
        tags = chapter.get("tags")
        if isinstance(tags, dict):
            for tag_name, tag_value in tags.items():
                metadata.extend((str(tag_name), str(tag_value)))
        description = chapter.get("description")
        if isinstance(description, str) and description:
            descriptions.append(description)

    tokens = study_search_tokens(
        str(study_doc.get("name") or ""),
        str(study_doc.get("owner") or ""),
        *metadata,
        *descriptions,
    )
    await app_state.db.study.update_one(
        {"_id": study_id},
        {"$set": {"searchTokens": list(tokens)}},
    )


async def public_studies_page(
    app_state: Any,
    *,
    q: str = "",
    order: StudyListOrder = "updated",
    page: int = 1,
) -> dict[str, object]:
    """Return one public Study discovery page, optionally filtered by indexed prefixes."""

    clean_query = " ".join(str(q or "").split())[:80]
    tokens = study_search_query_tokens(clean_query)
    query: dict[str, object] = {"visibility": "public"}
    if tokens:
        indexed_search: dict[str, object] = {
            "searchTokens": tokens[0] if len(tokens) == 1 else {"$all": list(tokens)}
        }
        # Phase 3 predates the derived searchTokens field. Keep already-created
        # public Studies searchable while new/renamed documents use the multikey
        # index. User text is escaped before it reaches MongoDB's regex engine.
        legacy_terms: list[dict[str, object]] = []
        for token in tokens:
            pattern = re.compile(re.escape(token), re.IGNORECASE)
            legacy_terms.append(
                {"$or": [{"name": {"$regex": pattern}}, {"owner": {"$regex": pattern}}]}
            )
        query["$or"] = [
            indexed_search,
            {
                "$and": [
                    {"searchTokens": {"$exists": False}},
                    *legacy_terms,
                ]
            },
        ]
    elif clean_query:
        # Match Lichess's minimum useful query length without turning one- or
        # two-character searches into collection scans.
        return {
            "studies": [],
            "q": clean_query,
            "order": order,
            "page": 1,
            "pages": 1,
            "total": 0,
            "prev_page": None,
            "next_page": None,
            "query_too_short": True,
        }

    result = await _studies_page(app_state, query, order=order, page=page)
    result["q"] = clean_query
    result["query_too_short"] = False
    return result


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


def _owner_listing_filter(owner: str, viewer: str | None) -> dict[str, object]:
    # Unlisted Studies stay out of owner/profile listings. Owners still need a
    # complete self-view, matching the existing /study page and Lichess's
    # by-owner behavior for the signed-in owner.
    if viewer == owner:
        return {"owner": owner}
    return {"owner": owner, "visibility": "public"}


async def studies_for_owner_view(
    app_state: Any, owner: str, viewer: str | None, *, limit: int = 100
) -> list[Study]:
    cursor = (
        app_state.db.study.find(_owner_listing_filter(owner, viewer))
        .sort("updatedAt", -1)
        .limit(limit)
    )
    return [Study.from_document(doc) async for doc in cursor]


async def count_studies_for_owner_view(app_state: Any, owner: str, viewer: str | None) -> int:
    return await app_state.db.study.count_documents(_owner_listing_filter(owner, viewer))


async def studies_writable_by(
    app_state: Any,
    username: str,
    *,
    limit: int = 100,
) -> list[Study]:
    """Return Studies the user may write, including contributed Studies."""

    docs = (
        await app_state.db.study.find({"$or": [{"owner": username}, {"writeMembers": username}]})
        .sort("updatedAt", -1)
        .limit(limit)
        .to_list(length=limit)
    )
    return [Study.from_document(doc) for doc in docs]


async def load_owned_study(app_state: Any, study_id: str, owner: str) -> Study | None:
    doc = await app_state.db.study.find_one({"_id": study_id, "owner": owner})
    return Study.from_document(doc) if doc is not None else None


async def load_study(app_state: Any, study_id: str) -> Study | None:
    doc = await app_state.db.study.find_one({"_id": study_id})
    return Study.from_document(doc) if doc is not None else None


async def set_study_like(
    app_state: Any,
    study: Study,
    username: str,
    liked: bool,
) -> tuple[bool, int]:
    """Idempotently set one user's Study like and return the canonical state."""

    update = {"$addToSet": {"likers": username}} if liked else {"$pull": {"likers": username}}
    await app_state.db.study.update_one({"_id": study.id}, update)
    doc = await app_state.db.study.find_one({"_id": study.id}, projection={"likers": 1})
    if doc is None:
        raise StudyStorageError("Study not found")
    raw_likers = doc.get("likers")
    likers = (
        tuple(dict.fromkeys(item for item in raw_likers if isinstance(item, str) and item))
        if isinstance(raw_likers, list)
        else ()
    )
    likes = len(likers)
    await app_state.db.study.update_one({"_id": study.id}, {"$set": {"likes": likes}})
    return username in likers, likes


async def _replace_study_members(
    app_state: Any,
    study: Study,
    members: dict[str, StudyMemberRole],
) -> Study | None:
    """CAS one member-map update against the Study metadata revision.

    Membership changes are rare, so replacing the bounded map keeps the Mongo shape
    simple and lets the existing revision protect the cap/invariants from concurrent
    owner requests without introducing a permanent in-memory lock per Study.
    """

    now = datetime.now(UTC)
    result = await app_state.db.study.update_one(
        {"_id": study.id, "revision": study.revision},
        {
            "$set": {
                "members": members,
                "memberIds": sorted(members),
                "writeMembers": sorted(
                    username for username, role in members.items() if role == "write"
                ),
                "updatedAt": now,
            },
            "$inc": {"revision": 1},
        },
    )
    if result.matched_count != 1:
        return None
    return replace(study, members=members, updated_at=now, revision=study.revision + 1)


async def add_study_member(
    app_state: Any,
    study_id: str,
    actor: str,
    username: str,
    role: object = "read",
) -> Study:
    clean_role = study_member_role(role)
    for _ in range(4):
        study = await load_study(app_state, study_id)
        if study is None:
            raise StudyStorageError("Study not found")
        if study.owner != actor:
            raise StudyStorageError("Only the Study owner can add members")
        if username == study.owner:
            raise StudyStorageError("The Study owner is already a member")
        members = dict(study.members)
        if username not in members and len(members) >= STUDY_MAX_MEMBERS:
            raise StudyStorageError(f"A Study can have at most {STUDY_MAX_MEMBERS} members")
        if members.get(username) == clean_role:
            return study
        members[username] = clean_role
        updated = await _replace_study_members(app_state, study, members)
        if updated is not None:
            return updated
    raise StudyStorageError("Study membership changed concurrently; please retry")


async def set_study_member_role(
    app_state: Any,
    study_id: str,
    actor: str,
    username: str,
    role: object,
) -> Study:
    clean_role = study_member_role(role)
    for _ in range(4):
        study = await load_study(app_state, study_id)
        if study is None:
            raise StudyStorageError("Study not found")
        if study.owner != actor:
            raise StudyStorageError("Only the Study owner can change member roles")
        if username == study.owner:
            raise StudyStorageError("The Study owner's role cannot be changed")
        if username not in study.members:
            raise StudyStorageError("Study member not found")
        if study.members[username] == clean_role:
            return study
        members = dict(study.members)
        members[username] = clean_role
        updated = await _replace_study_members(app_state, study, members)
        if updated is not None:
            return updated
    raise StudyStorageError("Study membership changed concurrently; please retry")


async def remove_study_member(
    app_state: Any,
    study_id: str,
    actor: str,
    username: str,
) -> Study:
    for _ in range(4):
        study = await load_study(app_state, study_id)
        if study is None:
            raise StudyStorageError("Study not found")
        if study.owner != actor:
            raise StudyStorageError("Only the Study owner can remove members")
        if username == study.owner:
            raise StudyStorageError("The Study owner cannot be removed")
        if username not in study.members:
            raise StudyStorageError("Study member not found")
        members = dict(study.members)
        del members[username]
        updated = await _replace_study_members(app_state, study, members)
        if updated is not None:
            return updated
    raise StudyStorageError("Study membership changed concurrently; please retry")


async def leave_study(app_state: Any, study_id: str, username: str) -> Study:
    for _ in range(4):
        study = await load_study(app_state, study_id)
        if study is None:
            raise StudyStorageError("Study not found")
        if username == study.owner:
            raise StudyStorageError("The Study owner cannot leave the Study")
        if username not in study.members:
            raise StudyStorageError("You are not a member of this Study")
        members = dict(study.members)
        del members[username]
        updated = await _replace_study_members(app_state, study, members)
        if updated is not None:
            return updated
    raise StudyStorageError("Study membership changed concurrently; please retry")


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


async def load_chapter(app_state: Any, study_id: str, chapter_id: str) -> StudyChapter | None:
    doc = await app_state.db.study_chapter.find_one({"_id": chapter_id, "studyId": study_id})
    return StudyChapter.from_document(doc) if doc is not None else None


async def chapter_previews(app_state: Any, study_id: str) -> list[dict[str, object]]:
    cursor = app_state.db.study_chapter.find(
        {"studyId": study_id},
        projection={"_id": 1, "name": 1, "order": 1, "orientation": 1},
    ).sort("order", 1)
    return [
        {
            "id": str(doc["_id"]),
            "name": str(doc["name"]),
            "order": int(doc["order"]),
            "orientation": str(doc.get("orientation") or "white"),
        }
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
        description=draft.description,
        tags=draft.tags,
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
        await refresh_study_search_tokens(app_state, study.id)
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


async def clone_study(
    app_state: Any,
    source: Study,
    owner: str,
) -> tuple[Study, StudyChapter]:
    """Clone every chapter into a new private Study owned by ``owner``.

    The copy keeps Study/chapter content and settings, but receives fresh Study
    and chapter ids, fresh timestamps, reset revisions, and no inherited members.
    Like Lichess, the clone opens on its first chapter and records the source
    Study id for provenance.
    """

    docs = (
        await app_state.db.study_chapter.find({"studyId": source.id})
        .sort("order", 1)
        .to_list(length=STUDY_MAX_CHAPTERS + 1)
    )
    if not docs:
        raise StudyStorageError("Study has no chapters to clone")
    if len(docs) > STUDY_MAX_CHAPTERS:
        raise StudyStorageError(f"A Study can have at most {STUDY_MAX_CHAPTERS} chapters")

    now = datetime.now(UTC)
    cloned = await make_study(
        app_state.db.study,
        owner=owner,
        name=source.name,
        source=StudySource("study", source.id),
        now=now,
    )
    cloned = replace(cloned, settings=dict(source.settings))

    chapters: list[StudyChapter] = []
    for doc in docs:
        original = StudyChapter.from_document(doc)
        chapter = await make_chapter(
            app_state.db.study_chapter,
            study_id=cloned.id,
            owner=owner,
            variant=original.variant,
            initial_fen=original.initial_fen,
            orientation=original.orientation,
            order=original.order,
            name=original.name,
            chess960=original.chess960,
            variant_ini=original.variant_ini,
            root=original.root,
            description=original.description,
            tags=original.tags,
            now=now,
        )
        _ensure_chapter_size(chapter)
        chapters.append(chapter)

    cloned = replace(cloned, current_chapter=chapters[0].id)
    chapter_ids = [chapter.id for chapter in chapters]
    try:
        await app_state.db.study_chapter.insert_many(
            [chapter.to_document() for chapter in chapters]
        )
        await app_state.db.study.insert_one(cloned.to_document())
        await refresh_study_search_tokens(app_state, cloned.id)
    except Exception:
        await app_state.db.study_chapter.delete_many(
            {"_id": {"$in": chapter_ids}, "studyId": cloned.id}
        )
        await app_state.db.study.delete_one({"_id": cloned.id, "owner": owner})
        raise

    return cloned, chapters[0]


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
        description=draft.description,
        tags=draft.tags,
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
        {
            "$set": {"currentChapter": chapter.id, "updatedAt": now},
            "$unset": {"currentPath": ""},
            "$inc": {"revision": 1},
        },
    )
    await refresh_study_search_tokens(app_state, study.id)
    return chapter


async def add_chapters_from_drafts(
    app_state: Any,
    study: Study,
    drafts: list[StudyChapterDraft],
) -> list[StudyChapter]:
    if not drafts:
        raise StudyStorageError("PGN import contains no chapters")

    count = await app_state.db.study_chapter.count_documents({"studyId": study.id})
    if count + len(drafts) > STUDY_MAX_CHAPTERS:
        remaining = max(0, STUDY_MAX_CHAPTERS - count)
        raise StudyStorageError(
            f"Study has room for {remaining} more chapter{'s' if remaining != 1 else ''}"
        )

    last = await app_state.db.study_chapter.find_one(
        {"studyId": study.id}, projection={"order": 1}, sort=[("order", -1)]
    )
    start_order = int(last["order"]) + 1 if last is not None else 1
    chapters: list[StudyChapter] = []
    for offset, draft in enumerate(drafts):
        order = start_order + offset
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
            description=draft.description,
            tags=draft.tags,
            order=order,
            name=_clean_name(
                draft.name, fallback=f"Chapter {order}", max_length=STUDY_CHAPTER_NAME_MAX_LENGTH
            ),
        )
        _ensure_chapter_size(chapter)
        chapters.append(chapter)

    ids = [chapter.id for chapter in chapters]
    try:
        await app_state.db.study_chapter.insert_many(
            [chapter.to_document() for chapter in chapters]
        )
        now = datetime.now(UTC)
        result = await app_state.db.study.update_one(
            {"_id": study.id, "owner": study.owner},
            {
                "$set": {"currentChapter": chapters[-1].id, "updatedAt": now},
                "$unset": {"currentPath": ""},
                "$inc": {"revision": 1},
            },
        )
        if result.matched_count != 1:
            raise StudyStorageError("Study disappeared during PGN import")
    except Exception:
        await app_state.db.study_chapter.delete_many({"_id": {"$in": ids}, "studyId": study.id})
        raise
    await refresh_study_search_tokens(app_state, study.id)
    return chapters


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
        {
            "$set": {"currentChapter": chapter.id, "updatedAt": now},
            "$unset": {"currentPath": ""},
            "$inc": {"revision": 1},
        },
    )
    await refresh_study_search_tokens(app_state, study.id)
    return chapter


async def select_chapter(app_state: Any, study: Study, chapter: StudyChapter) -> None:
    if study.current_chapter == chapter.id:
        return
    await app_state.db.study.update_one(
        {"_id": study.id, "owner": study.owner},
        {"$set": {"currentChapter": chapter.id}, "$inc": {"revision": 1}},
    )


async def set_shared_position(
    app_state: Any,
    study_id: str,
    username: str,
    chapter_id: str,
    path: str,
) -> tuple[Study, bool]:
    """Persist the authoritative Study chapter/path selected by a contributor.

    Shared navigation is intentionally separate from chapter tree revisions: the
    active position is ephemeral collaboration state, but it still lives in MongoDB
    so late joiners and reconnecting clients can resume the same presentation.
    """

    study = await load_study(app_state, study_id)
    if study is None:
        raise StudyStorageError("Study not found")
    if not can_write_study(study, username):
        raise StudyStorageError("Study is read only")
    chapter = await load_chapter(app_state, study_id, chapter_id)
    if chapter is None:
        raise StudyStorageError("Study chapter not found")
    if path and chapter.root.node_at_path(path) is None:
        raise StudyStorageError("Study path not found")

    current_path = study.current_path or ""
    if study.current_chapter == chapter_id and current_path == path:
        return study, False

    update: dict[str, object] = {"$set": {"currentChapter": chapter_id}}
    if path:
        cast_set = update["$set"]
        assert isinstance(cast_set, dict)
        cast_set["currentPath"] = path
    else:
        update["$unset"] = {"currentPath": ""}
    await app_state.db.study.update_one({"_id": study_id}, update)
    return replace(study, current_chapter=chapter_id, current_path=path or None), True


async def rename_study(app_state: Any, study: Study, name: object) -> str:
    clean = _clean_name(name, fallback=study.name, max_length=STUDY_NAME_MAX_LENGTH)
    now = datetime.now(UTC)
    await app_state.db.study.update_one(
        {"_id": study.id, "owner": study.owner},
        {
            "$set": {
                "name": clean,
                "updatedAt": now,
            },
            "$inc": {"revision": 1},
        },
    )
    await refresh_study_search_tokens(app_state, study.id)
    return clean


async def set_study_visibility(
    app_state: Any,
    study: Study,
    visibility: object,
) -> StudyVisibility:
    clean = study_visibility(visibility)
    if clean == study.visibility:
        return clean
    now = datetime.now(UTC)
    await app_state.db.study.update_one(
        {"_id": study.id, "owner": study.owner},
        {"$set": {"visibility": clean, "updatedAt": now}, "$inc": {"revision": 1}},
    )
    return clean


async def rename_chapter(app_state: Any, chapter: StudyChapter, name: object) -> str:
    clean, _ = await edit_chapter_metadata(
        app_state,
        chapter,
        name=name,
        orientation=chapter.orientation,
    )
    return clean


async def edit_chapter_metadata(
    app_state: Any,
    chapter: StudyChapter,
    *,
    name: object,
    orientation: object,
) -> tuple[str, StudyOrientation]:
    clean_name = _clean_name(name, fallback=chapter.name, max_length=STUDY_CHAPTER_NAME_MAX_LENGTH)
    clean_orientation = str(orientation or chapter.orientation).lower()
    if clean_orientation not in ("white", "black"):
        raise StudyStorageError("Invalid Study chapter orientation")
    typed_orientation = cast(StudyOrientation, clean_orientation)
    now = datetime.now(UTC)
    await app_state.db.study_chapter.update_one(
        {"_id": chapter.id, "studyId": chapter.study_id, "owner": chapter.owner},
        {
            "$set": {
                "name": clean_name,
                "orientation": typed_orientation,
                "updatedAt": now,
            }
        },
    )
    await app_state.db.study.update_one(
        {"_id": chapter.study_id, "owner": chapter.owner},
        {"$set": {"updatedAt": now}, "$inc": {"revision": 1}},
    )
    await refresh_study_search_tokens(app_state, chapter.study_id)
    return clean_name, typed_orientation


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
    update: dict[str, object] = {
        "$set": {"currentChapter": next_chapter_id, "updatedAt": now},
        "$inc": {"revision": 1},
    }
    if study.current_chapter == chapter.id or not study.current_chapter:
        update["$unset"] = {"currentPath": ""}
    await app_state.db.study.update_one(
        {"_id": study.id, "owner": study.owner},
        update,
    )
    await refresh_study_search_tokens(app_state, study.id)
    return next_chapter_id


async def delete_study(app_state: Any, study: Study) -> None:
    await app_state.db.study_chapter.delete_many({"studyId": study.id, "owner": study.owner})
    await app_state.db.study.delete_one({"_id": study.id, "owner": study.owner})
