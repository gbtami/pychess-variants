from __future__ import annotations

import json
import time
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import aiohttp
import pytest
import test_logger
from const import FOLLOW
from fairy import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from study.builder import StudyChapterBuilder
from study.storage import (
    add_chapter,
    add_study_member,
    create_study_from_draft,
    set_study_visibility,
)

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
async def test_study_create_modal_starts_with_default_chess_chapter(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    username = "study_create_owner"
    await _insert_user(app_state, username)
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(username)})

    response = await client.get("/study")
    assert response.status == 200
    html = await response.text()
    assert "data-study-new-open" in html
    assert 'id="study-new-dialog"' in html
    assert 'id="study-create-form"' in html
    assert 'name="variant"' not in html
    assert 'name="gameId"' not in html
    assert 'name="fen"' not in html

    response = await client.post(
        "/study",
        data={
            "name": "Modal Study",
            "visibility": "unlisted",
            "computer": "member",
            "explorer": "owner",
            "cloneable": "contributor",
            "shareable": "nobody",
            # Study creation intentionally ignores chapter-specific input.
            "variant": "atomic",
            "fen": "not-a-fen",
            "gameId": "ignored",
        },
        allow_redirects=False,
    )
    assert response.status == 302

    study_doc = await app_state.db.study.find_one({"owner": username, "name": "Modal Study"})
    assert study_doc is not None
    assert study_doc["visibility"] == "unlisted"
    assert study_doc["settings"] == {
        "computer": "member",
        "explorer": "owner",
        "cloneable": "contributor",
        "shareable": "nobody",
    }
    chapter_doc = await app_state.db.study_chapter.find_one({"studyId": study_doc["_id"]})
    assert chapter_doc is not None
    assert chapter_doc["variant"] == "chess"
    assert chapter_doc["initialFen"] == FairyBoard.start_fen("chess")


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
async def test_browsing_chapter_does_not_change_shared_study_position(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    username = "study_position_owner"
    await _insert_user(app_state, username)

    first_draft = await StudyChapterBuilder(app_state, username).blank_or_fen(
        variant="chess", name="First chapter"
    )
    study, first = await create_study_from_draft(app_state, username, first_draft)
    second = await add_chapter(app_state, study, first, name="Second chapter")

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(username)})
    response = await client.get(
        f"/study/{study.id}/{first.id}",
        headers={"Accept": "application/json"},
    )
    assert response.status == 200
    payload = await response.json()
    assert payload["study"]["chapter"]["id"] == first.id
    assert payload["study"]["sharedChapter"] == second.id
    assert payload["study"]["sharedPath"] == ""

    stored = await app_state.db.study.find_one({"_id": study.id})
    assert stored is not None
    assert stored["currentChapter"] == second.id
    assert "currentPath" not in stored


