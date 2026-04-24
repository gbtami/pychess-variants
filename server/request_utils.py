from __future__ import annotations

from typing import Any

from aiohttp import web
from aiohttp.client_exceptions import ClientConnectionResetError


CLIENT_DISCONNECT_ERRORS = (ConnectionResetError, ClientConnectionResetError)


async def read_post_data(request: web.Request) -> Any | None:
    try:
        return await request.post()
    except CLIENT_DISCONNECT_ERRORS:
        return None


async def read_json_data(request: web.Request) -> Any | None:
    try:
        return await request.json()
    except CLIENT_DISCONNECT_ERRORS:
        return None


async def read_text_data(request: web.Request) -> str | None:
    try:
        return await request.text()
    except CLIENT_DISCONNECT_ERRORS:
        return None
