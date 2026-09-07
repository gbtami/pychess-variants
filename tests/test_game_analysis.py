from __future__ import annotations

import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast

import test_fishnet
from analysis_advice import advice_for_move, prepare_analysis_line
from compress import R2C
from game_analysis import annotated_game_moves, enrich_game_analysis
from study.analysis import _merge_analysis_into_tree
from study.models import StudyChapter
from study.tree import StudyTree, StudyTreeNode
from test_embassy_castling_pgn import make_game
from typing_defs import AnalysisStep
from utils import pgn as export_pgn
from variants import get_server_variant

MOVES = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"]
ROWS = [
    {"score": {"cp": 50}, "depth": 18, "pv": "d2d4 d7d5"},
    {"score": {"cp": -40}, "depth": 18, "pv": "c7c5 g1f3 d7d6"},
    {"score": {"cp": 400}, "depth": 18, "pv": "f1c4 b8c6"},
    {"score": {"cp": -380}, "depth": 18, "pv": "b8c6 f1b5"},
    {"score": {"cp": 390}, "depth": 18, "pv": "f1b5 a7a6"},
    {"score": {"cp": -390}, "depth": 18},
]


def analysed_game(initial_fen: str = "", moves: list[str] = MOVES, variant: str = "chess"):
    game = make_game("analysis-game", variant, initial_fen, corr=True)
    game.steps = [
        {"fen": game.board.fen, "turnColor": "white" if game.board.color == 0 else "black"}
    ]
    game.steps.extend(prepare_analysis_line(game.board, moves))
    return game


class GameAdviceTestCase(unittest.TestCase):
    def test_game_and_study_produce_identical_advice_and_variations(self):
        game = analysed_game()
        nodes = {}
        for ply, step in enumerate(game.steps[1:], start=1):
            node_id = f"StudyNode{ply}"
            nodes[node_id] = StudyTreeNode(
                id=node_id,
                parent_id=f"StudyNode{ply - 1}" if ply > 1 else None,
                order=0,
                move=step["move"],
                fen=step["fen"],
                turn_color=step["turnColor"],
                check=step["check"],
                san=step["san"],
                san_san=step["sanSAN"],
            )
        now = datetime.now(UTC)
        chapter = StudyChapter(
            id="chapter1",
            study_id="study001",
            name="Game",
            order=0,
            owner="owner",
            variant="chess",
            initial_fen=game.board.initial_fen,
            orientation="white",
            root=StudyTree(nodes),
            created_at=now,
            updated_at=now,
        )
        tree = _merge_analysis_into_tree(
            cast(Any, SimpleNamespace(catalogued_variants={})), chapter, cast(Any, ROWS)
        )
        for ply, row in enumerate(ROWS):
            analysis: AnalysisStep = {"s": row["score"]}
            enrich_game_analysis(
                game, ply, cast(Any, ROWS[ply - 1] if ply else None), cast(Any, row), analysis
            )
            game.steps[ply]["analysis"] = analysis
            if ply == 0:
                continue
            study_node = tree.nodes[f"StudyNode{ply}"]
            if "advice" in analysis:
                advice = analysis["advice"]
                self.assertEqual(study_node.annotations.nags, (advice["nag"],))
                self.assertEqual(study_node.annotations.comments[0].text, advice["comment"])
                parent_id = study_node.parent_id
                for alternative in advice["variation"]:
                    matching = next(
                        n for n in tree.children_of(parent_id) if n.move == alternative["move"]
                    )
                    self.assertEqual(matching.fen, alternative["fen"])
                    self.assertEqual(matching.san_san, alternative["sanSAN"])
                    parent_id = matching.id
            else:
                self.assertEqual(study_node.annotations.nags, ())
        self.assertEqual(game.steps[2]["analysis"]["p"], "f1c4 b8c6")
        self.assertIn("e5 $4 {Blunder. c5 was best.} (1... c5 2. Nf3 d6)", game.pgn)
        doc = {
            "_id": game.id,
            "v": get_server_variant("chess", False).code,
            "m": list(map(get_server_variant("chess", False).move_encoding, MOVES)),
            "d": now,
            "us": ["White", "Black"],
            "r": R2C["*"],
            "b": 5,
            "i": 0,
            "a": [step["analysis"] for step in game.steps],
        }
        self.assertIn("e5 $4 {Blunder. c5 was best.} (1... c5 2. Nf3 d6)", export_pgn(doc))

    def test_black_start_uses_actual_mover_and_pgn_number(self):
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 7"
        game = analysed_game(fen, ["e7e5", "e2e4"])
        analysis: AnalysisStep = {"s": {"cp": 400}}
        enrich_game_analysis(
            game, 2, {"score": {"cp": 40}, "pv": "d2d4 d7d6"}, {"score": {"cp": 400}}, analysis
        )
        self.assertEqual(analysis["advice"]["comment"], "Blunder. d4 was best.")
        text = annotated_game_moves(["e5", "e4"], fen, [None, None, analysis])
        self.assertEqual(text, "7... e5 8. e4 $4 {Blunder. d4 was best.} (8. d4 d6)")

    def test_mate_transitions_and_stable_advantage(self):
        cases = [
            ({"cp": 0}, {"mate": 3}, "Checkmate is now unavoidable"),
            ({"mate": 3}, {"cp": 0}, "Lost forced checkmate sequence"),
            ({"cp": 400}, {"cp": -400}, None),
        ]
        for previous, current, description in cases:
            with self.subTest(previous=previous, current=current):
                advice = advice_for_move(
                    previous, current, previous_side_to_move="white", current_side_to_move="black"
                )
                self.assertEqual(advice.description if advice else None, description)

    def test_judgment_thresholds_for_both_colors(self):
        for side, next_side in (("white", "black"), ("black", "white")):
            for cp, nag in ((20, None), (60, 6), (120, 2), (200, 4)):
                with self.subTest(side=side, cp=cp):
                    advice = advice_for_move(
                        {"cp": 0},
                        {"cp": cp},
                        previous_side_to_move=side,
                        current_side_to_move=next_side,
                    )
                    self.assertEqual(advice.nag if advice else None, nag)

    def test_history_required_replay_preserves_the_game_board(self):
        game = analysed_game()
        game.board.legal_moves_need_history = True
        original_fen = game.board.fen
        original_moves = list(game.board.move_stack)
        analysis: AnalysisStep = {"s": ROWS[2]["score"]}
        enrich_game_analysis(game, 2, cast(Any, ROWS[1]), cast(Any, ROWS[2]), analysis)
        self.assertEqual(analysis["advice"]["comment"], "Blunder. c5 was best.")
        self.assertEqual(game.board.fen, original_fen)
        self.assertEqual(game.board.move_stack, original_moves)

    def test_crazyhouse_alternative_can_start_with_a_drop(self):
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[n] w KQkq - 0 1"
        game = analysed_game(fen, ["e2e4", "e7e5"], "crazyhouse")
        analysis: AnalysisStep = {"s": {"cp": 400}}
        enrich_game_analysis(
            game,
            2,
            {"score": {"cp": -40}, "pv": "N@f6 g1f3"},
            {"score": {"cp": 400}},
            analysis,
        )
        self.assertEqual(analysis["advice"]["comment"], "Blunder. N@f6 was best.")
        self.assertEqual(analysis["advice"]["variation"][0]["move"], "N@f6")

    def test_invalid_later_pv_move_drops_entire_advice(self):
        game = analysed_game()
        analysis: AnalysisStep = {"s": {"cp": 400}}
        enrich_game_analysis(
            game, 2, {"score": {"cp": -40}, "pv": "c7c5 g1g8"}, {"score": {"cp": 400}}, analysis
        )
        self.assertNotIn("advice", analysis)
        self.assertNotIn("p", analysis)

    def test_old_saved_analysis_pgn_is_unchanged(self):
        game = analysed_game()
        original = game.pgn
        for step in game.steps:
            step["analysis"] = {"s": {"cp": 20}, "d": 18, "p": "a2a3"}
        self.assertEqual(game.pgn, original)


class GameAnalysisEndpointTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_partial_results_persist_and_reload_without_duplicates(self):
        game = analysed_game()
        app_state = test_fishnet.FishnetAnalysisPvRegressionTestCase._make_app_state(
            cast(Any, game)
        )
        game.server_variant = get_server_variant("chess", False)
        call = test_fishnet.FishnetAnalysisPvRegressionTestCase._call
        partial = [None, None, *ROWS[2:-1], None]
        await call(app_state, cast(Any, game), partial)
        self.assertNotIn("advice", game.steps[2]["analysis"])
        count = app_state.users["botuser"].send_game_message.await_count
        partial[1] = ROWS[1]
        await call(app_state, cast(Any, game), partial)
        self.assertEqual(game.steps[2]["analysis"]["advice"]["nag"], 4)
        self.assertEqual(app_state.users["botuser"].send_game_message.await_count, count + 2)
        messages = app_state.users["botuser"].send_game_message.call_args_list
        self.assertIn("Blunder. c5 was best.", messages[-1].args[1]["pgn"])
        await call(app_state, cast(Any, game), partial)
        self.assertEqual(app_state.users["botuser"].send_game_message.await_count, count + 2)
        await call(app_state, cast(Any, game), ROWS)
        saved = app_state.db.game.find_one_and_update.call_args.args[1]["$set"]["a"]
        self.assertEqual(saved, game.analysis)
        reloaded = analysed_game()
        reloaded.steps = reloaded.steps[:1]
        reloaded.analysis = saved
        reloaded.create_steps()
        self.assertEqual(
            reloaded.steps[2]["analysis"]["advice"]["comment"], "Blunder. c5 was best."
        )
        self.assertNotIn("work1", app_state.fishnet_works)
