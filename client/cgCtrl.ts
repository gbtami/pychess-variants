//import { VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';

import ffishModule from 'ffish-es6';

import { Variant, VARIANTS, notation } from './chess';
import { boardSettings, IBoardController } from './boardSettings';
import { PyChessModel } from './types';
import { variantsIni } from './variantsIni';

export abstract class ChessgroundController implements IBoardController {
    readonly home: string;

    chessground: Api;
    ffish: any;
    ffishBoard: any;
    notationAsObject: any;

    readonly variant : Variant;
    readonly chess960 : boolean;
    readonly hasPockets: boolean;
    readonly anon: boolean;
    mycolor: cg.Color;
    oppcolor: cg.Color;

    fullfen: string;
    notation: cg.Notation;

    constructor(el: HTMLElement, model: PyChessModel) {
        this.home = model.home;

        this.variant = VARIANTS[model.variant];
        this.chess960 = model.chess960 === 'True';
        this.hasPockets = this.variant.pocket;
        this.anon = model.anon === 'True';
        this.mycolor = 'white';
        this.oppcolor = 'black';
        this.fullfen = model.fen as string;
        this.notation = notation(this.variant);

        const pocket0 = document.getElementById('pocket0') as HTMLElement;
        const pocket1 = document.getElementById('pocket1') as HTMLElement;

        const parts = this.fullfen.split(" ");
        const fen_placement: cg.FEN = parts[0];

        this.chessground = Chessground(el, {
            fen: fen_placement as cg.FEN,
            variant: this.variant.name as cg.Variant,
            geometry: this.variant.geometry,
            notation: this.notation,
            addDimensionsCssVars: true,
            pocketRoles: this.variant.pocketRoles.bind(this.variant),
        }, pocket0, pocket1);

        boardSettings.ctrl = this;
        boardSettings.assetURL = model.assetURL;
        const boardFamily = this.variant.board;
        const pieceFamily = this.variant.piece;
        boardSettings.updateBoardStyle(boardFamily);
        boardSettings.updatePieceStyle(pieceFamily);
        boardSettings.updateZoom(boardFamily);
        boardSettings.updateBlindfold();

        new ffishModule().then((loadedModule: any) => {
            this.ffish = loadedModule;
            this.ffish.loadVariantConfig(variantsIni);
            this.notationAsObject = this.notation2ffishjs(this.notation);
            this.ffishBoard = new this.ffish.Board(this.variant.name, this.fullfen, this.chess960);
            window.addEventListener('beforeunload', () => this.ffishBoard.delete());
        });
    }

    toggleOrientation() {
        this.chessground.toggleOrientation();
    }

    flipped() {
        return this.chessground.state.orientation === 'black';
    }

    notation2ffishjs = (n: cg.Notation) => {
        switch (n) {
            case cg.Notation.ALGEBRAIC: return this.ffish.Notation.SAN;
            case cg.Notation.SHOGI_ARBNUM: return this.ffish.Notation.SHOGI_HODGES_NUMBER;
            case cg.Notation.JANGGI: return this.ffish.Notation.JANGGI;
            case cg.Notation.XIANGQI_ARBNUM: return this.ffish.Notation.XIANGQI_WXF;
            default: return this.ffish.Notation.SAN;
        }
    }
}
