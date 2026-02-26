import json
from typing import TYPE_CHECKING
from datetime import datetime

import aiohttp_jinja2
from aiohttp import web

from simul.simuls import load_simul
from tournament.tournaments import get_tournament_name
from utils import corr_games, load_game, simul_games
from typing_defs import ViewContext
from views import add_game_context, get_user_context
from pychess_global_app_state_utils import get_app_state

if TYPE_CHECKING:
    from game import Game


@aiohttp_jinja2.template("index.html")
async def round_view(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    # play or analyze game
    gameId = request.match_info["gameId"]
    ply = request.rel_url.query.get("ply")

    game = await load_game(app_state, gameId)
    if game is None:
        raise web.HTTPNotFound()

    context["view"] = "round"
    context["view_css"] = "round.css"

    if not game.is_player(user):
        game.spectators.add(user)

    add_game_context(game, ply, user, context)

    context["ct"] = json.dumps(game.crosstable)

    if game.tournamentId is not None:
        if TYPE_CHECKING:
            assert isinstance(game, Game)
        tournament_name = await get_tournament_name(request, game.tournamentId)
        context["tournamentid"] = game.tournamentId
        context["tournamentname"] = tournament_name
        context["wberserk"] = game.wberserk
        context["bberserk"] = game.bberserk

    if game.corr and user.username in (game.wplayer.username, game.bplayer.username):
        c_games = corr_games(user.correspondence_games)
        context["corr_games"] = json.dumps(c_games, default=datetime.isoformat)

    simul_id: str | None = None
    if not game.server_variant.two_boards:
        if TYPE_CHECKING:
            assert isinstance(game, Game)
        simul_id = game.simulId
    if simul_id is not None:
        simul = app_state.simuls.get(simul_id)
        if simul is None:
            simul = await load_simul(app_state, simul_id)

        context["simulid"] = simul_id
        context["simulname"] = simul.name if simul is not None else "Simul"

        if (
            simul is not None
            and user.username in (game.wplayer.username, game.bplayer.username)
            and user.username == simul.created_by
        ):
            context["simulhost"] = True
            context["simul_games"] = json.dumps(simul_games(simul.games.values()))

    return context
