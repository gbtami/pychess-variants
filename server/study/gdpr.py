from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any

from study.models import Study
from study.sequencer import sequence_study
from study.storage import delete_study, refresh_study_search_tokens
from study.ws import (
    broadcast_study_reload,
    close_study_sockets,
    close_study_user_sockets,
)

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

log = logging.getLogger(__name__)

# Keep public collaborative content available after account erasure without
# attributing it to another real account. This intentionally matches the text
# used by the rest of PyChess for erased public authorship.
STUDY_ERASED_USER = "<erased>"


def _root_has_comment_author(root: object, username: str) -> bool:
    if not isinstance(root, Mapping):
        return False
    for record in root.values():
        if not isinstance(record, Mapping):
            continue
        annotations = record.get("a")
        if not isinstance(annotations, Mapping):
            continue
        comments = annotations.get("c")
        if not isinstance(comments, Sequence) or isinstance(comments, (str, bytes)):
            continue
        for comment in comments:
            if isinstance(comment, Mapping) and comment.get("a") == username:
                return True
    return False


def _anonymize_root_comments(root: object, username: str) -> tuple[object, bool]:
    """Replace one Study comment author without disturbing unrelated tree fields."""

    if not isinstance(root, Mapping):
        return root, False

    changed = False
    rewritten_root: dict[object, object] = dict(root)
    for record_key, record in root.items():
        if not isinstance(record, Mapping):
            continue
        annotations = record.get("a")
        if not isinstance(annotations, Mapping):
            continue
        comments = annotations.get("c")
        if not isinstance(comments, Sequence) or isinstance(comments, (str, bytes)):
            continue

        rewritten_comments: list[object] = []
        record_changed = False
        for comment in comments:
            if isinstance(comment, Mapping) and comment.get("a") == username:
                rewritten_comment = dict(comment)
                rewritten_comment["a"] = STUDY_ERASED_USER
                rewritten_comments.append(rewritten_comment)
                record_changed = True
            else:
                rewritten_comments.append(comment)

        if not record_changed:
            continue
        rewritten_annotations = dict(annotations)
        rewritten_annotations["c"] = rewritten_comments
        rewritten_record = dict(record)
        rewritten_record["a"] = rewritten_annotations
        rewritten_root[record_key] = rewritten_record
        changed = True

    return rewritten_root, changed


async def _study_ids_with_authored_comments(app_state: Any, username: str) -> dict[str, set[str]]:
    """Find legacy/current chapters containing comments authored by ``username``.

    Study node ids are dynamic Mongo keys, so old chapters cannot be queried by a
    fixed dotted path. Account erasure is rare; scan chapter roots once and retain
    only matching ids, then re-read those chapters under the Study sequencer before
    mutating them.
    """

    matches: dict[str, set[str]] = {}
    cursor = app_state.db.study_chapter.find({}, projection={"studyId": 1, "root": 1})
    async for doc in cursor:
        study_id = doc.get("studyId")
        chapter_id = doc.get("_id")
        if (
            isinstance(study_id, str)
            and isinstance(chapter_id, str)
            and _root_has_comment_author(doc.get("root"), username)
        ):
            matches.setdefault(study_id, set()).add(chapter_id)
    return matches


async def _affected_study_ids(
    app_state: Any,
    username: str,
    comment_studies: Mapping[str, set[str]],
) -> set[str]:
    ids = set(comment_studies)
    cursor = app_state.db.study.find(
        {
            "$or": [
                {"owner": username},
                {"likers": username},
                {"memberIds": username},
                {f"members.{username}": {"$exists": True}},
            ]
        },
        projection={"_id": 1},
    )
    async for doc in cursor:
        study_id = doc.get("_id")
        if isinstance(study_id, str):
            ids.add(study_id)
    return ids


