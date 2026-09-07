from __future__ import annotations

from typing import Final

from study.models import Study, StudyUserSelection, study_user_selection

STUDY_FEATURE_DEFAULT: Final[StudyUserSelection] = "everyone"
STUDY_FEATURE_KEYS: Final[tuple[str, ...]] = ("computer", "explorer", "cloneable", "shareable")


def can_view_study(study: Study, username: str | None) -> bool:
    """Return whether a viewer may read a Study.

    Public and unlisted Studies are link-viewable by anyone. Private Studies are
    visible only to explicit members; the owner is always a member by model
    invariant. Keeping this decision in one server-side helper avoids route-specific
    visibility drift as export/embed/API endpoints are added.
    """

    if study.visibility != "private":
        return True
    return username is not None and username in study.members


def study_feature_selection(study: Study, feature: str) -> StudyUserSelection:
    """Return one Lichess-compatible per-feature audience selection.

    Existing Study documents predate Phase 5 settings, so a missing value preserves
    the old behavior: everyone who can view the Study may use the feature. A malformed
    known value fails closed instead of accidentally widening access.
    """

    if feature not in study.settings:
        return STUDY_FEATURE_DEFAULT
    try:
        return study_user_selection(study.settings[feature])
    except ValueError:
        return "nobody"


def study_selection_allows(
    selection: StudyUserSelection,
    study: Study,
    username: str | None,
) -> bool:
    """Evaluate a Study feature audience against owner/member roles."""

    if selection == "nobody":
        return False
    if selection == "everyone":
        return True
    if username is None:
        return False
    if selection == "owner":
        return username == study.owner
    if selection == "contributor":
        return study.members.get(username) == "write"
    return username in study.members


def can_use_study_feature(study: Study, username: str | None, feature: str) -> bool:
    return can_view_study(study, username) and study_selection_allows(
        study_feature_selection(study, feature), study, username
    )


def can_use_study_computer(study: Study, username: str | None) -> bool:
    return can_use_study_feature(study, username, "computer")


def can_use_study_explorer(study: Study, username: str | None) -> bool:
    # PyChess has no opening-explorer UI yet. Keeping the permission primitive now
    # means a future explorer can plug into Study without another settings migration.
    return can_use_study_feature(study, username, "explorer")


def can_clone_study(study: Study, username: str | None) -> bool:
    """Return whether a signed-in viewer may make a private copy of a Study."""

    return username is not None and can_use_study_feature(study, username, "cloneable")


def can_share_study(study: Study, username: str | None) -> bool:
    """Return whether this viewer may use Study share/export surfaces."""

    return can_use_study_feature(study, username, "shareable")


def can_embed_study(study: Study) -> bool:
    """Return whether a Study may be rendered in a third-party iframe.

    Lichess treats embedding as a property of Study visibility rather than the
    per-viewer ``shareable`` setting. The share setting controls whether a viewer
    sees/uses the share-export tools; a non-private Study remains embeddable.
    """

    return study.visibility != "private"


def is_study_owner(study: Study, username: str | None) -> bool:
    return username is not None and username == study.owner


def can_write_study(study: Study, username: str | None) -> bool:
    """Return whether a Study member may persist analysis/chapter changes.

    Visibility never grants write access. The owner is kept as a write member by the
    model invariant; Phase 4 contributors receive the same persisted-analysis rights
    through an explicit ``write`` member role.
    """

    return username is not None and study.members.get(username) == "write"