@pytest.mark.asyncio
async def test_edit_chapter_updates_name_and_orientation(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    username = "study_chapter_editor"
    await _insert_user(app_state, username)
    draft = await StudyChapterBuilder(app_state, username).blank_or_fen(
        variant="chess", name="Original chapter"
    )
    study, chapter = await create_study_from_draft(app_state, username, draft)

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(username)})
    response = await client.post(
        f"/study/{study.id}/{chapter.id}/edit",
        data={"name": "Black repertoire", "orientation": "black"},
        allow_redirects=False,
    )
    assert response.status == 302

    stored = await app_state.db.study_chapter.find_one({"_id": chapter.id})
    assert stored is not None
    assert stored["name"] == "Black repertoire"
    assert stored["orientation"] == "black"

    page = await client.get(
        f"/study/{study.id}/{chapter.id}", headers={"Accept": "application/json"}
    )
    assert page.status == 200
    payload = await page.json()
    assert payload["study"]["chapter"]["orientation"] == "black"
    assert payload["study"]["chapters"][0]["orientation"] == "black"


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
async def test_study_feature_permissions_gate_engine_clone_and_share(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    for username in ("feature_owner", "feature_writer", "feature_reader", "feature_other"):
        await _insert_user(app_state, username)

    draft = await StudyChapterBuilder(app_state, "feature_owner").blank_or_fen(variant="chess")
    study, chapter = await create_study_from_draft(app_state, "feature_owner", draft)
    await add_study_member(app_state, study.id, "feature_owner", "feature_writer", "write")
    await add_study_member(app_state, study.id, "feature_owner", "feature_reader", "read")

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("feature_owner")})
    response = await client.post(
        f"/study/{study.id}/edit",
        data={
            "name": study.name,
            "visibility": "public",
            "computer": "contributor",
            "explorer": "nobody",
            "cloneable": "member",
            "shareable": "owner",
        },
        allow_redirects=False,
    )
    assert response.status == 302

    stored = await app_state.db.study.find_one({"_id": study.id})
    assert stored is not None
    assert stored["settings"] == {
        "computer": "contributor",
        "explorer": "nobody",
        "cloneable": "member",
        "shareable": "owner",
    }

    url = f"/study/{study.id}/{chapter.id}"
    export_url = f"{url}/export-data"
    embed_url = f"/study/embed/{study.id}/{chapter.id}"

    async def payload_for(username: str | None) -> dict[str, object]:
        client.session.cookie_jar.clear()
        if username is not None:
            client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(username)})
        response = await client.get(url, headers={"Accept": "application/json"})
        assert response.status == 200
        return (await response.json())["study"]

    owner = await payload_for("feature_owner")
    assert owner["features"] == {"computer": True, "explorer": False}
    assert owner["canClone"] is True
    assert owner["canShare"] is True
    assert owner["canEmbed"] is True
    assert owner["settings"] == stored["settings"]
    assert (await client.get(export_url)).status == 200

    writer = await payload_for("feature_writer")
    assert writer["features"] == {"computer": True, "explorer": False}
    assert writer["canClone"] is True
    assert writer["canShare"] is False
    assert (await client.get(export_url)).status == 404

    reader = await payload_for("feature_reader")
    assert reader["features"] == {"computer": False, "explorer": False}
    assert reader["canClone"] is True
    assert reader["canShare"] is False

    other = await payload_for("feature_other")
    assert other["features"] == {"computer": False, "explorer": False}
    assert other["canClone"] is False
    assert other["canShare"] is False

    anonymous = await payload_for(None)
    assert anonymous["features"] == {"computer": False, "explorer": False}
    assert anonymous["canClone"] is False
    assert anonymous["canShare"] is False
    assert (await client.get(export_url)).status == 404
    assert (await client.get(embed_url)).status == 200


