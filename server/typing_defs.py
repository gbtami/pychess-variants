from __future__ import annotations

from datetime import datetime
from typing import Callable, Literal, Mapping, NotRequired, Sequence, TYPE_CHECKING, TypedDict

if TYPE_CHECKING:
    from user import User


class PerfGl(TypedDict):
    r: float
    d: float
    v: float


class PerfEntry(TypedDict):
    gl: PerfGl
    la: datetime
    nb: int


PerfMap = dict[str, PerfEntry]
ClockValues = Sequence[int | float]


class UserDocument(TypedDict, total=False):
    _id: str
    title: str
    enabled: bool
    perfs: PerfMap
    pperfs: PerfMap
    lang: str
    theme: str
    ct: str
    oauth_id: str
    oauth_provider: str


class RelationDocument(TypedDict):
    u1: str
    u2: str
    r: int


class Crosstable(TypedDict):
    _id: str
    s1: int
    s2: int
    r: list[str]


class UserJson(TypedDict):
    _id: str
    title: str
    online: bool
    simul: bool


class UserStatusJson(TypedDict):
    id: str
    status: bool


class UserBlocksResponse(TypedDict):
    blocks: list[str]


class VideoDoc(TypedDict, total=False):
    _id: str
    category: str
    tags: list[str]


class GameSummaryJson(TypedDict):
    gameId: str
    title: str
    name: str
    rating: int
    color: Literal["w", "b"]
    result: str


class TvGameJson(TypedDict):
    type: Literal["tv_game"]
    gameId: str
    variant: str
    fen: str
    wt: str
    bt: str
    w: str
    b: str
    wr: int | str
    br: int | str
    chess960: bool
    base: int | float
    inc: int
    byoyomi: int
    lastMove: str | None


class RatingDiffs(TypedDict):
    brdiff: int | str
    wrdiff: int | str


class AnalysisStep(TypedDict, total=False):
    s: object
    d: int
    p: str


class GameRatingDoc(TypedDict):
    e: int | str
    d: NotRequired[int | str]


GameDocument = TypedDict(
    "GameDocument",
    {
        "_id": str,
        "us": list[str],
        "v": str,
        "b": int | float,
        "i": int,
        "m": list[str],
        "d": datetime,
        "f": str,
        "s": int,
        "r": str,
        "bp": NotRequired[int],
        "if": NotRequired[str],
        "uci": NotRequired[int],
        "c": NotRequired[bool],
        "x": NotRequired[int],
        "y": NotRequired[int],
        "z": NotRequired[int],
        "tid": NotRequired[str],
        "a": NotRequired[list[AnalysisStep]],
        "cw": NotRequired[list[int]],
        "cb": NotRequired[list[int]],
        "p0": NotRequired[GameRatingDoc],
        "p1": NotRequired[GameRatingDoc],
        "by": NotRequired[str],
        "wd": NotRequired[bool],
        "bd": NotRequired[bool],
        "wb": NotRequired[bool],
        "bb": NotRequired[bool],
        "bj": NotRequired[list[str]],
        "wj": NotRequired[list[str]],
        "l": NotRequired[datetime],
        "mct": NotRequired[list[tuple[int, int]]],
        "ws": NotRequired[bool],
        "bs": NotRequired[bool],
    },
)


class GameStep(TypedDict, total=False):
    fen: str
    move: str
    san: str | None
    turnColor: str
    check: bool
    clocks: ClockValues
    analysis: AnalysisStep


class GameBoardResponse(TypedDict):
    type: Literal["board"]
    gameId: str
    status: int
    result: str
    fen: str
    lastMove: str | None
    tp: str
    steps: list[GameStep]
    check: bool
    ply: int
    clocks: ClockValues
    byo: list[int] | str
    pgn: str
    rdiffs: RatingDiffs | str
    date: str
    uci_usi: str
    ct: Crosstable | str
    berserk: dict[str, bool]
    by: str
    jieqiCaptures: NotRequired[list[str]]
    jieqiCaptureStack: NotRequired[list[str | None]]
    takeback: NotRequired[bool]


class GameEndResponse(TypedDict):
    type: Literal["gameEnd"]
    status: int
    result: str
    gameId: str
    pgn: str
    ct: NotRequired[Crosstable | str]
    rdiffs: NotRequired[RatingDiffs | str]
    jieqiCaptures: NotRequired[list[str]]
    jieqiCaptureStack: NotRequired[list[str | None]]


TournamentPoint = tuple[int | str, int] | Literal["-"]


class FishnetKey(TypedDict):
    apikey: str


