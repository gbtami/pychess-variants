from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Mapping
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal

from bson import BSON
from catalogued_variants import (
    catalogued_legal_moves_need_history,
    catalogued_show_promoted,
    extract_variant_name,
)
from fairy.fairy_board import NOTATION_SAN, WHITE, FairyBoard, sf

from study.constants import STUDY_CHAPTER_MAX_BSON_BYTES, STUDY_MAX_NODES_PER_CHAPTER
from study.models import Study, StudyChapter
from study.tree import StudyTree, StudyTreeNode, is_study_node_id, new_study_node_id

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

log = logging.getLogger(__name__)

StudyMutationStatus = Literal["ok", "reload", "error"]


@dataclass(frozen=True, slots=True)
class StudyMutationResult:
    """Structured result consumed by the future Study websocket layer.

    `reload` means the client must discard its optimistic local mutation and request the
    authoritative chapter again. `error` is a rejected operation that does not imply the
    client's already-loaded tree is stale. Successful idempotent/no-op operations return
    `ok` with `changed=False` and do not increment the revision.
    """

    status: StudyMutationStatus
    revision: int | None
    changed: bool = False
    reason: str | None = None
    path: str | None = None
    node: StudyTreeNode | None = None

    def to_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "status": self.status,
            "changed": self.changed,
        }
        if self.revision is not None:
            payload["revision"] = self.revision
        if self.reason is not None:
            payload["reason"] = self.reason
        if self.path is not None:
            payload["path"] = self.path
        if self.node is not None:
            payload["node"] = self.node.to_payload()
        return payload


@dataclass(frozen=True, slots=True)
class _MutationContext:
    study: Study
    chapter: StudyChapter


class _InvalidStoredTree(Exception):
    pass


class _IllegalStudyMove(Exception):
    pass


class _VariantUnavailable(Exception):
    pass


