import * as cg from 'chessgroundx/types';

export interface MsgUserStatus {
    ustatus: string;
}

export interface MsgGetGames {
    rank: number;
    name: string;
    title: string;
    games: TournamentGame[];
    berger: number;
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
    // Game termination status code from server; used to render variant-specific tournament points.
    status?: number;
    unplayedType?: 'bye' | 'late' | 'absent';
    color: string;
    rating: number;
}

export interface MsgTournamentStatus {
    tstatus: number;
    secondsToFinish: number;
    rounds?: number;
    currentRound?: number;
    roundOngoingGames?: number;
    secondsToNextRound?: number;
    manualNextRound?: boolean;
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
    rounds?: number;
    currentRound?: number;
    roundOngoingGames?: number;
    secondsToNextRound?: number;
    manualNextRound?: boolean;
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
    createdBy: string;
    rrRequiresApproval?: boolean;
    rrJoiningClosed?: boolean;
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
    berger: number;
    paused: boolean;
    title: string;
    rating: number;
    points: any[]; // TODO: I am not sure what elements can be in here. most of the time i see 2-element arrays (i think first is the result, second a streak flag or something). But i've seen also string '*' as well and there is that check about isArray that might mean more cases with numeric scalars exist
    fire: number;
    perf: number;
    nbGames: number;
    nbWin: number;
    nbBerserk: number;
    withdrawn?: boolean;
}

export interface TournamentManagePlayer {
    title: string;
    name: string;
    rating: number;
}

export interface MsgError {
    message: string;
}
export interface MsgPing {
    timestamp: string;
}

export interface RRArrangementCell {
    id: string;
    round: number;
    white: string;
    black: string;
    status: string;
    gameId: string;
    inviteId: string;
    challenger: string;
    color: string;
    date: string;
    result?: string;
}

export interface MsgRRArrangements {
    type: string;
    requestedBy: string;
    players: string[];
    matrix: Record<string, Record<string, RRArrangementCell>>;
    completedGames: number;
    totalGames: number;
}

export interface MsgRRManagement {
    type: string;
    requestedBy: string;
    createdBy: string;
    approvalRequired: boolean;
    joiningClosed: boolean;
    pendingPlayers: TournamentManagePlayer[];
    deniedPlayers: TournamentManagePlayer[];
}

export interface MsgRRSettings {
    type: string;
    createdBy: string;
    approvalRequired: boolean;
    joiningClosed: boolean;
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
