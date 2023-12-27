from __future__ import annotations
from aiohttp.web import AppKey
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient

db_key = AppKey("db", AsyncIOMotorDatabase)
calendar_key = AppKey("calendar", dict)
client_key = AppKey("client", AsyncIOMotorClient)
kill_key = AppKey("kill", dict)
date_key = AppKey("date", dict)
pychess_global_app_state_key = AppKey("pychess_global_app_state", dict)