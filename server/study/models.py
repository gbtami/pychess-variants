from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal, cast

from newid import new_id

from study.annotations import canonical_description, canonical_tags
from study.constants import STUDY_SEARCH_MAX_TOKENS
from study.tree import StudyTree

StudyVisibility = Literal["private", "unlisted", "public"]
StudyMemberRole = Literal["read", "write"]
StudySourceKind = Literal["scratch", "game", "study", "import"]
StudyOrientation = Literal["white", "black"]

_VISIBILITIES = frozenset(("private", "unlisted", "public"))
_MEMBER_ROLES = frozenset(("read", "write"))
_SOURCE_KINDS = frozenset(("scratch", "game", "study", "import"))
_ORIENTATIONS = frozenset(("white", "black"))


def study_visibility(value: object) -> StudyVisibility:
    if not isinstance(value, str) or value not in _VISIBILITIES:
        raise ValueError(f"Unknown Study visibility: {value!r}")
    return cast(StudyVisibility, value)


def study_member_role(value: object) -> StudyMemberRole:
    if not isinstance(value, str) or value not in _MEMBER_ROLES:
        raise ValueError(f"Unknown Study member role: {value!r}")
    return cast(StudyMemberRole, value)


def _search_words(value: str) -> tuple[str, ...]:
    words: list[str] = []
    current: list[str] = []
    for char in value.casefold():
        if char.isalnum():
            current.append(char)
        elif current:
            words.append("".join(current))
            current.clear()
    if current:
        words.append("".join(current))
    return tuple(words)


def study_search_tokens(name: str, owner: str, *content: str) -> tuple[str, ...]:
    """Return bounded word-prefix tokens for Study discovery.

    The Study name and owner are always passed first so they retain priority if
    unusually large chapter metadata reaches the global token budget. Chapter
    names, variants, descriptions, and PGN tags are appended by the storage
    layer for richer discovery.
    """

    tokens: set[str] = set()
    for value in (name, owner, *content):
        for word in _search_words(value):
            if len(word) < 3:
                continue
            # Cap each individual prefix and the complete multikey array. Long
            # annotation text must never grow the Study index without bound.
            for length in range(3, min(len(word), 32) + 1):
                tokens.add(word[:length])
                if len(tokens) >= STUDY_SEARCH_MAX_TOKENS:
                    return tuple(sorted(tokens))
    return tuple(sorted(tokens))


def study_search_query_tokens(value: str) -> tuple[str, ...]:
    """Normalize a user query to the same searchable word-prefix vocabulary."""

    return tuple(dict.fromkeys(word[:32] for word in _search_words(value) if len(word) >= 3))


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _required_str(doc: Mapping[str, object], key: str) -> str:
    value = doc.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"Study document field {key!r} must be a non-empty string")
    return value


def _optional_str(doc: Mapping[str, object], key: str) -> str | None:
    value = doc.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(f"Study document field {key!r} must be a string or null")
    return value or None


def _required_datetime(doc: Mapping[str, object], key: str) -> datetime:
    value = doc.get(key)
    if not isinstance(value, datetime):
        raise TypeError(f"Study document field {key!r} must be a datetime")
    return _utc(value)


def _nonnegative_int(doc: Mapping[str, object], key: str, *, default: int | None = None) -> int:
    value = doc.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"Study document field {key!r} must be a non-negative integer")
    return value


def _positive_int(doc: Mapping[str, object], key: str) -> int:
    value = doc.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"Study document field {key!r} must be a positive integer")
    return value


@dataclass(frozen=True, slots=True)
class StudySource:
    kind: StudySourceKind = "scratch"
    source_id: str | None = None

    def encode(self) -> str:
        if self.kind in ("game", "study"):
            if not self.source_id:
                raise ValueError(f"Study source {self.kind!r} requires an id")
            return f"{self.kind} {self.source_id}"
        if self.source_id:
            raise ValueError(f"Study source {self.kind!r} does not accept an id")
        return self.kind

    @classmethod
    def decode(cls, value: object) -> StudySource:
        if not isinstance(value, str) or not value:
            raise ValueError("Study source must be a non-empty string")
        kind, separator, source_id = value.partition(" ")
        if kind not in _SOURCE_KINDS:
            raise ValueError(f"Unknown Study source kind: {kind!r}")
        typed_kind = cast(StudySourceKind, kind)
        if typed_kind in ("game", "study"):
            if not separator or not source_id:
                raise ValueError(f"Study source {typed_kind!r} requires an id")
            return cls(typed_kind, source_id)
        if separator:
            raise ValueError(f"Study source {typed_kind!r} does not accept an id")
        return cls(typed_kind)


