from __future__ import annotations

import json
import time
from datetime import UTC, datetime, timedelta

import aiohttp
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


@pytest.mark.asyncio
async def test_study_visibility_controls_page_export_and_write_access(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_user(app_state, "chapter_owner")
    await _insert_user(app_state, "chapter_intruder")
    draft = await StudyChapterBuilder(app_state, "chapter_owner").blank_or_fen(
        variant="chess", name="Chapter snapshot"
    )
    study, chapter = await create_study_from_draft(app_state, "chapter_owner", draft)
    url = f"/study/{study.id}/{chapter.id}"
    export_url = f"{url}/export-data"
    embed_url = f"/study/embed/{study.id}/{chapter.id}"

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("chapter_owner")})
    response = await client.get(url, headers={"Accept": "application/json"})
    assert response.status == 200
    data = await response.json()
    assert data["study"]["chapter"]["id"] == chapter.id
    assert data["study"]["chapter"]["revision"] == chapter.revision
    assert data["study"]["chapter"]["tree"] == chapter.root.to_payload()
    assert data["study"]["visibility"] == "private"
    assert data["study"]["canWrite"] is True
    assert data["board"]["fen"] == chapter.initial_fen
    assert data["board"]["steps"][0]["fen"] == chapter.initial_fen
    assert isinstance(data["cataloguedVariants"], list)
    assert (await client.get(export_url)).status == 200
    # Embedding is a public/link-share surface, so private Studies remain
    # non-embeddable even for their owner.
    assert (await client.get(embed_url)).status == 404
    assert (
        await client.get(f"/study/{study.id}/missing1", headers={"Accept": "application/json"})
    ).status == 404
    assert (await client.get(f"/study/{study.id}/missing1/export-data")).status == 404
    assert (await client.get(f"/study/embed/{study.id}/missing1")).status == 404

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("chapter_intruder")})
    assert (await client.get(url, headers={"Accept": "application/json"})).status == 404
    assert (await client.get(export_url)).status == 404
    assert (await client.get(embed_url)).status == 404
    client.session.cookie_jar.clear()
    assert (await client.get(url, headers={"Accept": "application/json"})).status == 404

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("chapter_owner")})
    response = await client.post(
        f"/study/{study.id}/edit",
        data={"name": study.name, "visibility": "unlisted"},
        allow_redirects=False,
    )
    assert response.status == 302

    client.session.cookie_jar.clear()
    response = await client.get(url, headers={"Accept": "application/json"})
    assert response.status == 200
    data = await response.json()
    assert data["study"]["visibility"] == "unlisted"
    assert data["study"]["canWrite"] is False
    assert (await client.get(export_url)).status == 200
    embed_response = await client.get(embed_url)
    assert embed_response.status == 200
    embed_html = await embed_response.text()
    assert 'data-view="embed"' in embed_html
    assert 'data-study="' in embed_html
    assert f"/study/{study.id}/{chapter.id}" not in embed_html  # link is rendered client-side

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("chapter_intruder")})
    response = await client.post(
        f"/study/{study.id}/edit",
        data={"name": "Hijacked", "visibility": "public"},
        allow_redirects=False,
    )
    assert response.status == 404

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("chapter_owner")})
    response = await client.post(
        f"/study/{study.id}/edit",
        data={"name": study.name, "visibility": "public"},
        allow_redirects=False,
    )
    assert response.status == 302
    client.session.cookie_jar.clear()
    response = await client.get(url, headers={"Accept": "application/json"})
    assert response.status == 200
    assert (await response.json())["study"]["visibility"] == "public"
    assert (await client.get(embed_url)).status == 200

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("chapter_owner")})
    response = await client.post(
        f"/study/{study.id}/edit",
        data={"name": study.name, "visibility": "private"},
        allow_redirects=False,
    )
    assert response.status == 302
    client.session.cookie_jar.clear()
    assert (await client.get(url, headers={"Accept": "application/json"})).status == 404
    assert (await client.get(export_url)).status == 404
    assert (await client.get(embed_url)).status == 404


