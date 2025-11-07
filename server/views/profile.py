import aiohttp_jinja2
from aiohttp import web

from const import IMPORTED, RATED, DASH, NONE_USER, TROPHIES
from custom_trophy_owners import CUSTOM_TROPHY_OWNERS
from glicko2.glicko2 import PROVISIONAL_PHI
from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from variants import NOT_RATED_VARIANTS, VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("profile.html")
async def profile(request):
    user, context = await get_user_context(request)

    profileId = request.match_info.get("profileId")
    variant = request.match_info.get("variant")

    app_state = get_app_state(request.app)

    rated = None

    if variant is not None:
        context["variant"] = variant

    context["icons"] = VARIANT_ICONS

    if profileId is not None:
        profileId_user = await app_state.users.get(profileId)
        if profileId_user.username == NONE_USER:
            raise web.HTTPNotFound()
        elif (profileId in app_state.users) and not app_state.users[profileId].enabled:
            raise web.HTTPNotFound()

        if user.anon and DASH in profileId:
            return context

        if request.path[-7:] == "/import":
            rated = IMPORTED
        elif request.path[-6:] == "/rated":
            rated = RATED
        elif request.path[-8:] == "/playing":
            rated = -2
        elif request.path[-3:] == "/me":
            rated = -1

    context["can_block"] = profileId not in user.blocked
    context["can_challenge"] = user.username not in profileId_user.blocked

    _id = "%s|%s" % (profileId, profileId_user.title)
    context["trophies"] = [
        (v, "top10") for v in app_state.highscore if _id in app_state.highscore[v].keys()[:10]
    ]
    for i, (v, kind) in enumerate(context["trophies"]):
        if app_state.highscore[v].peekitem(0)[0] == _id:
            context["trophies"][i] = (v, "top1")
    context["trophies"] = sorted(context["trophies"], key=lambda x: x[1])

    if not app_state.users[profileId].bot:
        shield_owners = app_state.shield_owners
        context["trophies"] += [
            (v, "shield") for v in shield_owners if shield_owners[v] == profileId
        ]

    if profileId in CUSTOM_TROPHY_OWNERS:
        trophies = CUSTOM_TROPHY_OWNERS[profileId]
        for v, kind in trophies:
            if v in VARIANTS:
                context["trophies"].append((v, kind))

    context["title"] = "Profile • " + profileId
    context["icons"] = VARIANT_ICONS
    context["cup"] = TROPHIES

    if variant is not None:
        context["variant"] = variant

    if profileId not in app_state.users or app_state.users[profileId].perfs is None:
        context["ratings"] = {}
    else:
        context["ratings"] = {
            k: (
                "%s%s"
                % (
                    int(round(v["gl"]["r"], 0)),
                    "?" if v["gl"]["d"] > PROVISIONAL_PHI else "",
                ),
                v["nb"],
            )
            for (k, v) in sorted(
                app_state.users[profileId].perfs.items(),
                key=lambda x: x[1]["nb"],
                reverse=True,
            )
        }
        for v in NOT_RATED_VARIANTS:
            context["ratings"][v] = ("1500?", 0)

    context["profile_title"] = (
        app_state.users[profileId].title if profileId in app_state.users else ""
    )
    context["rated"] = rated

    context["view"] = "profile"
    context["view_css"] = "profile.css"
    context["profile"] = profileId
    context["lichess_id"] = (
        profileId_user.oauth_id if profileId_user.oauth_provider == "lichess" else ""
    )
    context["lishogi_id"] = (
        profileId_user.oauth_id if profileId_user.oauth_provider == "lishogi" else ""
    )

    return context
