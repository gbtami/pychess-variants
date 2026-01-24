from __future__ import annotations

from typing import TYPE_CHECKING, Literal, NotRequired, Sequence, TypedDict

from typing_defs import ClockValues, StreamInfo, TournamentSpotlightItem

if TYPE_CHECKING:
    from seek import SeekJson


class ChatMessage(TypedDict):
    type: str
    user: str
    message: str
    room: str
    time: int


class TournamentChatMessage(ChatMessage, total=False):
    tid: str
    _id: object


class LobbyChatMessage(TypedDict):
    type: Literal["lobbychat"]
    user: str
    message: str
    room: NotRequired[str]
    time: NotRequired[int]
    _id: NotRequired[object]


class LobbyChatMessageDb(LobbyChatMessage):
    pass


ChatLine = ChatMessage | LobbyChatMessage


class LobbyCountMessage(TypedDict):
    type: Literal["u_cnt", "ap_cnt", "g_cnt"]
    cnt: int


class LobbySeeksMessage(TypedDict):
    type: Literal["get_seeks"]
    seeks: list[SeekJson]


class SeekStatusMessage(TypedDict):
    type: Literal["seek_yourself", "seek_occupied", "seek_joined"]
    seekID: str


class ErrorMessage(TypedDict):
    type: Literal["error"]
    message: str


class NewGameMessage(TypedDict):
    type: Literal["new_game"]
    gameId: str
    wplayer: str
    bplayer: str


class AnalysisBoardMessage(TypedDict):
    type: Literal["analysis_board"]
    gameId: str
    fen: str
    ply: int
    lastMove: str
    check: bool


class JieqiCaptureMoveMessage(TypedDict):
    type: Literal["move"]
    gameId: str
    move: str
    jieqiCapture: str


class LobbyUserConnectedMessage(TypedDict):
    type: Literal["lobby_user_connected"]
    username: str


class AutoPairingStatusMessage(TypedDict):
    type: Literal["auto_pairing_on", "auto_pairing_off"]


class GameInProgressMessage(TypedDict):
    type: Literal["game_in_progress"]
    gameId: str


class InviteCreatedMessage(TypedDict):
    type: Literal["invite_created"]
    gameId: str


class BotChallengeCreatedMessage(TypedDict):
    type: Literal["bot_challenge_created"]
    gameId: str


class HostCreatedMessage(TypedDict):
    type: Literal["host_created"]
    gameId: str


class SpotlightsMessage(TypedDict):
    type: Literal["spotlights"]
    items: list[TournamentSpotlightItem]


class StreamsMessage(TypedDict):
    type: Literal["streams"]
    items: list[StreamInfo]


class UserPresenceMessage(TypedDict):
    type: Literal["user_present", "user_disconnected"]
    username: str


class FullChatMessage(TypedDict):
    type: Literal["fullchat"]
    lines: Sequence[ChatLine]


class SpectatorsMessage(TypedDict):
    type: Literal["spectators"]
    spectators: str


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


class MoveMessage(MoveData):
    type: Literal["move"]


class BughouseMoveMessage(BughouseMoveData):
    type: Literal["move"]


class ReconnectMessage(TypedDict):
    type: Literal["reconnect"]
    movesQueued: NotRequired[list[BughouseMoveData | None]]


class BerserkMessage(TypedDict):
    type: Literal["berserk"]
    color: str


class AnalysisMoveMessage(TypedDict):
    type: Literal["analysis_move"]
    move: str
    fen: str
    ply: int


class ReadyMessage(TypedDict):
    type: Literal["ready"]
    gameId: str


class BoardMessage(TypedDict):
    type: Literal["board"]
    gameId: str


class SetupMessage(TypedDict):
    type: Literal["setup"]
    gameId: str
    color: str
    fen: str


class SetupResponse(TypedDict):
    type: Literal["setup"]
    color: str
    fen: str


class AnalysisMessage(TypedDict):
    type: Literal["analysis"]
    gameId: str
    username: str


class RematchMessage(TypedDict):
    type: Literal["rematch"]
    gameId: str
    handicap: bool


class RematchOfferMessage(TypedDict):
    type: Literal["rematch_offer"]
    username: str
    message: str
    room: str
    user: str


class RematchRejectedMessage(TypedDict):
    type: Literal["rematch_rejected"]
    message: str


class ViewRematchMessage(TypedDict):
    type: Literal["view_rematch"]
    gameId: str


class RejectRematchMessage(TypedDict):
    type: Literal["reject_rematch"]
    gameId: NotRequired[str]


class DrawMessage(TypedDict):
    type: Literal["draw"]
    gameId: str


class RejectDrawMessage(TypedDict):
    type: Literal["reject_draw"]
    gameId: NotRequired[str]


class ByoyomiMessage(TypedDict):
    type: Literal["byoyomi"]
    color: str
    period: int


class TakebackMessage(TypedDict):
    type: Literal["takeback"]
    gameId: NotRequired[str]


class AbortResignMessage(TypedDict):
    type: Literal["abort", "resign", "abandon", "flag"]
    gameId: str


class EmbedUserConnectedMessage(TypedDict):
    type: Literal["embed_user_connected"]


class IsUserPresentMessage(TypedDict):
    type: Literal["is_user_present"]
    username: str


class MoreTimeRequest(TypedDict):
    type: Literal["moretime"]
    gameId: str


class BugRoundChatMessage(TypedDict):
    type: Literal["bugroundchat"]
    gameId: str
    message: str
    room: str


class RoundChatMessage(TypedDict):
    type: Literal["roundchat"]
    gameId: str
    message: str
    room: str


class LeaveMessage(TypedDict):
    type: Literal["leave"]
    gameId: str


class UpdateTVMessage(TypedDict):
    type: Literal["updateTV"]
    gameId: str
    profileId: NotRequired[str]


class CountMessage(TypedDict):
    type: Literal["count"]
    gameId: NotRequired[str]
    mode: Literal["start", "stop"]


class CountResponse(TypedDict):
    type: Literal["count"]
    message: str
    room: str
    user: str


class RequestAnalysisMessage(TypedDict):
    type: Literal["request_analysis"]


class DeleteMessage(TypedDict):
    type: Literal["delete"]
    gameId: str


class DeletedMessage(TypedDict):
    type: Literal["deleted"]


RoundInboundMessage = (
    MoveMessage
    | BughouseMoveMessage
    | ReconnectMessage
    | BerserkMessage
    | AnalysisMoveMessage
    | ReadyMessage
    | BoardMessage
    | SetupMessage
    | AnalysisMessage
    | RematchMessage
    | RejectRematchMessage
    | DrawMessage
    | RejectDrawMessage
    | ByoyomiMessage
    | TakebackMessage
    | AbortResignMessage
    | EmbedUserConnectedMessage
    | IsUserPresentMessage
    | MoreTimeRequest
    | BugRoundChatMessage
    | RoundChatMessage
    | LeaveMessage
    | UpdateTVMessage
    | CountMessage
    | DeleteMessage
)


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