async def _rewrite_chapters_for_erasure(
    app_state: Any,
    study: Study,
    username: str,
    authored_chapter_ids: set[str],
    *,
    anonymize_owner: bool,
) -> bool:
    """Anonymize authored comments and, for retained owned Studies, chapter owner."""

    changed_any = False
    query: dict[str, object] = {"studyId": study.id}
    if not anonymize_owner:
        if not authored_chapter_ids:
            return False
        query["_id"] = {"$in": list(authored_chapter_ids)}

    cursor = app_state.db.study_chapter.find(
        query,
        projection={"_id": 1, "owner": 1, "root": 1},
    )
    async for chapter_doc in cursor:
        chapter_id = chapter_doc.get("_id")
        if not isinstance(chapter_id, str):
            continue

        set_fields: dict[str, object] = {}
        if anonymize_owner and chapter_doc.get("owner") == username:
            set_fields["owner"] = STUDY_ERASED_USER

        rewritten_root, comments_changed = _anonymize_root_comments(
            chapter_doc.get("root"), username
        )
        if comments_changed:
            set_fields["root"] = rewritten_root

        if not set_fields:
            continue

        update: dict[str, object] = {"$set": set_fields}
        # Owner bookkeeping does not change the board snapshot. Comment authorship
        # does, so advance the chapter revision to invalidate stale HTTP snapshots.
        if comments_changed:
            update["$inc"] = {"revision": 1}
        await app_state.db.study_chapter.update_one(
            {"_id": chapter_id, "studyId": study.id},
            update,
        )
        changed_any = True

    return changed_any


async def _erase_from_retained_study(
    app_state: Any,
    study: Study,
    username: str,
    authored_chapter_ids: set[str],
) -> None:
    anonymize_owner = study.owner == username
    chapters_changed = await _rewrite_chapters_for_erasure(
        app_state,
        study,
        username,
        authored_chapter_ids,
        anonymize_owner=anonymize_owner,
    )

    members = dict(study.members)
    member_changed = members.pop(username, None) is not None
    if anonymize_owner:
        members[STUDY_ERASED_USER] = "write"
        member_changed = True

    likers = tuple(liker for liker in study.likers if liker != username)
    likes_changed = likers != study.likers

    set_fields: dict[str, object] = {}
    if anonymize_owner:
        set_fields["owner"] = STUDY_ERASED_USER
    if member_changed:
        set_fields.update(
            {
                "members": members,
                "memberIds": sorted(members),
                "writeMembers": sorted(
                    member for member, role in members.items() if role == "write"
                ),
            }
        )
    if likes_changed:
        set_fields["likers"] = list(likers)
        set_fields["likes"] = len(likers)

    if set_fields or chapters_changed:
        update: dict[str, object] = {"$inc": {"revision": 1}}
        if set_fields:
            update["$set"] = set_fields
        await app_state.db.study.update_one({"_id": study.id}, update)

    if anonymize_owner:
        # owner is part of the denormalized search vocabulary; remove the erased
        # username from discovery without changing the Study's activity timestamp.
        await refresh_study_search_tokens(app_state, study.id)

    if set_fields or chapters_changed:
        await broadcast_study_reload(app_state, study.id, reason="account_erased")

    # A private Study must revoke the erased member before releasing the same
    # sequencer used by ordinary membership changes. Close public/unlisted tabs too
    # so a deleted account cannot keep an authenticated Study websocket alive.
    await close_study_user_sockets(app_state, study.id, username)


async def erase_user_from_studies(
    app_state: PychessGlobalAppState,
    username: str,
) -> None:
    """Apply the Study account-erasure policy.

    Policy mirrors Lichess's public/private split while accounting for PyChess's
    persisted comment authorship:

    * delete Studies owned by the erased account when they are private or unlisted;
    * retain public owned Studies, anonymizing owner/chapter ownership as ``<erased>``;
    * remove the account from every remaining Study membership and like list;
    * anonymize its persisted Study comments while preserving collaborative content;
    * refresh/close live rooms under the shared Study sequencer.
    """

    if getattr(app_state, "db", None) is None:
        return

    comment_studies = await _study_ids_with_authored_comments(app_state, username)
    study_ids = await _affected_study_ids(app_state, username, comment_studies)

    for study_id in sorted(study_ids):
        async with sequence_study(app_state, study_id):
            raw_study = await app_state.db.study.find_one({"_id": study_id})
            if raw_study is None:
                continue
            try:
                study = Study.from_document(raw_study)
            except (TypeError, ValueError):
                # Do not let one corrupt Study prevent the rest of an account erasure.
                log.warning(
                    "Cannot erase account data from invalid Study %s", study_id, exc_info=True
                )
                continue

            if study.owner == username and study.visibility != "public":
                # Privacy wins over collaborative retention for link-only/private data,
                # matching Lichess's account-erasure behavior.
                await close_study_sockets(app_state, study.id)
                await delete_study(app_state, study)
                continue

            await _erase_from_retained_study(
                app_state,
                study,
                username,
                comment_studies.get(study.id, set()),
            )
