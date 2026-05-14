import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import { Api } from 'chessgroundx/api';
import { Chessground } from 'chessgroundx';

import { uci2LastMove } from '../chess';
import { boardSettings } from '../boardSettings';
import { Variant } from '../variants';

const MAX_PV_HOVER_MOVES = 24;

interface RenderPvSanLineArgs {
    pvLine: string;
    sanBoard: any;
    fullfen: string;
    notationAsObject: any;
    getOrientation: () => cg.Color;
}

export class PvHoverPreview {
    private cg?: Api;
    private rootEl?: HTMLElement;
    private hideTimer?: number;

    constructor(private readonly variant: Variant) {}

    init(pvboxEl: HTMLElement | null, initialFen: string, orientation: cg.Color) {
        if (this.variant.twoBoards || this.cg !== undefined || !pvboxEl) return;

        const rootEl = document.createElement('div');
        rootEl.className = `pv-hover-board ${this.variant.boardFamily} ${this.variant.pieceFamily} ${this.variant.ui.boardMark}`;
        rootEl.style.visibility = 'hidden';

        const boardEl = document.createElement('div');
        boardEl.className = `cg-wrap ${this.variant.board.cg} minitooltip mini`;
        rootEl.appendChild(boardEl);
        pvboxEl.appendChild(rootEl);

        boardSettings.updateScopedBoardStyle(this.variant, boardEl);
        boardSettings.updateScopedPieceStyle(this.variant, boardEl);
        this.cg = Chessground(boardEl, {
            fen: initialFen,
            dimensions: this.variant.board.dimensions,
            coordinates: false,
            viewOnly: true,
            orientation,
            pocketRoles: this.variant.pocket?.roles,
        });
        this.rootEl = rootEl;
    }

    hide() {
        this.clearHideTimer();
        if (this.rootEl) this.rootEl.style.visibility = 'hidden';
    }

    scheduleHide(delayMs = 60) {
        this.clearHideTimer();
        this.hideTimer = window.setTimeout(() => {
            this.hideTimer = undefined;
            if (this.rootEl) this.rootEl.style.visibility = 'hidden';
        }, delayMs);
    }

    onOrientationChange() {
        if (!this.cg) return;
        this.cg.redrawAll();
    }

    renderPvSanLine({
        pvLine,
        sanBoard,
        fullfen,
        notationAsObject,
        getOrientation,
    }: RenderPvSanLineArgs): VNode[] {
        const uciMoves = pvLine.split(' ').filter(Boolean);
        if (uciMoves.length === 0) return [];

        sanBoard.setFen(fullfen);
        const parts = fullfen.split(' ');
        let turn: 'w' | 'b' = parts[1] === 'b' ? 'b' : 'w';
        let moveNumber = parseInt(parts[5] ?? '1', 10);
        if (!Number.isFinite(moveNumber) || moveNumber < 1) moveNumber = 1;

        const rendered: VNode[] = [];
        for (let i = 0; i < uciMoves.length && i < MAX_PV_HOVER_MOVES; i += 1) {
            const uciMove = uciMoves[i];
            if (turn === 'w') {
                rendered.push(h('span.pv-move-number', `${moveNumber}.`));
            } else if (i === 0) {
                rendered.push(h('span.pv-move-number', `${moveNumber}...`));
            }

            const san = sanBoard.sanMove(uciMove, notationAsObject);
            if (san === '' || !sanBoard.push(uciMove)) break;
            const previewFen = sanBoard.fen();
            rendered.push(
                h('span.pv-san-move', {
                    attrs: {
                        'data-fen': previewFen,
                        'data-uci': uciMove,
                    },
                    on: {
                        mouseenter: () => this.show(previewFen, uciMove, getOrientation()),
                    },
                }, san)
            );

            if (turn === 'b') moveNumber += 1;
            turn = turn === 'w' ? 'b' : 'w';
        }

        return rendered;
    }

    private show(fen: string, uci: string, orientation: cg.Color) {
        this.clearHideTimer();
        if (!this.rootEl || !this.cg) return;

        this.cg.set({
            fen,
            lastMove: uci2LastMove(uci),
            orientation,
        });
        this.rootEl.style.visibility = 'visible';
        this.cg.redrawAll();
    }

    private clearHideTimer() {
        if (this.hideTimer === undefined) return;
        window.clearTimeout(this.hideTimer);
        this.hideTimer = undefined;
    }
}
