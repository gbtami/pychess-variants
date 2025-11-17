import { h } from 'snabbdom';
import * as cg from 'chessgroundx/types';

import { GameController } from '@/gameCtrl';
import { chatMessage } from '@/chat';
import { ExtraInput } from './input';
import { patch } from '@/document';
import { _ } from '@/i18n';

export class DuckInput extends ExtraInput {
    inputState?: undefined | 'move';
    duckDests: cg.Key[];

    constructor(ctrl: GameController) {
        super(ctrl);
        this.type = 'duck';
        this.inputState = undefined;
        this.duckDests = [];
    }

    start(piece: cg.Piece, orig: cg.Orig, dest: cg.Key, meta: cg.MoveMetadata): void {
        this.data = { piece, orig, dest, meta };

        if (!this.ctrl.variant.rules.duck) {
            this.next('');
            return;
        }

        this.duckDests = this.ctrl.legalMoves().
            filter(move => move.includes(orig + dest)).
            map(move => move.slice(-2)) as cg.Key[];

        let duckKey: cg.Key | undefined;
        const pieces = this.ctrl.chessground.state.boardState.pieces
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

        const undo = document.getElementById('undo') as HTMLElement;
        if (undo && undo.tagName === 'DIV') {
            patch(undo,
                h('button#undo', { on: { click: () => this.ctrl.undo() }, props: {title: _('Undo')} }, [h('i', {class: {"icon": true, "icon-reply": true } } ), ])
            );
        }

        this.inputState = 'move';
        // When the game starts there is no duck piece on the board
        if (!duckKey) {
            duckKey = 'a0';
            this.ctrl.chessground.state.boardState.pieces.set(duckKey, {role: '_-piece', color: 'white'});
            const message = _('Place the duck on an empty square.');
            chatMessage('', message, "roundchat");
        }
        // Change the duck's color so that it became movable by the player
        this.ctrl.chessground.state.boardState.pieces.get(duckKey)!.color = piece.color;
        this.ctrl.chessground.set({
            turnColor: piece.color,
            movable: {
                dests: new Map([[duckKey, this.duckDests]]),
            },
        });
        this.ctrl.chessground.selectSquare(duckKey, false);
    }

    finish(key: cg.Key): void {
        if (this.duckDests.includes(key) && this.data) {
            this.ctrl.chessground.state.lastMove = [this.data.orig, this.data.dest, key];
            this.next(',' + this.data.dest + key);
            this.inputState = undefined;
            this.data = undefined;
        }
    }
}
