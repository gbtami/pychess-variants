from __future__ import annotations

from study.models import Study


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


def can_clone_study(study: Study, username: str | None) -> bool:
    """Return whether a viewer may make a private copy of a Study.

    Phase 3 keeps clone policy intentionally simple: any signed-in user who may
    view the Study may clone it. Per-Study cloneability settings are deferred to
    the later per-feature-permissions milestone.
    """

    return username is not None and can_view_study(study, username)


def can_embed_study(study: Study) -> bool:
    """Return whether a Study may be rendered in a third-party iframe.

    Embeds are a link-share surface rather than a member-authenticated view. Public
    and unlisted Studies are embeddable; private Studies are not, even for members.
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
