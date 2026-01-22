from __future__ import annotations
from typing import TYPE_CHECKING

from aiohttp import web


if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
from typedefs import pychess_global_app_state_key


def get_app_state(app: web.Application) -> PychessGlobalAppState:
    return app[pychess_global_app_state_key]
