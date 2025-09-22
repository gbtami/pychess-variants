import * as cg from 'chessgroundx/types';
import { Chessground } from 'chessgroundx/chessground';
import { Api } from 'chessgroundx/api';

import { FairyStockfish, Board, Notation } from 'ffish-es6';

import { boardSettings, BoardController } from '@/boardSettings';
import { CGMove, uci2cg } from '@/chess';
import { BoardName, PyChessModel } from '@/types';
import { fogFen, Variant, VARIANTS, moddedVariant } from '@/variants';

type MouchEvent = Event & Partial<MouseEvent & TouchEvent>;

export abstract class ChessgroundController implements BoardController {
    boardName: BoardName;
    readonly home: string;

    chessground: Api;
    ffish: FairyStockfish;
    ffishBoard: Board;
    notationAsObject: Notation;

    readonly variant : Variant;
    readonly chess960 : boolean;
    readonly hasPockets: boolean;
    readonly anon: boolean;
    mycolor: cg.Color;
    oppcolor: cg.Color;

    fullfen: string;
    notation: cg.Notation;
    fog: boolean;

    constructor(el: HTMLElement, model: PyChessModel, fullfen: string, pocket0: HTMLElement, pocket1: HTMLElement, boardName: BoardName = '') {
        this.boardName = boardName;
        this.home = model.home;
        this.ffish = model.ffish;
        this.variant = VARIANTS[model.variant];
        this.chess960 = model.chess960 === 'True';
        this.hasPockets = !!this.variant.pocket;
        this.anon = model.anon === 'True';
        this.mycolor = 'white';
        this.oppcolor = 'black';
        this.fullfen = fullfen;
        this.notation = this.variant.notation;
        this.fog = model.variant === 'fogofwar';

        const parts = this.fullfen.split(" ");
        const fen_placement: cg.FEN = (this.fog) ? fogFen(parts[0]) : parts[0];

        this.chessground = Chessground(el, {
            fen: fen_placement as cg.FEN,
            dimensions: this.variant.board.dimensions,
            notation: this.notation,
            addDimensionsCssVarsTo: document.body,
            dimensionsCssVarsSuffix: this.boardName,
            kingRoles: this.variant.kingRoles,
            pocketRoles: this.variant.pocket?.roles,
            events: { insert: this.onInsert() }
        }, pocket0, pocket1);

        if (this.boardName === 'b') {
            boardSettings.ctrl2 = this;
        } else {
            boardSettings.ctrl = this;
        }
        boardSettings.assetURL = model.assetURL;
        const boardFamily = this.variant.boardFamily;
        const pieceFamily = this.variant.pieceFamily;
        boardSettings.updateBoardStyle(boardFamily);
        boardSettings.updatePieceStyle(pieceFamily);
        boardSettings.updateZoom(boardFamily, '');

        this.notationAsObject = this.notation2ffishjs(this.notation);
        this.ffishBoard = new this.ffish.Board(
            moddedVariant(this.variant.name, this.chess960, this.chessground.state.boardState.pieces, parts[2]),
            this.fullfen,
            this.chess960);
        window.addEventListener('beforeunload', () => this.ffishBoard.delete());
    }

    onInsert = () => {
        return (elements: cg.Elements) => {
            console.log("onInsert()");
            const el = document.createElement('cg-resize');
            elements.container.appendChild(el);

            const startResize = (start: MouchEvent) => {
                start.preventDefault();

                const zoomSettings = boardSettings.getSettings('Zoom', this.variant.boardFamily, this.boardName);
                const sliderEl = document.getElementById('zoom' + this.boardName) as HTMLInputElement;

                const mousemoveEvent = start.type === 'touchstart' ? 'touchmove' : 'mousemove',
                    mouseupEvent = start.type === 'touchstart' ? 'touchend' : 'mouseup',
                    startPos = eventPosition(start)!,
                    initialZoom = zoomSettings.value as number;

                let zoom = initialZoom;

                const resize = (move: MouchEvent) => {
                    const pos = eventPosition(move)!,
                        delta = pos[0] - startPos[0] + pos[1] - startPos[1];

                    zoom = Math.round(Math.min(100, Math.max(0, initialZoom + delta / 10)));

                    zoomSettings.value = zoom;
                    sliderEl.value = zoom.toString();
                    zoomSettings.update();
                };

                document.body.classList.add('resizing');

                document.addEventListener(mousemoveEvent, resize);

                document.addEventListener(
                    mouseupEvent,
                    () => {
                        document.removeEventListener(mousemoveEvent, resize);
                        document.body.classList.remove('resizing');
                    },
                    { once: true },
                );
            };

            el.addEventListener('touchstart', startResize, { passive: false });
            el.addEventListener('mousedown', startResize, { passive: false });
        }
    }

    toggleOrientation(): void {
        this.chessground.toggleOrientation();
    }

    flipped(): boolean {
        return this.chessground.state.orientation === 'black';
    }

    legalMoves(): CGMove[] {
        return this.ffishBoard.legalMoves().split(" ").map(uci2cg) as CGMove[];
    }

    notation2ffishjs(n: cg.Notation): Notation {
        switch (n) {
            case cg.Notation.ALGEBRAIC: return this.ffish.Notation.SAN;
            case cg.Notation.SHOGI_ARBNUM: return this.ffish.Notation.SHOGI_HODGES_NUMBER;
            case cg.Notation.JANGGI: return this.ffish.Notation.JANGGI;
            case cg.Notation.XIANGQI_ARBNUM: return this.ffish.Notation.XIANGQI_WXF;
            default: return this.ffish.Notation.SAN;
        }
    }
}

function eventPosition(e: MouchEvent): [number, number] | undefined {
  if (e.clientX || e.clientX === 0) return [e.clientX, e.clientY!];
  if (e.targetTouches?.[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
  return;
}
