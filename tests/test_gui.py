import pytest
import re
from playwright.async_api import async_playwright, expect
from mongomock_motor import AsyncMongoMockClient

from server import make_app


@pytest.mark.asyncio
class TestGUI:
    async def test_main_page_buttons(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient())
        server = await aiohttp_server(app)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            await page.goto(f"http://{server.host}:{server.port}/")

            await page.wait_for_selector("main.lobby", state="visible")

            # Test "Play with AI" button
            await page.locator(".seekbuttons >> text=Play with AI").click()
            dialog = page.locator("dialog.modal")
            await expect(dialog).to_be_visible()
            await expect(dialog).to_contain_text("Play with AI")
            await page.keyboard.press("Escape")

            # Test "Play with a friend" button
            await page.locator(".seekbuttons >> text=Play with a friend").click()
            dialog = page.locator("dialog.modal")
            await expect(dialog).to_be_visible()
            await expect(dialog).to_contain_text("Play with a friend")
            await page.keyboard.press("Escape")

            # Test "Create a game" button
            await page.locator(".seekbuttons >> text=Create a game").click()
            dialog = page.locator("dialog.modal")
            await expect(dialog).to_be_visible()
            await expect(dialog).to_contain_text("Create a game")
            await page.keyboard.press("Escape")

            await browser.close()

    async def test_editor_play_with_machine(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient())
        # When tests has redirects port have to be fixed
        # By default aiohttp_server fixture randomize the port
        server = await aiohttp_server(app, host="127.0.0.1", port=8080)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            await page.goto(f"http://{server.host}:{server.port}/editor/chess")

            await page.wait_for_selector(".editor-app", state="visible")

            await page.locator("#challengeAI").click()

            AI_URL_RE = re.compile(
                r"http://127\.0\.0\.1:8080/@/Fairy-Stockfish/play/[^/?]+\?fen=.*"
            )
            await page.wait_for_url(AI_URL_RE)

            dialog = page.locator("dialog.modal")
            await expect(dialog).to_be_visible()
            await expect(dialog).to_contain_text("Challenge Fairy-Stockfish to a game")

            await browser.close()

    async def test_editor_continue_from_here(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient())
        # When tests has redirects port have to be fixed
        # By default aiohttp_server fixture randomize the port
        server = await aiohttp_server(app, host="127.0.0.1", port=8080)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            await page.goto(f"http://{server.host}:{server.port}/editor/chess")

            await page.wait_for_selector(".editor-app", state="visible")

            await page.locator("#createseek").click()

            SEEK_URL_RE = re.compile(r"http://127\.0\.0\.1:8080/seek/[^/?]+\?fen=.*")
            await page.wait_for_url(SEEK_URL_RE)

            dialog = page.locator("dialog.modal")
            await expect(dialog).to_be_visible()
            await expect(dialog).to_contain_text("Create a game")

            await browser.close()
