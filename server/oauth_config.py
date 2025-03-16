import os

oauth_config = {
    "lichess": {
        "client_id": os.getenv("CLIENT_ID", "pychess"),
        "client_secret": os.getenv("CLIENT_SECRET", "secret"),
        "oauth_authorize_url": "https://lichess.org/oauth",
        "oauth_token_url": "https://lichess.org/api/token",
        "scope": "email:read",
        "account_api_url": "https://lichess.org/api/account",
    },
    "google": {
        "client_id": os.getenv("GOOGLE_CLIENT_ID", "pychess"),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", "secret"),
        "oauth_authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "oauth_token_url": "https://oauth2.googleapis.com/token",
        "scope": " ".join(
            [
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile",
                "openid",
            ]
        ),
        "account_api_url": "https://www.googleapis.com/oauth2/v2/userinfo",
    },
    "facebook": {
        "client_id": os.getenv("FACEBOOK_CLIENT_ID", "pychess"),
        "client_secret": os.getenv("FACEBOOK_CLIENT_SECRET", "secret"),
        "oauth_authorize_url": "https://www.facebook.com/dialog/oauth",
        "oauth_token_url": "https://graph.facebook.com/oauth/access_token",
        "scope": "email",
        "account_api_url": "https://graph.facebook.com/me",
    },
    "discord": {
        "client_id": os.getenv("DISCORD_CLIENT_ID", "pychess"),
        "client_secret": os.getenv("DISCORD_CLIENT_SECRET", "secret"),
        "oauth_authorize_url": "https://discord.com/oauth2/authorize",
        "oauth_token_url": "https://discord.com/api/oauth2/token",
        "scope": "identify email",
        "account_api_url": "https://discordapp.com/api/users/@me",
    },
    "chessdotcom": {
        "client_id": os.getenv("CHESSDOTCOM_CLIENT_ID", "pychess"),
        "client_secret": os.getenv("CHESSDOTCOM_CLIENT_SECRET", "secret"),
        "oauth_authorize_url": "https://oauth.chess.com/authorize",
        "oauth_token_url": "https://oauth.chess.com/token",
        "scope": "openid profile email",
        "account_api_url": "https://api.chess.com/pub/player",
    },
}
