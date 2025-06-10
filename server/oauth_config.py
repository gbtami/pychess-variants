import os

oauth_config = {
    "lichess": {
        "client_id": os.getenv("LICHESS_CLIENT_ID", "pychess"),
        "client_secret": os.getenv("CLIENT_SECRET", "secret"),
        "oauth_authorize_url": "https://lichess.org/oauth",
        "oauth_token_url": "https://lichess.org/api/token",
        "scope": "email:read",
        "account_api_url": "https://lichess.org/api/account",
    },
    "lishogi": {
        "client_id": os.getenv("LISHOGI_CLIENT_ID", "pychess"),
        "client_secret": os.getenv("CLIENT_SECRET", "secret"),
        "oauth_authorize_url": "https://lishogi.org/oauth",
        "oauth_token_url": "https://lishogi.org/api/token",
        "scope": "email:read",
        "account_api_url": "https://lishogi.org/api/account",
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
    "microsoft": {
        "client_id": os.getenv("MICROSOFT_CLIENT_ID", "pychess"),
        "client_secret": os.getenv("MICROSOFT_CLIENT_SECRET", "secret"),
        "oauth_authorize_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "oauth_token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "scope": "openid email",
        "account_api_url": "https://graph.microsoft.com/v1.0/me",
    },
    "facebook": {
        "client_id": os.getenv("FACEBOOK_CLIENT_ID", "pychess"),
        "client_secret": os.getenv("FACEBOOK_CLIENT_SECRET", "secret"),
        "oauth_authorize_url": "https://www.facebook.com/dialog/oauth",
        "oauth_token_url": "https://graph.facebook.com/oauth/access_token",
        "scope": "user_link",
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
}
