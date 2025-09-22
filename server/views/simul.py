import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from views import get_user_context
from simul.simul import Simul
from newid import id8

@aiohttp_jinja2.template("simuls.html")
async def simuls(request):
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    context["simuls"] = app_state.simuls.values()
    return context

@aiohttp_jinja2.template("simul_new.html")
async def simul_new(request):
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    if request.method == "POST":
        data = await request.post()
        simul_id = id8()
        simul = Simul(
            app_state,
            simul_id,
            name=data.get("name", "Simul"),
            created_by=user.username,
            variant=data.get("variant", "chess"),
            base=int(data.get("base", 5)),
            inc=int(data.get("inc", 0)),
            host_color=data.get("host_color", "random"),
        )
        app_state.simuls[simul_id] = simul
        raise web.HTTPFound(f"/simul/{simul_id}")
    return context

@aiohttp_jinja2.template("simul.html")
async def simul(request):
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    simulId = request.match_info.get("simulId")
    simul = app_state.simuls.get(simulId)
    if simul is None:
        raise web.HTTPNotFound(text="Simul not found")

    context["simul"] = simul
    context["simulid"] = simulId # for simul.ts
    context["view"] = "simul"
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

    await simul.start_simul()
    return web.Response(text="Simul started")
