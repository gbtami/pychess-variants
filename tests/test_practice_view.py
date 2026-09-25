from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import practice as practice_data
import pytest
from mongomock_motor import AsyncMongoMockClient
from practice import PracticeSection, PracticeStudyRef
from pychess_global_app_state_utils import get_app_state
from study.models import Study, StudyChapter
from study.tree import StudyTree

from server import make_app


async def _insert_public_practice_study(
    app_state,
    study_id: str,
    *,
    name: str,
    chapter_name: str,
    variant: str = "chess",
    chess960: bool = False,
) -> None:
    now = datetime.now(UTC)
    study = Study(
        id=study_id,
        name=name,
        owner="teacher",
        members={"teacher": "write"},
        visibility="public",
        created_at=now,
        updated_at=now,
    )
    await app_state.db.study.insert_one(study.to_document())
    await app_state.db.study_chapter.insert_one(
        {
            "_id": f"{study_id}-chapter1",
            "studyId": study_id,
            "name": chapter_name,
            "order": 1,
            "variant": variant,
            "chess960": chess960,
            "mode": "gamebook",
        }
    )


async def _insert_practice_learner_study(app_state, study_id: str = "prac0001") -> None:
    now = datetime.now(UTC)
    study = Study(
        id=study_id,
        name="Pawn Endgames",
        owner="teacher",
        members={"teacher": "write"},
        visibility="public",
        settings={"computer": "nobody"},
        created_at=now,
        updated_at=now,
    )
    await app_state.db.study.insert_one(study.to_document())
    fen = "8/8/8/8/8/8/4K3/6k1 w - - 0 1"
    for order, (chapter_id, name, mode) in enumerate(
        (("chap0001", "Opposition", "gamebook"), ("chap0002", "Convert the win", "practice")),
        start=1,
    ):
        chapter = StudyChapter(
            id=chapter_id,
            study_id=study_id,
            name=name,
            order=order,
            owner="teacher",
            variant="chess",
            initial_fen=fen,
            orientation="white",
            root=StudyTree(),
            created_at=now,
            updated_at=now,
            mode=mode,
        )
        await app_state.db.study_chapter.insert_one(chapter.to_document())


def _practice_sections() -> tuple[PracticeSection, ...]:
    return (
        PracticeSection(
            id="pawn-endgames",
            name="Pawn endgames",
            studies=(
                PracticeStudyRef(
                    study_id="prac0001",
                    variant="chess",
                    description="Master the essential pawn endings.",
                ),
            ),
        ),
        PracticeSection(
            id="shogi-basics",
            name="Shogi basics",
            studies=(
                PracticeStudyRef(
                    study_id="prac0002",
                    variant="shogi",
                    description="Learn fundamental Shogi technique.",
                ),
            ),
        ),
    )


