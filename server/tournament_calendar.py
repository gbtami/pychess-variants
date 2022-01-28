import json
import datetime as dt
from functools import partial

from aiohttp import web

from scheduler import new_scheduled_tournaments


def create_scheduled_data(year, month, day, already_scheduled=[]):
    start = dt.datetime(year, month, day, tzinfo=dt.timezone.utc)
    data = new_scheduled_tournaments(already_scheduled, start)
    return [(e["frequency"], e["variant"], e["chess960"], e["startDate"], e["minutes"]) for e in data]


def go_day(day):
    d = dt.datetime.now() + dt.timedelta(days=day)
    return (d.year, d.month, d.day)


def event(data):
    title = data[1] + ("960" if data[2] else "")
    start = data[3]  # .isoformat(timespec="minutes")
    end = (data[3] + dt.timedelta(minutes=data[4]))  # .isoformat(timespec="minutes")
    return {"title": title, "start": start, "end": end}


async def tournament_calendar(request):
    events = []
    now = dt.datetime.now()
    y, m, d = now.year, now.month, now.day
    prev_data = create_scheduled_data(y, m, d)

    for data in prev_data:
        events.append(event(data))

    already_scheduled = prev_data
    for i in range(365):
        y, m, d = go_day(i)
        next_data = create_scheduled_data(y, m, d, already_scheduled=already_scheduled)

        for data in next_data:
            events.append(event(data))

        already_scheduled += next_data

    return web.json_response(events, dumps=partial(json.dumps, default=dt.datetime.isoformat))
