import * as cg from 'chessgroundx/types';

import { uci2cg, UCIMove } from '@/chess';
import { GameController } from '@/gameCtrl';
import { ExtraInput } from './input';

export class DuckInput extends ExtraInput {
    inputState?: 'click' | 'move';
    duckDests: cg.Key[];

    constructor(ctrl: GameController) {
        super(ctrl);
        this.type = 'duck';
        this.inputState = undefined;
    }

    start(piece: cg.Piece, orig: cg.Orig, dest: cg.Key, meta: cg.MoveMetadata): void {
        this.data = { piece, orig, dest, meta };

        if (!this.ctrl.variant.rules.duck) {
            this.next('');
            return;
        }

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
        // This assumes each side only has one king in any duck variant
        if (meta.captured && this.ctrl.variant.kingRoles.includes(meta.captured.role)) {
            this.finish(orig as cg.Key);
            return;
        }

        if (duckKey === undefined) {
            this.inputState = 'click';
        } else {
            // Change the duck's color so that it became movable by the player
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

    finish(key: cg.Key): void {
        if (this.duckDests.includes(key) && this.data) {
            this.next(',' + this.data.dest + key);
            this.inputState = undefined;
            this.data = undefined;
        }
    }
}