class StudyMutationService:
    """Authoritative owner-only Study tree mutations.

    Phase 1 uses an optimistic compare-and-swap on the chapter revision. A mutation is
    computed from one loaded chapter snapshot and persisted with `revision == expected`;
    if another tab wins first, this service returns `reload` instead of merging stale
    state. This keeps the owner-only MVP simple while preserving a safe path to a later
    per-Study sequencer for collaboration.
    """

    def __init__(self, app_state: PychessGlobalAppState):
        self.app_state = app_state
        self.db = app_state.db

    async def add_node(
        self,
        *,
        study_id: str,
        chapter_id: str,
        username: str,
        parent_path: str,
        move: str,
        expected_revision: int,
        node_id: str | None = None,
    ) -> StudyMutationResult:
        loaded = await self._load_owner_context(study_id, chapter_id, username)
        if isinstance(loaded, StudyMutationResult):
            return loaded
        chapter = loaded.chapter

        mismatch = self._revision_mismatch(chapter, expected_revision)
        if mismatch is not None:
            return mismatch

        parent_node = self._node_for_path(chapter.root, parent_path)
        if parent_path and parent_node is None:
            return self._reload(chapter.revision, "invalid_path")
        parent_id = parent_node.id if parent_node is not None else None

        existing = next(
            (child for child in chapter.root.children_of(parent_id) if child.move == move),
            None,
        )
        if existing is not None:
            return StudyMutationResult(
                status="ok",
                revision=chapter.revision,
                changed=False,
                path=chapter.root.path_for_node(existing.id),
                node=existing,
            )

        if chapter.root.count() >= STUDY_MAX_NODES_PER_CHAPTER:
            return self._error(chapter.revision, "node_limit")

        siblings = chapter.root.children_of(parent_id)
        order = max((node.order for node in siblings), default=-1) + 1
        if node_id is not None:
            if not is_study_node_id(node_id):
                return self._error(chapter.revision, "invalid_node_id")
            if node_id in chapter.root.nodes:
                return self._reload(chapter.revision, "node_id_conflict")
        else:
            node_id = new_study_node_id(chapter.root.nodes.keys())
        try:
            node = self._validated_child_node(
                chapter,
                parent_path=parent_path,
                move=move,
                node_id=node_id,
                parent_id=parent_id,
                order=order,
            )
        except _IllegalStudyMove:
            return self._error(chapter.revision, "illegal_move")
        except _InvalidStoredTree:
            return self._error(chapter.revision, "invalid_chapter_tree")
        except _VariantUnavailable:
            return self._error(chapter.revision, "variant_unavailable")

        nodes = dict(chapter.root.nodes)
        nodes[node.id] = node
        candidate = self._candidate_chapter(chapter, StudyTree(nodes))
        size_error = self._size_error(candidate)
        if size_error is not None:
            return size_error

        result = await self._commit(
            chapter,
            candidate,
            set_nodes={node.id: node},
        )
        if result is not None:
            return result

        return StudyMutationResult(
            status="ok",
            revision=candidate.revision,
            changed=True,
            path=self._join_path(parent_path, node.id),
            node=node,
        )

    async def delete_node(
        self,
        *,
        study_id: str,
        chapter_id: str,
        username: str,
        path: str,
        expected_revision: int,
    ) -> StudyMutationResult:
        loaded = await self._load_owner_context(study_id, chapter_id, username)
        if isinstance(loaded, StudyMutationResult):
            return loaded
        chapter = loaded.chapter

        mismatch = self._revision_mismatch(chapter, expected_revision)
        if mismatch is not None:
            return mismatch
        target = self._node_for_path(chapter.root, path)
        if not path or target is None:
            return self._reload(chapter.revision, "invalid_path")

        removed_ids = self._subtree_ids(chapter.root, target.id)
        nodes = {
            node_id: node
            for node_id, node in chapter.root.nodes.items()
            if node_id not in removed_ids
        }

        changed_nodes: dict[str, StudyTreeNode] = {}
        remaining_siblings = sorted(
            (node for node in nodes.values() if node.parent_id == target.parent_id),
            key=lambda node: node.order,
        )
        for order, sibling in enumerate(remaining_siblings):
            if sibling.order != order:
                replacement = replace(sibling, order=order)
                nodes[sibling.id] = replacement
                changed_nodes[sibling.id] = replacement

        candidate = self._candidate_chapter(chapter, StudyTree(nodes))
        result = await self._commit(
            chapter,
            candidate,
            set_nodes=changed_nodes,
            unset_node_ids=removed_ids,
        )
        if result is not None:
            return result
        return StudyMutationResult(
            status="ok",
            revision=candidate.revision,
            changed=True,
            path=path,
        )

    async def promote_variation(
        self,
        *,
        study_id: str,
        chapter_id: str,
        username: str,
        path: str,
        to_mainline: bool,
        expected_revision: int,
    ) -> StudyMutationResult:
        loaded = await self._load_owner_context(study_id, chapter_id, username)
        if isinstance(loaded, StudyMutationResult):
            return loaded
        chapter = loaded.chapter

        mismatch = self._revision_mismatch(chapter, expected_revision)
        if mismatch is not None:
            return mismatch
        target = self._node_for_path(chapter.root, path)
        if not path or target is None:
            return self._reload(chapter.revision, "invalid_path")

        nodes = dict(chapter.root.nodes)
        original = dict(nodes)
        segments = path.split(".")

        # Mirror client/analysis/analysisTree.ts::promoteNodePath(): walk from the
        # selected node toward the root, moving the deepest sideline to child[0].
        # `to_mainline` continues through every ancestor; ordinary promote changes
        # only the first divergence (or clears one forced-variation boundary).
        for node_id in reversed(segments):
            node = nodes[node_id]
            siblings = sorted(
                (
                    candidate
                    for candidate in nodes.values()
                    if candidate.parent_id == node.parent_id
                ),
                key=lambda candidate: candidate.order,
            )
            index = next(i for i, sibling in enumerate(siblings) if sibling.id == node.id)
            if index != 0:
                reordered = [node, *(sibling for sibling in siblings if sibling.id != node.id)]
                for order, sibling in enumerate(reordered):
                    if sibling.order != order:
                        nodes[sibling.id] = replace(sibling, order=order)
                if not to_mainline:
                    break
            elif node.force_variation:
                nodes[node.id] = replace(node, force_variation=False)
                if not to_mainline:
                    break

        changed_nodes = {
            node_id: node for node_id, node in nodes.items() if node != original[node_id]
        }
        if not changed_nodes:
            return StudyMutationResult(
                status="ok", revision=chapter.revision, changed=False, path=path
            )

        candidate = self._candidate_chapter(chapter, StudyTree(nodes))
        size_error = self._size_error(candidate)
        if size_error is not None:
            return size_error
        result = await self._commit(chapter, candidate, set_nodes=changed_nodes)
        if result is not None:
            return result
        return StudyMutationResult(
            status="ok",
            revision=candidate.revision,
            changed=True,
            path=path,
        )

    async def force_variation(
        self,
        *,
        study_id: str,
        chapter_id: str,
        username: str,
        path: str,
        force: bool,
        expected_revision: int,
    ) -> StudyMutationResult:
        loaded = await self._load_owner_context(study_id, chapter_id, username)
        if isinstance(loaded, StudyMutationResult):
            return loaded
        chapter = loaded.chapter

        mismatch = self._revision_mismatch(chapter, expected_revision)
        if mismatch is not None:
            return mismatch
        target = self._node_for_path(chapter.root, path)
        if not path or target is None:
            return self._reload(chapter.revision, "invalid_path")

        nodes = dict(chapter.root.nodes)
        original = dict(nodes)
        # Match the generic client tree: at most one forced-variation marker exists.
        for node_id, node in tuple(nodes.items()):
            if node.force_variation:
                nodes[node_id] = replace(node, force_variation=False)
        if force:
            nodes[target.id] = replace(nodes[target.id], force_variation=True)

        changed_nodes = {
            node_id: node for node_id, node in nodes.items() if node != original[node_id]
        }
        if not changed_nodes:
            return StudyMutationResult(
                status="ok", revision=chapter.revision, changed=False, path=path
            )

        candidate = self._candidate_chapter(chapter, StudyTree(nodes))
        size_error = self._size_error(candidate)
        if size_error is not None:
            return size_error
        result = await self._commit(chapter, candidate, set_nodes=changed_nodes)
        if result is not None:
            return result
        return StudyMutationResult(
            status="ok",
            revision=candidate.revision,
            changed=True,
            path=path,
        )

    async def _load_owner_context(
        self, study_id: str, chapter_id: str, username: str
    ) -> _MutationContext | StudyMutationResult:
        study_doc = await self.db.study.find_one({"_id": study_id})
        if study_doc is None:
            return self._error(None, "study_not_found")
        try:
            study = Study.from_document(study_doc)
        except (TypeError, ValueError):
            log.exception("Invalid Study document %s", study_id)
            return self._error(None, "invalid_study")
        if study.owner != username:
            return self._error(None, "forbidden")

        chapter_doc = await self.db.study_chapter.find_one({"_id": chapter_id, "studyId": study.id})
        if chapter_doc is None:
            return self._error(None, "chapter_not_found")
        try:
            chapter = StudyChapter.from_document(chapter_doc)
        except (TypeError, ValueError):
            log.exception("Invalid Study chapter document %s/%s", study_id, chapter_id)
            return self._error(None, "invalid_chapter")
        return _MutationContext(study, chapter)

    @staticmethod
    def _revision_mismatch(
        chapter: StudyChapter, expected_revision: int
    ) -> StudyMutationResult | None:
        if expected_revision < 0 or expected_revision != chapter.revision:
            return StudyMutationService._reload(chapter.revision, "revision_mismatch")
        return None

    @staticmethod
    def _node_for_path(tree: StudyTree, path: str) -> StudyTreeNode | None:
        if not path:
            return None
        return tree.node_at_path(path)

    @staticmethod
    def _join_path(parent_path: str, node_id: str) -> str:
        return f"{parent_path}.{node_id}" if parent_path else node_id

    @staticmethod
    def _subtree_ids(tree: StudyTree, root_id: str) -> set[str]:
        children: dict[str, list[str]] = defaultdict(list)
        for node in tree.nodes.values():
            if node.parent_id is not None:
                children[node.parent_id].append(node.id)
        removed: set[str] = set()
        pending = [root_id]
        while pending:
            node_id = pending.pop()
            if node_id in removed:
                continue
            removed.add(node_id)
            pending.extend(children[node_id])
        return removed

    def _validated_child_node(
        self,
        chapter: StudyChapter,
        *,
        parent_path: str,
        move: str,
        node_id: str,
        parent_id: str | None,
        order: int,
    ) -> StudyTreeNode:
        moves: list[str] = []
        if parent_path:
            parent = chapter.root.node_at_path(parent_path)
            if parent is None:
                raise _InvalidStoredTree
            moves = [chapter.root.nodes[segment].move for segment in parent_path.split(".")]

        try:
            with self._chapter_variant(chapter) as variant_options:
                show_promoted, legal_moves_need_history = variant_options
                parent_fen = (
                    chapter.root.nodes[parent_id].fen
                    if parent_id is not None
                    else chapter.initial_fen
                )
                if parent_id is not None and not legal_moves_need_history:
                    # Most variants are position-local. Starting directly from the
                    # authoritative parent FEN makes appending to a 1,000-ply Study O(1)
                    # instead of replaying the whole line for every new move.
                    board = FairyBoard(
                        chapter.variant,
                        initial_fen=parent_fen,
                        chess960=chapter.chess960,
                        show_promoted=show_promoted,
                    )
                else:
                    # Janggi/Ataxx and custom rules such as perpetual-check illegality
                    # need the complete move history, so reconstruct those branches.
                    board = FairyBoard(
                        chapter.variant,
                        initial_fen=chapter.initial_fen,
                        chess960=chapter.chess960,
                        show_promoted=show_promoted,
                        legal_moves_need_history=legal_moves_need_history,
                    )
                    for stored_move in moves:
                        board.push(stored_move)
                    if parent_id is not None and board.fen != parent_fen:
                        raise _InvalidStoredTree

                if move not in board.legal_moves():
                    raise _IllegalStudyMove
                san = board.get_san(move)
                san_san = board.sf.get_san(
                    board.variant,
                    board.fen,
                    move,
                    board.chess960,
                    NOTATION_SAN,
                )
                board.push(move)
                return StudyTreeNode(
                    id=node_id,
                    parent_id=parent_id,
                    order=order,
                    move=move,
                    fen=board.fen,
                    turn_color="white" if board.color == WHITE else "black",
                    check=board.is_checked(),
                    san=san,
                    san_san=san_san,
                )
        except (_IllegalStudyMove, _InvalidStoredTree):
            raise
        except Exception as exc:
            log.info(
                "Study FairyBoard validation failed for %s/%s (%s)",
                chapter.study_id,
                chapter.id,
                chapter.variant,
                exc_info=True,
            )
            raise _VariantUnavailable from exc

    @contextmanager
    def _chapter_variant(self, chapter: StudyChapter):
        """Temporarily restore a chapter's exact catalogued-variant snapshot.

        `pyffish.load_variant_config()` is process-global. There is deliberately no
        `await` while the snapshot is installed, so another asyncio request cannot run
        against the temporary definition. If the same catalogue slot currently has a
        newer active definition, restore it before returning to the event loop.
        """

        if chapter.variant_ini is None:
            yield False, False
            return

        snapshot = chapter.variant_ini
        try:
            snapshot_name = extract_variant_name(snapshot)
        except Exception as exc:
            raise _VariantUnavailable from exc
        if snapshot_name != chapter.variant:
            raise _VariantUnavailable

        active_doc = self.app_state.catalogued_variants.get(chapter.variant)
        active_ini = ""
        if isinstance(active_doc, Mapping):
            active_ini = str(active_doc.get("ini") or "")

        try:
            sf.load_variant_config(snapshot)
            yield (
                catalogued_show_promoted(snapshot, chapter.initial_fen),
                catalogued_legal_moves_need_history(snapshot),
            )
        finally:
            if active_ini and active_ini != snapshot:
                try:
                    sf.load_variant_config(active_ini)
                except Exception as exc:
                    # Never return to the event loop with a known-wrong active ruleset.
                    # The chapter mutation has not reached MongoDB yet, so rejecting the
                    # operation is safer than accepting it after a failed restore.
                    log.exception(
                        "Failed to restore active catalogued variant %s after Study validation",
                        chapter.variant,
                    )
                    raise _VariantUnavailable from exc

    @staticmethod
    def _candidate_chapter(chapter: StudyChapter, root: StudyTree) -> StudyChapter:
        return replace(
            chapter,
            root=root,
            updated_at=datetime.now(UTC),
            revision=chapter.revision + 1,
        )

    @staticmethod
    def _size_error(chapter: StudyChapter) -> StudyMutationResult | None:
        try:
            encoded_size = len(BSON.encode(chapter.to_document()))
        except Exception:
            log.exception("Failed to BSON-encode Study chapter %s", chapter.id)
            return StudyMutationService._error(chapter.revision - 1, "invalid_chapter")
        if encoded_size > STUDY_CHAPTER_MAX_BSON_BYTES:
            return StudyMutationService._error(chapter.revision - 1, "chapter_too_large")
        return None

    async def _commit(
        self,
        previous: StudyChapter,
        candidate: StudyChapter,
        *,
        set_nodes: Mapping[str, StudyTreeNode] | None = None,
        unset_node_ids: set[str] | None = None,
    ) -> StudyMutationResult | None:
        set_fields: dict[str, object] = {
            "updatedAt": candidate.updated_at,
            "revision": candidate.revision,
        }
        for node_id, node in (set_nodes or {}).items():
            set_fields[f"root.{node_id}"] = node.to_document()

        update: dict[str, object] = {"$set": set_fields}
        if unset_node_ids:
            update["$unset"] = {f"root.{node_id}": "" for node_id in unset_node_ids}

        result = await self.db.study_chapter.update_one(
            {
                "_id": previous.id,
                "studyId": previous.study_id,
                "revision": previous.revision,
            },
            update,
        )
        if result.matched_count == 1:
            await self.db.study.update_one(
                {"_id": previous.study_id},
                {"$set": {"updatedAt": candidate.updated_at}},
            )
            return None

        current = await self.db.study_chapter.find_one(
            {"_id": previous.id, "studyId": previous.study_id},
            projection={"revision": 1},
        )
        current_revision = previous.revision
        if current is not None:
            raw_revision = current.get("revision", previous.revision)
            if isinstance(raw_revision, int) and not isinstance(raw_revision, bool):
                current_revision = raw_revision
        return self._reload(current_revision, "revision_mismatch")

    @staticmethod
    def _reload(revision: int | None, reason: str) -> StudyMutationResult:
        return StudyMutationResult(status="reload", revision=revision, reason=reason)

    @staticmethod
    def _error(revision: int | None, reason: str) -> StudyMutationResult:
        return StudyMutationResult(status="error", revision=revision, reason=reason)