@dataclass(frozen=True, slots=True)
class Study:
    id: str
    name: str
    owner: str
    members: Mapping[str, StudyMemberRole]
    created_at: datetime
    updated_at: datetime
    visibility: StudyVisibility = "private"
    source: StudySource = field(default_factory=StudySource)
    current_chapter: str | None = None
    current_path: str | None = None
    settings: Mapping[str, object] = field(default_factory=dict)
    revision: int = 0

    def to_document(self) -> dict[str, object]:
        if self.owner not in self.members or self.members[self.owner] != "write":
            raise ValueError("Study owner must be a write member")
        if self.visibility not in _VISIBILITIES:
            raise ValueError(f"Unknown Study visibility: {self.visibility!r}")
        if self.revision < 0:
            raise ValueError("Study revision must be non-negative")

        doc: dict[str, object] = {
            "_id": self.id,
            "name": self.name,
            "owner": self.owner,
            "members": dict(self.members),
            "memberIds": sorted(self.members),
            "writeMembers": sorted(
                username for username, role in self.members.items() if role == "write"
            ),
            "visibility": self.visibility,
            "source": self.source.encode(),
            "createdAt": _utc(self.created_at),
            "updatedAt": _utc(self.updated_at),
            "revision": self.revision,
            "searchTokens": list(study_search_tokens(self.name, self.owner)),
        }
        if self.current_chapter is not None:
            doc["currentChapter"] = self.current_chapter
        if self.current_path is not None:
            doc["currentPath"] = self.current_path
        if self.settings:
            doc["settings"] = dict(self.settings)
        return doc

    @classmethod
    def from_document(cls, doc: Mapping[str, object]) -> Study:
        owner = _required_str(doc, "owner")
        raw_members = doc.get("members")
        if not isinstance(raw_members, Mapping):
            raise TypeError("Study document field 'members' must be a mapping")
        members: dict[str, StudyMemberRole] = {}
        for username, role in raw_members.items():
            if not isinstance(username, str) or not username:
                raise ValueError("Study member usernames must be non-empty strings")
            if not isinstance(role, str) or role not in _MEMBER_ROLES:
                raise ValueError(f"Unknown Study member role for {username!r}: {role!r}")
            members[username] = cast(StudyMemberRole, role)
        if members.get(owner) != "write":
            raise ValueError("Study owner must be a write member")

        raw_visibility = study_visibility(doc.get("visibility", "private"))

        raw_settings = doc.get("settings", {})
        if not isinstance(raw_settings, Mapping):
            raise TypeError("Study document field 'settings' must be a mapping")

        return cls(
            id=_required_str(doc, "_id"),
            name=_required_str(doc, "name"),
            owner=owner,
            members=members,
            visibility=raw_visibility,
            source=StudySource.decode(doc.get("source", "scratch")),
            current_chapter=_optional_str(doc, "currentChapter"),
            current_path=_optional_str(doc, "currentPath"),
            settings={str(key): value for key, value in raw_settings.items()},
            created_at=_required_datetime(doc, "createdAt"),
            updated_at=_required_datetime(doc, "updatedAt"),
            revision=_nonnegative_int(doc, "revision", default=0),
        )


