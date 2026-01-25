from __future__ import annotations
from typing import TYPE_CHECKING

from aiohttp.web import AppKey
from pymongo import AsyncMongoClient

db_key = AppKey("db", object)
client_key = AppKey("client", AsyncMongoClient)
anon_as_test_users_key = AppKey("anon_as_test_users", bool)
if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

    _PychessGlobalAppStateType = PychessGlobalAppState
else:
    _PychessGlobalAppStateType = object

pychess_global_app_state_key = AppKey("pychess_global_app_state", _PychessGlobalAppStateType)
