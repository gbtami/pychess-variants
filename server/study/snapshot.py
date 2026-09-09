from __future__ import annotations

from hashlib import sha256

from bson import BSON

from study.models import StudyChapter


def chapter_snapshot_token(chapter: StudyChapter) -> str:
    """Opaque fingerprint for one persisted Study chapter snapshot.

    Chapter ``revision`` intentionally tracks collaborative mutations, while
    Fishnet/server-analysis updates can also change the stored tree. Hash the
    complete persisted chapter document so HTTP snapshots can be verified
    against the websocket stream without relying on revision semantics alone.
    """

    return sha256(BSON.encode(chapter.to_document())).hexdigest()[:32]