@dataclass(frozen=True, slots=True)
class StudyChapter:
    id: str
    study_id: str
    name: str
    order: int
    owner: str
    variant: str
    initial_fen: str
    orientation: StudyOrientation
    root: StudyTree
    created_at: datetime
    updated_at: datetime
    chess960: bool = False
    variant_ini: str | None = None
    description: str = ""
    tags: Mapping[str, str] = field(default_factory=dict)
    revision: int = 0

    def to_document(self) -> dict[str, object]:
        if self.order < 1:
            raise ValueError("Study chapter order must be positive")
        if self.orientation not in _ORIENTATIONS:
            raise ValueError(f"Unknown Study chapter orientation: {self.orientation!r}")
        if self.revision < 0:
            raise ValueError("Study chapter revision must be non-negative")
        description = canonical_description(self.description)
        tags = canonical_tags(self.tags)

        doc: dict[str, object] = {
            "_id": self.id,
            "studyId": self.study_id,
            "name": self.name,
            "order": self.order,
            "owner": self.owner,
            "variant": self.variant,
            "initialFen": self.initial_fen,
            "orientation": self.orientation,
            "root": self.root.to_document(),
            "createdAt": _utc(self.created_at),
            "updatedAt": _utc(self.updated_at),
            "revision": self.revision,
        }
        if self.chess960:
            doc["chess960"] = True
        if self.variant_ini is not None:
            doc["variantIni"] = self.variant_ini
        if description:
            doc["description"] = description
        if tags:
            doc["tags"] = tags
        return doc

    @classmethod
    def from_document(cls, doc: Mapping[str, object]) -> StudyChapter:
        raw_orientation = doc.get("orientation")
        if not isinstance(raw_orientation, str) or raw_orientation not in _ORIENTATIONS:
            raise ValueError(f"Unknown Study chapter orientation: {raw_orientation!r}")
        raw_root = doc.get("root")
        if not isinstance(raw_root, Mapping):
            raise TypeError("Study chapter field 'root' must be a mapping")
        raw_chess960 = doc.get("chess960", False)
        if not isinstance(raw_chess960, bool):
            raise TypeError("Study chapter field 'chess960' must be boolean")
        raw_tags = doc.get("tags", {})

        return cls(
            id=_required_str(doc, "_id"),
            study_id=_required_str(doc, "studyId"),
            name=_required_str(doc, "name"),
            order=_positive_int(doc, "order"),
            owner=_required_str(doc, "owner"),
            variant=_required_str(doc, "variant"),
            initial_fen=_required_str(doc, "initialFen"),
            orientation=cast(StudyOrientation, raw_orientation),
            root=StudyTree.from_document(raw_root),
            created_at=_required_datetime(doc, "createdAt"),
            updated_at=_required_datetime(doc, "updatedAt"),
            chess960=raw_chess960,
            variant_ini=_optional_str(doc, "variantIni"),
            description=canonical_description(doc.get("description", "")),
            tags=canonical_tags(raw_tags),
            revision=_nonnegative_int(doc, "revision", default=0),
        )


async def make_study(
    table: Any | None,
    *,
    owner: str,
    name: str | None = None,
    source: StudySource | None = None,
    now: datetime | None = None,
) -> Study:
    created_at = _utc(now or datetime.now(UTC))
    return Study(
        id=await new_id(table),
        name=name or f"{owner}'s Study",
        owner=owner,
        members={owner: "write"},
        visibility="private",
        source=source or StudySource(),
        created_at=created_at,
        updated_at=created_at,
    )


async def make_chapter(
    table: Any | None,
    *,
    study_id: str,
    owner: str,
    variant: str,
    initial_fen: str,
    orientation: StudyOrientation,
    order: int,
    name: str | None = None,
    chess960: bool = False,
    variant_ini: str | None = None,
    root: StudyTree | None = None,
    description: str = "",
    tags: Mapping[str, str] | None = None,
    now: datetime | None = None,
) -> StudyChapter:
    created_at = _utc(now or datetime.now(UTC))
    return StudyChapter(
        id=await new_id(table),
        study_id=study_id,
        name=name or f"Chapter {order}",
        order=order,
        owner=owner,
        variant=variant,
        chess960=chess960,
        initial_fen=initial_fen,
        orientation=orientation,
        variant_ini=variant_ini,
        root=StudyTree() if root is None else root,
        description=description,
        tags={} if tags is None else dict(tags),
        created_at=created_at,
        updated_at=created_at,
    )
