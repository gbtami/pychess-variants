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


RATED_GAME_CHOICES = [
    (0, "No restriction"),
    (5, "5 rated games"),
    (10, "10 rated games"),
    (20, "20 rated games"),
    (50, "50 rated games"),
    (100, "100 rated games"),
    (200, "200 rated games"),
]
RATED_GAME_VALUES = [value for value, _ in RATED_GAME_CHOICES]
MIN_RATING_CHOICES = [
    (0, "No restriction"),
    (800, "800"),
    (900, "900"),
    (1000, "1000"),
    (1100, "1100"),
    (1200, "1200"),
    (1300, "1300"),
    (1400, "1400"),
    (1500, "1500"),
    (1600, "1600"),
    (1700, "1700"),
    (1800, "1800"),
    (1900, "1900"),
    (2000, "2000"),
    (2100, "2100"),
    (2200, "2200"),
]
MIN_RATING_VALUES = [value for value, _ in MIN_RATING_CHOICES]
MAX_RATING_CHOICES = [
    (0, "No restriction"),
    (2200, "2200"),
    (2100, "2100"),
    (2000, "2000"),
    (1900, "1900"),
    (1800, "1800"),
    (1700, "1700"),
    (1600, "1600"),
    (1500, "1500"),
    (1400, "1400"),
    (1300, "1300"),
    (1200, "1200"),
    (1100, "1100"),
    (1000, "1000"),
    (900, "900"),
    (800, "800"),
]
MAX_RATING_VALUES = [value for value, _ in MAX_RATING_CHOICES]
ACCOUNT_AGE_CHOICES = [
    (0, "No restriction"),
    (1, "1 day"),
    (3, "3 days"),
    (7, "7 days"),
    (14, "14 days"),
    (30, "1 month"),
    (60, "2 months"),
    (90, "3 months"),
    (180, "6 months"),
    (365, "1 year"),
    (730, "2 years"),
    (1095, "3 years"),
]
ACCOUNT_AGE_VALUES = [value for value, _ in ACCOUNT_AGE_CHOICES]


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


def parse_simul_description(data) -> str:
    description_raw = data.get("description", "")
    if not isinstance(description_raw, (str, bytes)):
        raise web.HTTPBadRequest(text="Invalid simul description")
    if isinstance(description_raw, bytes):
        description_raw = description_raw.decode("utf-8")
    description = description_raw.strip()
    if len(description) > 2000:
        raise web.HTTPBadRequest(text="Simul description is too long")
    return description


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


def add_simul_form_context(context: ViewContext) -> None:
    context["rated_game_choices"] = RATED_GAME_CHOICES
    context["rated_game_values"] = RATED_GAME_VALUES
    context["min_rating_choices"] = MIN_RATING_CHOICES
    context["min_rating_values"] = MIN_RATING_VALUES
    context["max_rating_choices"] = MAX_RATING_CHOICES
    context["max_rating_values"] = MAX_RATING_VALUES
    context["account_age_choices"] = ACCOUNT_AGE_CHOICES
    context["account_age_values"] = ACCOUNT_AGE_VALUES


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
        description = parse_simul_description(data)
        entry_min_rating = parse_int_post_field(data, "entryMinRating", min_value=0, max_value=4000)
        entry_max_rating = parse_int_post_field(data, "entryMaxRating", min_value=0, max_value=4000)
        entry_min_rated_games = parse_int_post_field(
            data, "entryMinRatedGames", min_value=0, max_value=100000
        )
        entry_min_account_age_days = parse_int_post_field(
            data, "entryMinAccountAgeDays", min_value=0, max_value=36500
        )
        if entry_max_rating > 0 and entry_min_rating > entry_max_rating:
            entry_min_rating, entry_max_rating = entry_max_rating, entry_min_rating

        simul = await Simul.create(
            app_state,
            simul_id,
            name=name,
            created_by=user.username,
            description=description,
            variant=variant.uci_variant,
            chess960=variant.chess960,
            rated=False,
            base=base,
            inc=inc,
            host_color=host_color,
            entry_min_rating=entry_min_rating,
            entry_max_rating=entry_max_rating,
            entry_min_rated_games=entry_min_rated_games,
            entry_min_account_age_days=entry_min_account_age_days,
            entry_titled_only=False,
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
    add_simul_form_context(context)
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
    add_simul_form_context(context)
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
    simul.description = parse_simul_description(data)

    if simul.status == T_CREATED:
        _, variant = parse_simul_variant(data)
        simul.variant = variant.uci_variant
        simul.chess960 = variant.chess960
        simul.base = parse_int_post_field(data, "base", min_value=0, max_value=180)
        simul.inc = parse_int_post_field(data, "inc", min_value=0, max_value=180)
        simul.host_color = parse_host_color(data)
        simul.entry_min_rating = parse_int_post_field(
            data, "entryMinRating", min_value=0, max_value=4000
        )
        simul.entry_max_rating = parse_int_post_field(
            data, "entryMaxRating", min_value=0, max_value=4000
        )
        simul.entry_min_rated_games = parse_int_post_field(
            data, "entryMinRatedGames", min_value=0, max_value=100000
        )
        simul.entry_min_account_age_days = parse_int_post_field(
            data, "entryMinAccountAgeDays", min_value=0, max_value=36500
        )
        simul.entry_titled_only = False
        if simul.entry_max_rating > 0 and simul.entry_min_rating > simul.entry_max_rating:
            simul.entry_min_rating, simul.entry_max_rating = (
                simul.entry_max_rating,
                simul.entry_min_rating,
            )

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
