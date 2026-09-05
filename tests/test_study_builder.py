from __future__ import annotations

import unittest
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, patch

from fairy import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study.builder import StudyChapterBuilder, StudyChapterBuildError
from study.variant import study_variant_client_doc, study_variant_context


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
        self.assertEqual(draft.root.nodes["Client0002"].san, "e5")
        self.assertTrue(draft.root.nodes["Client0003"].force_variation)
        self.assertEqual([n.id for n in draft.root.children_of(None)], ["Client0001", "Client0003"])
        self.assertEqual(draft.root.root_annotations.comments[0].text, "Root note")
        self.assertEqual(draft.root.root_annotations.comments[0].author, "owner")
        self.assertEqual(first.annotations.comments[0].text, "Node note")
        self.assertEqual(first.annotations.comments[0].author, "owner")
        self.assertEqual(first.annotations.nags, (3,))

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
            wplayer=SimpleNamespace(username="White"),
            bplayer=SimpleNamespace(username="Black"),
            get_board=lambda full=True: {
                "steps": [
                    {"fen": FairyBoard.start_fen("chess"), "turnColor": "white"},
                    {
                        "move": "e2e4",
                        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                        "turnColor": "black",
                        "check": False,
                        "san": "e4",
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
        self.assertEqual(draft.root.children_of(None)[0].move, "e2e4")

    async def test_rejects_two_board_game(self) -> None:
        await self.db.game.insert_one({"_id": "game0002"})
        fake_game = SimpleNamespace(server_variant=SimpleNamespace(two_boards=True))
        with (
            patch("study.builder.load_game", new=AsyncMock(return_value=fake_game)),
            self.assertRaisesRegex(StudyChapterBuildError, "Two-board"),
        ):
            await self.builder.from_game("game0002")


class StudyVariantSnapshotTestCase(unittest.TestCase):
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
