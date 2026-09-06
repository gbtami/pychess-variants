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


def can_write_study(study: Study, username: str | None) -> bool:
    """Phase-3 write policy: sharing never grants edit rights.

    Contributor writes are deliberately deferred to Phase 4. The helper exists now so
    page serialization can distinguish owner editing from read-only sharing without
    deriving permission from visibility.
    """

    return username is not None and username == study.owner
