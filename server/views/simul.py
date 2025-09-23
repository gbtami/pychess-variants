import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from misc import time_control_str
from views import get_user_context
from variants import VARIANTS, VARIANT_ICONS
from simul.simul import Simul
from newid import id8

@aiohttp_jinja2.template("simuls.html")
async def simuls(request):
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)

    if request.path.endswith("/simul"):
        data = await request.post()
        simul_id = id8()
        simul = await Simul.create(
            app_state,
            simul_id,
            name=data["name"],
            variant=int(data["variant"]),
            time_control=data["time_control"],
            host_color=data.get("host_color", "random"),
        )
        app_state.simuls[simul_id] = simul

    context["simuls"] = app_state.simuls.values()
    context["icons"] = VARIANT_ICONS
    context["time_control_str"] = time_control_str
    context["view_css"] = "simul.css"
    return context


@aiohttp_jinja2.template("simul_new.html")
async def simul_new(request):
    user, context = await get_user_context(request)
    context["variants"] = VARIANTS
    context["view_css"] = "simul.css"
    return context


@aiohttp_jinja2.template("index.html")
async def simul(request):
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

async def start_simul(request):
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    simulId = request.match_info.get("simulId")
    simul = app_state.simuls.get(simulId)
    if simul is None:
        raise web.HTTPNotFound(text="Simul not found")

    if user.username != simul.created_by:
        raise web.HTTPForbidden(text="Only the host can start the simul")

    await simul.start()
    return web.Response(text="Simul started")
