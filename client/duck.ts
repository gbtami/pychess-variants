import * as cg from 'chessgroundx/types';

import { uci2cg, UCIMove } from './chess';
import { GameController } from './gameCtrl';

export class DuckInput {
    ctrl: GameController;
    inputState?: 'click' | 'move';
    ducking?: { piece: cg.Piece, orig: cg.Orig, dest: cg.Key, meta: cg.MoveMetadata };
    duckDests: cg.Key[];

    constructor(ctrl: GameController) {
        this.ctrl = ctrl;
        this.inputState = undefined;
    }

    start(piece: cg.Piece, orig: cg.Orig, dest: cg.Key, meta: cg.MoveMetadata): void {
        this.duckDests = (this.ctrl.ffishBoard.legalMoves().split(" ") as UCIMove[]).
            filter(move => move.includes(orig + dest)).
            map(uci2cg).
            map(move => move.slice(-2)) as cg.Key[];

        const pieces = this.ctrl.chessground.state.boardState.pieces
        let duckKey: cg.Key | undefined;
        for (const [k, p] of pieces) {
            if (p.role === '_-piece') {
                duckKey = k;
                break;
            }
        }

        // Automatically move the duck if a king is captured, as the game is already over
        if (meta.captured && this.ctrl.variant.roles.kings.includes(meta.captured.role)) {
            this.ctrl.processInput(piece, orig, dest, meta, ',' + dest + orig, 'duck');
            return;
        }

        this.ducking = { piece, orig, dest, meta };

        if (duckKey === undefined) {
            this.inputState = 'click';
        } else {
            this.ctrl.chessground.state.boardState.pieces.get(duckKey)!.color = piece.color;
            this.ctrl.chessground.set({
                turnColor: piece.color,
                movable: {
                    dests: new Map([[duckKey, this.duckDests]]),
                },
            });
            this.inputState = 'move';
        }
    }

    duckClick(key: cg.Key): void {
        if (this.duckDests.includes(key) && this.ducking) {
            this.ctrl.processInput(this.ducking.piece, this.ducking.orig, this.ducking.dest, this.ducking.meta, ',' + this.ducking.dest + key, 'duck');
            this.inputState = undefined;
            this.ducking = undefined;
        }
    }

    duckMove(_orig: cg.Key, dest: cg.Key): void {
        if (this.ducking) {
            this.ctrl.processInput(this.ducking.piece, this.ducking.orig, this.ducking.dest, this.ducking.meta, ',' + this.ducking.dest + dest, 'duck');
            this.inputState = undefined;
            this.ducking = undefined;
        }
    }
}
