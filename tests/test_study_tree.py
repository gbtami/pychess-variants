from __future__ import annotations

import unittest

from study.annotations import StudyAnnotations, StudyComment, StudyShape
from study.tree import (
    STUDY_NODE_ID_LENGTH,
    STUDY_TREE_ROOT_KEY,
    StudyTree,
    StudyTreeNode,
    StudyTurnColor,
    is_study_node_id,
    new_study_node_id,
)

ROOT_A = "RootNode01"
ROOT_B = "RootNode02"
CHILD_A = "ChildNode1"
DEEP_A = "DeepNode01"


def make_node(
    node_id: str,
    *,
    parent_id: str | None = None,
    order: int = 0,
    move: str = "e2e4",
    fen: str = "fen after move",
    turn_color: StudyTurnColor = "black",
    check: bool = False,
    force_variation: bool = False,
    annotations: StudyAnnotations | None = None,
) -> StudyTreeNode:
    return StudyTreeNode(
        id=node_id,
        parent_id=parent_id,
        order=order,
        move=move,
        fen=fen,
        turn_color=turn_color,
        check=check,
        san="e4",
        san_san="e4",
        force_variation=force_variation,
        annotations=annotations or StudyAnnotations(),
    )


class StudyTreeTestCase(unittest.TestCase):
    def test_node_ids_are_compact_collision_resistant_path_segments(self) -> None:
        ids = {new_study_node_id() for _ in range(200)}
        self.assertEqual(len(ids), 200)
        self.assertTrue(all(len(node_id) == STUDY_NODE_ID_LENGTH for node_id in ids))
        self.assertTrue(all(is_study_node_id(node_id) for node_id in ids))

    def test_flat_document_round_trip_preserves_order_and_force_variation(self) -> None:
        tree = StudyTree(
            {
                ROOT_A: make_node(ROOT_A, move="e2e4"),
                ROOT_B: make_node(ROOT_B, order=1, move="d2d4", force_variation=True),
                CHILD_A: make_node(CHILD_A, parent_id=ROOT_A, move="e7e5", turn_color="white"),
            }
        )

        doc = tree.to_document()
        self.assertEqual(doc[STUDY_TREE_ROOT_KEY], {})
        self.assertEqual(doc[ROOT_A]["p"], STUDY_TREE_ROOT_KEY)  # type: ignore[index]
        self.assertNotIn("children", doc[ROOT_A])  # type: ignore[operator]
        self.assertEqual(doc[ROOT_B]["o"], 1)  # type: ignore[index]
        self.assertTrue(doc[ROOT_B]["v"])  # type: ignore[index]

        restored = StudyTree.from_document(doc)
        self.assertEqual(restored, tree)
        self.assertEqual([node.id for node in restored.children_of(None)], [ROOT_A, ROOT_B])
        self.assertEqual(restored.children_of(ROOT_A)[0].id, CHILD_A)

    def test_root_and_node_annotations_round_trip_in_document_and_payload(self) -> None:
        root_annotations = StudyAnnotations(
            shapes=(StudyShape("e4", "e5", "red"),),
            comments=(StudyComment("Comment001", "owner", "Root note"),),
            nags=(1, 3),
        )
        node_annotations = StudyAnnotations(
            shapes=(StudyShape("d4", brush="blue"),),
            comments=(StudyComment("Comment002", "owner", "Node note"),),
            nags=(2,),
        )
        tree = StudyTree(
            {ROOT_A: make_node(ROOT_A, annotations=node_annotations)},
            root_annotations=root_annotations,
        )

        doc = tree.to_document()
        self.assertEqual(doc[STUDY_TREE_ROOT_KEY]["a"]["n"], [1, 3])  # type: ignore[index]
        self.assertIn("a", doc[ROOT_A])  # type: ignore[operator]
        self.assertEqual(StudyTree.from_document(doc), tree)

        payload = tree.to_payload()
        self.assertEqual(payload["rootAnnotations"]["nags"], [1, 3])  # type: ignore[index]
        self.assertEqual(StudyTree.from_payload(payload), tree)

    def test_payload_round_trip_and_stable_path_resolution(self) -> None:
        tree = StudyTree(
            {
                ROOT_A: make_node(ROOT_A),
                CHILD_A: make_node(CHILD_A, parent_id=ROOT_A, move="e7e5", turn_color="white"),
                DEEP_A: make_node(DEEP_A, parent_id=CHILD_A, move="g1f3"),
            }
        )

        payload = tree.to_payload()
        restored = StudyTree.from_payload(payload)
        self.assertEqual(restored, tree)
        path = f"{ROOT_A}.{CHILD_A}.{DEEP_A}"
        self.assertEqual(restored.path_for_node(DEEP_A), path)
        self.assertEqual(restored.node_at_path(path), restored.nodes[DEEP_A])
        self.assertIsNone(restored.node_at_path(f"{ROOT_B}.{CHILD_A}"))

    def test_rejects_duplicate_sibling_order(self) -> None:
        with self.assertRaisesRegex(ValueError, "duplicate order"):
            StudyTree(
                {
                    ROOT_A: make_node(ROOT_A),
                    ROOT_B: make_node(ROOT_B, move="d2d4"),
                }
            )

    def test_rejects_parent_cycles(self) -> None:
        with self.assertRaisesRegex(ValueError, "parent cycle"):
            StudyTree(
                {
                    ROOT_A: make_node(ROOT_A, parent_id=ROOT_B),
                    ROOT_B: make_node(ROOT_B, parent_id=ROOT_A, move="d2d4"),
                }
            )

    def test_long_mainline_stays_flat_and_non_recursive(self) -> None:
        nodes: dict[str, StudyTreeNode] = {}
        parent_id: str | None = None
        for idx in range(1_200):
            node_id = f"N{idx:09d}"
            nodes[node_id] = make_node(node_id, parent_id=parent_id, move=f"m{idx}")
            parent_id = node_id

        tree = StudyTree(nodes)
        doc = tree.to_document()
        restored = StudyTree.from_document(doc)
        self.assertEqual(restored.count(), 1_200)
        self.assertEqual(len(doc), 1_201)


if __name__ == "__main__":
    unittest.main()
