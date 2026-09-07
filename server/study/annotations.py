from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from link_filter import sanitize_user_message

from study.constants import (
    STUDY_COMMENT_MAX_LENGTH,
    STUDY_DESCRIPTION_MAX_LENGTH,
    STUDY_MAX_COMMENTS_PER_POSITION,
    STUDY_MAX_NAGS_PER_POSITION,
    STUDY_MAX_SHAPES_PER_POSITION,
    STUDY_MAX_TAGS,
    STUDY_TAG_NAME_MAX_LENGTH,
    STUDY_TAG_VALUE_MAX_LENGTH,
)

STUDY_COMMENT_ID_LENGTH = 10
_COMMENT_ID_RE = re.compile(rf"^[A-Za-z0-9]{{{STUDY_COMMENT_ID_LENGTH}}}$")
_TAG_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
_VALID_FILES = frozenset("abcdefghijklmnop")
_VALID_RANKS = frozenset("123456789:;<=>?@")
_VALID_BRUSHES = frozenset(("green", "red", "blue", "yellow"))


def is_study_comment_id(value: object) -> bool:
    return isinstance(value, str) and _COMMENT_ID_RE.fullmatch(value) is not None


def _clean_text(value: object, *, max_length: int) -> str:
    if not isinstance(value, str):
        raise TypeError("Study annotation text must be a string")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    # Preserve ordinary whitespace/newlines, but drop embedded control characters that
    # have no useful meaning in Study text and can behave inconsistently across clients.
    value = "".join(ch for ch in value if ch in "\n\t" or unicodedata.category(ch) != "Cc").strip()
    value = sanitize_user_message(value)
    if len(value) > max_length:
        raise ValueError("Study annotation text is too long")
    return value


def canonical_comment_text(value: object) -> str:
    return _clean_text(value, max_length=STUDY_COMMENT_MAX_LENGTH)


def canonical_description(value: object) -> str:
    return _clean_text(value, max_length=STUDY_DESCRIPTION_MAX_LENGTH)


def canonical_tag_name(value: object) -> str:
    if not isinstance(value, str):
        raise TypeError("Study PGN tag name must be a string")
    name = value.strip()
    if len(name) > STUDY_TAG_NAME_MAX_LENGTH or _TAG_NAME_RE.fullmatch(name) is None:
        raise ValueError("Invalid Study PGN tag name")
    return name


def canonical_tag_value(value: object) -> str:
    return _clean_text(value, max_length=STUDY_TAG_VALUE_MAX_LENGTH).replace("\n", " ")


def canonical_tags(value: object) -> dict[str, str]:
    if not isinstance(value, Mapping):
        raise TypeError("Study PGN tags must be a mapping")
    if len(value) > STUDY_MAX_TAGS:
        raise ValueError("Too many Study PGN tags")
    tags: dict[str, str] = {}
    for raw_name, raw_value in value.items():
        name = canonical_tag_name(raw_name)
        tag_value = canonical_tag_value(raw_value)
        if not tag_value:
            continue
        tags[name] = tag_value
    return dict(sorted(tags.items(), key=lambda item: item[0].casefold()))


def _canonical_square(value: object) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 2
        or value[0] not in _VALID_FILES
        or value[1] not in _VALID_RANKS
    ):
        raise ValueError("Invalid Study annotation square")
    return value


@dataclass(frozen=True, slots=True)
class StudyShape:
    orig: str
    dest: str | None = None
    brush: str = "green"

    def __post_init__(self) -> None:
        _canonical_square(self.orig)
        if self.dest is not None:
            _canonical_square(self.dest)
        if self.brush not in _VALID_BRUSHES:
            raise ValueError("Invalid Study annotation brush")

    def to_document(self) -> dict[str, object]:
        doc: dict[str, object] = {"o": self.orig}
        if self.dest is not None:
            doc["d"] = self.dest
        if self.brush != "green":
            doc["b"] = self.brush
        return doc

    @classmethod
    def from_document(cls, doc: Mapping[str, object]) -> StudyShape:
        orig = _canonical_square(doc.get("o"))
        raw_dest = doc.get("d")
        dest = None if raw_dest is None else _canonical_square(raw_dest)
        raw_brush = doc.get("b", "green")
        if not isinstance(raw_brush, str) or raw_brush not in _VALID_BRUSHES:
            raise ValueError("Invalid Study annotation brush")
        return cls(orig=orig, dest=dest, brush=raw_brush)

    def to_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {"orig": self.orig, "brush": self.brush}
        if self.dest is not None:
            payload["dest"] = self.dest
        return payload

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> StudyShape:
        orig = _canonical_square(payload.get("orig"))
        raw_dest = payload.get("dest")
        dest = None if raw_dest is None else _canonical_square(raw_dest)
        raw_brush = payload.get("brush", "green")
        if not isinstance(raw_brush, str) or raw_brush not in _VALID_BRUSHES:
            raise ValueError("Invalid Study annotation brush")
        return cls(orig=orig, dest=dest, brush=raw_brush)


