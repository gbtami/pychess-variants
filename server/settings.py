import os
import json
import logging
import base64
from cryptography import fernet

logging.basicConfig(level=logging.DEBUG)

URI = os.getenv("URI", "http://127.0.0.1:8080")

REDIRECT_PATH = "/oauth"  # path of oauth callback in app
# lichess.org OAuth Apps Callback URL: https://pychess-variants.herokuapp.com/oauth
REDIRECT_URI = URI + REDIRECT_PATH

# lichess token for local dev user login
DEV_TOKEN = os.getenv("DEV_TOKEN")

# client app id and secret from lichess.org
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")

# secret_key for session encryption
# key must be 32 url-safe base64-encoded bytes
fernet_key = fernet.Fernet.generate_key()
SECRET_KEY = base64.urlsafe_b64decode(fernet_key)

MONGO_HOST = os.getenv("MONGO_HOST", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = "pychess-variants"

BOT_TOKENS = json.loads(os.getenv("BOT_TOKENS"))
FISHNET_KEYS = json.loads(os.getenv("FISHNET_KEYS"))
