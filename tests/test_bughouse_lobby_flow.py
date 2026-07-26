"""Two-browser bughouse lobby flow: one user creates a bughouse seek and sits
both seats of their team (simul); a second user accepts both seats of the other
team. Asserts both browsers get redirected to the round page and reports how
long the redirect and the round-page render took."""

import asyncio
import json
import shutil
import time

import pytest
import test_logger
from mongomock_motor import AsyncMongoMockClient
from playwright.async_api import async_playwright, Error as PlaywrightError

from bug.game_bug import GameBug
from glicko2.glicko2 import new_default_perf_map
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import VARIANTS

test_logger.init_test_logger()

CREATOR = "BugSimulCreator"
ACCEPTOR = "BugSimulAcceptor"
# generous ceiling so CI jitter doesn't flake the test; locally this is < 1s
REDIRECT_TIMEOUT_MS = 30000


def is_round_url(url) -> bool:
    tail = str(url).rstrip("/").split("/")[-1]
    return tail.isalnum() and len(tail) == 8


@pytest.mark.asyncio
class TestBughouseLobbyFlow:
    async def _launch_browser(self, playwright):
        try:
            return await playwright.chromium.launch(headless=True)
        except PlaywrightError as err:
            if "Executable doesn't exist" not in str(err):
                raise
            system_chromium = shutil.which("chromium-browser") or shutil.which("chromium")
            if not system_chromium:
                raise
            return await playwright.chromium.launch(headless=True, executable_path=system_chromium)

    async def _lobby_page_for_user(self, browser, base_url: str, username: str):
        context = await browser.new_context()
        await context.add_init_script("localStorage.seek_variant = 'bughouse';")
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        await context.add_cookies(
            [{"name": "AIOHTTP_SESSION", "value": json.dumps(session_data), "url": base_url}]
        )
        page = await context.new_page()
        await page.goto(base_url + "/")
        await page.wait_for_selector(".lobby-button", state="visible")
        # dismiss the first-visit "Game category filter" modal
        keep_all = page.get_by_text("Keep all variants")
        if await keep_all.count() > 0:
            await keep_all.click()
        return page

    async def test_bughouse_simul_seek_accept_redirects_both_players(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
        server = await aiohttp_server(app, host="127.0.0.1")
        base_url = f"http://{server.host}:{server.port}"
        app_state = get_app_state(app)
        for name in (CREATOR, ACCEPTOR):
            app_state.users[name] = User(
                app_state, username=name, perfs=new_default_perf_map(VARIANTS)
            )

        async with async_playwright() as playwright:
            browser1 = await self._launch_browser(playwright)
            browser2 = await self._launch_browser(playwright)
            try:
                creator = await self._lobby_page_for_user(browser1, base_url, CREATOR)
                acceptor = await self._lobby_page_for_user(browser2, base_url, ACCEPTOR)
                await creator.wait_for_timeout(1000)  # let lobby websockets settle

                # creator opens the create-game dialog (bughouse preselected via localStorage)
                await creator.locator(".lobby-button").first.click()
                await creator.wait_for_selector("#variant", state="visible")
                assert (
                    await creator.evaluate("() => document.getElementById('variant').value")
                    == "bughouse"
                )
                await creator.locator("#color-button-group button.icon-white").click()

                # creator sits the second seat of their own team (simul): the only
                # Join button the creator sees on their seek is their partner seat
                await creator.wait_for_selector(".bug-join-button", state="visible")
                await creator.locator(".bug-join-button").first.click()

                # acceptor sees the seek with the two remaining (team 2) seats
                await acceptor.wait_for_function(
                    "() => document.querySelectorAll('.bug-join-button').length === 2"
                )
                await acceptor.locator(".bug-join-button").nth(0).click()
                await acceptor.wait_for_function(
                    "() => document.querySelectorAll('.bug-join-button').length === 1"
                )

                # final seat: the game is created and both browsers must redirect
                t0 = time.perf_counter()

                async def timed_redirect(page, who):
                    await page.wait_for_url(is_round_url, timeout=REDIRECT_TIMEOUT_MS)
                    t_url = time.perf_counter() - t0
                    await page.wait_for_selector(
                        "#mainboard cg-board", state="visible", timeout=REDIRECT_TIMEOUT_MS
                    )
                    t_board = time.perf_counter() - t0
                    print(
                        f"[bughouse-lobby-flow] {who}: redirect {t_url:.3f}s, boards {t_board:.3f}s"
                    )
                    return t_url, t_board

                waiter1 = asyncio.create_task(timed_redirect(creator, "creator(simul)"))
                waiter2 = asyncio.create_task(timed_redirect(acceptor, "acceptor"))
                await acceptor.locator(".bug-join-button").first.click()
                await asyncio.gather(waiter1, waiter2)

                # both landed on the same game
                assert (
                    creator.url.rstrip("/").split("/")[-1]
                    == acceptor.url.rstrip("/").split("/")[-1]
                )
                # simul really happened: creator holds both seats of team 1
                game = next(iter(app_state.games.values()))
                assert isinstance(game, GameBug)
                assert game.wplayerA.username == CREATOR and game.bplayerB.username == CREATOR
                assert game.bplayerA.username == ACCEPTOR and game.wplayerB.username == ACCEPTOR
            finally:
                await browser1.close()
                await browser2.close()
