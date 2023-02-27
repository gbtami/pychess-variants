import * as cg from 'chessgroundx/types';

import { GameController } from '@/gameCtrl';

export type InputType = 'gating' | 'promotion' | 'duck';

export abstract class ExtraInput {
    protected readonly ctrl: GameController;
    protected type: InputType;
    protected data?: { piece: cg.Piece, orig: cg.Orig, dest: cg.Key, meta: cg.MoveMetadata };

    constructor(ctrl: GameController) {
        this.ctrl = ctrl;
    }

    abstract start(piece: cg.Piece, orig: cg.Orig, dest: cg.Key, meta: cg.MoveMetadata): void;

    protected next(suffix: string): void {
        if (this.data)
            this.ctrl.processInput(this.data.piece, this.data.orig, this.data.dest, this.data.meta, suffix, this.type);
        this.data = undefined;
    }
}
