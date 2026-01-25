from __future__ import annotations
from typing import TYPE_CHECKING
from collections.abc import Mapping

import collections
from typing import Optional, Deque

from aiohttp.web_ws import WebSocketResponse

from const import MAX_CHAT_LINES
from seek import get_seeks
from websocket_utils import ws_send_json

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from user import User
    from ws_types import (
        ChatLine,
        LobbyChatMessage,
        LobbyChatMessageDb,
        LobbyCountMessage,
        LobbySeeksMessage,
    )
# from logger import log


class Lobby:
    def __init__(self, app_state: PychessGlobalAppState) -> None:
        self.app_state: PychessGlobalAppState = app_state
        self.lobbysockets: dict[
            str, set[WebSocketResponse]
        ] = {}  # one dict only! {user.username: user.tournament_sockets, ...}
        self.lobbychat: Deque[ChatLine] = collections.deque([], MAX_CHAT_LINES)

    # below methods maybe best in separate class eventually
    async def lobby_broadcast(self, response: Mapping[str, object]) -> None:
        # log.debug("lobby_broadcast: %r to %r", response, self.lobbysockets)
        for username, ws_set in list(self.lobbysockets.items()):
            for ws in list(ws_set):
                await ws_send_json(ws, response)

    async def lobby_broadcast_u_cnt(self) -> None:
        # todo: probably wont scale great if we broadcast these on every user join/leave.
        response: LobbyCountMessage = {"type": "u_cnt", "cnt": self.app_state.online_count()}
        await self.lobby_broadcast(response)

    async def lobby_broadcast_ap_cnt(self) -> None:
        response: LobbyCountMessage = {"type": "ap_cnt", "cnt": self.app_state.auto_pairing_count()}
        await self.lobby_broadcast(response)

    async def lobby_broadcast_seeks(self) -> None:
        # We will need all the seek users blocked info
        for seek in self.app_state.seeks.values():
            await self.app_state.users.get(seek.creator.username)

        for username, ws_set in list(self.lobbysockets.items()):
            ws_user = await self.app_state.users.get(username)
            compatible_seeks = get_seeks(ws_user, self.app_state.seeks.values())
            for ws in list(ws_set):
                response: LobbySeeksMessage = {"type": "get_seeks", "seeks": compatible_seeks}
                await ws_send_json(
                    ws,
                    response,
                )

    async def lobby_chat(self, username: str, message: str, time: Optional[int] = None) -> None:
        response: LobbyChatMessage = {"type": "lobbychat", "user": username, "message": message}
        if time is not None:
            response["time"] = time
        await self.lobby_chat_save(response)
        await self.lobby_broadcast(response)

    async def lobby_chat_save(self, response: LobbyChatMessage) -> None:
        self.lobbychat.append(response)
        await self.app_state.db.lobbychat.insert_one(response)
        # We have to remove _id added by insert to remain our response JSON serializable
        response_db: LobbyChatMessageDb = response
        del response_db["_id"]

    async def handle_user_closes_lobby(self, user: User) -> None:
        # todo: maybe get rid of lobbysockets at some point and use app_state.users.loobby_sockets instead.
        #       On this event we could clean-up also app_state.users etc. if user is considered no longer online
        # online user counter will be updated in quit_lobby also!
        if len(user.lobby_sockets) == 0:
            if user.username in self.lobbysockets:
                del self.lobbysockets[user.username]
            # response = {"type": "lobbychat", "user": "", "message": "%s left the lobby" % user.username}
            # await lobby_broadcast(sockets, response)

    async def close_lobby_sockets(self) -> None:
        for ws_set in list(self.lobbysockets.values()):
            for ws in list(ws_set):
                await ws.close()
