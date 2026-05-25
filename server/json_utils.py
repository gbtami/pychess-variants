from __future__ import annotations

from typing import Any

import msgspec
from aiohttp import web

_JSON_ENCODER = msgspec.json.Encoder()


def json_dumps(data: Any) -> str:
    """Fast msgspec serialization. Datetimes are emitted in RFC3339 form (UTC as Z)."""
    return _JSON_ENCODER.encode(data).decode("utf-8")


def json_response(data: Any, **kwargs: Any) -> web.Response:
    """aiohttp json_response with msgspec serialization."""
    return web.json_response(data, dumps=json_dumps, **kwargs)
