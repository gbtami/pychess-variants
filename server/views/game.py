import json
from datetime import datetime

import aiohttp_jinja2
from aiohttp import web

from const import DARK_FEN
from fairy import BLACK, WHITE
from tournament.tournaments import get_tournament_name
from utils import corr_games, load_game
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("index.html")
async def game(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    # play or analyze game
    gameId = request.match_info.get("gameId")
    ply = request.rel_url.query.get("ply")

    game = await load_game(app_state, gameId)
    if game is None:
        raise web.HTTPNotFound()

    if ply is not None:
        context["view"] = "analysis"
        context["view_css"] = "analysis.css"
    else:
        context["view"] = "round"
        context["view_css"] = "round.css"

    if not game.is_player(user):
        game.spectators.add(user)

    context["gameid"] = gameId
    context["variant"] = game.variant
    context["wplayer"] = game.wplayer.username
    context["wtitle"] = game.wplayer.title
    context["wrating"] = game.wrating
    context["wrdiff"] = game.wrdiff
    context["chess960"] = game.chess960
    context["rated"] = game.rated
    context["corr"] = game.corr
    context["level"] = game.level
    context["bplayer"] = game.bplayer.username
    context["btitle"] = game.bplayer.title
    context["brating"] = game.brating
    context["brdiff"] = game.brdiff
    context["fen"] = DARK_FEN if game.variant == "fogofwar" else game.fen
    context["base"] = game.base
    context["inc"] = game.inc
    context["byo"] = game.byoyomi_period
    context["result"] = game.result
    context["status"] = game.status
    context["date"] = game.date.isoformat()
    context["title"] = game.browser_title
    # todo: I think sent ply value shouldn't be minus 1.
    #       But also it gets overwritten anyway right after that so why send all this stuff at all here.
    #       just init client on 1st ws board msg received right after ws connection is established
    context["ply"] = ply if ply is not None else game.ply - 1
    context["initialFen"] = game.initial_fen
    context["ct"] = json.dumps(game.crosstable)

    user_color = WHITE if user == game.wplayer else BLACK if user == game.bplayer else None
    context["board"] = json.dumps(game.get_board(full=True, persp_color=user_color))

    if game.tournamentId is not None:
        tournament_name = await get_tournament_name(request, game.tournamentId)
        context["tournamentid"] = game.tournamentId
        context["tournamentname"] = tournament_name
        context["wberserk"] = game.wberserk
        context["bberserk"] = game.bberserk
    if game.server_variant.two_boards:
        context["wplayerB"] = game.wplayerB.username
        context["wtitleB"] = game.wplayerB.title
        context["wratingB"] = game.wrating_b
        context["bplayerB"] = game.bplayerB.username
        context["btitleB"] = game.bplayerB.title
        context["bratingB"] = game.brating_b
    if game.corr and user.username in (game.wplayer.username, game.bplayer.username):
        c_games = corr_games(user.correspondence_games)
        context["corr_games"] = json.dumps(c_games, default=datetime.isoformat)

    return context
