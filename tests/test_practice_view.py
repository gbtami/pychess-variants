from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import practice as practice_data
import pytest
from mongomock_motor import AsyncMongoMockClient
from practice import PracticeSection, PracticeStudyRef
from pychess_global_app_state_utils import get_app_state
from study.models import Study

from server import make_app


async def _insert_public_practice_study(app_state, study_id: str = "prac0001") -> None:
    now = datetime.now(UTC)
    study = Study(
        id=study_id,
        name="Pawn Endgames",
        owner="teacher",
        members={"teacher": "write"},
        visibility="public",
        created_at=now,
        updated_at=now,
    )
    await app_state.db.study.insert_one(study.to_document())
    await app_state.db.study_chapter.insert_one(
        {
            "_id": "chapter1",
            "studyId": study_id,
            "name": "Opposition",
            "order": 1,
            "variant": "chess",
            "chess960": False,
            "mode": "gamebook",
        }
    )


@pytest.mark.asyncio
async def test_practice_index_renders_validated_registry_and_variant_route(
    aiohttp_client, monkeypatch
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_public_practice_study(app_state)

    monkeypatch.setattr(
        practice_data,
        "PRACTICE_SECTIONS",
        (
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
        ),
    )

    response = await client.get("/practice")
    assert response.status == 200
    html = await response.text()
    assert "Practice • PyChess" in html
    assert "Pawn endgames" in html
    assert "Pawn Endgames" in html
    assert "Opposition" in html
    assert "Master the essential pawn endings." in html
    assert 'href="/study/prac0001"' in html
    assert 'href="/practice"' in html

    variant_response = await client.get("/practice/chess")
    assert variant_response.status == 200


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
