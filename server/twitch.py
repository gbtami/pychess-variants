import hmac
import hashlib
import logging
import random
import string
from datetime import datetime, timedelta, timezone

import aiohttp
from aiohttp import web

from broadcast import lobby_broadcast
from settings import TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
from streamers import TWITCH_STREAMERS

TWITCH_OAUTH2_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
TWITCH_EVENTSUB_API_URL = "https://api.twitch.tv/helix/eventsub/subscriptions"
TWITCH_USERS_API_URL = "https://api.twitch.tv/helix/users"
TWITCH_CHANNELS_API_URL = "https://api.twitch.tv/helix/channels"
TWITCH_STREAMS_API_URL = "https://api.twitch.tv/helix/streams"

# CALLBACK_URL = "https://www.pychess.org/twitch"
CALLBACK_URL = "https://heavy-eagle-4.loca.lt/twitch"

ID_CHARS = string.ascii_letters + string.digits
SECRET = "".join(random.choice(ID_CHARS) for x in range(16))

log = logging.getLogger(__name__)


def validate_twitch_signature(secret, request, data):
    print("---- validate_twitch_signature() ----")
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

    async def init_subscriptions(self):
        if self.token_valid_until <= datetime.now(timezone.utc):
            await self.get_oauth_token()

        await self.get_subscriptions()

        for subscription_id in self.subscriptions:
            await self.delete_subscription(subscription_id)

        for username in TWITCH_STREAMERS:
            uid, title = await self.get_user_data(TWITCH_STREAMERS[username])
            if uid is not None:
                await self.request_subscription(uid, "stream.online")
                await self.request_subscription(uid, "stream.offline")
                await self.request_subscription(uid, "channel.update")

    def live_streams(self):
        streams = [
            {"username": "gbtami", "url": "https://www.twitch.tv/" + "gbtami", "title": "Playing chess variants on www.pychess.org"},
        ]
        print("--- live_streams() ---")
        print(streams)
        return []

    async def get_oauth_token(self):
        print("---- get_oauth_token() ----")
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
                print(response_data)
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
        if subscription_id not in self.subscriptions:
            return

        async with aiohttp.ClientSession() as client_session:
            async with client_session.delete("%s?id=%s" % (TWITCH_EVENTSUB_API_URL, subscription_id), headers=self.headers):
                print("---- delete_subscription() ----", subscription_id)

    async def request_subscription(self, broadcaster_user_id, subscription_type):
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
                print("---- request_subscription() ----", response_data)
                subs = response_data["data"][0]
                self.subscriptions[subs["id"]] = subs

    async def get_subscriptions(self):
        async with aiohttp.ClientSession() as client_session:
            async with client_session.get(TWITCH_EVENTSUB_API_URL, headers=self.headers) as resp:
                response_data = await resp.json()
                print("---------- We have %s subscriptions --------" % response_data["total"])
                for subs in response_data["data"]:
                    print("   ", subs)
                    self.subscriptions[subs["id"]] = subs

    async def get_user_data(self, username):
        async with aiohttp.ClientSession() as client_session:
            broadcaster_id = None
            title = None

            async with client_session.get("%s?login=%s" % (TWITCH_USERS_API_URL, username), headers=self.headers) as resp:
                if resp.status == 400:
                    log.exception("Invalid argument")
                    return None
                else:
                    response_data = await resp.json()
                    resp_user = response_data["data"][0]
                    print("---- get_user_data() ----", resp_user)
                    broadcaster_id = resp_user["id"]

            async with client_session.get("%s?broadcaster_id=%s" % (TWITCH_CHANNELS_API_URL, broadcaster_id), headers=self.headers) as resp:
                if resp.status == 400:
                    log.exception("Invalid argument")
                    return None
                else:
                    response_data = await resp.json()
                    resp_channel = response_data["data"][0]
                    print("---- get_user_data() ----", resp_channel)
                    title = resp_channel["title"]
            return (broadcaster_id, title)

    async def broadcast_streams(self):
        lobby_sockets = self.app["lobbysockets"]
        response = {"type": "streams", "items": self.live_streams()}
        await lobby_broadcast(lobby_sockets, response)


async def twitch(request):
    json = await request.json()
    data = await request.text()

    header_msg_type = request.headers.get('Twitch-Eventsub-Message-Type')
    header_sub_type = request.headers.get('Twitch-Eventsub-Subscription-Type')

    if not header_msg_type:
        print("---- twitch_post() no header_msg_type !!! ----")
        raise web.HTTPBadRequest()

    if not validate_twitch_signature(SECRET, request, data):
        print("---- twitch_post() FORBIDDEN !!! ----")
        print(data)
        print("-------------------------------------")
        raise web.HTTPForbidden()

    challenge = json.get('challenge')
    if header_msg_type == 'webhook_callback_verification':
        if challenge:
            print("--- webhook_callback_verification OK ---")
            return web.Response(text=challenge)
        else:
            print("--- webhook_callback_verification FAIL ---")

    elif header_msg_type == 'notification':
        print("---- twitch_post() ----", header_msg_type, "|", header_sub_type)
        # print(data)

        if header_sub_type == 'stream.online':
            print("*** ONLINE ***")
        elif header_sub_type == 'stream.offline':
            print("*** OFF ***")
        elif header_sub_type == 'channel.update':
            print("*** channel update ***")
        elif header_sub_type == 'channel.follow':
            print("*** follow ***")
        return web.Response()
