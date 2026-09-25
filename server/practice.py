from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from study.models import Study, StudyChapterMode, study_chapter_mode
from study.storage import load_study
from variants import is_catalogued_variant

PracticeValidationCode = Literal[
    "study-not-found",
    "invalid-study",
    "not-public",
    "no-chapters",
    "invalid-chapter",
    "mixed-variant",
    "variant-mismatch",
    "mixed-chess960",
    "chess960-mismatch",
    "unsupported-mode",
]

PRACTICE_ELIGIBLE_CHAPTER_MODES: frozenset[StudyChapterMode] = frozenset(("gamebook", "practice"))


@dataclass(frozen=True, slots=True)
class PracticeStudyRef:
    """One curated Study entry in the Learn -> Practice curriculum.

    Variant identity is deliberately repeated in the curated registry. It lets the
    Practice index filter cheaply later and, more importantly, lets validation catch a
    Study that was edited into a different variant after it was curated.
    """

    study_id: str
    variant: str
    description: str = ""
    chess960: bool = False


@dataclass(frozen=True, slots=True)
class PracticeSection:
    id: str
    name: str
    studies: tuple[PracticeStudyRef, ...]


@dataclass(frozen=True, slots=True)
class PracticeChapterMetadata:
    id: str
    name: str
    order: int
    variant: str
    chess960: bool
    mode: StudyChapterMode


@dataclass(frozen=True, slots=True)
class PracticeValidationIssue:
    code: PracticeValidationCode
    message: str


@dataclass(frozen=True, slots=True)
class PracticeStudyValidation:
    ref: PracticeStudyRef
    study: Study | None
    chapters: tuple[PracticeChapterMetadata, ...]
    issues: tuple[PracticeValidationIssue, ...]

    @property
    def valid(self) -> bool:
        return not self.issues


@dataclass(frozen=True, slots=True)
class PracticeSectionValidation:
    section: PracticeSection
    studies: tuple[PracticeStudyValidation, ...]

    @property
    def valid_studies(self) -> tuple[PracticeStudyValidation, ...]:
        return tuple(study for study in self.studies if study.valid)

    @property
    def invalid_studies(self) -> tuple[PracticeStudyValidation, ...]:
        return tuple(study for study in self.studies if not study.valid)


def practice_variant_key(ref: PracticeStudyRef) -> str:
    """Return the URL/client variant key for one curated Study.

    Built-in randomized starts use the site's conventional ``<variant>960`` key.
    Catalogued variants keep their catalogued name because random-start identity is
    already part of that variant snapshot/name on the client.
    """

    if ref.chess960 and not is_catalogued_variant(ref.variant):
        return f"{ref.variant}960"
    return ref.variant


def practice_variant_keys(
    curriculum: tuple[PracticeSectionValidation, ...],
) -> tuple[str, ...]:
    """Return curated variant keys that currently have at least one valid Study."""

    keys: list[str] = []
    seen: set[str] = set()
    for section in curriculum:
        for resolved in section.valid_studies:
            key = practice_variant_key(resolved.ref)
            if key not in seen:
                seen.add(key)
                keys.append(key)
    return tuple(keys)


def filter_practice_curriculum(
    curriculum: tuple[PracticeSectionValidation, ...], variant_key: str
) -> tuple[PracticeSectionValidation, ...]:
    """Keep only cards for ``variant_key`` and drop empty curriculum sections.

    Invalid entries with the selected registry variant remain visible on DEV so content
    creators can fix curation mistakes. They do not make a variant appear in the
    selector because :func:`practice_variant_keys` considers only valid Studies.
    """

    filtered: list[PracticeSectionValidation] = []
    for resolved_section in curriculum:
        studies = tuple(
            resolved
            for resolved in resolved_section.studies
            if practice_variant_key(resolved.ref) == variant_key
        )
        if studies:
            filtered.append(
                PracticeSectionValidation(section=resolved_section.section, studies=studies)
            )
    return tuple(filtered)


@dataclass(frozen=True, slots=True)
class PracticeStudyLocation:
    section: PracticeSection
    ref: PracticeStudyRef


def find_practice_study(
    variant_key: str,
    study_id: str,
    sections: tuple[PracticeSection, ...] | None = None,
) -> PracticeStudyLocation | None:
    """Locate one curated Practice Study without touching Study storage.

    The registry identity is part of the learner URL contract. A Study curated for one
    variant key must not be reachable through another variant's Practice namespace.
    """

    for section in PRACTICE_SECTIONS if sections is None else sections:
        for ref in section.studies:
            if ref.study_id == study_id and practice_variant_key(ref) == variant_key:
                return PracticeStudyLocation(section=section, ref=ref)
    return None


# Keep the initial registry intentionally empty. P1 establishes the curation contract
# and validator; real DEV Study IDs can be added once the Practice index/player exists.
PRACTICE_SECTIONS: tuple[PracticeSection, ...] = ()


def _issue(code: PracticeValidationCode, message: str) -> PracticeValidationIssue:
    return PracticeValidationIssue(code=code, message=message)


