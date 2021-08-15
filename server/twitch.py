import hmac
import hashlib
import logging
import random
import string
from datetime import datetime, timedelta, timezone

import aiohttp
from aiohttp import web

from broadcast import lobby_broadcast
from settings import DEV, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
from streamers import TWITCH_STREAMERS

TWITCH_OAUTH2_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
TWITCH_EVENTSUB_API_URL = "https://api.twitch.tv/helix/eventsub/subscriptions"
TWITCH_USERS_API_URL = "https://api.twitch.tv/helix/users"
TWITCH_STREAMS_API_URL = "https://api.twitch.tv/helix/streams"

if DEV:
    # https://github.com/localtunnel/localtunnel
    CALLBACK_URL = "https://fresh-husky-89.loca.lt/twitch"
else:
    CALLBACK_URL = "https://www.pychess.org/twitch"

ID_CHARS = string.ascii_letters + string.digits
SECRET = "".join(random.choice(ID_CHARS) for x in range(16))

log = logging.getLogger(__name__)


def validate_twitch_signature(secret, request, data):
    msg_id = request.headers.get('twitch-eventsub-message-id')
    timestamp = request.headers.get('twitch-eventsub-message-timestamp')
    hmac_message = msg_id + timestamp + data

    calculated_hash = hmac.new(
        bytes(secret, encoding='UTF-8'),
        msg=bytes(hmac_message, encoding='UTF-8'),
        digestmod=hashlib.sha256
    ).hexdigest()

    submitted_hash = request.headers.get('Twitch-Eventsub-Message-Signature')[7:]
    return calculated_hash == submitted_hash


class Twitch:
    def __init__(self, app):
        self.app = app
        self.token = None
        self.token_valid_until = datetime.now(timezone.utc)
        self.subscriptions = {}
        self.streams = {}

    @property
    def live_streams(self):
        return [self.streams[streamer] for streamer in self.streams if "pychess" in self.streams[streamer]["title"].lower()]

    async def init_subscriptions(self):
        if TWITCH_CLIENT_ID == "":
            return

        if self.token_valid_until <= datetime.now(timezone.utc):
            await self.get_oauth_token()

        await self.get_subscriptions()

        for subscription_id in self.subscriptions:
            await self.delete_subscription(subscription_id)

        uids = await self.get_users_data(TWITCH_STREAMERS.keys())
        for uid in uids:
            await self.request_subscription(uid, "stream.online")
            await self.request_subscription(uid, "stream.offline")
            await self.request_subscription(uid, "channel.update")

        if len(self.streams) > 0:
            await self.broadcast_streams()

    async def get_oauth_token(self):
        log.debug("--- get_oauth_token from twitch ---")
        data = {
            "client_id": TWITCH_CLIENT_ID,
            "client_secret": TWITCH_CLIENT_SECRET,
            "grant_type": "client_credentials"
        }

        async with aiohttp.ClientSession() as client_session:
            async with client_session.post(TWITCH_OAUTH2_TOKEN_URL, json=data) as resp:
                if resp.status == 400:
                    log.exception("OAuth2 failed")
                    return

                response_data = await resp.json()
                if "status" in response_data:
                    if response_data["status"] == 400:
                        log.error("Invalid TWITCH_CLIENT_ID")
                    elif response_data["status"] == 403:
                        log.error("Invalid TWITCH_CLIENT_SECRET")
                else:
                    self.token = response_data['access_token']
                    self.token_valid_until = datetime.now(timezone.utc) + timedelta(seconds=response_data['expires_in'])
                    self.headers = {
                        'Client-ID': TWITCH_CLIENT_ID,
                        'Authorization': "Bearer %s" % self.token,
                        "Content-Type": "application/json"
                    }

    async def delete_subscription(self, subscription_id):
        log.debug("--- delete_subscription --- %s", subscription_id)
        if subscription_id not in self.subscriptions:
            return

        async with aiohttp.ClientSession() as client_session:
            async with client_session.delete("%s?id=%s" % (TWITCH_EVENTSUB_API_URL, subscription_id), headers=self.headers):
                pass

    async def request_subscription(self, broadcaster_user_id, subscription_type):
        log.debug("--- request_subscription ---- %s %s", broadcaster_user_id, subscription_type)
        data = {
            "type": subscription_type,
            "version": "1",
            "condition": {
                "broadcaster_user_id": broadcaster_user_id
            },
            "transport": {
                "method": "webhook",
                "callback": CALLBACK_URL,
                "secret": SECRET,
            }
        }

        async with aiohttp.ClientSession() as client_session:
            async with client_session.post(TWITCH_EVENTSUB_API_URL, headers=self.headers, json=data) as resp:
                response_data = await resp.json()
                subs = response_data["data"][0]
                self.subscriptions[subs["id"]] = subs

    async def get_subscriptions(self):
        log.debug("--- get_subscriptions from twitch ---")
        async with aiohttp.ClientSession() as client_session:
            async with client_session.get(TWITCH_EVENTSUB_API_URL, headers=self.headers) as resp:
                response_data = await resp.json()
                for subs in response_data["data"]:
                    self.subscriptions[subs["id"]] = subs

    async def get_users_data(self, usernames):
        log.debug("--- get_users_data from twitch ---")
        async with aiohttp.ClientSession() as client_session:
            uids = []
            query_params = "&".join(["login=%s" % username for username in usernames])

            async with client_session.get("%s?%s" % (TWITCH_USERS_API_URL, query_params), headers=self.headers) as resp:
                if resp.status == 400:
                    log.exception("Invalid argument")
                    return uids
                else:
                    json = await resp.json()
                    for user in json["data"]:
                        uids.append(user["id"])

            query_params = "&".join(["user_login=%s" % username for username in usernames])
            async with client_session.get("%s?%s" % (TWITCH_STREAMS_API_URL, query_params), headers=self.headers) as resp:
                if resp.status == 400:
                    log.exception("Invalid argument")
                    return uids
                else:
                    json = await resp.json()
                    for stream in json["data"]:
                        title = stream["title"]
                        streamer = stream["user_login"]
                        live = stream["type"] == "live"
                        if live:
                            self.streams[streamer] = {
                                "username": TWITCH_STREAMERS[streamer],
                                "streamer": streamer,
                                "site": "twitch",
                                "title": title,
                            }

            return uids

    async def broadcast_streams(self):
        lobby_sockets = self.app["lobbysockets"]
        response = {"type": "streams", "items": self.live_streams}
        await lobby_broadcast(lobby_sockets, response)


