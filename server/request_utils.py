from __future__ import annotations

from typing import Any

from aiohttp import web
from aiohttp.client_exceptions import ClientConnectionResetError


CLIENT_DISCONNECT_ERRORS = (ConnectionResetError, ClientConnectionResetError)


def safe_log_value(value: str | None, default: str = "-", max_length: int = 200) -> str:
    if value is None:
        value = default
    value = value[:max_length]
    return value.encode("ascii", "backslashreplace").decode("ascii")


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
