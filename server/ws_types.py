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
    _id: NotRequired[object]


class LobbyChatMessageDb(LobbyChatMessage):
    pass


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


class LobbySeekPayload(TypedDict):
    variant: str
    fen: str
    color: str
    minutes: int
    increment: int
    byoyomiPeriod: int
    day: NotRequired[int]
    rated: NotRequired[bool | None]
    rrmin: NotRequired[int | None]
    rrmax: NotRequired[int | None]
    chess960: NotRequired[bool | None]
    target: NotRequired[str]
    user: NotRequired[str]


class CreateSeekMessage(LobbySeekPayload):
    type: Literal["create_seek"]


class CreateInviteMessage(LobbySeekPayload):
    type: Literal["create_invite"]


class CreateBotChallengeMessage(LobbySeekPayload):
    type: Literal["create_bot_challenge"]
    profileid: str


class CreateAiChallengeMessage(LobbySeekPayload):
    type: Literal["create_ai_challenge"]
    profileid: str
    level: int
    rm: bool


class CreateHostMessage(LobbySeekPayload):
    type: Literal["create_host"]


class SeekIdMessage(TypedDict):
    seekID: str


class DeleteSeekMessage(SeekIdMessage):
    type: Literal["delete_seek"]


class LeaveSeekMessage(SeekIdMessage):
    type: Literal["leave_seek"]


class AcceptSeekMessage(SeekIdMessage):
    type: Literal["accept_seek"]


class CreateAutoPairingMessage(TypedDict):
    type: Literal["create_auto_pairing"]
    variants: list[tuple[str, bool]]
    tcs: list[tuple[int, int, int]]
    rrmin: int
    rrmax: int


class CancelAutoPairingMessage(TypedDict):
    type: Literal["cancel_auto_pairing"]


LobbyInboundMessage = (
    CreateAiChallengeMessage
    | CreateSeekMessage
    | CreateInviteMessage
    | CreateBotChallengeMessage
    | CreateHostMessage
    | DeleteSeekMessage
    | LeaveSeekMessage
    | AcceptSeekMessage
    | LobbyChatMessage
    | CreateAutoPairingMessage
    | CancelAutoPairingMessage
)


class TournamentIdMessage(TypedDict):
    tournamentId: str


class TournamentGetPlayersMessage(TournamentIdMessage):
    type: Literal["get_players"]
    page: int


class TournamentMyPageMessage(TournamentIdMessage):
    type: Literal["my_page"]


class TournamentGetGamesMessage(TournamentIdMessage):
    type: Literal["get_games"]
    player: str


class TournamentJoinMessage(TournamentIdMessage):
    type: Literal["join"]
    password: NotRequired[str]


class TournamentPauseMessage(TournamentIdMessage):
    type: Literal["pause"]


class TournamentWithdrawMessage(TournamentIdMessage):
    type: Literal["withdraw"]


class TournamentUserConnectedRequest(TournamentIdMessage):
    type: Literal["tournament_user_connected"]
    username: NotRequired[str]


class TournamentLobbyChatMessage(TournamentIdMessage):
    type: Literal["lobbychat"]
    message: str
    room: NotRequired[str]


TournamentInboundMessage = (
    TournamentGetPlayersMessage
    | TournamentMyPageMessage
    | TournamentGetGamesMessage
    | TournamentJoinMessage
    | TournamentPauseMessage
    | TournamentWithdrawMessage
    | TournamentUserConnectedRequest
    | TournamentLobbyChatMessage
)


class SimulIdMessage(TypedDict):
    simulId: str


class SimulUserConnectedRequest(SimulIdMessage):
    type: Literal["simul_user_connected"]


class SimulStartRequest(SimulIdMessage):
    type: Literal["start_simul"]


class SimulJoinRequest(SimulIdMessage):
    type: Literal["join"]


class SimulApprovePlayerRequest(SimulIdMessage):
    type: Literal["approve_player"]
    username: NotRequired[str]


class SimulDenyPlayerRequest(SimulIdMessage):
    type: Literal["deny_player"]
    username: NotRequired[str]


SimulInboundMessage = (
    SimulUserConnectedRequest
    | SimulStartRequest
    | SimulJoinRequest
    | SimulApprovePlayerRequest
    | SimulDenyPlayerRequest
)
