import aiohttp_jinja2
from aiohttp import web

from const import IMPORTED, RATED, DASH, TROPHIES
from custom_trophy_owners import CUSTOM_TROPHY_OWNERS
from glicko2.glicko2 import PROVISIONAL_PHI
from settings import ADMINS
from typing_defs import ViewContext
from ublog import display_date, image_src, post_url, summary_from_markdown
from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from variants import NOT_RATED_VARIANTS, VARIANTS, VARIANT_ICONS


def _thread_id(user1: str, user2: str) -> str:
    first, second = sorted((user1, user2), key=lambda x: (x.lower(), x))
    return f"{first}:{second}"


@aiohttp_jinja2.template("profile.html")
async def profile(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    profileId = request.match_info["profileId"]
    variant = request.match_info.get("variant")
    if (variant is not None) and (variant not in VARIANTS):
        raise web.HTTPNotFound()

    app_state = get_app_state(request.app)

    rated: int | None = None

    if variant is not None:
        context["variant"] = variant

    context["icons"] = VARIANT_ICONS

    if user.anon and DASH in profileId:
        return context

    profile_user = await app_state.public_users.get_profile(profileId)
    if profile_user is None or not profile_user.enabled:
        raise web.HTTPNotFound()

    if request.path[-7:] == "/import":
        rated = IMPORTED
    elif request.path[-6:] == "/rated":
        rated = RATED
    elif request.path[-8:] == "/playing":
        rated = -2
    elif request.path[-3:] == "/me":
        rated = -1

    follow_allowed = (profileId not in user.blocked) and (user.username not in profile_user.blocked)
    context["can_block"] = profileId not in user.blocked
    context["can_follow"] = follow_allowed
    context["is_following"] = profileId in user.following
    can_message = (
        (profileId not in user.blocked)
        and (user.username not in profile_user.blocked)
        and ((not profile_user.pm_friends_only) or (profileId in user.following))
    )
    if (
        (not can_message)
        and profile_user.pm_friends_only
        and follow_allowed
        and (app_state.db is not None)
    ):
        existing = await app_state.db.inbox_thread.find_one(
            {"_id": _thread_id(user.username, profileId), "deletedBy": {"$ne": profileId}},
            projection={"_id": 1},
        )
        can_message = existing is not None
    context["can_message"] = can_message
    context["can_challenge"] = user.username not in profile_user.blocked
    context["can_export_games"] = (
        (not user.anon)
        and (not profile_user.bot)
        and (profileId == user.username or user.username in ADMINS)
    )

    allowed_variants = user.category_variant_set

    _id = "%s|%s" % (profileId, profile_user.title)
    context["trophies"] = [
        (v, "top10")
        for v in app_state.highscore
        if _id in app_state.highscore[v].keys()[:10]
        and (allowed_variants is None or v in allowed_variants)
    ]
    for i, (v, kind) in enumerate(context["trophies"]):
        if app_state.highscore[v].peekitem(0)[0] == _id:
            context["trophies"][i] = (v, "top1")
    context["trophies"] = sorted(context["trophies"], key=lambda x: x[1])

    if not profile_user.bot:
        shield_owners = app_state.shield_owners
        context["trophies"] += [
            (v, "shield")
            for v in shield_owners
            if shield_owners[v] == profileId and (allowed_variants is None or v in allowed_variants)
        ]

    if profileId in CUSTOM_TROPHY_OWNERS:
        trophies = CUSTOM_TROPHY_OWNERS[profileId]
        for v, kind in trophies:
            if v in VARIANTS and (allowed_variants is None or v in allowed_variants):
                context["trophies"].append((v, kind))

    context["title"] = "Profile • " + profileId
    context["icons"] = VARIANT_ICONS
    context["cup"] = TROPHIES

    if variant is not None:
        context["variant"] = variant

    perfs = profile_user.perfs.items()
    if user.game_category != "all":
        perfs = [(k, v) for k, v in perfs if k in allowed_variants]

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
            perfs,
            key=lambda x: x[1]["nb"],
            reverse=True,
        )
    }
    for v in NOT_RATED_VARIANTS:
        if v in context["ratings"]:
            context["ratings"][v] = ("1500?", 0)

    context["profile_title"] = profile_user.title
    context["rated"] = rated

    context["view"] = "profile"
    context["view_css"] = "profile.css"
    context["profile"] = profileId
    context["lichess_id"] = (
        profile_user.oauth_id if profile_user.oauth_provider == "lichess" else ""
    )
    context["lishogi_id"] = (
        profile_user.oauth_id if profile_user.oauth_provider == "lishogi" else ""
    )
    context["ublog_posts"] = []
    context["ublog_post_count"] = 0
    if app_state.db is not None:
        context["ublog_post_count"] = await app_state.db.ublog_post.count_documents(
            {"author": profileId, "live": True}
        )
        posts = await (
            app_state.db.ublog_post.find({"author": profileId, "live": True})
            .sort([("sticky", -1), ("publishedAt", -1), ("createdAt", -1)])
            .limit(3)
            .to_list(3)
        )
        titles = await app_state.public_users.get_titles([profileId])
        author_title = titles.get(profileId, "")
        ublog_posts: list[dict[str, str]] = []
        for post in posts:
            summary = summary_from_markdown(str(post.get("markdown") or ""))
            intro = str(post.get("intro") or post.get("subtitle") or summary)
            ublog_posts.append(
                {
                    "_id": post["_id"],
                    "title": str(post.get("title") or ""),
                    "intro": intro,
                    "subtitle": intro,
                    "summary": summary,
                    "date": display_date(post),
                    "image": str(post.get("image") or ""),
                    "image_src": image_src(post),
                    "imageAlt": str(post.get("imageAlt") or ""),
                    "url": post_url(post),
                    "author": profileId,
                    "author_title": author_title,
                }
            )
        context["ublog_posts"] = ublog_posts

    return context