@pytest.mark.asyncio
async def test_invalid_study_feature_permission_does_not_partially_edit_study(
    aiohttp_client,
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    await _insert_user(app_state, "feature_validation_owner")

    draft = await StudyChapterBuilder(app_state, "feature_validation_owner").blank_or_fen(
        variant="chess"
    )
    study, _ = await create_study_from_draft(app_state, "feature_validation_owner", draft)
    client.session.cookie_jar.update_cookies(
        {"AIOHTTP_SESSION": _login_cookie("feature_validation_owner")}
    )

    response = await client.post(
        f"/study/{study.id}/edit",
        data={
            "name": "Should not stick",
            "visibility": "public",
            "computer": "invalid",
        },
        allow_redirects=False,
    )
    assert response.status == 400

    stored = await app_state.db.study.find_one({"_id": study.id})
    assert stored is not None
    assert stored["name"] == study.name
    assert stored["visibility"] == study.visibility
    assert stored.get("settings", {}) == dict(study.settings)


@pytest.mark.asyncio
async def test_profile_study_listing_only_exposes_public_studies(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    owner = "study_profile_owner"
    viewer = "study_profile_viewer"
    await _insert_user(app_state, owner)
    await _insert_user(app_state, viewer)

    builder = StudyChapterBuilder(app_state, owner)
    _private, _ = await create_study_from_draft(
        app_state, owner, await builder.blank_or_fen(variant="chess"), name="Private repertoire"
    )
    unlisted, _ = await create_study_from_draft(
        app_state, owner, await builder.blank_or_fen(variant="chess"), name="Link repertoire"
    )
    public, _ = await create_study_from_draft(
        app_state, owner, await builder.blank_or_fen(variant="chess"), name="Public repertoire"
    )
    await set_study_visibility(app_state, unlisted, "unlisted")
    await set_study_visibility(app_state, public, "public")

    response = await client.get(f"/study/by/{owner}")
    assert response.status == 200
    html = await response.text()
    assert "Public repertoire" in html
    assert "Private repertoire" not in html
    assert "Link repertoire" not in html

    response = await client.get(f"/@/{owner}", headers={"Referer": str(client.make_url("/"))})
    assert response.status == 200
    profile_html = await response.text()
    assert f"/study/by/{owner}" in profile_html
    assert "Studies" in profile_html
    assert "<strong>1</strong> Studies</a>" in profile_html

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(viewer)})
    response = await client.get(f"/@/{owner}")
    assert response.status == 200
    profile_html = await response.text()
    assert f"/study/by/{owner}" in profile_html
    assert "Studies" in profile_html
    assert "<strong>1</strong> Studies</a>" in profile_html

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(owner)})
    response = await client.get(f"/study/by/{owner}")
    assert response.status == 200
    html = await response.text()
    assert "Public repertoire" in html
    assert "Private repertoire" in html
    assert "Link repertoire" in html
    assert "study-card__visibility--public" not in html
    assert "study-card__visibility--private" in html
    assert "study-card__visibility--unlisted" in html

    response = await client.get(f"/@/{owner}")
    assert response.status == 200
    profile_html = await response.text()
    assert f"/study/by/{owner}" in profile_html
    assert "<strong>3</strong> Studies</a>" in profile_html

    response = await client.get("/study/by/no_such_study_owner")
    assert response.status == 404


@pytest.mark.asyncio
async def test_study_list_cards_preview_chapters_and_members(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    owner = "study_card_owner"
    reader = "study_card_reader"
    await _insert_user(app_state, owner)
    await _insert_user(app_state, reader)

    draft = await StudyChapterBuilder(app_state, owner).blank_or_fen(
        variant="chess", name="First line"
    )
    study, first = await create_study_from_draft(app_state, owner, draft, name="Preview repertoire")
    for name in ("Second line", "Third line", "Fourth line", "Fifth line"):
        await add_chapter(app_state, study, first, name=name)
    await add_study_member(app_state, study.id, owner, reader, "read")
    await set_study_visibility(app_state, study, "public")

    response = await client.get("/study/all")
    assert response.status == 200
    html = await response.text()
    assert 'class="study-card__overlay"' in html
    assert 'class="study-card__icon"' in html
    assert '<ol class="study-card__chapters">' in html
    assert '<ol class="study-card__members">' in html
    assert 'class="study-card__chapter">First line</li>' in html
    assert 'class="study-card__chapter">Fourth line</li>' in html
    assert 'class="study-card__chapter">Fifth line</li>' not in html
    assert f'class="study-card__member study-card__member--write">{owner}</li>' in html
    assert f'class="study-card__member study-card__member--read">{reader}</li>' in html


@pytest.mark.asyncio
async def test_personal_study_lists_include_contributions_filters_and_ordering(
    aiohttp_client,
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    owner = "study_list_owner"
    collaborator_owner = "study_list_collaborator"
    await _insert_user(app_state, owner)
    await _insert_user(app_state, collaborator_owner)

    builder = StudyChapterBuilder(app_state, owner)
    _private, _ = await create_study_from_draft(
        app_state, owner, await builder.blank_or_fen(variant="chess"), name="Zulu private"
    )
    unlisted, _ = await create_study_from_draft(
        app_state, owner, await builder.blank_or_fen(variant="chess"), name="Mike unlisted"
    )
    public, _ = await create_study_from_draft(
        app_state, owner, await builder.blank_or_fen(variant="chess"), name="Alpha public"
    )
    await set_study_visibility(app_state, unlisted, "unlisted")
    await set_study_visibility(app_state, public, "public")

    contributed, _ = await create_study_from_draft(
        app_state,
        collaborator_owner,
        await StudyChapterBuilder(app_state, collaborator_owner).blank_or_fen(variant="chess"),
        name="Contributor lab",
    )
    await add_study_member(app_state, contributed.id, collaborator_owner, owner, "write")
    read_only, _ = await create_study_from_draft(
        app_state,
        collaborator_owner,
        await StudyChapterBuilder(app_state, collaborator_owner).blank_or_fen(variant="chess"),
        name="Read-only lab",
    )
    await add_study_member(app_state, read_only.id, collaborator_owner, owner, "read")

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(owner)})

    response = await client.get("/study?order=alphabetical")
    assert response.status == 200
    html = await response.text()
    assert html.index("Alpha public") < html.index("Mike unlisted") < html.index("Zulu private")
    assert "Contributor lab" not in html
    assert "Studies I contribute to" in html
    assert "My public studies" in html
    assert "My private studies" in html
    assert "Alphabetical" in html

    response = await client.get("/study/member")
    assert response.status == 200
    html = await response.text()
    assert "Contributor lab" in html
    assert "Read-only lab" in html
    assert collaborator_owner in html
    assert "Alpha public" not in html

    response = await client.get("/study/public")
    assert response.status == 200
    html = await response.text()
    assert "Alpha public" in html
    assert "Mike unlisted" not in html
    assert "Zulu private" not in html

    response = await client.get("/study/private")
    assert response.status == 200
    html = await response.text()
    assert "Mike unlisted" in html
    assert "Zulu private" in html
    assert "Alpha public" not in html

    response = await client.get("/study?order=not-an-order")
    assert response.status == 200
    html = await response.text()
    assert "Recently updated" in html

    client.session.cookie_jar.clear()
    assert (await client.get("/study/member", allow_redirects=False)).status == 302


