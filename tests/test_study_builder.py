from __future__ import annotations

import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, patch

from catalogued_variants import (
    FSF_CATALOGUED_BUILTIN_VARIANTS,
    _build_fsf_builtin_doc,
    register_catalogued_variant_doc,
)
from fairy import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study import variant as study_variant
from study.builder import StudyChapterBuilder, StudyChapterBuildError
from study.variant import (
    StudyVariantCapacityError,
    study_variant_client_doc,
    study_variant_context,
)
from variants import unregister_catalogued_server_variant


class StudyChapterBuilderTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(db=self.db, catalogued_variants={})
        self.builder = StudyChapterBuilder(cast(Any, self.app_state), "owner")

    async def test_blank_and_validated_fen(self) -> None:
        blank = await self.builder.blank_or_fen(variant="chess")
        self.assertEqual(blank.initial_fen, FairyBoard.start_fen("chess"))
        self.assertEqual(blank.root.count(), 0)

        fen = "8/8/8/8/8/8/4K3/7k w - - 0 1"
        custom = await self.builder.blank_or_fen(variant="chess", fen=fen)
        self.assertEqual(custom.initial_fen, fen)

        with self.assertRaisesRegex(StudyChapterBuildError, "Invalid FEN"):
            await self.builder.blank_or_fen(variant="chess", fen="not a fen")

    async def test_randomized_community_game_position_can_be_imported_with_snapshot(self) -> None:
        name = "studysideways960"
        ini = f"[{name}:pawnsideways]\nchess960 = true"
        default = FairyBoard.start_fen("chess")
        metadata = {
            "name": name,
            "ini": ini,
            "startFen": default,
            "width": 8,
            "height": 8,
            "visibility": "public",
        }
        register_catalogued_variant_doc(self.app_state, metadata)
        self.addCleanup(unregister_catalogued_server_variant, name)
        fen = "rnkrqbbn/pppppppp/8/8/8/8/PPPPPPPP/RNKRQBBN w DAda - 0 1"
        draft = await self.builder.from_import(
            variant=name,
            initial_fen=fen,
            chess960=True,
            variant_ini=ini,
            tree_payload={"nodes": []},
        )
        self.assertEqual(draft.variant, name)
        self.assertEqual(draft.initial_fen, fen)
        self.assertTrue(draft.chess960)
        self.assertEqual(draft.variant_ini, ini)
        with patch("study.builder.find_catalogued_variant_doc", AsyncMock(return_value=metadata)):
            custom = await self.builder.blank_or_fen(variant=name, fen=fen, chess960=True)
        self.assertEqual(custom.initial_fen, fen)
        self.assertTrue(custom.chess960)

    async def test_analysis_tree_is_replayed_authoritatively(self) -> None:
        root_fen = FairyBoard.start_fen("chess")
        submitted = {
            "rootAnnotations": {
                "shapes": [{"orig": "e4", "brush": "blue"}],
                "comments": [{"id": "Comment001", "author": "spoofed", "text": "Root note"}],
                "nags": [1],
            },
            "nodes": [
                {
                    "id": "Client0001",
                    "parentId": None,
                    "order": 0,
                    "move": "e2e4",
                    "fen": "fake-fen",
                    "turnColor": "white",
                    "check": True,
                    "san": "fake-san",
                    "eval": {"cp": 35},
                    "annotations": {
                        "shapes": [{"orig": "e4", "dest": "e5", "brush": "red"}],
                        "comments": [
                            {"id": "Comment002", "author": "spoofed", "text": "Node note"}
                        ],
                        "nags": [3],
                    },
                },
                {
                    "id": "Client0002",
                    "parentId": "Client0001",
                    "order": 0,
                    "move": "e7e5",
                    "fen": "another-fake-fen",
                    "turnColor": "black",
                    "check": True,
                    "eval": {"mate": 3},
                },
                {
                    "id": "Client0003",
                    "parentId": None,
                    "order": 1,
                    "move": "d2d4",
                    "fen": "variation-fake-fen",
                    "turnColor": "white",
                    "check": False,
                    "forceVariation": True,
                },
            ],
        }
        draft = await self.builder.from_analysis(
            variant="chess",
            initial_fen=root_fen,
            tree_payload=submitted,
        )

        first = draft.root.nodes["Client0001"]
        self.assertEqual(first.san, "e4")
        self.assertEqual(first.turn_color, "black")
        self.assertFalse(first.check)
        self.assertNotEqual(first.fen, "fake-fen")
        # Submitted evals use the submitted node turn as their POV. Move replay
        # reconstructs the opposite turn for both deliberately bogus payloads, so
        # the builder must preserve the score while rebasing it authoritatively.
        self.assertEqual(first.eval_score, {"cp": -35})
        self.assertEqual(draft.root.nodes["Client0002"].san, "e5")
        self.assertEqual(draft.root.nodes["Client0002"].eval_score, {"mate": -3})
        self.assertTrue(draft.root.nodes["Client0003"].force_variation)
        self.assertEqual([n.id for n in draft.root.children_of(None)], ["Client0001", "Client0003"])
        self.assertEqual(draft.root.root_annotations.comments[0].text, "Root note")
        self.assertEqual(draft.root.root_annotations.comments[0].author, "owner")
        self.assertEqual(first.annotations.comments[0].text, "Node note")
        self.assertEqual(first.annotations.comments[0].author, "owner")
        self.assertEqual(first.annotations.nags, (3,))

    async def test_analysis_preserves_orientation_and_pgn_tags(self) -> None:
        draft = await self.builder.from_analysis(
            variant="chess",
            initial_fen=FairyBoard.start_fen("chess"),
            tree_payload={"nodes": []},
            orientation="black",
            tags={"White": "Alice", "Black": "Bob", "Event": "PyChess casual game"},
        )

        self.assertEqual(draft.orientation, "black")
        self.assertEqual(
            dict(draft.tags),
            {"Black": "Bob", "Event": "PyChess casual game", "White": "Alice"},
        )

    async def test_analysis_rejects_invalid_pgn_tags(self) -> None:
        with self.assertRaisesRegex(StudyChapterBuildError, "PGN tags"):
            await self.builder.from_analysis(
                variant="chess",
                initial_fen=FairyBoard.start_fen("chess"),
                tree_payload={"nodes": []},
                tags={"not valid tag": "value"},
            )

    async def test_analysis_from_saved_game_uses_historical_variant_snapshot(self) -> None:
        variant = "studysource"
        root_fen = FairyBoard.start_fen("chess")
        saved_ini = f"[{variant}:chess]\nstartFen = {root_fen}\n"
        await self.db.game.insert_one({"_id": "gameOld1", "v": variant, "vini": saved_ini, "z": 0})

        draft = await self.builder.from_analysis(
            variant=variant,
            chess960=False,
            initial_fen=root_fen,
            game_id="gameOld1",
            tree_payload={
                "nodes": [
                    {
                        "id": "ClientOld1",
                        "parentId": None,
                        "order": 0,
                        "move": "e2e4",
                        "fen": "fake",
                        "turnColor": "black",
                        "check": False,
                    }
                ]
            },
        )

        self.assertEqual(draft.variant_ini, saved_ini)
        self.assertEqual(draft.source.kind, "game")
        self.assertEqual(draft.source.source_id, "gameOld1")
        self.assertEqual(draft.root.children_of(None)[0].san, "e4")

    async def test_analysis_from_fsf_catalogued_builtin_does_not_require_ini_snapshot(self) -> None:
        doc = _build_fsf_builtin_doc("joust", FSF_CATALOGUED_BUILTIN_VARIANTS["joust"])
        register_catalogued_variant_doc(cast(Any, self.app_state), doc, load_config=False)
        initial_fen = FairyBoard.start_fen("joust")
        move = next(iter(FairyBoard("joust", initial_fen=initial_fen).legal_moves()))
        await self.db.game.insert_one({"_id": "gameFsf1", "v": "joust", "z": 0})
        try:
            draft = await self.builder.from_analysis(
                variant="joust",
                initial_fen=initial_fen,
                game_id="gameFsf1",
                tree_payload={
                    "nodes": [
                        {
                            "id": "Client0001",
                            "parentId": None,
                            "order": 0,
                            "move": move,
                            "fen": "client-fen-is-not-trusted",
                            "turnColor": "black",
                            "check": False,
                        }
                    ]
                },
            )
        finally:
            unregister_catalogued_server_variant("joust")

        self.assertIsNone(draft.variant_ini)
        self.assertEqual(draft.source.kind, "game")
        self.assertEqual(draft.source.source_id, "gameFsf1")
        self.assertEqual(draft.root.children_of(None)[0].move, move)

    async def test_analysis_rejects_catalogued_variant_without_rules_snapshot(self) -> None:
        with (
            patch("study.builder.is_catalogued_variant", return_value=True),
            patch(
                "study.builder.find_catalogued_variant_doc",
                new=AsyncMock(return_value={"name": "chess", "source": "user", "ini": ""}),
            ),
            self.assertRaisesRegex(StudyChapterBuildError, "rules snapshot"),
        ):
            await self.builder.from_analysis(
                variant="chess",
                initial_fen=FairyBoard.start_fen("chess"),
                tree_payload={"nodes": []},
            )

    async def test_analysis_tree_rejects_illegal_move(self) -> None:
        with self.assertRaisesRegex(StudyChapterBuildError, "illegal move"):
            await self.builder.from_analysis(
                variant="chess",
                initial_fen=FairyBoard.start_fen("chess"),
                tree_payload={
                    "nodes": [
                        {
                            "id": "Client0001",
                            "parentId": None,
                            "order": 0,
                            "move": "e2e5",
                            "fen": "fake",
                            "turnColor": "black",
                            "check": False,
                        }
                    ]
                },
            )

    async def test_saved_game_builds_mainline_and_source(self) -> None:
        await self.db.game.insert_one({"_id": "game0001", "vini": ""})
        fake_game = SimpleNamespace(
            server_variant=SimpleNamespace(two_boards=False),
            variant="chess",
            chess960=False,
            initial_fen=FairyBoard.start_fen("chess"),
            date=datetime(2026, 9, 7, tzinfo=UTC),
            result="1-0",
            wrating=2107,
            brating=2224,
            wplayer=SimpleNamespace(username="White", title="FM"),
            bplayer=SimpleNamespace(username="Black", title=""),
            get_board=lambda full=True: {
                "steps": [
                    {
                        "fen": FairyBoard.start_fen("chess"),
                        "turnColor": "white",
                        "clocks": [300000, 300000],
                    },
                    {
                        "move": "e2e4",
                        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                        "turnColor": "black",
                        "check": False,
                        "san": "e4",
                        "clocks": [298000, 300000],
                    },
                ]
            },
        )
        with patch("study.builder.load_game", new=AsyncMock(return_value=fake_game)):
            draft = await self.builder.from_game("game0001")
        self.assertEqual(draft.name, "White - Black")
        self.assertEqual(draft.source.kind, "game")
        self.assertEqual(draft.source.source_id, "game0001")
        self.assertEqual(draft.root.count(), 1)
        self.assertEqual(draft.root.root_clocks, (300000, 300000))
        self.assertEqual(draft.root.children_of(None)[0].move, "e2e4")
        self.assertEqual(draft.root.children_of(None)[0].clocks, (298000, 300000))
        self.assertEqual(draft.tags["WhiteElo"], "2107")
        self.assertEqual(draft.tags["BlackElo"], "2224")
        self.assertEqual(draft.tags["WhiteTitle"], "FM")

    def test_rejects_nonfinite_saved_game_clock(self) -> None:
        with self.assertRaisesRegex(StudyChapterBuildError, "invalid clock data"):
            self.builder._step_clocks({"clocks": [float("nan"), 300000]})

    async def test_rejected_embedded_snapshot_never_reaches_main_pyffish_registry(self) -> None:
        snapshot = (
            "[isolatedstudy:chess]\n"
            "startFen = rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\n"
        )
        from fairy.fairy_board import sf

        before_variants = set(sf.variants())
        with patch("study.variant.validate_catalogued_ini") as main_process_validate:
            for index in range(3):
                with self.assertRaisesRegex(StudyChapterBuildError, "snapshot is invalid"):
                    await self.builder.from_import(
                        variant="isolatedstudy",
                        initial_fen="not a fen",
                        tree_payload={"nodes": []},
                        variant_ini=f"{snapshot}# rejected import {index}\n",
                    )

        main_process_validate.assert_not_called()
        self.assertEqual(set(sf.variants()), before_variants)

    async def test_illegal_embedded_tree_never_reaches_main_pyffish_registry(self) -> None:
        initial_fen = FairyBoard.start_fen("chess")
        snapshot = f"[isolatedtree:chess]\nstartFen = {initial_fen}\n"
        submitted = {
            "nodes": [
                {
                    "id": "Illegal001",
                    "parentId": None,
                    "order": 0,
                    "move": "e2e5",
                    "fen": "client supplied",
                    "turnColor": "white",
                    "check": False,
                }
            ]
        }
        from fairy.fairy_board import sf

        before_variants = set(sf.variants())
        with (
            patch("study.variant.validate_catalogued_ini") as main_process_validate,
            self.assertRaisesRegex(StudyChapterBuildError, "snapshot is invalid"),
        ):
            await self.builder.from_import(
                variant="isolatedtree",
                initial_fen=initial_fen,
                tree_payload=submitted,
                variant_ini=snapshot,
            )

        main_process_validate.assert_not_called()
        self.assertEqual(set(sf.variants()), before_variants)

    async def test_rejects_two_board_game(self) -> None:
        await self.db.game.insert_one({"_id": "game0002"})
        fake_game = SimpleNamespace(server_variant=SimpleNamespace(two_boards=True))
        with (
            patch("study.builder.load_game", new=AsyncMock(return_value=fake_game)),
            self.assertRaisesRegex(StudyChapterBuildError, "Two-board"),
        ):
            await self.builder.from_game("game0002")