class FishnetAcquireFishnet(FishnetKey):
    version: str


class FishnetAcquireStockfish(TypedDict):
    name: str
    nnue: NotRequired[str]


class FishnetAcquirePayload(TypedDict):
    fishnet: FishnetAcquireFishnet
    stockfish: FishnetAcquireStockfish


class FishnetKeyPayload(TypedDict):
    fishnet: FishnetKey


class FishnetAnalysisItem(TypedDict):
    score: object
    depth: NotRequired[int]
    pv: NotRequired[str]


class FishnetAnalysisPayload(TypedDict):
    fishnet: FishnetKey
    analysis: list[FishnetAnalysisItem | None]


class FishnetMoveInfo(TypedDict):
    bestmove: str
    fen: NotRequired[str]


class FishnetMovePayload(TypedDict):
    fishnet: FishnetKey
    move: FishnetMoveInfo


class FishnetAbortPayload(TypedDict):
    fishnet: FishnetKey


class FishnetWorkInfo(TypedDict):
    type: Literal["analysis", "move"]
    id: str
    level: NotRequired[int]


class FishnetWork(TypedDict):
    work: FishnetWorkInfo
    game_id: str
    position: str
    variant: str
    chess960: bool
    moves: str
    nnue: object
    time: NotRequired[float]
    username: NotRequired[str]
    nodes: NotRequired[int]
    skipPositions: NotRequired[list[int]]


class StreamInfo(TypedDict):
    username: str
    streamer: str
    site: str
    title: str


class TwitchOAuthTokenResponse(TypedDict, total=False):
    access_token: str
    expires_in: int
    status: int
    message: str


class TwitchSubscriptionData(TypedDict):
    id: str


class TwitchSubscriptionsResponse(TypedDict):
    data: list[TwitchSubscriptionData]


class TwitchSubscriptionRequestResponse(TypedDict, total=False):
    data: list[TwitchSubscriptionData]
    error: str
    message: str


class TwitchUserData(TypedDict):
    login: str
    id: str


class TwitchUsersResponse(TypedDict):
    data: list[TwitchUserData]


class TwitchStreamData(TypedDict):
    title: str
    user_login: str
    type: str


class TwitchStreamsResponse(TypedDict):
    data: list[TwitchStreamData]


class TwitchWebhookEvent(TypedDict):
    broadcaster_user_login: str
    type: str
    title: NotRequired[str]


class TwitchWebhookPayload(TypedDict):
    event: TwitchWebhookEvent
    challenge: NotRequired[str]


class NotificationContent(TypedDict, total=False):
    id: str
    opp: str
    win: bool | None


class NotificationDocument(TypedDict):
    _id: str
    notifies: str
    type: str
    read: bool
    createdAt: datetime
    expireAt: str
    content: NotificationContent


class ViewContext(TypedDict, total=False):
    user: User
    lang: str
    variant_display_name: Callable[[str], str]
    theme: str
    game_category: str
    game_category_intro: bool
    menu_variant: str
    title: str
    view: str
    view_css: str
    anon: bool
    username: str
    piece_sets: list[str]
    simuling: bool
    gameid: str
    variant: str
    wplayer: str
    wtitle: str
    wrating: str
    wrdiff: int | str
    chess960: bool
    rated: bool | int
    corr: bool
    level: int
    bplayer: str
    btitle: str
    brating: str
    brdiff: int | str
    fen: str
    posnum: int
    base: float
    inc: int
    byo: int
    result: str
    status: int
    date: str | datetime
    ply: int | str
    initialFen: str
    board: str
    wplayerB: str
    wtitleB: str
    wratingB: str
    bplayerB: str
    btitleB: str
    bratingB: str
    variants: Mapping[str, object]
    groups: Mapping[str, str]
    icons: Mapping[str, str]
    pairing_system_name: Callable[[int], str]
    time_control_str: Callable[..., str]
    tables: object
    td: bool
    tournamentid: str
    tournamentname: str
    tournamentcreator: str
    description: str
    before_start: int
    minutes: int
    rounds: int
    frequency: str


class TournamentCreateData(TypedDict):
    name: str
    createdBy: str
    variant: str
    base: float
    inc: int
    system: int
    beforeStart: NotRequired[int]
    minutes: int
    password: NotRequired[str]
    rated: NotRequired[bool]
    chess960: NotRequired[bool]
    bp: NotRequired[int]
    fen: NotRequired[str]
    rounds: NotRequired[int]
    startDate: NotRequired[datetime | None]
    frequency: NotRequired[str]
    description: NotRequired[str]
    createdAt: NotRequired[datetime]
    status: NotRequired[int]
    tid: NotRequired[str]
    with_clock: NotRequired[bool]


