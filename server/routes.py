from bot_api import account, playing, event_stream, game_stream, bot_abort,\
    bot_resign, bot_chat, bot_move, challenge_accept, challenge_decline,\
    create_bot_seek, challenge_create, bot_pong, bot_analysis
from fishnet import fishnet_monitor, fishnet_key, fishnet_acquire,\
    fishnet_abort, fishnet_analysis, fishnet_move
from game_api import export, get_games, get_user_games, subscribe_games,\
    subscribe_notify, subscribe_invites, get_variant_stats, cancel_invite
from utils import import_game
from login import login, logout, oauth
from index import index, robots, select_lang
from wsl import lobby_socket_handler
from wsr import round_socket_handler
from wst import tournament_socket_handler
from twitch import twitch


get_routes = (
    ("/login", login),
    ("/oauth", oauth),
    ("/logout", logout),
    ("/", index),
    ("/about", index),
    ("/faq", index),
    ("/stats", index),
    ("/players", index),
    ("/allplayers", index),
    ("/games", index),
    ("/tv", index),
    ("/analysis/{variant}", index),
    ("/analysis/{variant}/{fen}", index),
    ("/editor/{variant}", index),
    ("/editor/{variant}/{fen}", index),
    (r"/{gameId:\w{8}}", index),
    (r"/embed/{gameId:\w{8}}", index),
    ("/tournaments", index),
    ("/tournaments/new", index),
    (r"/tournaments/{tournamentId:\w{8}}/edit", index),
    ("/tournaments/shields", index),
    ("/tournaments/winners", index),
    (r"/tournament/{tournamentId:\w{8}}", index),
    (r"/tournament/{tournamentId:\w{8}}/pause", index),
    (r"/tournament/{tournamentId:\w{8}}/cancel", index),
    ("/@/{profileId}", index),
    ("/@/{profileId}/tv", index),
    ("/@/{profileId}/challenge", index),
    ("/@/{profileId}/challenge/{variant}", index),
    ("/@/{profileId}/perf/{variant}", index),
    ("/@/{profileId}/rated", index),
    ("/@/{profileId}/import", index),
    ("/level8win", index),
    ("/patron", index),
    ("/patron/thanks", index),
    ("/news", index),
    ("/news/{news_item}", index),
    ("/variants", index),
    ("/variants/{variant}", index),
    ("/wsl", lobby_socket_handler),
    ("/wsr", round_socket_handler),
    ("/wst", tournament_socket_handler),
    ("/api/account", account),
    ("/api/account/playing", playing),
    ("/api/stream/event", event_stream),
    ("/api/bot/game/stream/{gameId}", game_stream),
    ("/api/{profileId}/all", get_user_games),
    ("/api/{profileId}/win", get_user_games),
    ("/api/{profileId}/loss", get_user_games),
    ("/api/{profileId}/rated", get_user_games),
    ("/api/{profileId}/import", get_user_games),
    ("/api/{profileId}/perf/{variant}", get_user_games),
    ("/api/stats", get_variant_stats),
    ("/api/games", get_games),
    ("/api/invites", subscribe_invites),
    ("/api/ongoing", subscribe_games),
    ("/api/notify", subscribe_notify),
    ("/paste", index),
    (r"/games/export/monthly/{yearmonth:\d{6}}", export),
    ("/games/export/{profileId}", export),
    ("/games/export/tournament/{tournamentId}", export),
    ("/fishnet/monitor", fishnet_monitor),
    ("/fishnet/key/{key}", fishnet_key),
    ("/robots.txt", robots),
)

post_routes = (
    ("/api/bot/game/{gameId}/abort", bot_abort),
    ("/api/bot/game/{gameId}/resign", bot_resign),
    ("/api/bot/game/{gameId}/analysis", bot_analysis),
    ("/api/bot/game/{gameId}/chat", bot_chat),
    ("/api/bot/game/{gameId}/move/{move}", bot_move),
    ("/api/challenge/{username}", challenge_create),
    (r"/invite/accept/{gameId:\w{8}}", index),
    (r"/invite/accept/{gameId:\w{8}}/player1", index),
    (r"/invite/accept/{gameId:\w{8}}/player2", index),
    (r"/invite/cancel/{gameId:\w{8}}", cancel_invite),
    ("/api/challenge/{challengeId}/accept", challenge_accept),
    ("/api/challenge/{challengeId}/decline", challenge_decline),
    ("/api/seek", create_bot_seek),
    ("/api/pong", bot_pong),
    ("/fishnet/acquire", fishnet_acquire),
    ("/fishnet/analysis/{workId}", fishnet_analysis),
    ("/fishnet/move/{workId}", fishnet_move),
    ("/fishnet/abort/{workId}", fishnet_abort),
    ("/translation/select", select_lang),
    ("/import", import_game),
    ("/tournaments/arena", index),
    (r"/tournament/{tournamentId:\w{8}}/edit", index),
    ("/twitch", twitch),
)
