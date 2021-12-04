// TODO: This files contains types related almost entirely only to web socket messages, and ONLY those that are used in more than one different places (.ts files)
//       Other such (message) types which are specific only to single file/page and never re-used in multiple places exist in their corresponding files.
//       Would be good to review the types here and those other types in each specific file (e.g. roundCtrl.ts, analysisCtrl.ts, editorCtrl.ts, tournament.ts, lobby.ts)
//       and see if there is any duplication or the ones that are here should be split or any other improvement that might be needed or better organization can be found
import * as cg from "chessgroundx/types";

export interface Step {
    fen: cg.FEN;
    move: string | undefined;
    check: boolean;
    turnColor: cg.Color;

    san?: string;
    analysis?: Ceval;

    ceval?: Ceval;
    scoreStr?: string;

    vari?: Step[];
    sanSAN?: string;

}

export interface CrossTable {
    s1: number;
    s2: number;
    r: string[];
    _id: string;

}

export interface MsgCtable {
    ct: CrossTable
}
export interface MsgGameNotFound {
    gameId: string;
}
export interface MsgShutdown {
    message: string;
}

export interface MsgChat {
    room?: string; // Unlike "roundchat", "lobbychat" messages don't have such property and currently re-using same interface for them as well.
    user: string;
    message: string;
    time?: number;
}

export interface MsgFullChat {
    lines: MsgChat[];
}

export interface MsgBoard {
    gameId: string;
    fen: string;
    ply: number;
    lastMove: string;
    dests: { [orig: string]: cg.Key[] };
    promo: string[];
    bikjang: boolean;
    check: boolean;
    by: string;
    status: number;
    pgn: string;
    uci_usi: string;
    result: string;
    steps: Step[];
    berserk: { w: boolean, b: boolean };

    byo?: number[];
    clocks?: Clocks;
}

export interface Ceval {
    d: number;
    m?: string;
    p?: string;
    s: { cp?: number ; mate?: number};
    k?: number;
}

export interface MsgSpectators {
    spectators: string;
}

export interface MsgUserConnected {
    username: string;
    ply?: number; // used only in roundctrl
    firstmovetime?: number; // used only in roundctrl
}

export interface MsgGameEnd {
    /*"type": "gameEnd"*/
    status: number;
    result: string;
    gameId: string;
    pgn: string;
    ct: CrossTable;
    rdiffs: RDiffs;
}

export interface MsgNewGame {
	gameId: string;
}

export interface Clocks {
    white: number; black: number;
}

export interface RDiffs {
    brdiff: number;
    wrdiff: number;
}

export type MsgMove = { // cannot be interface because canot be converted to an indexed type and JSONObject, which is used in doSend is such
     type: string;//"move"
     gameId: string;
     move: string;
     clocks: { movetime: number; white: number; black: number; }; // looks a lot like Clocks interface, but maybe overkil to reuse it - i dont know
     ply: number;
}

