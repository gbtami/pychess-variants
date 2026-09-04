import asyncio
import json
import re
import shutil
import time
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
import test_logger
from mongomock_motor import AsyncMongoMockClient
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright, expect
from pychess_global_app_state_utils import get_app_state
from study.storage import load_owned_chapter, load_owned_study
from study.tree import StudyTree

from server import make_app

test_logger.init_test_logger()


@pytest.mark.asyncio
class TestStudyGUI:
    async def _launch_browser(self, playwright):
        try:
            return await playwright.chromium.launch(headless=True)
        except PlaywrightError as err:
            # Local dev fallback: Playwright currently has no bundled Chromium for ubuntu26.04.
            if "Executable doesn't exist" not in str(err):
                raise
            system_chromium = shutil.which("chromium-browser") or shutil.which("chromium")
            if not system_chromium:
                raise
            return await playwright.chromium.launch(headless=True, executable_path=system_chromium)

    async def _page_for_user(self, browser, base_url: str, username: str):
        context = await browser.new_context()
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        await context.add_cookies(
            [{"name": "AIOHTTP_SESSION", "value": json.dumps(session_data), "url": base_url}]
        )
        page = await context.new_page()
        page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
        return context, page

    async def _insert_user(self, app_state, username: str):
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

    @staticmethod
    def _study_ids_from_url(url: str) -> tuple[str, str]:
        match = re.search(r"/study/(\w{8})/(\w{8})$", url)
        assert match is not None, url
        return match.group(1), match.group(2)

    async def _play_board_move(self, page, source: str, target: str):
        board = page.locator("#mainboard cg-board")
        await expect(board).to_be_visible()
        box = await board.bounding_box()
        assert box is not None

        def position(square: str):
            file_index = ord(square[0]) - ord("a")
            rank = int(square[1:])
            return {
                "x": (file_index + 0.5) * box["width"] / 8,
                "y": (8 - rank + 0.5) * box["height"] / 8,
            }

        await board.click(position=position(source))
        await board.click(position=position(target))

    async def _study_node_count(self, app_state, chapter_id: str) -> int:
        doc = await app_state.db.study_chapter.find_one({"_id": chapter_id})
        assert doc is not None
        return sum(1 for node_id in doc["root"] if node_id != "_")

    async def _study_has_node_count(self, app_state, chapter_id: str, expected: int) -> bool:
        return await self._study_node_count(app_state, chapter_id) == expected

    async def _eventually(self, predicate, timeout: float = 10.0, interval: float = 0.1):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            result = predicate()
            if result:
                return result
            await asyncio.sleep(interval)
        raise AssertionError("Timed out waiting for condition")

    async def _eventually_async(self, predicate, timeout: float = 10.0, interval: float = 0.1):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            result = await predicate()
            if result:
                return result
            await asyncio.sleep(interval)
        raise AssertionError("Timed out waiting for condition")

    async def test_persistence_chapters_and_fresh_app_state(self, aiohttp_server):
        db_client = AsyncMongoMockClient(tz_aware=True)
        app = make_app(db_client=db_client, simple_cookie_storage=True)
        server = await aiohttp_server(app, host="127.0.0.1")
        app_state = get_app_state(app)
        username = "study_owner"
        await self._insert_user(app_state, username)
        base_url = f"http://{server.host}:{server.port}"

        async with async_playwright() as p:
            browser = await self._launch_browser(p)
            context, page = await self._page_for_user(browser, base_url, username)
            try:
                await page.goto(f"{base_url}/study")
                await page.locator('.study-create-form input[name="name"]').fill("Acceptance Study")
                await page.get_by_role("button", name="New study").click()
                await page.wait_for_url(
                    re.compile(rf"{re.escape(base_url)}/study/\w{{8}}/\w{{8}}$")
                )
                study_id, first_chapter_id = self._study_ids_from_url(page.url)
                await self._eventually(
                    lambda: len(app_state.study_sockets.get(study_id, set())) == 1
                )

                # Main line: 1.e4 e5. Then make 1...c5 with a nested 2.Nf3/d4 fork.
                await self._play_board_move(page, "e2", "e4")
                await self._eventually_async(
                    lambda: self._study_has_node_count(app_state, first_chapter_id, 1)
                )
                await self._play_board_move(page, "e7", "e5")
                await self._eventually_async(
                    lambda: self._study_has_node_count(app_state, first_chapter_id, 2)
                )
                await page.locator("#movelist move.mainline").first.click()
                await self._play_board_move(page, "c7", "c5")
                await self._play_board_move(page, "g1", "f3")
                await page.locator("#movelist move", has_text="c5").click()
                await self._play_board_move(page, "d2", "d4")
                await self._eventually_async(
                    lambda: self._study_has_node_count(app_state, first_chapter_id, 5)
                )

                # Promote the Sicilian branch to the preferred line, then delete its
                # nested 2.d4 variation through the real movelist context menu.
                c5 = page.locator("#movelist move", has_text="c5")
                await c5.click(button="right")
                await (
                    page.locator(".tree-context-menu")
                    .get_by_role("button", name="Make main line")
                    .click()
                )

                async def sicilian_is_mainline():
                    doc = await app_state.db.study_chapter.find_one({"_id": first_chapter_id})
                    assert doc is not None
                    tree = StudyTree.from_document(doc["root"])
                    nodes = {node.move: node for node in tree.nodes.values()}
                    return nodes["c7c5"].order == 0 and nodes["e7e5"].order == 1

                await self._eventually_async(sicilian_is_mainline)
                d4 = page.locator("#movelist move", has_text="d4")
                await d4.click(button="right")
                await (
                    page.locator(".tree-context-menu")
                    .get_by_role("button", name="Delete from here")
                    .click()
                )
                await self._eventually_async(
                    lambda: self._study_has_node_count(app_state, first_chapter_id, 4)
                )

                await page.reload()
                await expect(page.locator("#movelist")).to_contain_text("e4")
                await expect(page.locator("#movelist")).to_contain_text("c5")
                await expect(page.locator("#movelist")).to_contain_text("Nf3")
                await expect(page.locator("#movelist")).to_contain_text("e5")
                await expect(page.locator("#movelist")).not_to_contain_text("d4")

                # Build three chapters, rename the middle one, then delete it and
                # verify that the formerly third chapter becomes the adjacent current one.
                add = page.locator("details.study-side__new-chapter")
                await add.locator("summary").click()
                await add.locator('input[name="chapterName"]').fill("Middle chapter")
                await add.get_by_role("button", name="Create chapter").click()
                await page.wait_for_url(
                    re.compile(rf"{re.escape(base_url)}/study/{study_id}/\w{{8}}$")
                )
                _, middle_chapter_id = self._study_ids_from_url(page.url)

                chapter_rename = page.locator("form.study-side__rename").nth(1)
                await chapter_rename.locator('input[name="name"]').fill("Renamed middle")
                await chapter_rename.get_by_role("button", name="Rename").click()
                await expect(page.locator(".study-chapters")).to_contain_text("2. Renamed middle")

                add = page.locator("details.study-side__new-chapter")
                await add.locator("summary").click()
                await add.locator('input[name="chapterName"]').fill("Last chapter")
                await add.get_by_role("button", name="Create chapter").click()
                _, last_chapter_id = self._study_ids_from_url(page.url)

                await page.get_by_role("link", name="2. Renamed middle").click()
                assert self._study_ids_from_url(page.url)[1] == middle_chapter_id
                await page.get_by_role("button", name="Delete chapter").click()
                await page.wait_for_url(f"{base_url}/study/{study_id}/{last_chapter_id}")
                await expect(page.locator(".study-chapters")).to_contain_text("2. Last chapter")
                await expect(page.locator(".study-chapters")).not_to_contain_text("Renamed middle")

                # Study persistence has no in-memory preload dependency: the storage
                # layer can reconstruct both objects from a fresh context that contains
                # only the database handle. Do not start a second aiohttp test server in
                # this event loop because PyChess graceful shutdown cancels loop-wide tasks.
                fresh_storage = SimpleNamespace(db=app_state.db)
                restarted_study = await load_owned_study(fresh_storage, study_id, username)
                restarted_chapter = await load_owned_chapter(
                    fresh_storage, study_id, first_chapter_id, username
                )
                assert restarted_study is not None
                assert restarted_chapter is not None
                restarted_moves = {node.move for node in restarted_chapter.root.nodes.values()}
                assert {"e2e4", "c7c5", "g1f3", "e7e5"} <= restarted_moves
                assert "d2d4" not in restarted_moves
            finally:
                await context.close()
                await browser.close()

    async def test_two_tabs_converge_and_private_access(self, aiohttp_server):
        app = make_app(
            db_client=AsyncMongoMockClient(tz_aware=True),
            simple_cookie_storage=True,
        )
        server = await aiohttp_server(app, host="127.0.0.1")
        app_state = get_app_state(app)
        owner = "study_sync_owner"
        intruder = "study_intruder"
        await self._insert_user(app_state, owner)
        await self._insert_user(app_state, intruder)
        base_url = f"http://{server.host}:{server.port}"

        async with async_playwright() as p:
            browser = await self._launch_browser(p)
            owner_context, page_a = await self._page_for_user(browser, base_url, owner)
            page_b = await owner_context.new_page()
            intruder_context, intruder_page = await self._page_for_user(browser, base_url, intruder)
            anon_context = await browser.new_context()
            anon_page = await anon_context.new_page()
            try:
                await page_a.goto(f"{base_url}/study")
                await page_a.locator('.study-create-form input[name="name"]').fill("Synced Study")
                await page_a.get_by_role("button", name="New study").click()
                study_id, chapter_id = self._study_ids_from_url(page_a.url)
                study_url = f"{base_url}/study/{study_id}/{chapter_id}"
                await page_b.goto(study_url)
                await self._eventually(
                    lambda: len(app_state.study_sockets.get(study_id, set())) == 2
                )

                await self._play_board_move(page_a, "e2", "e4")
                await expect(page_b.locator("#movelist")).to_contain_text("e4", timeout=5000)

                # Study mutations synchronize the shared tree, but Phase 1 intentionally
                # keeps each tab's current path/board position independent. Follow the
                # remote move in tab B before extending that line.
                await page_b.locator("#movelist move", has_text="e4").click()
                await self._play_board_move(page_b, "e7", "e5")
                await expect(page_a.locator("#movelist")).to_contain_text("e5", timeout=5000)
                await self._eventually_async(
                    lambda: self._study_has_node_count(app_state, chapter_id, 2)
                )

                # Try independent root alternatives from both tabs at nearly the same
                # time. They may serialize, or one tab may reload after the revision
                # race. Either outcome must converge to the authoritative Mongo tree.
                await page_a.locator(".btn-controls button:has(.icon-fast-backward)").click()
                await page_b.locator(".btn-controls button:has(.icon-fast-backward)").click()
                await asyncio.gather(
                    self._play_board_move(page_a, "d2", "d4"),
                    self._play_board_move(page_b, "c2", "c4"),
                )

                async def concurrent_edits_settled():
                    count = await self._study_node_count(app_state, chapter_id)
                    return count in {3, 4}

                await self._eventually_async(concurrent_edits_settled)
                await asyncio.sleep(0.5)

                async def views_match_authoritative_tree():
                    doc = await app_state.db.study_chapter.find_one({"_id": chapter_id})
                    assert doc is not None
                    accepted_moves = {
                        node["m"] for node_id, node in doc["root"].items() if node_id != "_"
                    }
                    if not accepted_moves & {"d2d4", "c2c4"}:
                        return False

                    expected = {
                        san
                        for uci, san in (("d2d4", "d4"), ("c2c4", "c4"))
                        if uci in accepted_moves
                    }
                    rejected = {"d4", "c4"} - expected
                    for page in (page_a, page_b):
                        try:
                            sans = set(await page.locator("#movelist move san").all_text_contents())
                        except PlaywrightError:
                            # The tab that loses the optimistic revision race reloads.
                            return False
                        if not expected <= sans or rejected & sans:
                            return False
                    return True

                await self._eventually_async(views_match_authoritative_tree)

                response = await intruder_page.goto(study_url)
                assert response is not None and response.status == 404
                await anon_page.goto(study_url)
                await expect(anon_page).to_have_url(re.compile(rf"{re.escape(base_url)}/login"))
            finally:
                await owner_context.close()
                await intruder_context.close()
                await anon_context.close()
                await browser.close()

    async def test_save_analysis_to_study(self, aiohttp_server):
        app = make_app(
            db_client=AsyncMongoMockClient(tz_aware=True),
            simple_cookie_storage=True,
        )
        server = await aiohttp_server(app, host="127.0.0.1")
        app_state = get_app_state(app)
        username = "study_analysis_owner"
        await self._insert_user(app_state, username)
        base_url = f"http://{server.host}:{server.port}"

        async with async_playwright() as p:
            browser = await self._launch_browser(p)
            context, page = await self._page_for_user(browser, base_url, username)
            try:
                await page.goto(f"{base_url}/analysis/chess")
                await self._play_board_move(page, "e2", "e4")
                await self._play_board_move(page, "e7", "e5")
                await expect(page.locator("#movelist")).to_contain_text("e4")
                await expect(page.locator("#movelist")).to_contain_text("e5")

                # Standalone analysis displays the FEN/PGN panel directly and hides
                # its tab bar, so Save to Study is already visible.
                await page.get_by_role("button", name="Save to Study").click()
                await page.wait_for_url(
                    re.compile(rf"{re.escape(base_url)}/study/\w{{8}}/\w{{8}}$")
                )
                study_id, chapter_id = self._study_ids_from_url(page.url)

                await expect(page.locator("#movelist")).to_contain_text("e4")
                await expect(page.locator("#movelist")).to_contain_text("e5")
                await self._eventually_async(
                    lambda: self._study_has_node_count(app_state, chapter_id, 2)
                )
                study_doc = await app_state.db.study.find_one({"_id": study_id})
                chapter_doc = await app_state.db.study_chapter.find_one({"_id": chapter_id})
                assert study_doc is not None
                assert chapter_doc is not None
                assert study_doc["owner"] == username
                assert chapter_doc["initialFen"].startswith("rnbqkbnr/pppppppp/")
            finally:
                await context.close()
                await browser.close()