@dataclass(frozen=True, slots=True)
class StudyComment:
    id: str
    author: str
    text: str

    def __post_init__(self) -> None:
        if not is_study_comment_id(self.id):
            raise ValueError("Invalid Study comment id")
        if not self.author:
            raise ValueError("Study comment author must be non-empty")
        canonical = canonical_comment_text(self.text)
        if not canonical:
            raise ValueError("Study comment text must be non-empty")
        object.__setattr__(self, "text", canonical)

    def to_document(self) -> dict[str, object]:
        return {"i": self.id, "a": self.author, "t": self.text}

    @classmethod
    def from_document(cls, doc: Mapping[str, object]) -> StudyComment:
        comment_id = doc.get("i")
        author = doc.get("a")
        text = doc.get("t")
        if not is_study_comment_id(comment_id):
            raise ValueError("Invalid Study comment id")
        if not isinstance(author, str) or not author:
            raise ValueError("Invalid Study comment author")
        return cls(comment_id, author, canonical_comment_text(text))

    def to_payload(self) -> dict[str, object]:
        return {"id": self.id, "author": self.author, "text": self.text}

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> StudyComment:
        comment_id = payload.get("id")
        author = payload.get("author")
        text = payload.get("text")
        if not is_study_comment_id(comment_id):
            raise ValueError("Invalid Study comment id")
        if not isinstance(author, str) or not author:
            raise ValueError("Invalid Study comment author")
        return cls(comment_id, author, canonical_comment_text(text))


def canonical_nags(value: object) -> tuple[int, ...]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise TypeError("Study NAGs must be a list")
    nags: list[int] = []
    for raw_nag in value:
        if isinstance(raw_nag, bool) or not isinstance(raw_nag, int) or not 1 <= raw_nag <= 255:
            raise ValueError("Study NAG must be an integer from 1 to 255")
        if raw_nag not in nags:
            nags.append(raw_nag)
    if len(nags) > STUDY_MAX_NAGS_PER_POSITION:
        raise ValueError("Too many Study NAGs")
    return tuple(nags)


@dataclass(frozen=True, slots=True)
class StudyAnnotations:
    shapes: tuple[StudyShape, ...] = ()
    comments: tuple[StudyComment, ...] = ()
    nags: tuple[int, ...] = ()

    def __post_init__(self) -> None:
        if len(self.shapes) > STUDY_MAX_SHAPES_PER_POSITION:
            raise ValueError("Too many Study shapes")
        if len(self.comments) > STUDY_MAX_COMMENTS_PER_POSITION:
            raise ValueError("Too many Study comments")
        if len({comment.id for comment in self.comments}) != len(self.comments):
            raise ValueError("Duplicate Study comment id")
        canonical = canonical_nags(self.nags)
        object.__setattr__(self, "nags", canonical)

    @property
    def empty(self) -> bool:
        return not (self.shapes or self.comments or self.nags)

    def to_document(self) -> dict[str, object]:
        doc: dict[str, object] = {}
        if self.shapes:
            doc["s"] = [shape.to_document() for shape in self.shapes]
        if self.comments:
            doc["c"] = [comment.to_document() for comment in self.comments]
        if self.nags:
            doc["n"] = list(self.nags)
        return doc

    @classmethod
    def from_document(cls, doc: Mapping[str, object]) -> StudyAnnotations:
        raw_shapes = doc.get("s", ())
        raw_comments = doc.get("c", ())
        raw_nags = doc.get("n", ())
        if not isinstance(raw_shapes, Sequence) or isinstance(raw_shapes, (str, bytes)):
            raise TypeError("Study shapes must be a list")
        if not isinstance(raw_comments, Sequence) or isinstance(raw_comments, (str, bytes)):
            raise TypeError("Study comments must be a list")
        shapes = tuple(
            StudyShape.from_document(item) for item in raw_shapes if isinstance(item, Mapping)
        )
        if len(shapes) != len(raw_shapes):
            raise TypeError("Study shape entries must be mappings")
        comments = tuple(
            StudyComment.from_document(item) for item in raw_comments if isinstance(item, Mapping)
        )
        if len(comments) != len(raw_comments):
            raise TypeError("Study comment entries must be mappings")
        return cls(shapes=shapes, comments=comments, nags=canonical_nags(raw_nags))

    def to_payload(self) -> dict[str, object]:
        return {
            "shapes": [shape.to_payload() for shape in self.shapes],
            "comments": [comment.to_payload() for comment in self.comments],
            "nags": list(self.nags),
        }

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> StudyAnnotations:
        raw_shapes = payload.get("shapes", ())
        raw_comments = payload.get("comments", ())
        raw_nags = payload.get("nags", ())
        if not isinstance(raw_shapes, Sequence) or isinstance(raw_shapes, (str, bytes)):
            raise TypeError("Study shapes payload must be a list")
        if not isinstance(raw_comments, Sequence) or isinstance(raw_comments, (str, bytes)):
            raise TypeError("Study comments payload must be a list")
        shapes = tuple(
            StudyShape.from_payload(item) for item in raw_shapes if isinstance(item, Mapping)
        )
        if len(shapes) != len(raw_shapes):
            raise TypeError("Study shape payload entries must be mappings")
        comments = tuple(
            StudyComment.from_payload(item) for item in raw_comments if isinstance(item, Mapping)
        )
        if len(comments) != len(raw_comments):
            raise TypeError("Study comment payload entries must be mappings")
        return cls(shapes=shapes, comments=comments, nags=canonical_nags(raw_nags))
