import pytest
from playwright.async_api import async_playwright, expect
from mongomock_motor import AsyncMongoMockClient

from server import make_app


@pytest.mark.asyncio
async def test_lobby_page(aiohttp_server):
    # Start the server using the fixture
    app = make_app(db_client=AsyncMongoMockClient())
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
