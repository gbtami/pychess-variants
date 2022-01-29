import json
import datetime as dt
from functools import partial

from aiohttp import web

from scheduler import new_scheduled_tournaments
from tournaments import get_scheduled_tournaments


def create_scheduled_data(year, month, day, already_scheduled=None):
    if already_scheduled is None:
        already_scheduled = []
    start = dt.datetime(year, month, day, tzinfo=dt.timezone.utc)
    data = new_scheduled_tournaments(already_scheduled, start)
    return [(e["frequency"], e["variant"], e["chess960"], e["startDate"], e["minutes"]) for e in data]


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
    if "calendar" in request.app:
        events = request.app["calendar"]
        return web.json_response(events, dumps=partial(json.dumps, default=dt.datetime.isoformat))

    scheduled_tournaments = await get_scheduled_tournaments(request.app)
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

    request.app["calendar"] = events

    return web.json_response(events, dumps=partial(json.dumps, default=dt.datetime.isoformat))
