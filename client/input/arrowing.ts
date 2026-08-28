import { h } from 'snabbdom';
import * as cg from 'chessgroundx/types';

import { GameController } from '@/gameCtrl';
import { chatMessage } from '@/chat';
import { ExtraInput } from './input';
import { patch } from '@/document';
import { _ } from '@/i18n';

const ARROW_KEY = 'a0' as cg.Key;

export class ArrowingInput extends ExtraInput {
    inputState?: undefined | 'move';
    arrowDests: cg.Key[];

    constructor(ctrl: GameController) {
        super(ctrl);
        this.type = 'arrowing';
        this.inputState = undefined;
        this.arrowDests = [];
    }

    private setPlacementActive(active: boolean): void {
        // An Amazons turn is sent as one compound move, but is entered in two
        // stages. While active, the Amazon move exists only on the client and
        // undo() cancels that partial input by restoring the current server ply.
        this.inputState = active ? 'move' : undefined;
        this.ctrl.onArrowingInputStateChange(active);

        const undo = document.getElementById('undo') as HTMLElement | null;
        if (!undo) return;
        patch(
            undo,
            active
                ? h(
                      'button#undo',
                      {
                          on: { click: () => this.ctrl.undo() },
                          props: { title: _('Cancel piece move'), type: 'button' },
                      },
                      [h('i', { class: { icon: true, 'icon-reply': true } })],
                  )
                : h('div#undo'),
        );
    }

    cancel(): void {
        this.setPlacementActive(false);
        this.data = undefined;
        this.arrowDests = [];
    }

    start(piece: cg.Piece, orig: cg.Orig, dest: cg.Key, meta: cg.MoveMetadata): void {
        this.data = { piece, orig, dest, meta };

        if (!this.ctrl.variant.rules.arrowing) {
            this.next('');
            return;
        }

        const firstLeg = orig + dest + ',';
        this.arrowDests = [
            ...new Set(
                this.ctrl
                    .legalMoves()
                    .filter(move => move.startsWith(firstLeg))
                    .map(move => move.slice(-2) as cg.Key),
            ),
        ];

        // The arrow is represented by Fairy-Stockfish's wall/block piece "*".
        // Put a temporary blocker on the off-board a0 square, then let
        // chessground move it to one of the engine-provided legal arrow squares.
        const pieces = this.ctrl.chessground.state.boardState.pieces;
        const firstArrow = ![...pieces.values()].some(boardPiece => boardPiece.role === '_-piece');
        pieces.set(ARROW_KEY, { role: '_-piece', color: piece.color });
        this.setPlacementActive(true);
        this.ctrl.chessground.set({
            turnColor: piece.color,
            movable: {
                dests: new Map([[ARROW_KEY, this.arrowDests]]),
            },
        });
        this.ctrl.chessground.selectSquare(ARROW_KEY, false);

        if (firstArrow) chatMessage('', _('Place the arrow on an empty square.'), 'roundchat');
    }

    onSelect(key: cg.Key): void {
        // During the second leg only an engine-provided arrow destination is
        // meaningful. Chessground normally unselects the temporary off-board
        // arrow when any other square is clicked, so restore that selection and
        // leave the valid arrow targets visible. This makes invalid clicks a
        // no-op instead of escaping arrow-placement mode.
        if (key !== ARROW_KEY && !this.arrowDests.includes(key)) {
            this.ctrl.chessground.set({ selectable: { selected: ARROW_KEY } });
        }
    }

    finish(key: cg.Key): void {
        if (this.arrowDests.includes(key) && this.data) {
            this.ctrl.chessground.state.lastMove = [this.data.orig, this.data.dest, key];
            this.setPlacementActive(false);
            this.next(',' + this.data.dest + key);
            this.arrowDests = [];
        }
    }
}
