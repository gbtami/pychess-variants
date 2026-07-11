from __future__ import annotations

from aiohttp import web


_COMMON_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Content-Security-Policy": (
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
        "base-uri 'none'; frame-ancestors 'none'"
    ),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
}

_PAGE_STYLE = """
:root {
    color-scheme: light dark;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
body {
    min-height: 100vh;
    margin: 0;
    display: grid;
    place-items: center;
    background: #312e2b;
    color: #f0f0f0;
}
main {
    box-sizing: border-box;
    width: min(92vw, 36rem);
    padding: 2rem;
    border-radius: 0.75rem;
    background: #262421;
    box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 35%);
}
h1 {
    margin-top: 0;
}
p {
    line-height: 1.5;
}
.notice {
    padding: 0.85rem 1rem;
    border-left: 0.3rem solid #7fa650;
    background: rgb(127 166 80 / 12%);
}
.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1.5rem;
}
button,
a.button {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.8rem;
    padding: 0.75rem 1rem;
    border: 0;
    border-radius: 0.3rem;
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
}
button,
a.primary {
    color: #fff;
    background: #7fa650;
}
a.secondary {
    color: inherit;
    background: #3c3936;
}
"""

_CONFIRMATION_PAGE = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset PyChess browser data</title>
  <style>{_PAGE_STYLE}</style>
</head>
<body>
  <main>
    <h1>Reset PyChess browser data</h1>
    <p>
      Use this when PyChess does not load correctly after an update, or when the
      page remains blank or black.
    </p>
    <div class="notice">
      This clears cached PyChess files and browser storage for this site. Your
      login cookie is not cleared, so you should stay signed in.
    </div>
    <p>
      Locally saved preferences, such as board and piece settings, may return to
      their defaults.
    </p>
    <form method="post" action="/client-reset">
      <div class="actions">
        <button type="submit">Reset PyChess</button>
        <a class="button secondary" href="/">Cancel</a>
      </div>
    </form>
  </main>
</body>
</html>
"""

_COMPLETE_PAGE = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PyChess reset complete</title>
  <style>{_PAGE_STYLE}</style>
</head>
<body>
  <main>
    <h1>Reset complete</h1>
    <p>
      Cached PyChess files and browser storage were cleared. Your login cookie
      was preserved.
    </p>
    <p>Open PyChess again to download a fresh copy of the site.</p>
    <div class="actions">
      <a class="button primary" href="/">Return to PyChess</a>
    </div>
  </main>
</body>
</html>
"""


def _html_response(text: str) -> web.Response:
    return web.Response(
        text=text,
        content_type="text/html",
        charset="utf-8",
        headers=dict(_COMMON_HEADERS),
    )


async def client_reset_page(_request: web.Request) -> web.Response:
    return _html_response(_CONFIRMATION_PAGE)


async def client_reset(_request: web.Request) -> web.Response:
    response = _html_response(_COMPLETE_PAGE)
    response.headers["Clear-Site-Data"] = '"cache", "storage"'
    return response
