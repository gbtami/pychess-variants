from __future__ import annotations

from typing import Any

from bson.int64 import Int64
import msgspec
from aiohttp import web

_JSON_ENCODER = msgspec.json.Encoder()


def _convert_bson_int64(value: Any) -> Any:
    if isinstance(value, Int64):
        return int(value)
    if isinstance(value, list):
        return [_convert_bson_int64(item) for item in value]
    if isinstance(value, dict):
        return {key: _convert_bson_int64(item) for key, item in value.items()}
    return value


def json_dumps(data: Any) -> str:
    """Fast msgspec serialization. Datetimes are emitted in RFC3339 form (UTC as Z)."""
    try:
        return _JSON_ENCODER.encode(data).decode("utf-8")
    except TypeError as error:
        # Legacy local data may contain BSON Int64 values, which msgspec cannot encode directly.
        if "Int64" not in str(error):
            raise
        return _JSON_ENCODER.encode(_convert_bson_int64(data)).decode("utf-8")


def json_response(data: Any, **kwargs: Any) -> web.Response:
    """aiohttp json_response with msgspec serialization."""
    return web.json_response(data, dumps=json_dumps, **kwargs)
