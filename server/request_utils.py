from __future__ import annotations

from typing import Any

from aiohttp import web
from aiohttp.client_exceptions import ClientConnectionResetError

CLIENT_DISCONNECT_ERRORS = (ConnectionResetError, ClientConnectionResetError)


def safe_log_value(value: str | None, default: str = "-", max_length: int = 200) -> str:
    if value is None:
        value = default
    value = value[:max_length]
    ascii_value = value.encode("ascii", "backslashreplace").decode("ascii")
    # Keep untrusted header/path values on one log line.
    return "".join(char if 32 <= ord(char) < 127 else f"\\x{ord(char):02x}" for char in ascii_value)


def request_log_fingerprint(request: web.Request) -> tuple[str, str, str, bool]:
    return (
        safe_log_value(request.headers.get("User-Agent")),
        safe_log_value(request.headers.get("Referer")),
        f"{request.version.major}.{request.version.minor}",
        "AIOHTTP_SESSION" in request.cookies,
    )


async def read_post_data(request: web.Request) -> Any | None:
    try:
        return await request.post()
    except CLIENT_DISCONNECT_ERRORS:
        return None
    except ValueError as exc:
        raise web.HTTPBadRequest(text="invalid form data") from exc


async def read_json_data(request: web.Request) -> Any | None:
    try:
        return await request.json()
    except CLIENT_DISCONNECT_ERRORS:
        return None
    except ValueError as exc:
        raise web.HTTPBadRequest(text="invalid json data") from exc


async def read_text_data(request: web.Request) -> str | None:
    try:
        return await request.text()
    except CLIENT_DISCONNECT_ERRORS:
        return None
    except UnicodeDecodeError as exc:
        raise web.HTTPBadRequest(text="invalid text data") from exc
