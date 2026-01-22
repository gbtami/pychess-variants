from __future__ import annotations

from typing import TYPE_CHECKING, Literal, NotRequired, TypedDict

from typing_defs import ClockValues

if TYPE_CHECKING:
    from seek import SeekJson


class ChatMessage(TypedDict):
    type: str
    user: str
    message: str
    room: str
    time: int


class LobbyChatMessage(TypedDict):
    type: Literal["lobbychat"]
    user: str
    message: str
    room: NotRequired[str]
    time: NotRequired[int]


class LobbyChatMessageDb(LobbyChatMessage, total=False):
    _id: object


class LobbyCountMessage(TypedDict):
    type: Literal["u_cnt", "ap_cnt", "g_cnt"]
    cnt: int


class LobbySeeksMessage(TypedDict):
    type: Literal["get_seeks"]
    seeks: list[SeekJson]


class UserPresenceMessage(TypedDict):
    type: Literal["user_present", "user_disconnected"]
    username: str


class FullChatMessage(TypedDict):
    type: Literal["fullchat"]
    lines: list[object]


class GameUserConnectedMessage(TypedDict):
    type: Literal["game_user_connected"]
    username: str
    gameId: str
    ply: int
    firstmovetime: int


class GameStartMessage(TypedDict):
    type: Literal["gameStart"]
    gameId: str


class MoreTimeMessage(TypedDict):
    type: Literal["moretime"]
    username: str


class MoveData(TypedDict):
    gameId: str
    move: str
    clocks: ClockValues
    ply: int


class BughouseMoveData(MoveData):
    board: str
    clocksB: ClockValues


class TournamentUserConnectedMessage(TypedDict):
    type: Literal["tournament_user_connected"]
    username: str
    ustatus: str
    urating: int | str
    tstatus: int
    tsystem: int
    tminutes: int
    startsAt: str
    startFen: str
    description: str
    frequency: str
    secondsToStart: float
    secondsToFinish: float
    chatClosed: bool
    private: bool
    defender_title: NotRequired[str]
    defender_name: NotRequired[str]
