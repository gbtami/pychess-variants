from __future__ import annotations

from aiohttp import web

ROBOTS_TXT = """User-agent: PetalBot
Disallow: /
User-agent: *
Disallow: /@/
Disallow: /tv/
Disallow: /api/
Disallow: /editor/
Disallow: /fishnet/
Disallow: /games/
Disallow: /login/
Disallow: /logout/
Disallow: /oauth/
Disallow: /players/
Disallow: /patron/
Disallow: /level8win/
Disallow: /tournament/
Disallow: /tournaments/
Disallow: /calendar/
Crawl-delay: 30
"""


async def robots(request):
    return web.Response(text=ROBOTS_TXT, content_type="text/plain")
