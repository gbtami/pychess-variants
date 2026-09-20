from __future__ import annotations

from study.tree import StudyTree


def preferred_mainline_depth_for_path(tree: StudyTree, path: str) -> int | None:
    """Return the root-relative depth when ``path`` is a preferred-mainline prefix.

    Concealment deliberately counts tree edges from the chapter root. A custom-FEN
    chapter therefore still starts at depth 0 regardless of its move number or side
    to move. Side-variation paths return ``None`` and never advance shared reveal
    state.
    """

    if not path:
        return 0
    segments = path.split(".")
    mainline = tree.preferred_mainline()
    if len(segments) > len(mainline):
        return None
    for segment, node in zip(segments, mainline, strict=False):
        if segment != node.id:
            return None
    return len(segments)


def reconciled_conceal_ply(
    previous: StudyTree,
    current: StudyTree,
    conceal_ply: int | None,
) -> int | None:
    """Clamp reveal progress to the unchanged preferred-mainline prefix.

    When an edit changes the authored mainline, positions beyond the first changed
    node are no longer guaranteed to be the sequence that was previously revealed.
    Keep only the reveal depth whose node IDs are unchanged in both trees.
    """

    if conceal_ply is None:
        return None
    previous_ids = tuple(node.id for node in previous.preferred_mainline())
    current_ids = tuple(node.id for node in current.preferred_mainline())
    common = 0
    for old_id, new_id in zip(previous_ids, current_ids, strict=False):
        if old_id != new_id:
            break
        common += 1
    return min(conceal_ply, common)
