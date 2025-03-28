from __future__ import annotations

from bot_api import (
    account,
    playing,
    event_stream,
    game_stream,
    bot_abort,
    bot_resign,
    bot_chat,
    bot_move,
    challenge_accept,
    challenge_decline,
    create_bot_seek,
    challenge_create,
    bot_pong,
    bot_analysis,
)
from fishnet import (
    fishnet_monitor,
    fishnet_validate_key,
    fishnet_acquire,
    fishnet_abort,
    fishnet_analysis,
    fishnet_move,
)
from game_api import (
    export,
    get_games,
    get_user_games,
    get_tournament_games,
    subscribe_games,
    subscribe_invites,
    get_variant_stats,
    cancel_invite,
)
from utils import import_game, get_names, get_notifications, subscribe_notify, notified
from bug.import_bugh_game import import_game_bpgn
from login import login, logout, oauth
from index import index, robots, select_lang
from wsl import lobby_socket_handler
from wsr import round_socket_handler
from tournament.wst import tournament_socket_handler
from tournament.tournament_calendar import tournament_calendar
from twitch import twitch_request_handler
from puzzle import puzzle_complete, puzzle_vote
from user import block_user, get_blocked_users, set_theme
from views import (
    about,
    allplayers,
    blog,
    blogs,
    calendar,
    editor,
    faq,
    features,
    lobby,
    patron,
    players,
    players50,
    stats,
    videos,
    video,
)


get_routes = (
    ("/login", login),
    ("/oauth", oauth),
    ("/logout", logout),
    ("/", lobby.lobby),
    ("/about", about.about),
    ("/faq", faq.faq),
    ("/stats", stats.stats),
    ("/players", players.players),
    ("/players/{variant}", players50.players50),
    ("/allplayers", allplayers.allplayers),
    ("/calendar", calendar.calendar),
    ("/features", features.features),
    ("/games", index),
    ("/games/{variant}", index),
    ("/tv", index),
    ("/puzzle", index),
    ("/puzzle/daily", index),
    (r"/puzzle/{puzzleId:\w{5}}", index),
    ("/puzzle/{variant}", index),
    (r"/corranalysis/{gameId:\w{8}}", index),
    ("/analysis/{variant}", index),
    ("/analysis/{variant}/{fen}", index),
    ("/seek/{variant}", index),
    ("/editor/{variant}", editor.editor),
    ("/editor/{variant}/{fen}", editor.editor),
    ("/notifications", get_notifications),
    ("/notify", subscribe_notify),
    ("/notified", notified),
    (r"/{gameId:\w{8}}", index),
    (r"/{gameId:\w{8}}/{player:player[1-2]}", index),
    (r"/embed/{gameId:\w{8}}", index),
    ("/tournaments", index),
    ("/tournaments/new", index),
    (r"/tournaments/{tournamentId:\w{8}}/edit", index),
    ("/tournaments/shields", index),
    ("/tournaments/shields/{variant}", index),
    ("/tournaments/winners", index),
    ("/tournaments/winners/{variant}", index),
    (r"/tournament/{tournamentId:\w{8}}", index),
    (r"/tournament/{tournamentId:\w{8}}/pause", index),
    (r"/tournament/{tournamentId:\w{8}}/cancel", index),
    ("/@/{profileId}", index),
    ("/@/{profileId}/tv", index),
    ("/@/{profileId}/challenge", index),
    ("/@/{profileId}/challenge/{variant}", index),
    ("/@/{profileId}/perf/{variant}", index),
    ("/@/{profileId}/rated", index),
    ("/@/{profileId}/playing", index),
    ("/@/{profileId}/me", index),
    ("/@/{profileId}/import", index),
    ("/level8win", index),
    ("/patron", patron.patron),
    ("/patron/thanks", patron.patron),
    ("/blogs", blogs.blogs),
    ("/blogs/{blogId}", blog.blog),
    ("/variants", index),
    ("/variants/{variant}", index),
    ("/memory", index),
    ("/video", videos.videos),
    ("/video/{videoId}", video.video),
    ("/wsl", lobby_socket_handler),
    ("/wsr/{gameId}", round_socket_handler),
    ("/wst", tournament_socket_handler),
    ("/api/account", account),
    ("/api/account/playing", playing),
    ("/api/stream/event", event_stream),
    ("/api/bot/game/stream/{gameId}", game_stream),
    ("/api/blocks", get_blocked_users),
    ("/api/{profileId}/all", get_user_games),
    ("/api/{profileId}/win", get_user_games),
    ("/api/{profileId}/loss", get_user_games),
    ("/api/{profileId}/rated", get_user_games),
    ("/api/{profileId}/playing", get_user_games),
    ("/api/{profileId}/import", get_user_games),
    ("/api/{profileId}/me", get_user_games),
    ("/api/{profileId}/perf/{variant}", get_user_games),
    ("/api/calendar", tournament_calendar),
    ("/api/stats", get_variant_stats),
    ("/api/stats/humans", get_variant_stats),
    ("/api/games", get_games),
    ("/api/games/{variant}", get_games),
    ("/api/invites", subscribe_invites),
    ("/api/ongoing", subscribe_games),
    ("/api/names", get_names),
    ("/paste", index),
    (r"/games/export/monthly/{yearmonth:\d{6}}", export),
    ("/games/export/{profileId}", export),
    ("/games/export/tournament/{tournamentId}", export),
    ("/games/json/{profileId}", get_user_games),
    ("/tournament/json/{tournamentId}", get_tournament_games),
    ("/fishnet/monitor", fishnet_monitor),
    ("/fishnet/key/{key}", fishnet_validate_key),
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
    (r"/invite/accept/{gameId:\w{8}}/{player:player[1-2]}", index),
    (r"/invite/cancel/{gameId:\w{8}}", cancel_invite),
    ("/api/challenge/{challengeId}/accept", challenge_accept),
    ("/api/challenge/{challengeId}/decline", challenge_decline),
    ("/api/seek", create_bot_seek),
    ("/api/pong", bot_pong),
    ("/pref/theme", set_theme),
    ("/api/{profileId}/block", block_user),
    ("/fishnet/acquire", fishnet_acquire),
    ("/fishnet/analysis/{workId}", fishnet_analysis),
    ("/fishnet/move/{workId}", fishnet_move),
    ("/fishnet/abort/{workId}", fishnet_abort),
    ("/translation/select", select_lang),
    ("/import", import_game),
    ("/import_bpgn", import_game_bpgn),
    ("/tournaments/arena", index),
    (r"/tournament/{tournamentId:\w{8}}/edit", index),
    ("/twitch", twitch_request_handler),
    (r"/puzzle/complete/{puzzleId:\w{5}}", puzzle_complete),
    (r"/puzzle/vote/{puzzleId:\w{5}}", puzzle_vote),
)
