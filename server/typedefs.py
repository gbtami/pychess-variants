from __future__ import annotations
from aiohttp.web import AppKey
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient

db_key = AppKey("db", AsyncIOMotorDatabase)
client_key = AppKey("client", AsyncIOMotorClient)
pychess_global_app_state_key = AppKey("pychess_global_app_state", object)