@pytest.mark.asyncio
async def test_public_study_discovery_and_search_never_expose_link_only_studies(
    aiohttp_client,
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    for username in ("discovery_alice", "discovery_bob", "private_owner"):
        await _insert_user(app_state, username)

    alice_builder = StudyChapterBuilder(app_state, "discovery_alice")
    public, _ = await create_study_from_draft(
        app_state,
        "discovery_alice",
        await alice_builder.blank_or_fen(variant="chess"),
        name="Sicilian Defense Lab",
    )
    await set_study_visibility(app_state, public, "public")

    bob_builder = StudyChapterBuilder(app_state, "discovery_bob")
    unlisted, _ = await create_study_from_draft(
        app_state,
        "discovery_bob",
        await bob_builder.blank_or_fen(variant="chess"),
        name="Sicilian Secret",
    )
    await set_study_visibility(app_state, unlisted, "unlisted")

    private_builder = StudyChapterBuilder(app_state, "private_owner")
    private, _ = await create_study_from_draft(
        app_state,
        "private_owner",
        await private_builder.blank_or_fen(variant="chess"),
        name="Sicilian Private",
    )

    response = await client.get("/study/all")
    assert response.status == 200
    html = await response.text()
    assert "Sicilian Defense Lab" in html
    assert "discovery_alice" in html
    assert "Sicilian Secret" not in html
    assert "Sicilian Private" not in html

    response = await client.get("/study/all?q=sic")
    assert response.status == 200
    html = await response.text()
    assert "Sicilian Defense Lab" in html
    assert "Sicilian Secret" not in html
    assert "Sicilian Private" not in html

    # Studies created by the earlier Phase 3 slices have no derived searchTokens.
    # They remain discoverable through the safe legacy fallback.
    await app_state.db.study.update_one({"_id": public.id}, {"$unset": {"searchTokens": ""}})
    response = await client.get("/study/all?q=def")
    assert response.status == 200
    assert "Sicilian Defense Lab" in await response.text()

    response = await client.get("/study/all?q=disc+ali")
    assert response.status == 200
    html = await response.text()
    assert "Sicilian Defense Lab" in html

    response = await client.get("/study/all?q=si")
    assert response.status == 200
    html = await response.text()
    assert "Enter at least 3 characters" in html
    assert "Sicilian Defense Lab" not in html

    # Link access remains independent from discovery: unlisted is readable by URL
    # while private remains protected.
    assert (await client.get(f"/study/{unlisted.id}", allow_redirects=False)).status == 302
    assert (await client.get(f"/study/{private.id}", allow_redirects=False)).status == 404


@pytest.mark.asyncio
async def test_richer_study_search_indexes_chapter_metadata_without_leaking_unlisted_studies(
    aiohttp_client,
) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    for username in ("search_public", "search_secret", "search_viewer"):
        await _insert_user(app_state, username)

    public_draft = await StudyChapterBuilder(app_state, "search_public").blank_or_fen(
        variant="chess", name="Dragon attack"
    )
    public_draft = replace(
        public_draft,
        description="Poisoned pawn investigation",
        tags={"Event": "Budapest Masters", "White": "Alice"},
    )
    public, _ = await create_study_from_draft(
        app_state, "search_public", public_draft, name="Opening notes"
    )
    await set_study_visibility(app_state, public, "public")

    secret_draft = await StudyChapterBuilder(app_state, "search_secret").blank_or_fen(
        variant="chess", name="Hidden dragon"
    )
    secret_draft = replace(secret_draft, description="Poisoned pawn secret")
    unlisted, _ = await create_study_from_draft(
        app_state, "search_secret", secret_draft, name="Link only notes"
    )
    await set_study_visibility(app_state, unlisted, "unlisted")

    private_draft = await StudyChapterBuilder(app_state, "search_secret").blank_or_fen(
        variant="chess", name="Fortress endgame"
    )
    private, _ = await create_study_from_draft(
        app_state, "search_secret", private_draft, name="Member notes"
    )
    await add_study_member(app_state, private.id, "search_secret", "search_viewer", "read")

    response = await client.get("/study/search?q=poi")
    assert response.status == 200
    html = await response.text()
    assert "Opening notes" in html
    assert "Link only notes" not in html
    assert "Member notes" not in html

    response = await client.get("/study/search?q=bud")
    assert response.status == 200
    assert "Opening notes" in await response.text()

    response = await client.get("/study/search?q=owner:search_public+dra")
    assert response.status == 200
    html = await response.text()
    assert "Opening notes" in html
    assert "Link only notes" not in html

    # A member filter never bypasses Study discovery privacy for anonymous users.
    response = await client.get("/study/search?q=member:search_viewer+for")
    assert response.status == 200
    assert "Member notes" not in await response.text()

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("search_viewer")})
    response = await client.get("/study/search?q=member:search_viewer+for")
    assert response.status == 200
    html = await response.text()
    assert "Member notes" in html
    assert "Link only notes" not in html

    # The personal list search form carries the same owner/member query syntax
    # as Lichess, so submitting it keeps the intended personal scope.
    response = await client.get("/study/member")
    assert response.status == 200
    assert 'value="member:search_viewer "' in await response.text()

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("search_secret")})
    response = await client.get("/study/search?q=owner:search_secret+poi")
    assert response.status == 200
    html = await response.text()
    assert "Link only notes" in html
    assert "Opening notes" not in html


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


