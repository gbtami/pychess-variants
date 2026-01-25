import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from misc import time_control_str
from typing_defs import ViewContext
from views import get_user_context
from variants import VARIANTS, VARIANT_ICONS
from simul.simul import Simul
from newid import id8
from const import T_CREATED, T_STARTED, T_FINISHED
from settings import SIMULING


@aiohttp_jinja2.template("simuls.html")
async def simuls(request: web.Request) -> ViewContext:
    if not SIMULING:
        raise web.HTTPForbidden()

    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)

    if request.path.endswith("/simul"):
        data = await request.post()
        simul_id = id8()
        base_raw = data["base"]
        inc_raw = data["inc"]
        if not isinstance(base_raw, (str, bytes)) or not isinstance(inc_raw, (str, bytes)):
            raise web.HTTPBadRequest()
        simul = await Simul.create(
            app_state,
            simul_id,
            name=data["name"],
            created_by=user.username,
            variant=data["variant"],
            base=int(base_raw),
            inc=int(inc_raw),
            host_color=data.get("host_color", "random"),
        )
        app_state.simuls[simul_id] = simul

    simuls = list(app_state.simuls.values())
    context["created_simuls"] = [s for s in simuls if s.status == T_CREATED]
    context["started_simuls"] = [s for s in simuls if s.status == T_STARTED]
    context["finished_simuls"] = [s for s in simuls if s.status == T_FINISHED]
    context["icons"] = VARIANT_ICONS
    context["time_control_str"] = time_control_str
    context["view_css"] = "simul.css"
    return context


@aiohttp_jinja2.template("simul_new.html")
async def simul_new(request: web.Request) -> ViewContext:
    if not SIMULING:
        raise web.HTTPForbidden()

    user, context = await get_user_context(request)

    context["variants"] = VARIANTS
    context["view_css"] = "simul.css"
    return context


@aiohttp_jinja2.template("index.html")
async def simul(request: web.Request) -> ViewContext:
    if not SIMULING:
        raise web.HTTPForbidden()

    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)

    simul_id = request.match_info["simulId"]
    simul = app_state.simuls.get(simul_id)
    if simul is None:
        raise web.HTTPNotFound(text="Simul not found")

    context["simulid"] = simul.id
    context["view"] = "simul"
    context["status"] = simul.status
    context["view_css"] = "simul.css"
    return context


async def start_simul(request: web.Request) -> web.Response:
    if not SIMULING:
        raise web.HTTPForbidden()

    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    simulId = request.match_info["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        raise web.HTTPNotFound(text="Simul not found")

    if user.username != simul.created_by:
        raise web.HTTPForbidden(text="Only the host can start the simul")

    await simul.start()
    return web.Response(text="Simul started")