async def twitch(request):
    """ Twitch POST request handler """

    json = await request.json()
    data = await request.text()

    header_msg_type = request.headers.get('Twitch-Eventsub-Message-Type')
    header_sub_type = request.headers.get('Twitch-Eventsub-Subscription-Type')

    if not header_msg_type:
        raise web.HTTPBadRequest()

    if not validate_twitch_signature(SECRET, request, data):
        raise web.HTTPForbidden()

    log.debug("--- twitch --- %s %s", header_msg_type, header_sub_type)
    challenge = json.get('challenge')
    if header_msg_type == 'webhook_callback_verification':
        if challenge:
            return web.Response(text=challenge)

    elif header_msg_type == 'notification':
        twitch = request.app["twitch"]
        event = json.get("event")
        streamer = event["broadcaster_user_login"]
        log.debug("--- twitch notification --- %s %s", streamer, event)

        if header_sub_type == 'stream.online':
            if event["type"] == "live":
                if streamer not in twitch.streams:
                    twitch.streams[streamer] = {
                        "username": TWITCH_STREAMERS[streamer],
                        "streamer": streamer,
                        "site": "twitch",
                        "title": "",
                    }
                    await twitch.broadcast_streams()

        elif header_sub_type == 'stream.offline':
            if streamer in twitch.streams:
                del twitch.streams[streamer]
                await twitch.broadcast_streams()

        elif header_sub_type == 'channel.update':
            title = event["title"]
            if streamer in twitch.streams:
                twitch.streams[streamer]["title"] = title
            else:
                twitch.streams[streamer] = {
                    "username": TWITCH_STREAMERS[streamer],
                    "streamer": streamer,
                    "site": "twitch",
                    "title": title,
                }
            await twitch.broadcast_streams()

        return web.Response()
