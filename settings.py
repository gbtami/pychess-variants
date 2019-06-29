import os
import logging
import base64
from cryptography import fernet

logging.basicConfig(level=logging.DEBUG)

URI = os.getenv("URI", "http://127.0.0.1:8080")

REDIRECT_PATH = os.getenv("REDIRECT_PATH")  # path of oauth callback in your app
REDIRECT_URI = os.getenv("REDIRECT_URI")  # define it in lichess

# client app id and secret from lichess.org
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")

# secret_key for session encryption
# key must be 32 url-safe base64-encoded bytes
fernet_key = fernet.Fernet.generate_key()
SECRET_KEY = base64.urlsafe_b64decode(fernet_key)

MONGO_HOST = os.getenv("MONGO_HOST", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = "pychess-variants"
