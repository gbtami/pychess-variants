import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from misc import time_control_str
from typing_defs import ViewContext
from views import get_user_context
from variants import VARIANTS, VARIANT_ICONS
from simul.simul import Simul
from simul.simuls import get_latest_simuls, load_simul, upsert_simul_to_db
from newid import id8
from const import T_CREATED
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


def parse_simul_name(data) -> str:
    name_raw = data.get("name", "")
    if not isinstance(name_raw, (str, bytes)):
        raise web.HTTPBadRequest(text="Invalid simul name")
    if isinstance(name_raw, bytes):
        name_raw = name_raw.decode("utf-8")
    name = name_raw.strip()
    if len(name) < 2 or len(name) > 30:
        raise web.HTTPBadRequest(text="Invalid simul name length")
    return name


def parse_host_color(data) -> str:
    host_color = data.get("host_color", "random")
    if not isinstance(host_color, (str, bytes)):
        raise web.HTTPBadRequest(text="Invalid host color")
    if isinstance(host_color, bytes):
        host_color = host_color.decode("utf-8")
    if host_color not in ("random", "white", "black"):
        raise web.HTTPBadRequest(text="Invalid host color value")
    return host_color


def parse_simul_variant(data):
    variant_key = data.get("variant", "")
    if not isinstance(variant_key, (str, bytes)):
        raise web.HTTPBadRequest(text="Invalid simul variant")
    if isinstance(variant_key, bytes):
        variant_key = variant_key.decode("utf-8")
    variant = VARIANTS.get(variant_key)
    if variant is None:
        raise web.HTTPBadRequest(text="Unknown variant")
    if variant.two_boards:
        raise web.HTTPBadRequest(text="Two-board variants are not allowed in simuls")
    return variant_key, variant


async def get_simul_for_request(request: web.Request) -> Simul:
    app_state = get_app_state(request.app)
    simul_id = request.match_info["simulId"]
    simul = app_state.simuls.get(simul_id)
    if simul is None:
        simul = await load_simul(app_state, simul_id)
    if simul is None:
        raise web.HTTPNotFound(text="Simul not found")
    return simul


@aiohttp_jinja2.template("simuls.html")
async def simuls(request: web.Request) -> ViewContext:
    if not SIMULING:
        raise web.HTTPForbidden()

    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)

    if request.method == "POST":
        data = await read_post_data(request)
        if data is None:
            raise web.HTTPNoContent()
        simul_id = id8()
        name = parse_simul_name(data)
        variant_key, variant = parse_simul_variant(data)
        host_color = parse_host_color(data)
        base = parse_int_post_field(data, "base", min_value=0, max_value=180)
        inc = parse_int_post_field(data, "inc", min_value=0, max_value=180)

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

    created_simuls, started_simuls, finished_simuls = await get_latest_simuls(app_state)
    context["created_simuls"] = created_simuls
    context["started_simuls"] = started_simuls
    context["finished_simuls"] = finished_simuls
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
    context["edit"] = False
    context["simul_form_action"] = "/simul"
    context["simul_form_title"] = "Host a new simul"
    context["simul_submit_label"] = "Create a new simul"
    context["simul_cancel_url"] = "/simul"
    context["simul_editable"] = True
    context["view_css"] = "simul.css"
    return context


@aiohttp_jinja2.template("simul_new.html")
async def simul_edit(request: web.Request) -> ViewContext:
    if not SIMULING:
        raise web.HTTPForbidden()

    user, context = await get_user_context(request)
    simul = await get_simul_for_request(request)

    if user.username != simul.created_by:
        raise web.HTTPForbidden(text="Only the host can edit the simul")

    context["variants"] = {
        key: variant for key, variant in VARIANTS.items() if not variant.two_boards
    }
    context["edit"] = True
    context["simul"] = simul
    context["simul_form_action"] = f"/simul/{simul.id}/edit"
    context["simul_form_title"] = f"Edit {simul.name}"
    context["simul_submit_label"] = "Save"
    context["simul_cancel_url"] = f"/simul/{simul.id}"
    context["simul_editable"] = simul.status == T_CREATED
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


async def update_simul(request: web.Request) -> web.Response:
    if not SIMULING:
        raise web.HTTPForbidden()

    user, _ = await get_user_context(request)
    simul = await get_simul_for_request(request)

    if user.username != simul.created_by:
        raise web.HTTPForbidden(text="Only the host can edit the simul")

    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()

    simul.name = parse_simul_name(data)

    if simul.status == T_CREATED:
        _, variant = parse_simul_variant(data)
        simul.variant = variant.uci_variant
        simul.chess960 = variant.chess960
        simul.base = parse_int_post_field(data, "base", min_value=0, max_value=180)
        simul.inc = parse_int_post_field(data, "inc", min_value=0, max_value=180)
        simul.host_color = parse_host_color(data)

    await upsert_simul_to_db(simul)
    raise web.HTTPFound(f"/simul/{simul.id}")


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
