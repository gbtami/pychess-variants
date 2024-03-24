import * as cg from 'chessgroundx/types';
import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';

import ffishModule, { FairyStockfish, Board, Notation } from 'ffish-es6';

import { boardSettings, BoardController } from '@/boardSettings';
import { CGMove, uci2cg } from '@/chess';
import { PyChessModel } from '@/types';
import { Variant, VARIANTS, notation, moddedVariant } from '@/variants';
import { variantsIni } from '@/variantsIni';

export abstract class ChessgroundController implements BoardController {
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

    ffishPromise: Promise<void | FairyStockfish>;

    constructor(el: HTMLElement, model: PyChessModel, pocket0: HTMLElement, pocket1: HTMLElement) {
        this.home = model.home;

        this.variant = VARIANTS[model.variant];
        this.chess960 = model.chess960 === 'True';
        this.hasPockets = !!this.variant.pocket;
        this.anon = model.anon === 'True';
        this.mycolor = 'white';
        this.oppcolor = 'black';
        this.fullfen = model.fen as string;
        this.notation = notation(this.variant);

        const parts = this.fullfen.split(" ");
        const fen_placement: cg.FEN = parts[0];

        this.chessground = Chessground(el, {
            fen: fen_placement as cg.FEN,
            dimensions: this.variant.board.dimensions,
            notation: this.notation,
            addDimensionsCssVarsTo: document.body,
            kingRoles: this.variant.kingRoles,
            pocketRoles: this.variant.pocket?.roles,
        }, pocket0, pocket1);

        boardSettings.ctrl = this;
        boardSettings.assetURL = model.assetURL;
        const boardFamily = this.variant.boardFamily;
        const pieceFamily = this.variant.pieceFamily;
        boardSettings.updateBoardStyle(boardFamily);
        boardSettings.updatePieceStyle(pieceFamily);
        boardSettings.updateZoom(boardFamily);
        boardSettings.updateBlindfold();
        console.time('load ffish ' + (el.parentNode! as HTMLElement).id!);
        this.ffishPromise = ffishModule().then((loadedModule: any) => {
            console.timeEnd('load ffish ' + (el.parentNode! as HTMLElement).id!);
            this.ffish = loadedModule;
            this.ffish.loadVariantConfig(variantsIni);
            this.notationAsObject = this.notation2ffishjs(this.notation);
            this.ffishBoard = new this.ffish.Board(
                moddedVariant(this.variant.name, this.chess960, this.chessground.state.boardState.pieces, parts[2]),
                this.fullfen,
                this.chess960);

            window.addEventListener('beforeunload', () => this.ffishBoard.delete());
        });
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
