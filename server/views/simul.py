import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from misc import time_control_str
from typing_defs import ViewContext
from views import get_user_context
from variants import VARIANTS, VARIANT_ICONS
from simul.simul import Simul
from simul.simuls import load_simul, upsert_simul_to_db
from newid import id8
from const import T_CREATED, T_STARTED, T_FINISHED
from settings import SIMULING


def parse_int_post_field(data, field_name: str, min_value: int, max_value: int) -> int:
    raw_value = data.get(field_name)
    if not isinstance(raw_value, (str, bytes)):
        raise web.HTTPBadRequest(text=f"Missing field: {field_name}")
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise web.HTTPBadRequest(text=f"Invalid integer value: {field_name}") from exc
    if value < min_value or value > max_value:
        raise web.HTTPBadRequest(text=f"Field out of range: {field_name}")
    return value


@aiohttp_jinja2.template("simuls.html")
async def simuls(request: web.Request) -> ViewContext:
    if not SIMULING:
        raise web.HTTPForbidden()

    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)

    if request.method == "POST":
        data = await request.post()
        simul_id = id8()
        name_raw = data.get("name", "")
        variant_key = data.get("variant", "")
        host_color = data.get("host_color", "random")
        base = parse_int_post_field(data, "base", min_value=0, max_value=180)
        inc = parse_int_post_field(data, "inc", min_value=0, max_value=180)

        if not isinstance(name_raw, (str, bytes)) or not isinstance(variant_key, (str, bytes)):
            raise web.HTTPBadRequest(text="Invalid simul form data")
        if not isinstance(host_color, (str, bytes)):
            raise web.HTTPBadRequest(text="Invalid host color")

        if isinstance(name_raw, bytes):
            name_raw = name_raw.decode("utf-8")
        if isinstance(variant_key, bytes):
            variant_key = variant_key.decode("utf-8")
        if isinstance(host_color, bytes):
            host_color = host_color.decode("utf-8")

        name = name_raw.strip()
        if len(name) < 2 or len(name) > 30:
            raise web.HTTPBadRequest(text="Invalid simul name length")
        variant = VARIANTS.get(variant_key)
        if variant is None:
            raise web.HTTPBadRequest(text="Unknown variant")
        if variant.two_boards:
            raise web.HTTPBadRequest(text="Two-board variants are not allowed in simuls")
        if host_color not in ("random", "white", "black"):
            raise web.HTTPBadRequest(text="Invalid host color value")

        simul = await Simul.create(
            app_state,
            simul_id,
            name=name,
            created_by=user.username,
            variant=variant.uci_variant,
            chess960=variant.chess960,
            rated=False,
            base=base,
            inc=inc,
            host_color=host_color,
        )
        app_state.simuls[simul_id] = simul
        await upsert_simul_to_db(simul, app_state)
        raise web.HTTPFound(f"/simul/{simul_id}")

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

    context["variants"] = {
        key: variant for key, variant in VARIANTS.items() if not variant.two_boards
    }
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
        simul = await load_simul(app_state, simul_id)
    if simul is None:
        raise web.HTTPNotFound(text="Simul not found")

    context["simulid"] = simul.id
    context["name"] = simul.name
    context["variant"] = simul.variant + ("960" if simul.chess960 else "")
    context["base"] = simul.base
    context["inc"] = simul.inc
    context["rated"] = False
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
        simul = await load_simul(app_state, simulId)
    if simul is None:
        raise web.HTTPNotFound(text="Simul not found")

    if user.username != simul.created_by:
        raise web.HTTPForbidden(text="Only the host can start the simul")

    await simul.start()
    return web.Response(text="Simul started")