class StudyVariantSnapshotTestCase(unittest.TestCase):
    def test_semantic_alias_ignores_comments_and_native_registry_has_hard_cap(self) -> None:
        first = "[studybudget:chess]\ncustomPiece1 = a:KN\n"
        commented = f"{first}# formatting-only historical note\n"
        second = "[studybudget:chess]\ncustomPiece1 = a:BN\n"
        self.assertEqual(
            study_variant._snapshot_alias(first), study_variant._snapshot_alias(commented)
        )

        def validation(ini: str):
            return SimpleNamespace(
                name=study_variant.extract_variant_name(ini),
                start_fen=FairyBoard.start_fen("chess"),
                show_promoted=False,
            )

        with (
            patch("study.variant._SNAPSHOT_NATIVE_ALIASES", set()),
            patch("study.variant._SNAPSHOT_VALIDATION", {}),
            patch("study.variant.STUDY_MAX_NATIVE_SNAPSHOT_VARIANTS", 1),
            patch("study.variant.validate_catalogued_ini", side_effect=validation) as validate_ini,
        ):
            first_validation = study_variant._snapshot_validation(first)
            same_validation = study_variant._snapshot_validation(commented)
            self.assertIs(same_validation, first_validation)
            with self.assertRaisesRegex(StudyVariantCapacityError, "capacity"):
                study_variant._snapshot_validation(second)

        self.assertEqual(validate_ini.call_count, 1)

    def test_current_snapshot_client_doc_reuses_live_metadata_without_alias(self) -> None:
        name = "studycurrent"
        ini = f"[{name}:chess]\nstartFen = 8/8/8/8/8/8/4K3/7k w - - 0 1\n"
        metadata = {
            "ini": ini,
            "displayName": "Current",
            "baseVariant": "chess",
            "startFen": "8/8/8/8/8/8/4K3/7k w - - 0 1",
            "width": 8,
            "height": 8,
            "pieces": ["k"],
            "kingRoles": ["k"],
            "pocketRoles": [],
            "captureToHand": False,
            "promotionType": "normal",
            "promotionRoles": [],
            "promotionOrder": [],
            "showPromoted": False,
            "rulesGate": False,
            "rulesPass": False,
            "showCheckCounters": False,
        }

        app_state = SimpleNamespace(catalogued_variants={name: metadata})
        with patch("study.variant._snapshot_validation") as validate_snapshot:
            with study_variant_context(cast(Any, app_state), name, ini) as options:
                self.assertEqual(options.runtime_variant, name)
            doc = study_variant_client_doc(name, ini, metadata=metadata)

        validate_snapshot.assert_not_called()
        self.assertEqual(doc["displayName"], "Current")
        self.assertEqual(doc["startFen"], metadata["startFen"])

    def test_snapshot_client_doc_and_live_definition_restore(self) -> None:
        name = "studysnapshot"
        live_ini = f"[{name}:chess]\nstartFen = 8/8/8/8/8/8/4K3/7k w - - 0 1\n"
        saved_ini = f"[{name}:chess]\nstartFen = 8/8/8/8/8/8/7k/4K3 w - - 0 1\n"
        app_state = SimpleNamespace(
            catalogued_variants={name: {"ini": live_ini, "displayName": "Live"}}
        )

        from fairy.fairy_board import sf

        sf.load_variant_config(live_ini)
        self.assertEqual(sf.start_fen(name), "8/8/8/8/8/8/4K3/7k w - - 0 1")
        with study_variant_context(cast(Any, app_state), name, saved_ini) as options:
            doc = study_variant_client_doc(name, saved_ini)
            self.assertEqual(doc["ini"], saved_ini)
            self.assertEqual(doc["startFen"], "8/8/8/8/8/8/7k/4K3 w - - 0 1")
            self.assertNotEqual(options.runtime_variant, name)
            self.assertEqual(sf.start_fen(options.runtime_variant), "8/8/8/8/8/8/7k/4K3 w - - 0 1")
            self.assertEqual(sf.start_fen(name), "8/8/8/8/8/8/4K3/7k w - - 0 1")
        self.assertEqual(sf.start_fen(name), "8/8/8/8/8/8/4K3/7k w - - 0 1")


if __name__ == "__main__":
    unittest.main()
