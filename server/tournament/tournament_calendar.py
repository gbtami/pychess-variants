from __future__ import annotations
import json
import datetime as dt
from functools import partial

import aiohttp_session
from aiohttp import web

from const import CATEGORIES
from pychess_global_app_state_utils import get_app_state
from tournament.scheduler import new_scheduled_tournaments
from tournament.tournaments import get_scheduled_tournaments


def create_scheduled_data(year, month, day, already_scheduled=None):
    if already_scheduled is None:
        already_scheduled = []
    start = dt.datetime(year, month, day, tzinfo=dt.timezone.utc)
    data = new_scheduled_tournaments(already_scheduled, start)
    return [
        (e["frequency"], e["variant"], e["chess960"], e["startDate"], e["minutes"]) for e in data
    ]


def go_day(day):
    d = dt.datetime.now() + dt.timedelta(days=day)
    return (d.year, d.month, d.day)


def event(data, created_tournaments):
    event_data = {
        "title": data[1] + ("960" if data[2] else ""),
        "start": data[3],
        "end": (data[3] + dt.timedelta(minutes=data[4])),
        "classNames": data[0],
    }

    tid = created_tournaments.get(data)
    if tid is None:
        event_data["borderColor"] = "gray"
    else:
        event_data["url"] = "/tournament/%s" % tid

    return event_data


async def tournament_calendar(request):
    app_state = get_app_state(request.app)

    if app_state.tourney_calendar is not None:
        events = app_state.tourney_calendar
    else:
        scheduled_tournaments = await get_scheduled_tournaments(get_app_state(request.app))
        created_tournaments = {t[:5]: t[5] for t in scheduled_tournaments}

        events = []
        now = dt.datetime.now()
        y, m, d = now.year, now.month, now.day
        prev_data = create_scheduled_data(y, m, d)

        for data in prev_data:
            events.append(event(data, created_tournaments))

        already_scheduled = prev_data
        for i in range(365):
            y, m, d = go_day(i)
            next_data = create_scheduled_data(y, m, d, already_scheduled=already_scheduled)

            for data in next_data:
                events.append(event(data, created_tournaments))

            already_scheduled += next_data

        app_state.tourney_calendar = events

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = await app_state.users.get(session_user) if session_user else None
    game_category = user.game_category if user is not None else session.get("game_category", "all")

    if game_category != "all":
        allowed_variants = set(CATEGORIES[game_category])
        events = [event for event in events if event.get("title") in allowed_variants]

    return web.json_response(events, dumps=partial(json.dumps, default=dt.datetime.isoformat))
