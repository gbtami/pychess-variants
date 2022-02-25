from datetime import datetime
import logging

import aiohttp

from const import T_CREATED
from misc import time_control_str
from settings import (
    DEV,
    LICHESS_API_TOKEN,
)

# POST
# Responses:
# 200: {"ok": true}
# 400: {"error": "This request is invalid because [...]"}

log = logging.getLogger(__name__)


async def lichess_team_msg(app):
    if DEV or LICHESS_API_TOKEN is None:
        return

    to_date = datetime.now().date()
    if to_date in app["sent_lichess_team_msg"]:
        print("No more lichess team msg for today!")
        return

    team_id = "pychess-tournaments"
    msg = upcoming_tournaments_msgs(app["tournaments"])
    print(msg)

    async with aiohttp.ClientSession() as session:
        headers = {"Authorization": "Bearer %s" % LICHESS_API_TOKEN}

        endpoint = f"https://lichess.org/team/{team_id}/pm-all"
        async with session.post(endpoint, headers=headers, data={"message": msg}) as resp:
            print(resp.status)
            json = await resp.json()
            if json.get("error") is not None:
                log.error(json)

            app["sent_lichess_team_msg"].append(to_date)


def upcoming_tournaments_msgs(tournaments):
    to_date = datetime.now().date()
    tourney_msgs = []

    for _id, tourney in sorted(tournaments.items(), key=lambda item: item[1].starts_at):
        if tourney.status == T_CREATED and tourney.starts_at.date() <= to_date:
            tc = time_control_str(tourney.base, tourney.inc, tourney.byoyomi_period)
            at = tourney.starts_at.strftime("%H:%M")
            url = "https://www.pychess.org/tournament/%s" % _id
            tourney_msgs.append("%s %s starts at today UTC %s\n%s" % (tc, tourney.name, at, url))

    tourney_msgs.append(
        "If you want more notifications (10 min before start) join our Discord https://discord.gg/aPs8RKr and use #self-roles! Thx."
    )

    return "\n\n".join(tourney_msgs)
