from __future__ import annotations

import re
import secrets
import string
from collections import defaultdict
from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Literal, cast

from study.annotations import StudyAnnotations
from study.constants import STUDY_MAX_NODES_PER_CHAPTER

StudyTurnColor = Literal["white", "black"]

STUDY_NODE_ID_LENGTH = 10
STUDY_TREE_ROOT_KEY = "_"
_NODE_ID_ALPHABET = string.ascii_letters + string.digits
_NODE_ID_RE = re.compile(rf"^[A-Za-z0-9]{{{STUDY_NODE_ID_LENGTH}}}$")
_TURN_COLORS = frozenset(("white", "black"))


def is_study_node_id(value: object) -> bool:
    return isinstance(value, str) and _NODE_ID_RE.fullmatch(value) is not None


def new_study_node_id(existing: Collection[str] = ()) -> str:
    used = set(existing)
    while True:
        node_id = "".join(secrets.choice(_NODE_ID_ALPHABET) for _ in range(STUDY_NODE_ID_LENGTH))
        if node_id not in used:
            return node_id


def _required_str(doc: Mapping[str, object], key: str, *, context: str) -> str:
    value = doc.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{context} field {key!r} must be a non-empty string")
    return value


def _optional_str(doc: Mapping[str, object], key: str, *, context: str) -> str | None:
    value = doc.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(f"{context} field {key!r} must be a string or null")
    return value or None


def _nonnegative_int(doc: Mapping[str, object], key: str, *, default: int = 0, context: str) -> int:
    value = doc.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{context} field {key!r} must be a non-negative integer")
    return value


@dataclass(frozen=True, slots=True)
class StudyTreeNode:
    id: str
    parent_id: str | None
    order: int
    move: str
    fen: str
    turn_color: StudyTurnColor
    check: bool = False
    san: str | None = None
    san_san: str | None = None
    force_variation: bool = False
    annotations: StudyAnnotations = field(default_factory=StudyAnnotations)

    def __post_init__(self) -> None:
        if not is_study_node_id(self.id):
            raise ValueError(f"Invalid Study node id: {self.id!r}")
        if self.parent_id is not None and not is_study_node_id(self.parent_id):
            raise ValueError(f"Invalid Study parent node id: {self.parent_id!r}")
        if self.parent_id == self.id:
            raise ValueError("Study node cannot be its own parent")
        if self.order < 0:
            raise ValueError("Study node order must be non-negative")
        if not self.move:
            raise ValueError("Study node move must be non-empty")
        if not self.fen:
            raise ValueError("Study node FEN must be non-empty")
        if self.turn_color not in _TURN_COLORS:
            raise ValueError(f"Invalid Study node turn color: {self.turn_color!r}")

    def to_document(self) -> dict[str, object]:
        doc: dict[str, object] = {
            "p": self.parent_id or STUDY_TREE_ROOT_KEY,
            "m": self.move,
            "f": self.fen,
            "t": "w" if self.turn_color == "white" else "b",
        }
        if self.order:
            doc["o"] = self.order
        if self.check:
            doc["c"] = True
        if self.san is not None:
            doc["s"] = self.san
        if self.san_san is not None:
            doc["ss"] = self.san_san
        if self.force_variation:
            doc["v"] = True
        if not self.annotations.empty:
            doc["a"] = self.annotations.to_document()
        return doc

    @classmethod
    def from_document(cls, node_id: str, doc: Mapping[str, object]) -> StudyTreeNode:
        context = f"Study node {node_id!r}"
        raw_parent = doc.get("p")
        if raw_parent == STUDY_TREE_ROOT_KEY:
            parent_id = None
        elif is_study_node_id(raw_parent):
            parent_id = cast(str, raw_parent)
        else:
            raise ValueError(f"{context} field 'p' must be a Study node id or root")

        raw_turn = doc.get("t")
        if raw_turn == "w":
            turn_color: StudyTurnColor = "white"
        elif raw_turn == "b":
            turn_color = "black"
        else:
            raise ValueError(f"{context} field 't' must be 'w' or 'b'")

        raw_check = doc.get("c", False)
        if not isinstance(raw_check, bool):
            raise TypeError(f"{context} field 'c' must be boolean")
        raw_force = doc.get("v", False)
        if not isinstance(raw_force, bool):
            raise TypeError(f"{context} field 'v' must be boolean")
        raw_annotations = doc.get("a", {})
        if not isinstance(raw_annotations, Mapping):
            raise TypeError(f"{context} field 'a' must be a mapping")

        return cls(
            id=node_id,
            parent_id=parent_id,
            order=_nonnegative_int(doc, "o", context=context),
            move=_required_str(doc, "m", context=context),
            fen=_required_str(doc, "f", context=context),
            turn_color=turn_color,
            check=raw_check,
            san=_optional_str(doc, "s", context=context),
            san_san=_optional_str(doc, "ss", context=context),
            force_variation=raw_force,
            annotations=StudyAnnotations.from_document(raw_annotations),
        )

    def to_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "id": self.id,
            "parentId": self.parent_id,
            "order": self.order,
            "move": self.move,
            "fen": self.fen,
            "turnColor": self.turn_color,
            "check": self.check,
        }
        if self.san is not None:
            payload["san"] = self.san
        if self.san_san is not None:
            payload["sanSAN"] = self.san_san
        if self.force_variation:
            payload["forceVariation"] = True
        if not self.annotations.empty:
            payload["annotations"] = self.annotations.to_payload()
        return payload

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> StudyTreeNode:
        context = "Study tree node payload"
        raw_parent = payload.get("parentId")
        if raw_parent is not None and not is_study_node_id(raw_parent):
            raise ValueError(f"{context} field 'parentId' must be a Study node id or null")
        raw_turn = payload.get("turnColor")
        if not isinstance(raw_turn, str) or raw_turn not in _TURN_COLORS:
            raise ValueError(f"{context} field 'turnColor' must be white or black")
        raw_check = payload.get("check")
        if not isinstance(raw_check, bool):
            raise TypeError(f"{context} field 'check' must be boolean")
        raw_force = payload.get("forceVariation", False)
        if not isinstance(raw_force, bool):
            raise TypeError(f"{context} field 'forceVariation' must be boolean")
        raw_annotations = payload.get("annotations", {})
        if not isinstance(raw_annotations, Mapping):
            raise TypeError(f"{context} field 'annotations' must be a mapping")

        return cls(
            id=_required_str(payload, "id", context=context),
            parent_id=cast(str | None, raw_parent),
            order=_nonnegative_int(payload, "order", context=context),
            move=_required_str(payload, "move", context=context),
            fen=_required_str(payload, "fen", context=context),
            turn_color=cast(StudyTurnColor, raw_turn),
            check=raw_check,
            san=_optional_str(payload, "san", context=context),
            san_san=_optional_str(payload, "sanSAN", context=context),
            force_variation=raw_force,
            annotations=StudyAnnotations.from_payload(raw_annotations),
        )