@pytest.mark.asyncio
async def test_study_members_roles_and_contributor_write_access(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    for username in ("member_owner", "member_writer", "member_reader", "member_other"):
        await _insert_user(app_state, username)

    draft = await StudyChapterBuilder(app_state, "member_owner").blank_or_fen(variant="chess")
    study, chapter = await create_study_from_draft(app_state, "member_owner", draft)
    study_url = f"/study/{study.id}/{chapter.id}"

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("member_owner")})
    response = await client.post(
        f"/study/{study.id}/member",
        data={"username": "member_writer", "role": "write"},
        allow_redirects=False,
    )
    assert response.status == 302
    response = await client.post(
        f"/study/{study.id}/member",
        data={"username": "member_reader", "role": "read"},
        allow_redirects=False,
    )
    assert response.status == 302

    response = await client.get(study_url, headers={"Accept": "application/json"})
    payload = (await response.json())["study"]
    assert payload["isOwner"] is True
    assert payload["members"] == {
        "member_owner": "write",
        "member_writer": "write",
        "member_reader": "read",
    }
    assert payload["maxMembers"] >= 3

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("member_writer")})
    response = await client.get(study_url, headers={"Accept": "application/json"})
    payload = (await response.json())["study"]
    assert payload["isOwner"] is False
    assert payload["canWrite"] is True

    response = await client.get("/study/choices", headers={"Accept": "application/json"})
    assert response.status == 200
    choices = (await response.json())["studies"]
    assert {item["id"] for item in choices} == {study.id}

    response = await client.post(
        f"/study/{study.id}/chapter",
        data={"chapterName": "Writer chapter", "variant": "chess"},
        allow_redirects=False,
    )
    assert response.status == 302

    response = await client.post(
        f"/study/{study.id}/edit",
        data={"name": "Nope", "visibility": "public"},
        allow_redirects=False,
    )
    assert response.status == 404
    response = await client.post(
        f"/study/{study.id}/member",
        data={"username": "member_other", "role": "read"},
        allow_redirects=False,
    )
    assert response.status == 404

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("member_reader")})
    response = await client.get(study_url, headers={"Accept": "application/json"})
    assert (await response.json())["study"]["canWrite"] is False
    response = await client.post(
        f"/study/{study.id}/chapter",
        data={"chapterName": "Denied", "variant": "chess"},
        allow_redirects=False,
    )
    assert response.status == 403

    response = await client.post(f"/study/{study.id}/leave", allow_redirects=False)
    assert response.status == 302
    assert (await client.get(study_url, headers={"Accept": "application/json"})).status == 404

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("member_owner")})
    response = await client.post(
        f"/study/{study.id}/member/role",
        data={"username": "member_writer", "role": "read"},
        allow_redirects=False,
    )
    assert response.status == 302

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie("member_writer")})
    response = await client.get(study_url, headers={"Accept": "application/json"})
    assert (await response.json())["study"]["canWrite"] is False


