from __future__ import annotations

from collections.abc import Mapping
from urllib.parse import quote

import aiohttp_jinja2
from aiohttp import web
from const import FOLLOW
from glicko2.glicko2 import PROVISIONAL_PHI, sparse_perf_map
from pychess_global_app_state_utils import get_app_state
from settings import ADMINS
from typing_defs import FollowingUserRow, PerfEntry, PerfMap, UserDocument, ViewContext
from user_stats import normalize_user_count
from variants import RATED_VARIANTS

from views import get_user_context

FOLLOWING_PAGE_SIZE = 30


def _positive_page(value: str | None) -> int:
    try:
        return max(1, int(value or "1"))
    except ValueError:
        return 1


def _best_perf(perfs: PerfMap) -> tuple[str, str]:
    played: list[tuple[str, PerfEntry]] = [
        (variant, perf) for variant, perf in perfs.items() if perf.get("nb", 0) > 0
    ]
    if not played:
        return "", ""

    variant, perf = max(played, key=lambda item: item[1]["gl"]["r"])
    gl = perf["gl"]
    rating = str(int(round(gl["r"], 0)))
    if gl["d"] > PROVISIONAL_PHI:
        rating += "?"
    return rating, variant


def _page_href(profile_id: str, page: int) -> str:
    base = f"/@/{quote(profile_id, safe='')}/following"
    return base if page == 1 else f"{base}?page={page}"


def _row_from_user_data(
    username: str,
    title: str,
    count: Mapping[str, object] | None,
    perfs: PerfMap,
    online: bool,
) -> FollowingUserRow:
    rating, variant = _best_perf(perfs)
    return {
        "username": username,
        "title": title,
        "games": normalize_user_count(count).get("game", 0),
        "rating": rating,
        "variant": variant,
        "online": online,
    }


@aiohttp_jinja2.template("following.html")
async def following(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if user.anon:
        raise web.HTTPForbidden()

    app_state = get_app_state(request.app)
    profile_id = request.match_info["profileId"]
    if profile_id != user.username and user.username not in ADMINS:
        raise web.HTTPFound(_page_href(user.username, 1))

    live_profile = app_state.users.data.get(profile_id)
    profile_doc: UserDocument | None = None
    if live_profile is None and app_state.db is not None:
        profile_doc = await app_state.db.user.find_one(
            {"_id": profile_id}, projection={"_id": 1, "enabled": 1}
        )
    if (
        (live_profile is None and profile_doc is None)
        or (live_profile is not None and not live_profile.enabled)
        or (profile_doc is not None and not profile_doc.get("enabled", True))
    ):
        raise web.HTTPNotFound()

    page = _positive_page(request.rel_url.query.get("page"))
    offset = (page - 1) * FOLLOWING_PAGE_SIZE
    relation_query = {"u1": profile_id, "r": FOLLOW}
    total = await app_state.db.relation.count_documents(relation_query)
    relation_docs = await (
        app_state.db.relation.find(relation_query, projection={"_id": 0, "u2": 1})
        .sort("u2", 1)
        .skip(offset)
        .limit(FOLLOWING_PAGE_SIZE)
        .to_list(FOLLOWING_PAGE_SIZE)
    )
    target_ids = [str(doc["u2"]) for doc in relation_docs]

    user_docs: dict[str, UserDocument] = {}
    if target_ids:
        cursor = app_state.db.user.find(
            {"_id": {"$in": target_ids}},
            projection={"_id": 1, "title": 1, "enabled": 1, "count": 1, "perfs": 1},
        )
        user_docs = {str(doc["_id"]): doc async for doc in cursor}

    rows: list[FollowingUserRow] = []
    for target_id in target_ids:
        live_user = app_state.users.data.get(target_id)
        if live_user is not None:
            if live_user.enabled:
                rows.append(
                    _row_from_user_data(
                        target_id,
                        live_user.title,
                        live_user.count,
                        live_user.perfs,
                        bool(live_user.online),
                    )
                )
            continue

        doc = user_docs.get(target_id)
        if doc is None or not doc.get("enabled", True):
            continue
        rows.append(
            _row_from_user_data(
                target_id,
                doc.get("title") or "",
                doc.get("count"),
                sparse_perf_map(RATED_VARIANTS, doc.get("perfs")),
                False,
            )
        )

    context["title"] = f"{profile_id} • Following"
    context["view"] = "following"
    context["view_css"] = "following.css"
    context["following_profile"] = profile_id
    context["following_users"] = rows
    context["following_total"] = total
    context["following_prev_href"] = _page_href(profile_id, page - 1) if page > 1 else ""
    context["following_next_href"] = (
        _page_href(profile_id, page + 1) if offset + FOLLOWING_PAGE_SIZE < total else ""
    )
    return context