@pytest.mark.asyncio
async def test_practice_index_redirects_to_menu_variant_and_filters_curriculum(
    aiohttp_client, monkeypatch
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_public_practice_study(
        app_state,
        "prac0001",
        name="Pawn Endgames",
        chapter_name="Opposition",
    )
    await _insert_public_practice_study(
        app_state,
        "prac0002",
        name="Shogi Fundamentals",
        chapter_name="Entering king",
        variant="shogi",
    )
    monkeypatch.setattr(practice_data, "PRACTICE_SECTIONS", _practice_sections())

    response = await client.get("/practice", allow_redirects=False)
    assert response.status == 302
    assert response.headers["Location"] == "/practice/chess"

    chess_response = await client.get("/practice/chess")
    assert chess_response.status == 200
    html = await chess_response.text()
    assert "Practice • PyChess" in html
    assert "Pawn endgames" in html
    assert "Pawn Endgames" in html
    assert "Opposition" in html
    assert "Master the essential pawn endings." in html
    assert 'href="/practice/chess/prac0001"' in html
    assert "Shogi basics" not in html
    assert "Shogi Fundamentals" not in html
    assert "data-practice-variant-select" in html
    assert '<option value="chess" selected>' in html
    assert '<option value="shogi">' in html

    shogi_response = await client.get("/practice/shogi")
    assert shogi_response.status == 200
    shogi_html = await shogi_response.text()
    assert "Shogi basics" in shogi_html
    assert "Shogi Fundamentals" in shogi_html
    assert "Entering king" in shogi_html
    assert "Pawn endgames" not in shogi_html
    assert "Pawn Endgames" not in shogi_html
    assert '<option value="shogi" selected>' in shogi_html


@pytest.mark.asyncio
async def test_practice_index_falls_back_to_first_available_variant(
    aiohttp_client, monkeypatch
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_public_practice_study(
        app_state,
        "prac0002",
        name="Shogi Fundamentals",
        chapter_name="Entering king",
        variant="shogi",
    )
    monkeypatch.setattr(
        practice_data,
        "PRACTICE_SECTIONS",
        (_practice_sections()[1],),
    )

    response = await client.get("/practice", allow_redirects=False)
    assert response.status == 302
    assert response.headers["Location"] == "/practice/shogi"


@pytest.mark.asyncio
async def test_practice_stale_variant_url_has_friendly_empty_state(
    aiohttp_client, monkeypatch
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_public_practice_study(
        app_state,
        "prac0001",
        name="Pawn Endgames",
        chapter_name="Opposition",
    )
    monkeypatch.setattr(practice_data, "PRACTICE_SECTIONS", (_practice_sections()[0],))

    response = await client.get("/practice/atomic")
    assert response.status == 200
    html = await response.text()
    assert "No Practice lessons yet for Atomic." in html
    assert '<option value="chess">' in html
    assert '<option value="atomic"' not in html
    assert "Pawn Endgames" not in html


@pytest.mark.asyncio
async def test_practice_random_start_uses_variant_key_in_selector_and_url(
    aiohttp_client, monkeypatch
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_public_practice_study(
        app_state,
        "prac0960",
        name="Random Chess",
        chapter_name="Random development",
        chess960=True,
    )
    monkeypatch.setattr(
        practice_data,
        "PRACTICE_SECTIONS",
        (
            PracticeSection(
                id="random-start",
                name="Random starts",
                studies=(
                    PracticeStudyRef(
                        study_id="prac0960",
                        variant="chess",
                        chess960=True,
                    ),
                ),
            ),
        ),
    )

    response = await client.get("/practice", allow_redirects=False)
    assert response.status == 302
    assert response.headers["Location"] == "/practice/chess960"

    variant_response = await client.get("/practice/chess960")
    assert variant_response.status == 200
    html = await variant_response.text()
    assert '<option value="chess960" selected>' in html
    assert "Chess960" in html
    assert "Random Chess" in html


@pytest.mark.asyncio
async def test_practice_index_surfaces_invalid_curated_study(aiohttp_client, monkeypatch) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)

    monkeypatch.setattr(
        practice_data,
        "PRACTICE_SECTIONS",
        (
            PracticeSection(
                id="broken",
                name="Broken curation",
                studies=(PracticeStudyRef(study_id="missing1", variant="chess"),),
            ),
        ),
    )

    response = await client.get("/practice")
    assert response.status == 200
    html = await response.text()
    assert "No variants have valid Practice content yet." in html
    assert "Broken curation" in html
    assert "missing1" in html
    assert "Practice Study missing1 does not exist" in html


@pytest.mark.asyncio
async def test_practice_route_and_menu_are_hidden_outside_dev(aiohttp_client) -> None:
    with patch("settings.DEV", False), patch("pychess_global_app_state.DEV", False):
        app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
        client = await aiohttp_client(app)

        response = await client.get("/practice")
        assert response.status == 404

        variant_response = await client.get("/practice/chess")
        assert variant_response.status == 404

        about = await client.get("/about")
        assert about.status == 200
        html = await about.text()
        assert 'href="/practice"' not in html


@pytest.mark.asyncio
async def test_practice_learner_route_redirects_to_first_chapter_and_returns_isolated_study_data(
    aiohttp_client, monkeypatch
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_practice_learner_study(app_state)
    monkeypatch.setattr(practice_data, "PRACTICE_SECTIONS", (_practice_sections()[0],))

    response = await client.get("/practice/chess/prac0001", allow_redirects=False)
    assert response.status == 302
    assert response.headers["Location"] == "/practice/chess/prac0001/chap0001"

    learner_page = await client.get("/practice/chess/prac0001/chap0001")
    assert learner_page.status == 200
    learner_html = await learner_page.text()
    assert "Pawn Endgames • Practice • PyChess" in learner_html

    chapter = await client.get(
        "/practice/chess/prac0001/chap0001", headers={"Accept": "application/json"}
    )
    assert chapter.status == 200
    payload = await chapter.json()
    study = payload["study"]
    assert study["id"] == "prac0001"
    assert study["chapter"]["id"] == "chap0001"
    assert study["chapter"]["mode"] == "gamebook"
    assert [item["id"] for item in study["chapters"]] == ["chap0001", "chap0002"]
    assert study["practice"] == {
        "variant": "chess",
        "sectionId": "pawn-endgames",
        "sectionName": "Pawn endgames",
        "indexUrl": "/practice/chess",
        "studyUrl": "/practice/chess/prac0001",
    }
    assert study["canWrite"] is False
    assert study["isOwner"] is False
    assert study["canClone"] is False
    assert study["canShare"] is False
    assert study["canLike"] is False
    assert study["features"]["computer"] is True


@pytest.mark.asyncio
async def test_practice_learner_route_rejects_wrong_variant_or_non_curated_chapter(
    aiohttp_client, monkeypatch
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_practice_learner_study(app_state)
    monkeypatch.setattr(practice_data, "PRACTICE_SECTIONS", (_practice_sections()[0],))

    wrong_variant = await client.get("/practice/shogi/prac0001/chap0001")
    assert wrong_variant.status == 404

    wrong_chapter = await client.get("/practice/chess/prac0001/missing1")
    assert wrong_chapter.status == 404


@pytest.mark.asyncio
async def test_practice_learner_routes_are_hidden_outside_dev(aiohttp_client, monkeypatch) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_practice_learner_study(app_state)
    monkeypatch.setattr(practice_data, "PRACTICE_SECTIONS", (_practice_sections()[0],))

    with patch("settings.DEV", False):
        response = await client.get("/practice/chess/prac0001")
        assert response.status == 404
        chapter = await client.get("/practice/chess/prac0001/chap0001")
        assert chapter.status == 404
