from __future__ import annotations

import unittest

from study.conceal import preferred_mainline_depth_for_path, reconciled_conceal_ply
from study.tree import StudyTree, StudyTreeNode


def node(
    node_id: str,
    *,
    parent_id: str | None = None,
    order: int = 0,
    force_variation: bool = False,
) -> StudyTreeNode:
    return StudyTreeNode(
        id=node_id,
        parent_id=parent_id,
        order=order,
        move="e2e4",
        fen="position",
        turn_color="black",
        san="e4",
        san_san="e4",
        force_variation=force_variation,
    )


class StudyConcealTestCase(unittest.TestCase):
    def test_preferred_mainline_depth_is_root_relative_and_rejects_side_variations(self) -> None:
        first = "MainNode01"
        second = "MainNode02"
        side = "SideNode01"
        tree = StudyTree(
            {
                first: node(first),
                second: node(second, parent_id=first),
                side: node(side, order=1),
            }
        )

        self.assertEqual(preferred_mainline_depth_for_path(tree, ""), 0)
        self.assertEqual(preferred_mainline_depth_for_path(tree, first), 1)
        self.assertEqual(preferred_mainline_depth_for_path(tree, f"{first}.{second}"), 2)
        self.assertIsNone(preferred_mainline_depth_for_path(tree, side))

    def test_reconcile_keeps_only_the_unchanged_revealed_mainline_prefix(self) -> None:
        first = "MainNode01"
        old_second = "MainNode02"
        new_second = "SideNode01"
        previous = StudyTree(
            {
                first: node(first),
                old_second: node(old_second, parent_id=first),
                new_second: node(new_second, parent_id=first, order=1),
            }
        )
        current = StudyTree(
            {
                first: node(first),
                old_second: node(old_second, parent_id=first, order=1),
                new_second: node(new_second, parent_id=first),
            }
        )

        self.assertEqual(reconciled_conceal_ply(previous, current, 2), 1)
        self.assertEqual(reconciled_conceal_ply(previous, current, 1), 1)
        self.assertIsNone(reconciled_conceal_ply(previous, current, None))