async def _chapter_metadata(
    app_state: Any, study_id: str
) -> tuple[tuple[PracticeChapterMetadata, ...], tuple[PracticeValidationIssue, ...]]:
    cursor = app_state.db.study_chapter.find(
        {"studyId": study_id},
        projection={
            "_id": 1,
            "name": 1,
            "order": 1,
            "variant": 1,
            "chess960": 1,
            "mode": 1,
        },
    ).sort("order", 1)

    chapters: list[PracticeChapterMetadata] = []
    issues: list[PracticeValidationIssue] = []
    async for doc in cursor:
        chapter_id = doc.get("_id")
        name = doc.get("name")
        order = doc.get("order")
        variant = doc.get("variant")
        chess960 = doc.get("chess960", False)
        raw_mode = doc.get("mode", "normal")

        if (
            not isinstance(chapter_id, str)
            or not chapter_id
            or not isinstance(name, str)
            or not name
            or isinstance(order, bool)
            or not isinstance(order, int)
            or order < 1
            or not isinstance(variant, str)
            or not variant
            or not isinstance(chess960, bool)
        ):
            issues.append(
                _issue(
                    "invalid-chapter",
                    f"Study {study_id} has malformed Practice chapter metadata",
                )
            )
            continue

        try:
            mode = study_chapter_mode(raw_mode)
        except ValueError:
            issues.append(
                _issue(
                    "invalid-chapter",
                    f"Study {study_id} chapter {chapter_id} has invalid mode {raw_mode!r}",
                )
            )
            continue

        chapters.append(
            PracticeChapterMetadata(
                id=chapter_id,
                name=name,
                order=order,
                variant=variant,
                chess960=chess960,
                mode=mode,
            )
        )

    return tuple(chapters), tuple(issues)


def _validate_chapter_identity(
    ref: PracticeStudyRef, chapters: tuple[PracticeChapterMetadata, ...]
) -> list[PracticeValidationIssue]:
    issues: list[PracticeValidationIssue] = []

    variants = {chapter.variant for chapter in chapters}
    if len(variants) > 1:
        issues.append(
            _issue(
                "mixed-variant",
                f"Practice Study {ref.study_id} mixes variants: {', '.join(sorted(variants))}",
            )
        )
    elif variants and next(iter(variants)) != ref.variant:
        actual = next(iter(variants))
        issues.append(
            _issue(
                "variant-mismatch",
                f"Practice Study {ref.study_id} is curated as {ref.variant} but uses {actual}",
            )
        )

    chess960_values = {chapter.chess960 for chapter in chapters}
    if len(chess960_values) > 1:
        issues.append(
            _issue(
                "mixed-chess960",
                f"Practice Study {ref.study_id} mixes randomized and non-randomized chapters",
            )
        )
    elif chess960_values and next(iter(chess960_values)) != ref.chess960:
        actual = next(iter(chess960_values))
        issues.append(
            _issue(
                "chess960-mismatch",
                f"Practice Study {ref.study_id} randomized-start setting is {actual} "
                f"but the registry expects {ref.chess960}",
            )
        )

    unsupported = sorted(
        {
            chapter.mode
            for chapter in chapters
            if chapter.mode not in PRACTICE_ELIGIBLE_CHAPTER_MODES
        }
    )
    if unsupported:
        issues.append(
            _issue(
                "unsupported-mode",
                f"Practice Study {ref.study_id} contains unsupported chapter mode(s): "
                f"{', '.join(unsupported)}",
            )
        )

    return issues


async def validate_practice_study(app_state: Any, ref: PracticeStudyRef) -> PracticeStudyValidation:
    """Load and validate one mutable Study referenced by the curated registry.

    Invalid curation is data, not an exception: DEV pages can show maintainers why an
    entry is unusable instead of one bad Study taking down the entire curriculum.
    """

    try:
        study = await load_study(app_state, ref.study_id)
    except (TypeError, ValueError) as exc:
        return PracticeStudyValidation(
            ref=ref,
            study=None,
            chapters=(),
            issues=(
                _issue(
                    "invalid-study",
                    f"Practice Study {ref.study_id} has invalid stored metadata: {exc}",
                ),
            ),
        )

    if study is None:
        return PracticeStudyValidation(
            ref=ref,
            study=None,
            chapters=(),
            issues=(_issue("study-not-found", f"Practice Study {ref.study_id} does not exist"),),
        )

    issues: list[PracticeValidationIssue] = []
    if study.visibility != "public":
        issues.append(
            _issue(
                "not-public",
                f"Practice Study {ref.study_id} must be public, not {study.visibility}",
            )
        )

    chapters, chapter_issues = await _chapter_metadata(app_state, study.id)
    issues.extend(chapter_issues)
    if not chapters and not chapter_issues:
        issues.append(_issue("no-chapters", f"Practice Study {ref.study_id} has no chapters"))
    if chapters:
        issues.extend(_validate_chapter_identity(ref, chapters))

    return PracticeStudyValidation(
        ref=ref,
        study=study,
        chapters=chapters,
        issues=tuple(issues),
    )


async def build_practice_curriculum(
    app_state: Any,
    sections: tuple[PracticeSection, ...] = PRACTICE_SECTIONS,
) -> tuple[PracticeSectionValidation, ...]:
    """Resolve the curated registry against current Study storage."""

    resolved: list[PracticeSectionValidation] = []
    for section in sections:
        studies: list[PracticeStudyValidation] = []
        for ref in section.studies:
            studies.append(await validate_practice_study(app_state, ref))
        resolved.append(PracticeSectionValidation(section=section, studies=tuple(studies)))
    return tuple(resolved)