@dataclass(frozen=True, slots=True)
class StudyTree:
    """Flat Study tree keyed by globally unique stable node IDs.

    Runtime analysis trees remain free to use their own representation. Persisted nodes
    store parent identity and sibling order instead of recursively nested children, which
    keeps MongoDB documents shallow and makes later per-node updates cheap.
    """

    nodes: Mapping[str, StudyTreeNode] = field(default_factory=dict)
    root_annotations: StudyAnnotations = field(default_factory=StudyAnnotations)

    def __post_init__(self) -> None:
        nodes = dict(self.nodes)
        object.__setattr__(self, "nodes", nodes)
        self._validate(nodes)

    @staticmethod
    def _validate(nodes: Mapping[str, StudyTreeNode]) -> None:
        if len(nodes) > STUDY_MAX_NODES_PER_CHAPTER:
            raise ValueError(
                f"Study tree has {len(nodes)} nodes, maximum is {STUDY_MAX_NODES_PER_CHAPTER}"
            )

        sibling_orders: dict[str | None, set[int]] = defaultdict(set)
        for node_id, node in nodes.items():
            if node_id != node.id:
                raise ValueError(f"Study tree key {node_id!r} does not match node id {node.id!r}")
            if node.parent_id is not None and node.parent_id not in nodes:
                raise ValueError(f"Study node {node.id!r} has missing parent {node.parent_id!r}")
            if node.order in sibling_orders[node.parent_id]:
                raise ValueError(
                    f"Study siblings below {node.parent_id!r} have duplicate order {node.order}"
                )
            sibling_orders[node.parent_id].add(node.order)

        # Parent references make the storage flat, so explicitly reject cycles. Walking
        # parent links is iterative to stay safe even for unusually long variant games.
        verified: set[str] = set()
        for node_id in nodes:
            if node_id in verified:
                continue
            chain: list[str] = []
            chain_set: set[str] = set()
            current_id: str | None = node_id
            while current_id is not None and current_id not in verified:
                if current_id in chain_set:
                    raise ValueError(f"Study tree contains a parent cycle at node {current_id!r}")
                chain.append(current_id)
                chain_set.add(current_id)
                current_id = nodes[current_id].parent_id
            verified.update(chain)

    def count(self) -> int:
        return len(self.nodes)

    def children_of(self, parent_id: str | None) -> tuple[StudyTreeNode, ...]:
        return tuple(
            sorted(
                (node for node in self.nodes.values() if node.parent_id == parent_id),
                key=lambda node: node.order,
            )
        )

    def path_for_node(self, node_id: str) -> str:
        if node_id not in self.nodes:
            raise KeyError(node_id)
        segments: list[str] = []
        current_id: str | None = node_id
        while current_id is not None:
            segments.append(current_id)
            current_id = self.nodes[current_id].parent_id
        return ".".join(reversed(segments))

    def node_at_path(self, path: str) -> StudyTreeNode | None:
        if not path:
            return None
        segments = path.split(".")
        parent_id: str | None = None
        node: StudyTreeNode | None = None
        for segment in segments:
            if not is_study_node_id(segment):
                return None
            node = self.nodes.get(segment)
            if node is None or node.parent_id != parent_id:
                return None
            parent_id = node.id
        return node

    def to_document(self) -> dict[str, object]:
        # Keep a dedicated root record like lila's StudyFlatTree so start-position
        # annotations are first-class and can be updated incrementally.
        root_record: dict[str, object] = {}
        if not self.root_annotations.empty:
            root_record["a"] = self.root_annotations.to_document()
        doc: dict[str, object] = {STUDY_TREE_ROOT_KEY: root_record}
        for node_id, node in self.nodes.items():
            doc[node_id] = node.to_document()
        return doc

    @classmethod
    def from_document(cls, doc: Mapping[str, object]) -> StudyTree:
        raw_root = doc.get(STUDY_TREE_ROOT_KEY)
        if not isinstance(raw_root, Mapping):
            raise TypeError("Study tree root record must be a mapping")
        raw_root_annotations = raw_root.get("a", {})
        if not isinstance(raw_root_annotations, Mapping):
            raise TypeError("Study tree root annotation record must be a mapping")
        unexpected_root_keys = set(raw_root) - {"a"}
        if unexpected_root_keys:
            raise ValueError("Study tree root record contains unsupported fields")
        root_annotations = StudyAnnotations.from_document(raw_root_annotations)

        nodes: dict[str, StudyTreeNode] = {}
        for node_id, raw_node in doc.items():
            if node_id == STUDY_TREE_ROOT_KEY:
                continue
            if not is_study_node_id(node_id):
                raise ValueError(f"Invalid Study tree node key: {node_id!r}")
            if not isinstance(raw_node, Mapping):
                raise TypeError(f"Study node {node_id!r} must be a mapping")
            nodes[node_id] = StudyTreeNode.from_document(node_id, raw_node)
        return cls(nodes, root_annotations=root_annotations)

    def to_payload(self) -> dict[str, object]:
        # Payload order is deterministic and topological, but consumers must use the
        # explicit sibling `order` field rather than relying on array order.
        children: dict[str | None, list[StudyTreeNode]] = defaultdict(list)
        for node in self.nodes.values():
            children[node.parent_id].append(node)
        for siblings in children.values():
            siblings.sort(key=lambda node: node.order)

        pending = list(reversed(children[None]))
        ordered: list[StudyTreeNode] = []
        while pending:
            node = pending.pop()
            ordered.append(node)
            pending.extend(reversed(children[node.id]))
        payload: dict[str, object] = {"nodes": [node.to_payload() for node in ordered]}
        if not self.root_annotations.empty:
            payload["rootAnnotations"] = self.root_annotations.to_payload()
        return payload

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> StudyTree:
        raw_nodes = payload.get("nodes")
        raw_root_annotations = payload.get("rootAnnotations", {})
        if not isinstance(raw_root_annotations, Mapping):
            raise TypeError("Study tree payload field 'rootAnnotations' must be a mapping")
        if not isinstance(raw_nodes, Sequence) or isinstance(raw_nodes, (str, bytes)):
            raise TypeError("Study tree payload field 'nodes' must be a list")
        nodes: dict[str, StudyTreeNode] = {}
        for raw_node in raw_nodes:
            if not isinstance(raw_node, Mapping):
                raise TypeError("Study tree payload nodes must be mappings")
            node = StudyTreeNode.from_payload(raw_node)
            if node.id in nodes:
                raise ValueError(f"Duplicate Study node id: {node.id!r}")
            nodes[node.id] = node
        return cls(nodes, root_annotations=StudyAnnotations.from_payload(raw_root_annotations))
