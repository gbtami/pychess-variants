import { Ceval } from "./messages";

export interface MsgAnalysisBoard {
    gameId: string;
    fen: string;
    ply: number;
    lastMove: string;
    bikjang: boolean;
    check: boolean;
}

export interface MsgAnalysis {
    type: string;
    ply: number;
    ceval: Ceval;
    color: string;
}
