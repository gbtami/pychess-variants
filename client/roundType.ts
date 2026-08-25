import * as cg from 'chessgroundx/types';

export interface MsgUserDisconnected {
    username: string;
}

export interface MsgUserPresent {
    username: string;
}

export interface MsgMoreTime {
    username: string;
}

export interface MsgDrawOffer {
    message: string;
    username: string;
}

export interface MsgDrawRejected {
    message: string;
}

// Bughouse only, and delivered to the two players on the resigning team alone — never
// broadcast. `username` is the player who asked; their partner is the one who confirms.
export interface MsgResignOffer {
    message: string;
    username: string;
}

export interface MsgResignCancelled {
    message: string;
}

export interface MsgTakebackOffer {
    message: string;
    username: string;
}

export interface MsgTakebackRejected {
    message: string;
}

export interface MsgRematchOffer {
    message: string;
    username: string;
    // Bughouse: every player currently signed up for the rematch. The control's state is
    // read from this rather than from `username`, which only says who moved last.
    offers?: string[];
}

export interface MsgRematchRejected {
    message: string;
    // Bughouse: who is still signed up after this withdrawal.
    offers?: string[];
}

export interface MsgCount {
    message: string;
}

export interface MsgSetup {
    fen: cg.FEN;
    color: cg.Color;
}

export interface MsgGameStart {
    gameId: string;
}

export interface MsgViewRematch {
    gameId: string;
}

export interface MsgUpdateTV {
    gameId: string;
}

export interface MsgBerserk {
    color: cg.Color;
}
