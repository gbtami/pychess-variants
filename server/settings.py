from __future__ import annotations

import base64
import os
import json
import string

LOCALHOST = "http://127.0.0.1:8080"
URI = os.getenv("URI", LOCALHOST)

SIMULING = URI == LOCALHOST

PROD = os.getenv("PROD") == "true"
DEV = not PROD

# lichess.org API token created by the pychess-monitor BOT user
PYCHESS_MONITOR_TOKEN = os.getenv("PYCHESS_MONITOR_TOKEN")

# lichess.org API token created by a team leader of
# https://lichess.org/team/pychess-tournaments
LICHESS_API_TOKEN = os.getenv("LICHESS_API_TOKEN")

# secret_key for session encryption
# key must be 32 url-safe base64-encoded bytes
FERNET_KEY = os.getenv("FERNET_KEY", string.ascii_letters[:42] + "_=")
SECRET_KEY = base64.urlsafe_b64decode(FERNET_KEY)
MAX_AGE = 3600 * 24 * 365

MONGO_HOST = os.getenv("MONGO_HOST", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = "pychess-variants"

BOT_TOKENS = json.loads(os.getenv("BOT_TOKENS", "{}"))
FISHNET_KEYS = json.loads(os.getenv("FISHNET_KEYS", "{}"))

ADMINS = os.getenv("ADMINS", "").split(",")
TOURNAMENT_DIRECTORS = os.getenv("TOURNAMENT_DIRECTORS", "").split(",")

STATIC_ROOT = os.getenv("STATIC_ROOT", "/static")

TWITCH_CLIENT_ID = os.getenv("TWITCH_CLIENT_ID", "")
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET", "")

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "")

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "https://www.pychess.org,https://cdn.jsdelivr.net,https://variantslove.netlify.app"
).split(",")

SOURCE_VERSION = os.getenv("SOURCE_VERSION", "")
if SOURCE_VERSION != "":
    SOURCE_VERSION = "?v=%s" % SOURCE_VERSION


def static_url(static_file_path):
    return "%s/%s" % (STATIC_ROOT, static_file_path)
