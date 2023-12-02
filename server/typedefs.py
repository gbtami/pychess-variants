import asyncio
import collections

from aiohttp.web import AppKey
import jinja2
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient


client_key = AppKey("client", AsyncIOMotorClient)
crosstable_key = AppKey("crosstable", dict)
db_key = AppKey("db", AsyncIOMotorDatabase)
kill_key = AppKey("kill", dict)
daily_puzzle_ids_key = AppKey("daily_puzzle_ids", dict)
date_key = AppKey("date", dict)
discord_key = AppKey("discord", object)
fishnet_queue_key = AppKey("fishnet_queue", asyncio.PriorityQueue)
fishnet_monitor_key = AppKey("fishnet_monitor", dict)
fishnet_versions_key = AppKey("fishnet_versions", dict)
fishnet_works_key = AppKey("fishnet_works", dict)
game_channels_key = AppKey("game_channels", set)
games_key = AppKey("games", dict)
g_cnt_key = AppKey("g_cnt", list)
gettext_key = AppKey("gettext", dict)
highscore_key = AppKey("highscore", dict)
invites_key = AppKey("invites", dict)
invite_channels_key = AppKey("invite_channels", set)
jinja_key = AppKey("jinja", dict[str, jinja2.Environment])
users_key = AppKey("users", dict)
shield_key = AppKey("shield", dict)
shield_owners_key = AppKey("shield_owners", dict)
seeks_key = AppKey("seeks", dict)
stats_key = AppKey("stats", dict)
stats_humans_key = AppKey("stats_humans", dict)
lobbychat_key = AppKey("lobbychat", collections.deque)
sent_lichess_team_msg_key = AppKey("sent_lichess_team_msg", list)
tournaments_key = AppKey("tournaments", dict)
tourneychat_key = AppKey("tourneychat", dict)
tourneynames_key = AppKey("tourneynames", dict)
lobbysockets_key = AppKey("lobbysockets", dict[str, set])
tourneysockets_key = AppKey("tourneysockets", dict[str, dict])
tv_key = AppKey("tv", str)
twitch_key = AppKey("twitch", object)
youtube_key = AppKey("youtube", object)
workers_key = AppKey("workers", set)
