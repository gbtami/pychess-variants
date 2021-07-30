import base64
import os
import json
import logging
import string

from newid import id8

logging.basicConfig(level=logging.DEBUG)

URI = os.getenv("URI", "http://127.0.0.1:8080")
DEV = ("heroku" in URI) or URI.startswith("http:")
BR_EXTENSION = ".br" if URI.startswith("https") else ""

REDIRECT_PATH = "/oauth"  # path of oauth callback in app
# lichess.org OAuth Apps Callback URL: https://pychess-variants.herokuapp.com/oauth
REDIRECT_URI = URI + REDIRECT_PATH

# client app id and secret from lichess.org
CLIENT_ID = os.getenv("CLIENT_ID", "pychess")
CLIENT_SECRET = os.getenv("CLIENT_SECRET", id8())[:8]

LICHESS_OAUTH_AUTHORIZE_URL = 'https://lichess.org/oauth'
LICHESS_OAUTH_TOKEN_URL = 'https://lichess.org/api/token'
LICHESS_ACCOUNT_API_URL = 'https://lichess.org/api/account'

# secret_key for session encryption
# key must be 32 url-safe base64-encoded bytes
FERNET_KEY = os.getenv("FERNET_KEY", string.ascii_letters[:42] + "_=")
SECRET_KEY = base64.urlsafe_b64decode(FERNET_KEY)
MAX_AGE = 3600 * 24 * 365

MONGO_HOST = os.getenv("MONGO_HOST", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = "pychess-variants"

BOT_TOKENS = json.loads(os.getenv("BOT_TOKENS", "{}"))
FISHNET_KEYS = json.loads(os.getenv("FISHNET_KEYS", "{}"))

ADMINS = os.getenv("ADMINS", "")

STATIC_ROOT = os.getenv("STATIC_ROOT", "/static")

SOURCE_VERSION = os.getenv("SOURCE_VERSION", "")
if SOURCE_VERSION != "":
    SOURCE_VERSION = "?v=%s" % SOURCE_VERSION


def static_url(static_file_path):
    return "%s/%s" % (STATIC_ROOT, static_file_path)
