import re

import pytest
import test_logger
from mongomock_motor import AsyncMongoMockClient
from playwright.async_api import async_playwright, expect

from server import make_app

test_logger.init_test_logger()


@pytest.mark.asyncio
async def test_lobby_page(aiohttp_server):
    # Start the server using the fixture
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True))
    server = await aiohttp_server(app)

    # Launch Playwright async
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)  # Headless for CI;set False to see browser
        context = await browser.new_context()
        page = await context.new_page()

        # Navigate to the server's root URL
        await page.goto(f"http://{server.host}:{server.port}/")

        # Assert page content
        content = await page.content()
        assert "Free Online Chess Variants" in content

        # Use Playwright's expect for UI assertions (e.g., if there's a heading)
        await expect(page.locator("body")).to_contain_text("PyChess")

        await browser.close()


@pytest.mark.asyncio
async def test_luffy_flip_keeps_white_artwork_on_white_pieces(aiohttp_server):
    app = make_app(db_client=AsyncMongoMockClient(tz_aware=True))
    server = await aiohttp_server(app)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.add_init_script("localStorage.setItem('chess-piece', '8')")
        await page.goto(f"http://{server.host}:{server.port}/analysis/chess")

        await expect(page.locator("#mainboard .cg-wrap.orientation-white")).to_be_visible(
            timeout=20000
        )
        await expect(page.locator("#mainboard")).to_have_class(
            re.compile(r"piece-style-standard-luffy")
        )

        white_pawn = page.locator("#mainboard cg-board piece.white.p-piece").first
        black_pawn = page.locator("#mainboard cg-board piece.black.p-piece").first
        await expect(white_pawn).to_be_visible()
        before_bg = await white_pawn.evaluate("el => getComputedStyle(el).backgroundImage")
        black_bg = await black_pawn.evaluate("el => getComputedStyle(el).backgroundImage")
        before_tf = await white_pawn.evaluate("el => el.style.transform")
        assert before_bg not in ("", "none")
        assert before_bg != black_bg

        await page.locator('button[title="Flip board"]').click()

        await expect(page.locator("#mainboard .cg-wrap.orientation-black")).to_be_visible()
        after_pawn = page.locator("#mainboard cg-board piece.white.p-piece").first
        after_bg = await after_pawn.evaluate("el => getComputedStyle(el).backgroundImage")
        after_tf = await after_pawn.evaluate("el => el.style.transform")

        assert before_tf != after_tf, (
            f"piece transform did not change on flip: {before_tf!r} -> {after_tf!r}"
        )
        assert after_bg == before_bg, (
            f"white pawn artwork changed on flip: {before_bg!r} -> {after_bg!r}"
        )

        await browser.close()