class ScheduledTournamentCreateData(TournamentCreateData):
    pass


class TournamentDoc(TypedDict):
    _id: str
    name: str
    password: str
    d: str
    fr: str
    minutes: int
    v: str
    b: float
    i: int
    bp: int
    f: str
    y: int
    z: int
    system: int
    rounds: int
    nbPlayers: int
    cr: NotRequired[int]
    createdBy: str
    createdAt: datetime
    beforeStart: int
    startsAt: datetime
    status: int
    nbGames: NotRequired[int]
    nbBerserk: NotRequired[int]
    winner: NotRequired[str]


class TournamentUpdateData(TypedDict, total=False):
    name: str
    password: str
    d: str
    fr: str
    minutes: int
    v: str
    b: float
    i: int
    bp: int
    f: str
    y: int
    z: int
    system: int
    rounds: int
    nbPlayers: int
    cr: int
    createdBy: str
    createdAt: datetime
    beforeStart: int
    startsAt: datetime | None
    status: int
    nbGames: int
    winner: str
    nbBerserk: int


class TournamentPlayerDoc(TypedDict):
    _id: str
    tid: str
    uid: str
    r: int
    pr: str
    a: bool
    f: int
    s: int
    w: int
    b: int
    e: int
    p: list[TournamentPoint]
    wd: bool


class TournamentPlayerUpdate(TypedDict, total=False):
    _id: str | None
    tid: str
    uid: str
    r: int
    pr: str
    a: bool
    f: int
    s: int
    w: int
    b: int
    e: int
    p: list[TournamentPoint]
    wd: bool


class TournamentPairingDoc(TypedDict):
    _id: str
    tid: str
    u: tuple[str, str]
    r: str
    d: datetime
    wr: str
    br: str
    wb: bool
    bb: bool


class TournamentPairingUpdate(TypedDict, total=False):
    tid: str
    u: tuple[str, str]
    r: str
    d: datetime
    wr: str
    br: str
    wb: bool
    bb: bool


class TournamentPlayerJson(TypedDict):
    paused: bool
    title: str
    name: str
    rating: int
    points: list[TournamentPoint]
    fire: int
    score: int
    perf: int
    nbGames: int
    nbWin: int
    nbBerserk: int


class TournamentPlayersResponse(TypedDict):
    type: Literal["get_players"]
    requestedBy: str
    nbPlayers: int
    nbGames: int
    page: int
    players: list[TournamentPlayerJson]
    podium: NotRequired[list[TournamentPlayerJson]]


class TournamentGameJson(TypedDict):
    gameId: str
    title: str
    name: str
    rating: int | str
    prov: NotRequired[str]
    color: str
    result: str


class TournamentGamesResponse(TypedDict):
    type: Literal["get_games"]
    rank: int
    title: str
    name: str
    perf: int
    nbGames: int
    nbWin: int
    nbBerserk: int
    games: list[TournamentGameJson | GameSummaryJson]


class TournamentTopGameResponse(TypedDict):
    type: Literal["top_game"]
    gameId: str
    variant: str
    fen: str
    w: str
    b: str
    wr: int
    br: int
    chess960: bool
    base: int | float
    inc: int
    byoyomi: int
    lastMove: str | None


class TournamentDuelItem(TypedDict):
    id: str
    wp: str
    wt: str
    wr: int | str
    wk: int | str
    bp: str
    bt: str
    br: int | str
    bk: int | str


class TournamentDuelsResponse(TypedDict):
    type: Literal["duels"]
    duels: list[TournamentDuelItem]


class TournamentStatusResponse(TypedDict):
    type: Literal["tstatus"]
    tstatus: int
    secondsToFinish: NotRequired[float]
    nbPlayers: NotRequired[int]
    nbGames: NotRequired[int]
    wWin: NotRequired[int]
    bWin: NotRequired[int]
    draw: NotRequired[int]
    berserk: NotRequired[int]
    sumRating: NotRequired[int]


class TournamentSpotlightItem(TypedDict):
    tid: str
    names: dict[str, str]
    variant: str
    chess960: bool
    nbPlayers: int
    startsAt: str


class TournamentSpotlightsResponse(TypedDict):
    type: Literal["spotlights"]
    items: list[TournamentSpotlightItem]


class TournamentCalendarEvent(TypedDict):
    title: str
    start: datetime
    end: datetime
    classNames: str
    borderColor: NotRequired[str]
    url: NotRequired[str]
