from __future__ import annotations

import json
import time
from datetime import UTC, datetime, timedelta

import pytest
import test_logger
from fairy import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from study.builder import StudyChapterBuilder
from study.storage import create_study_from_draft

from server import make_app

test_logger.init_test_logger()


async def _insert_user(app_state, username: str) -> None:
    await app_state.db.user.insert_one(
        {
            "_id": username,
            "enabled": True,
            "createdAt": datetime.now(UTC) - timedelta(days=30),
            "lang": "en",
            "theme": "dark",
            "ct": "all",
            "perfs": {},
            "pperfs": {},
        }
    )


def _login_cookie(username: str) -> str:
    return json.dumps({"session": {"user_name": username}, "created": int(time.time())})


@pytest.mark.asyncio
async def test_analysis_can_append_to_existing_owned_study(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    username = "study_workflow_owner"
    await _insert_user(app_state, username)

    first = await StudyChapterBuilder(app_state, username).blank_or_fen(
        variant="chess", name="First chapter"
    )
    study, _ = await create_study_from_draft(app_state, username, first, name="Existing Study")

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(username)})

    choices_response = await client.get("/study/choices")
    assert choices_response.status == 200
    choices = await choices_response.json()
    assert choices == {"studies": [{"id": study.id, "name": "Existing Study"}]}

    response = await client.post(
        "/study/from-analysis",
        json={
            "studyId": study.id,
            "variant": "chess",
            "chess960": False,
            "initialFen": FairyBoard.start_fen("chess"),
            "chapterName": "Imported analysis",
            "orientation": "black",
            "tags": {"White": "Alice", "Black": "Bob"},
            "tree": {"nodes": []},
        },
    )
    assert response.status == 200
    payload = await response.json()
    assert payload["ok"] is True
    assert payload["studyId"] == study.id

    chapters = (
        await app_state.db.study_chapter.find({"studyId": study.id})
        .sort("order", 1)
        .to_list(length=10)
    )
    assert len(chapters) == 2
    assert chapters[1]["name"] == "Imported analysis"
    assert chapters[1]["orientation"] == "black"
    assert chapters[1]["tags"] == {"Black": "Bob", "White": "Alice"}
