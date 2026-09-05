from __future__ import annotations

from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, cast

from catalogued_variants import find_catalogued_variant_doc
from fairy.fairy_board import FEN_OK, NOTATION_SAN, WHITE, FairyBoard, validate_fen
from utils import MAX_CUSTOM_FEN_LENGTH, load_game, sanitize_fen
from variants import ALL_VARIANTS, C2V, TWO_BOARD_VARIANT_CODES, is_catalogued_variant

from study.annotations import StudyAnnotations, StudyComment
from study.models import StudySource
from study.tree import StudyTree, StudyTreeNode
from study.variant import study_variant_context

StudyOrientation = Literal["white", "black"]


class StudyChapterBuildError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class StudyChapterDraft:
    variant: str
    initial_fen: str
    orientation: StudyOrientation = "white"
    chess960: bool = False
    variant_ini: str | None = None
    root: StudyTree = field(default_factory=StudyTree)
    name: str | None = None
    source: StudySource = field(default_factory=StudySource)
    description: str = ""
    tags: Mapping[str, str] = field(default_factory=dict)


class StudyChapterBuilder:
    def __init__(self, app_state: Any, owner: str) -> None:
        self.app_state = app_state
        self.owner = owner

    async def blank_or_fen(
        self,
        *,
        variant: str = "chess",
        fen: str | None = None,
        chess960: bool = False,
        name: str | None = None,
        orientation: StudyOrientation = "white",
    ) -> StudyChapterDraft:
        variant_ini = await self._variant_snapshot(variant, chess960)
        with study_variant_context(self.app_state, variant, variant_ini) as options:
            if fen and fen.strip():
                valid, initial_fen = sanitize_fen(variant, fen.strip(), chess960)
                if not valid:
                    raise StudyChapterBuildError("Invalid FEN for this variant")
            else:
                try:
                    initial_fen = FairyBoard.start_fen(options.runtime_variant, chess960)
                except Exception as exc:
                    raise StudyChapterBuildError("Variant start position is unavailable") from exc
        return StudyChapterDraft(
            variant=variant,
            chess960=chess960,
            initial_fen=initial_fen,
            orientation=orientation,
            variant_ini=variant_ini,
            name=name,
        )

    async def from_game(self, game_id: str, *, name: str | None = None) -> StudyChapterDraft:
        game_id = game_id.strip()
        if not game_id:
            raise StudyChapterBuildError("Game ID is required")
        doc = await self.app_state.db.game.find_one({"_id": game_id})
        if doc is None:
            raise StudyChapterBuildError("Game not found")

        game = await load_game(self.app_state, game_id, cache_finished=False)
        if game is None:
            raise StudyChapterBuildError("Game not found")
        if getattr(game.server_variant, "two_boards", False):
            raise StudyChapterBuildError("Two-board games are not supported by Study yet")

        # get_board(full=True) reconstructs the authoritative saved mainline if this
        # finished game was loaded lazily from MongoDB.
        board_payload = game.get_board(full=True)
        raw_steps = board_payload.get("steps", [])
        if not isinstance(raw_steps, list) or not raw_steps:
            raise StudyChapterBuildError("Saved game has no readable analysis steps")

        nodes: dict[str, StudyTreeNode] = {}
        parent_id: str | None = None
        from study.tree import new_study_node_id

        for raw_step in raw_steps[1:]:
            if not isinstance(raw_step, Mapping):
                raise StudyChapterBuildError("Saved game contains an invalid move step")
            move = raw_step.get("move")
            fen = raw_step.get("fen")
            turn_color = raw_step.get("turnColor")
            if not isinstance(move, str) or not move or not isinstance(fen, str) or not fen:
                raise StudyChapterBuildError("Saved game contains an invalid move step")
            if turn_color not in ("white", "black"):
                raise StudyChapterBuildError("Saved game contains an invalid side to move")
            node_id = new_study_node_id(nodes)
            node = StudyTreeNode(
                id=node_id,
                parent_id=parent_id,
                order=0,
                move=move,
                fen=fen,
                turn_color=cast(StudyOrientation, turn_color),
                check=bool(raw_step.get("check", False)),
                san=str(raw_step["san"]) if raw_step.get("san") is not None else None,
            )
            nodes[node_id] = node
            parent_id = node_id

        variant_ini = str(doc.get("vini") or "") or None
        if variant_ini is None and is_catalogued_variant(game.variant):
            visible = await find_catalogued_variant_doc(self.app_state, game.variant, self.owner)
            if visible is not None:
                variant_ini = str(visible.get("ini") or "") or None

        default_name = f"{game.wplayer.username} - {game.bplayer.username}"
        initial_fen = str(raw_steps[0].get("fen") or game.initial_fen)
        return StudyChapterDraft(
            variant=game.variant,
            chess960=bool(game.chess960),
            initial_fen=initial_fen,
            orientation="white",
            variant_ini=variant_ini,
            root=StudyTree(nodes),
            name=name or default_name,
            source=StudySource("game", game_id),
        )

    async def from_import(
        self,
        *,
        variant: str,
        initial_fen: str,
        tree_payload: Mapping[str, object],
        chess960: bool = False,
        variant_ini: str | None = None,
        name: str | None = None,
        orientation: StudyOrientation = "white",
        description: str = "",
        tags: Mapping[str, str] | None = None,
    ) -> StudyChapterDraft:
        variant = variant.strip().lower()
        if not variant:
            raise StudyChapterBuildError("PGN variant is required")
        initial_fen = initial_fen.strip()
        if not initial_fen:
            raise StudyChapterBuildError("PGN initial FEN is required")
        if len(initial_fen) > MAX_CUSTOM_FEN_LENGTH:
            raise StudyChapterBuildError("PGN initial FEN is too long")

        snapshot = variant_ini if isinstance(variant_ini, str) and variant_ini.strip() else None
        if snapshot is not None:
            if chess960:
                raise StudyChapterBuildError(
                    "Embedded custom variant snapshots do not support Chess960"
                )
            server_variant = ALL_VARIANTS.get(variant)
            if server_variant is not None and not is_catalogued_variant(variant):
                raise StudyChapterBuildError(
                    "Built-in variants cannot use an embedded custom rules snapshot"
                )
            try:
                with study_variant_context(self.app_state, variant, snapshot) as options:
                    if validate_fen(initial_fen, options.runtime_variant, chess960) != FEN_OK:
                        raise StudyChapterBuildError(
                            "Invalid PGN FEN for embedded variant snapshot"
                        )
                    submitted = StudyTree.from_payload(tree_payload)
                    root = self._validated_tree(
                        submitted,
                        variant=variant,
                        initial_fen=initial_fen,
                        chess960=chess960,
                        show_promoted=options.show_promoted,
                        legal_moves_need_history=options.legal_moves_need_history,
                        runtime_variant=options.runtime_variant,
                        comment_author=self.owner,
                    )
            except StudyChapterBuildError:
                raise
            except Exception as exc:
                raise StudyChapterBuildError("Embedded PGN variant snapshot is invalid") from exc
        else:
            snapshot = await self._variant_snapshot(variant, chess960)
            with study_variant_context(self.app_state, variant, snapshot) as options:
                valid, sanitized_fen = sanitize_fen(variant, initial_fen, chess960)
                if not valid:
                    raise StudyChapterBuildError("Invalid PGN FEN for this variant")
                initial_fen = sanitized_fen
                try:
                    submitted = StudyTree.from_payload(tree_payload)
                    root = self._validated_tree(
                        submitted,
                        variant=variant,
                        initial_fen=initial_fen,
                        chess960=chess960,
                        show_promoted=options.show_promoted,
                        legal_moves_need_history=options.legal_moves_need_history,
                        runtime_variant=options.runtime_variant,
                        comment_author=self.owner,
                    )
                except StudyChapterBuildError:
                    raise
                except Exception as exc:
                    raise StudyChapterBuildError("PGN import tree is invalid") from exc

        return StudyChapterDraft(
            variant=variant,
            chess960=chess960,
            initial_fen=initial_fen,
            orientation=orientation,
            variant_ini=snapshot,
            root=root,
            name=name,
            source=StudySource("import"),
            description=description,
            tags=dict(tags or {}),
        )

    async def from_analysis(
        self,
        *,
        variant: str,
        initial_fen: str,
        tree_payload: Mapping[str, object],
        chess960: bool = False,
        game_id: str | None = None,
        name: str | None = None,
    ) -> StudyChapterDraft:
        source_game = await self._analysis_source_game(game_id, variant, chess960)
        source_snapshot = str(source_game.get("vini") or "") if source_game is not None else ""
        variant_ini = source_snapshot or await self._variant_snapshot(variant, chess960)
        with study_variant_context(self.app_state, variant, variant_ini) as options:
            if source_game is not None and source_snapshot:
                # A finished game's analysis was produced under the game's saved rules,
                # which may no longer be the live catalogue definition. In that case do
                # not validate its root FEN through today's public variant. Require the
                # authoritative saved game root instead and validate/replay all moves
                # below through the immutable Study snapshot alias.
                saved_initial_fen = str(source_game.get("if") or "") or FairyBoard.start_fen(
                    options.runtime_variant, chess960
                )
                if initial_fen.strip() != saved_initial_fen:
                    raise StudyChapterBuildError("Analysis start FEN does not match source game")
                sanitized_fen = saved_initial_fen
            else:
                valid, sanitized_fen = sanitize_fen(variant, initial_fen.strip(), chess960)
                if not valid:
                    raise StudyChapterBuildError("Invalid analysis start FEN")
            try:
                submitted = StudyTree.from_payload(tree_payload)
                root = self._validated_tree(
                    submitted,
                    variant=variant,
                    initial_fen=sanitized_fen,
                    chess960=chess960,
                    show_promoted=options.show_promoted,
                    legal_moves_need_history=options.legal_moves_need_history,
                    runtime_variant=options.runtime_variant,
                    comment_author=self.owner,
                )
            except StudyChapterBuildError:
                raise
            except Exception as exc:
                raise StudyChapterBuildError("Analysis tree is invalid") from exc

        source = StudySource("game", game_id) if game_id else StudySource()
        return StudyChapterDraft(
            variant=variant,
            chess960=chess960,
            initial_fen=sanitized_fen,
            orientation="white",
            variant_ini=variant_ini,
            root=root,
            name=name,
            source=source,
        )

    async def _analysis_source_game(
        self, game_id: str | None, variant: str, chess960: bool
    ) -> Mapping[str, object] | None:
        if not game_id:
            return None
        doc = await self.app_state.db.game.find_one({"_id": game_id})
        if not isinstance(doc, Mapping):
            raise StudyChapterBuildError("Source game not found")

        code = str(doc.get("v") or "")
        source_variant = C2V.get(code, code)
        if source_variant != variant:
            raise StudyChapterBuildError("Analysis variant does not match source game")
        if code in TWO_BOARD_VARIANT_CODES:
            raise StudyChapterBuildError("Two-board games are not supported by Study yet")

        raw_chess960 = doc.get("z", 0)
        try:
            source_chess960 = bool(int(raw_chess960))
        except (TypeError, ValueError):
            source_chess960 = bool(raw_chess960)
        if source_chess960 != chess960:
            raise StudyChapterBuildError("Analysis mode does not match source game")
        return doc

    async def _variant_snapshot(self, variant: str, chess960: bool) -> str | None:
        server_variant = ALL_VARIANTS.get(variant)
        if server_variant is None:
            raise StudyChapterBuildError("Unknown variant")
        if server_variant.two_boards:
            raise StudyChapterBuildError("Two-board variants are not supported by Study yet")
        if is_catalogued_variant(variant):
            if chess960:
                raise StudyChapterBuildError("Catalogued variants do not support Chess960 mode")
            doc = await find_catalogued_variant_doc(self.app_state, variant, self.owner)
            if doc is None:
                raise StudyChapterBuildError("Variant is unavailable")
            ini = str(doc.get("ini") or "")
            if not ini:
                raise StudyChapterBuildError("Variant rules snapshot is unavailable")
            return ini
        return None

    @staticmethod
    def _validated_tree(
        tree: StudyTree,
        *,
        variant: str,
        initial_fen: str,
        chess960: bool,
        show_promoted: bool,
        legal_moves_need_history: bool,
        runtime_variant: str,
        comment_author: str,
    ) -> StudyTree:
        rebuilt: dict[str, StudyTreeNode] = {}
        pending = deque([(None, initial_fen, ())])

        while pending:
            parent_id, parent_fen, parent_moves = pending.popleft()
            for submitted in tree.children_of(parent_id):
                try:
                    if legal_moves_need_history:
                        board = FairyBoard(
                            runtime_variant,
                            initial_fen=initial_fen,
                            chess960=chess960,
                            show_promoted=show_promoted,
                            legal_moves_need_history=True,
                        )
                        for stored_move in parent_moves:
                            board.push(stored_move)
                        if board.fen != parent_fen:
                            raise StudyChapterBuildError("Analysis tree parent FEN mismatch")
                    else:
                        board = FairyBoard(
                            runtime_variant,
                            initial_fen=parent_fen,
                            chess960=chess960,
                            show_promoted=show_promoted,
                        )
                    if submitted.move not in board.legal_moves():
                        raise StudyChapterBuildError("Analysis tree contains an illegal move")
                    san = board.get_san(submitted.move)
                    san_san = board.sf.get_san(
                        board.variant,
                        board.fen,
                        submitted.move,
                        board.chess960,
                        NOTATION_SAN,
                    )
                    board.push(submitted.move)
                except StudyChapterBuildError:
                    raise
                except Exception as exc:
                    raise StudyChapterBuildError("Analysis tree cannot be replayed") from exc

                node = StudyTreeNode(
                    id=submitted.id,
                    parent_id=parent_id,
                    order=submitted.order,
                    move=submitted.move,
                    fen=board.fen,
                    turn_color="white" if board.color == WHITE else "black",
                    check=board.is_checked(),
                    san=san,
                    san_san=san_san,
                    force_variation=submitted.force_variation,
                    annotations=StudyChapterBuilder._canonical_annotation_authors(
                        submitted.annotations, comment_author
                    ),
                )
                rebuilt[node.id] = node
                moves = parent_moves + (node.move,)
                pending.append((node.id, node.fen, moves))

        if len(rebuilt) != tree.count():
            raise StudyChapterBuildError("Analysis tree is disconnected")
        return StudyTree(
            rebuilt,
            root_annotations=StudyChapterBuilder._canonical_annotation_authors(
                tree.root_annotations, comment_author
            ),
        )

    @staticmethod
    def _canonical_annotation_authors(
        annotations: StudyAnnotations, comment_author: str
    ) -> StudyAnnotations:
        if not annotations.comments:
            return annotations
        return StudyAnnotations(
            shapes=annotations.shapes,
            comments=tuple(
                StudyComment(comment.id, comment_author, comment.text)
                for comment in annotations.comments
            ),
            nags=annotations.nags,
        )