@pytest.mark.asyncio
async def test_switching_to_private_disconnects_read_only_study_websockets(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_user(app_state, "visibility_owner")
    draft = await StudyChapterBuilder(app_state, "visibility_owner").blank_or_fen(variant="chess")
    study, _ = await create_study_from_draft(app_state, "visibility_owner", draft)

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("visibility_owner")})
    response = await client.post(
        f"/study/{study.id}/edit",
        data={"name": study.name, "visibility": "unlisted"},
        allow_redirects=False,
    )
    assert response.status == 302

    async with aiohttp.ClientSession() as viewer:
        ws = await viewer.ws_connect(client.make_url(f"/wsstudy/{study.id}"))
        connected = await ws.receive_json()
        assert connected == {"type": "study_user_connected", "studyId": study.id}
        assert study.id in app_state.study_sockets
        server_ws = next(iter(app_state.study_sockets[study.id]))
        assert not server_ws.closed

        response = await client.post(
            f"/study/{study.id}/edit",
            data={"name": study.name, "visibility": "private"},
            allow_redirects=False,
        )
        assert response.status == 302
        assert response.headers["Location"] == f"/study/{study.id}"
        assert server_ws.closed
        closed = await ws.receive(timeout=1)
        assert closed.type in {aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED}

        with pytest.raises(aiohttp.WSServerHandshakeError) as exc_info:
            await viewer.ws_connect(client.make_url(f"/wsstudy/{study.id}"))
        assert exc_info.value.status == 404


@pytest.mark.asyncio
async def test_viewable_study_can_be_cloned_into_private_owned_copy(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_user(app_state, "clone_owner")
    await _insert_user(app_state, "clone_viewer")

    draft = await StudyChapterBuilder(app_state, "clone_owner").blank_or_fen(
        variant="chess", name="Source chapter"
    )
    study, chapter = await create_study_from_draft(
        app_state, "clone_owner", draft, name="Clone source"
    )
    source_url = f"/study/{study.id}/{chapter.id}"
    clone_url = f"/study/{study.id}/clone"

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("clone_owner")})
    response = await client.get(source_url, headers={"Accept": "application/json"})
    assert response.status == 200
    assert (await response.json())["study"]["canClone"] is True

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("clone_viewer")})
    assert (await client.post(clone_url, allow_redirects=False)).status == 404

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("clone_owner")})
    response = await client.post(
        f"/study/{study.id}/edit",
        data={"name": study.name, "visibility": "public"},
        allow_redirects=False,
    )
    assert response.status == 302

    client.session.cookie_jar.clear()
    response = await client.get(source_url, headers={"Accept": "application/json"})
    assert response.status == 200
    assert (await response.json())["study"]["canClone"] is False
    response = await client.post(clone_url, allow_redirects=False)
    assert response.status == 302
    assert response.headers["Location"] == "/login"

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("clone_viewer")})
    response = await client.get(source_url, headers={"Accept": "application/json"})
    assert response.status == 200
    assert (await response.json())["study"]["canClone"] is True

    response = await client.post(clone_url, allow_redirects=False)
    assert response.status == 302
    location = response.headers["Location"]
    assert location.startswith("/study/")
    assert location != source_url

    cloned_study_id, cloned_chapter_id = location.removeprefix("/study/").split("/", 1)
    cloned_doc = await app_state.db.study.find_one({"_id": cloned_study_id})
    assert cloned_doc is not None
    assert cloned_doc["owner"] == "clone_viewer"
    assert cloned_doc["members"] == {"clone_viewer": "write"}
    assert cloned_doc["visibility"] == "private"
    assert cloned_doc["source"] == f"study {study.id}"
    assert cloned_doc["currentChapter"] == cloned_chapter_id
    assert cloned_doc["revision"] == 0

    cloned_chapters = await app_state.db.study_chapter.find({"studyId": cloned_study_id}).to_list(
        length=10
    )
    assert len(cloned_chapters) == 1
    assert cloned_chapters[0]["_id"] == cloned_chapter_id
    assert cloned_chapters[0]["_id"] != chapter.id
    assert cloned_chapters[0]["owner"] == "clone_viewer"
    assert cloned_chapters[0]["name"] == chapter.name
    assert cloned_chapters[0]["root"] == chapter.root.to_document()

    response = await client.get(location, headers={"Accept": "application/json"})
    assert response.status == 200
    clone_payload = (await response.json())["study"]
    assert clone_payload["visibility"] == "private"
    assert clone_payload["canWrite"] is True
    assert clone_payload["canClone"] is True
