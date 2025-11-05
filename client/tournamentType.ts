import * as cg from 'chessgroundx/types';

export interface MsgUserStatus {
    ustatus: string;
}

export interface MsgGetGames {
    rank: number;
    name: string;
    title: string;
    games: TournamentGame[];
    perf: number;
    nbWin: number;
    nbGames: number;
    nbBerserk: number;
}

export interface TournamentGame {
    gameId: string;
    title: string;
    name: string;
    result: string;
    color: string;
    rating: number;
}

export interface MsgTournamentStatus {
    tstatus: number;
    secondsToFinish: number;
    nbPlayers: number;
    sumRating: number;
    nbGames: number;
    wWin: number;
    bWin: number;
    draw: number;
    berserk: number;
}

export interface MsgUserConnectedTournament {
    tsystem: number;
    tminutes: number;
    frequency: string;
    startsAt: string;
    startFen: cg.FEN;

    username: string;
    ustatus: string;
    urating: number;
    tstatus: number;
    description: string;
    defender_name: string;
    defender_title: string;
    secondsToStart: number;
    secondsToFinish: number;
    chatClosed: boolean;
    private: boolean;
}

export interface MsgGetPlayers {
    page: number;
    requestedBy: string;
    nbPlayers: number;
    nbGames: number;

    players: TournamentPlayer[];
    podium?: TournamentPlayer[];
}

export interface TournamentPlayer {
    name: string;
    score: number;
    paused: boolean;
    title: string;
    rating: number;
    points: any[]; // TODO: I am not sure what elements can be in here. most of the time i see 2-element arrays (i think first is the result, second a streak flag or something). But i've seen also string '*' as well and there is that check about isArray that might mean more cases with numeric scalars exist
    fire: number;
    perf: number;
    nbGames: number;
    nbWin: number;
    nbBerserk: number;
}

export interface MsgError {
    message: string;
}
export interface MsgPing {
    timestamp: string;
}

export interface TopGame {
    gameId: string;
    variant: string;
    fen: cg.FEN;
    w: string;
    b: string;
    wr: number;
    br: number;
    chess960: boolean;
    base: number;
    inc: number;
    byoyomi: number;
    lastMove: string;
}
