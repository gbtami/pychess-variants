from __future__ import annotations
from aiohttp.web import AppKey
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

db_key = AppKey("db", AsyncDatabase)
client_key = AppKey("client", AsyncMongoClient)
anon_as_test_users_key = AppKey("anon_as_test_users", bool)
pychess_global_app_state_key = AppKey("pychess_global_app_state", object)
