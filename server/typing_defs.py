from __future__ import annotations

from datetime import datetime
from typing import Literal, NotRequired, TypedDict


class PerfGl(TypedDict):
    r: float
    d: float
    v: float


class PerfEntry(TypedDict):
    gl: PerfGl
    la: datetime
    nb: int


PerfMap = dict[str, PerfEntry]
ClockValues = list[int | float]


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
    base: int
    inc: int
    byoyomi: int
    lastMove: str | None


class RatingDiffs(TypedDict):
    brdiff: int | str
    wrdiff: int | str


class GameBoardResponse(TypedDict):
    type: Literal["board"]
    gameId: str
    status: int
    result: str
    fen: str
    lastMove: str | None
    tp: str
    steps: list[dict[str, object]]
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


TournamentPoint = tuple[int, int] | Literal["-"]


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
    startsAt: datetime | None
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
    base: int
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
