// https://github.com/lichess-org/lila/blob/master/ui/ceval/src/winningChances.ts

import * as cg from 'chessgroundx/types';

interface Eval {
    cp?: number;
    mate?: number;
}

// winning chances for a color
// 1  infinitely winning
// -1 infinitely losing
export function povChances(color: cg.Color, ev: Eval) {
    return toPov(color, evalWinningChances(ev));
}

function toPov(color: cg.Color, diff: number): number {
    return color === 'white' ? diff : -diff;
}

function rawWinningChances(cp: number): number {
    return 2 / (1 + Math.exp(-0.004 * cp)) - 1;
}

function cpWinningChances(cp: number): number {
    return rawWinningChances(Math.min(Math.max(-1000, cp), 1000));
}

function mateWinningChances(mate: number): number {
    const cp = (21 - Math.min(10, Math.abs(mate))) * 100;
    const signed = cp * (mate > 0 ? 1 : -1);
    return rawWinningChances(signed);
}

function evalWinningChances(ev: Eval): number {
    return typeof ev.mate !== 'undefined' ? mateWinningChances(ev.mate) : cpWinningChances(ev.cp!);
}
