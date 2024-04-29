import * as cg from 'chessgroundx/types';

export interface Post {
    _id: string;
    date: string;
    image:string;
    alt: string;
    title: string;
    subtitle: string;
    author: string;
    atitle: string;
    tags: string[];
}

export interface Stream {
    site: string;
    title: string;
    username: string;
    streamer: string;
}

export interface Spotlight {
    variant: string;
    chess960: boolean;
    nbPlayers: number;
    names: {[key: string]: string};
    startsAt: string;
    tid: string;
}

export interface MsgInviteCreated {
    gameId: string;
}

export interface MsgHostCreated {
    gameId: string;
}

export interface MsgGetSeeks {
    seeks: Seek[]
}

export interface MsgNewGame {
    gameId: string;
}

export interface MsgGameInProgress {
    gameId: string;
}

export interface MsgUserConnected {
    username: string;
}

export interface MsgPing {
    timestamp: string;//TODO: not sure string or number or other - can't find anywhere where this is actually read and not just copied to "pong", where again not read anywhere in python or ts
}

export interface MsgError {
    message: string;
}

export interface MsgShutdown {
    message: string;
}

export interface MsgGameCounter {
    cnt: number;
}
export interface MsgUserCounter {
    cnt: number;
}
export interface MsgStreams {
    items: Stream[];
}

export interface MsgSpotlights {
    items: Spotlight[];
}

export interface Seek {
    user: string;
    variant: string;
    color: string;
    fen: string;
    base: number;
    inc: number;
    byoyomi: number;
    day: number;
    chess960: boolean;
    rated: boolean;

    bot: boolean;
    rating: number;

    seekID: string;

    target: string;
    title: string;
}

export interface TvGame {
    gameId: string;
    variant: string;
    fen: cg.FEN;
    wt: string;
    bt: string;
    w: string;
    b: string;
    wr: string;
    br: string;
    chess960: boolean;
    base: number;
    inc: number;
    byoyomi: number;
    lastMove: string;
}

export type CreateMode = 'createGame' | 'playFriend' | 'playAI' | 'createHost';

export type TcMode = 'real' | 'corr';