@pytest.mark.asyncio
async def test_new_public_study_like_is_published_to_followers_only_once(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    owner = "timeline_study_owner"
    fan = "timeline_study_fan"
    follower = "timeline_study_follower"
    for username in (owner, fan, follower):
        await _insert_user(app_state, username)

    draft = await StudyChapterBuilder(app_state, owner).blank_or_fen(variant="chess")
    study, _ = await create_study_from_draft(app_state, owner, draft, name="Timeline Study")
    await set_study_visibility(app_state, study, "public")
    await app_state.db.relation.insert_one(
        {"_id": f"{follower}/{fan}", "u1": follower, "u2": fan, "r": FOLLOW}
    )

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(fan)})
    response = await client.post(f"/study/{study.id}/like", json={"liked": True})
    assert response.status == 200

    entries = await app_state.timeline.entries_for(follower)
    assert len(entries) == 1
    assert entries[0]["type"] == "study-like"
    assert entries[0]["data"] == {
        "actor": fan,
        "studyId": study.id,
        "name": "Timeline Study",
    }

    # Re-sending the same state and unliking do not create duplicate activity.
    response = await client.post(f"/study/{study.id}/like", json={"liked": True})
    assert response.status == 200
    response = await client.post(f"/study/{study.id}/like", json={"liked": False})
    assert response.status == 200
    assert len(await app_state.timeline.entries_for(follower)) == 1

    # Lichess only propagates likes of public Studies; unlisted/private Study
    # links must not become discoverable through followers' timelines.
    await set_study_visibility(app_state, study, "unlisted")
    response = await client.post(f"/study/{study.id}/like", json={"liked": True})
    assert response.status == 200
    assert len(await app_state.timeline.entries_for(follower)) == 1


