import * as cg from 'chessgroundx/types';
import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';

import { FairyStockfish, Board, Notation } from 'ffish-es6';

import { boardSettings, BoardController } from '@/boardSettings';
import { CGMove, uci2cg } from '@/chess';
import { BoardName, PyChessModel } from '@/types';
import { Variant, VARIANTS, moddedVariant } from '@/variants';

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

        const parts = this.fullfen.split(" ");
        const fen_placement: cg.FEN = parts[0];

        this.chessground = Chessground(el, {
            fen: fen_placement as cg.FEN,
            dimensions: this.variant.board.dimensions,
            notation: this.notation,
            addDimensionsCssVarsTo: document.body,
            dimensionsCssVarsSuffix: this.boardName,
            kingRoles: this.variant.kingRoles,
            pocketRoles: this.variant.pocket?.roles,
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