@pytest.mark.asyncio
async def test_study_topics_can_be_managed_and_discovered(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    owner = "topics_owner"
    writer = "topics_writer"
    reader = "topics_reader"
    for username in (owner, writer, reader):
        await _insert_user(app_state, username)

    draft = await StudyChapterBuilder(app_state, owner).blank_or_fen(variant="chess")
    study, chapter = await create_study_from_draft(app_state, owner, draft, name="Topic repertoire")
    await set_study_visibility(app_state, study, "public")
    study = await add_study_member(app_state, study.id, owner, writer, "write")
    await add_study_member(app_state, study.id, owner, reader, "read")

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(writer)})
    response = await client.post(
        f"/study/{study.id}/topics",
        json={"topics": ["  King   pawn ", "Endgame", "King pawn"]},
    )
    assert response.status == 200
    assert await response.json() == {"ok": True, "topics": ["King pawn", "Endgame"]}

    response = await client.get("/study/topic/autocomplete?term=ki")
    assert response.status == 200
    assert await response.json() == ["King pawn"]

    response = await client.get(
        f"/study/{study.id}/{chapter.id}", headers={"Accept": "application/json"}
    )
    assert response.status == 200
    assert (await response.json())["study"]["topics"] == ["King pawn", "Endgame"]

    client.session.cookie_jar.clear()
    response = await client.get("/study/topic/King%20pawn")
    assert response.status == 200
    html = await response.text()
    assert "King pawn" in html
    assert "Topic repertoire" in html

    response = await client.get("/study/topic")
    assert response.status == 200
    html = await response.text()
    assert "Popular topics" in html
    assert "King pawn" in html
    assert "Endgame" in html

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(reader)})
    response = await client.post(f"/study/{study.id}/topics", json={"topics": ["Denied"]})
    assert response.status == 403

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(owner)})
    response = await client.post(f"/study/{study.id}/topics", json={"topics": ["x"]})
    assert response.status == 400
    payload = await response.json()
    assert payload["error"] == "invalid_topics"
    assert "2-50" in payload["message"]

    response = await client.post(f"/study/{study.id}/topics", json={"topics": ["x" * 51]})
    assert response.status == 400
    payload = await response.json()
    assert payload["error"] == "invalid_topics"
    assert "2-50" in payload["message"]


@pytest.mark.asyncio
async def test_study_likes_and_favorite_list(aiohttp_client) -> None:
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
    client = await aiohttp_client(app)
    app_state = get_app_state(app)
    owner = "likes_owner"
    fan = "likes_fan"
    await _insert_user(app_state, owner)
    await _insert_user(app_state, fan)

    draft = await StudyChapterBuilder(app_state, owner).blank_or_fen(variant="chess")
    study, chapter = await create_study_from_draft(app_state, owner, draft, name="Favorite Study")
    await set_study_visibility(app_state, study, "public")
    study_url = f"/study/{study.id}/{chapter.id}"

    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(owner)})
    response = await client.get(study_url, headers={"Accept": "application/json"})
    assert response.status == 200
    payload = (await response.json())["study"]
    assert payload["canLike"] is True
    assert payload["liked"] is True
    assert payload["likes"] == 1

    # The owner's automatic initial like does not make their own Study appear in
    # My favorite studies, matching Lichess's personal list semantics.
    response = await client.get("/study/likes")
    assert response.status == 200
    assert "Favorite Study" not in await response.text()

    client.session.cookie_jar.clear()
    client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": _login_cookie(fan)})
    response = await client.get(study_url, headers={"Accept": "application/json"})
    payload = (await response.json())["study"]
    assert payload["canLike"] is True
    assert payload["liked"] is False
    assert payload["likes"] == 1

    response = await client.post(f"/study/{study.id}/like", json={"liked": True})
    assert response.status == 200
    assert await response.json() == {"ok": True, "liked": True, "likes": 2}

    # Setting the same state is idempotent.
    response = await client.post(f"/study/{study.id}/like", json={"liked": True})
    assert response.status == 200
    assert await response.json() == {"ok": True, "liked": True, "likes": 2}

    response = await client.get("/study/likes")
    assert response.status == 200
    html = await response.text()
    assert "My favorite studies" in html
    assert "Favorite Study" in html
    assert ">2<" in html

    response = await client.post(f"/study/{study.id}/like", json={"liked": False})
    assert response.status == 200
    assert await response.json() == {"ok": True, "liked": False, "likes": 1}
    response = await client.get("/study/likes")
    assert "Favorite Study" not in await response.text()

    client.session.cookie_jar.clear()
    response = await client.post(f"/study/{study.id}/like", json={"liked": True})
    assert response.status == 403
