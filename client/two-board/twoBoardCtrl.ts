import { VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';

import { uci2LastMove } from '../chess';
import { Step } from '../messages';
import { PyChessModel } from '../types';
import { Variant, VARIANTS } from '../variants';
import { boardSettings } from '@/boardSettings';
import { ChessgroundController } from '@/cgCtrl';
import { GameControllerBughouse } from './common/gameCtrl';
import { createMovelistButtons } from './common/movelist';

// Shared core of the two bughouse page controllers (RoundControllerBughouse and
// AnalysisControllerBughouse): owns the two boards and the state/logic both need.
// Round-only concerns (socket, clocks, offers, chat) and analysis-only concerns
// (engine, analysis tree, PGN) live in the subclasses.
export abstract class TwoBoardController {
    boardA: GameControllerBughouse;
    boardB: GameControllerBughouse;

    model: PyChessModel;
    gameId: string;
    username: string;
    variant: Variant;
    base: number;
    inc: number;
    status: number;
    result: string;
    readonly home: string;

    steps: Step[];
    ply: number;
    plyA: number = 0;
    plyB: number = 0;

    vmovelist: VNode | HTMLElement;
    moveControls: VNode;
    settings: boolean;

    abstract sendMove: (b: GameControllerBughouse, move: string) => void;
    abstract goPly: (ply: number, plyVari?: number) => void;
    abstract flipBoards: () => void;
    abstract switchBoards: () => void;

    constructor(
        el1: HTMLElement,
        el1Pocket1: HTMLElement,
        el1Pocket2: HTMLElement,
        el2: HTMLElement,
        el2Pocket1: HTMLElement,
        el2Pocket2: HTMLElement,
        model: PyChessModel,
    ) {
        this.model = model;
        this.home = model.home;
        this.gameId = model['gameId'] as string;
        this.username = model['username'];
        this.variant = VARIANTS[model.variant];
        this.base = Number(model['base']);
        this.inc = Number(model['inc']);
        this.status = Number(model['status']);
        this.settings = true;
        this.steps = [];

        this.boardA = new GameControllerBughouse(el1, el1Pocket1, el1Pocket2, 'a', model);
        this.boardB = new GameControllerBughouse(el2, el2Pocket1, el2Pocket2, 'b', model);
        this.boardA.partnerCC = this.boardB;
        this.boardB.partnerCC = this.boardA;
        this.boardA.parent = this;
        this.boardB.parent = this;

        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;
    }

    protected stampStepPlys = (step: Step, idx: number): void => {
        if (idx > 0) {
            //skip first dummy element
            if (step.boardName === 'a') {
                this.plyA++;
            } else {
                this.plyB++;
            }
        }
        step.plyA = this.plyA;
        step.plyB = this.plyB;
        this.steps.push(step);
    };

    protected stepCapture = (step: Step, board: GameControllerBughouse, move: cg.Orig[] | undefined): boolean => {
        if (!move) return false;
        // 960 king takes rook castling is not capture
        // TODO defer this logic to ffish.js
        return (
            (board.chessground.state.boardState.pieces.get(move[1] as cg.Key) !== undefined &&
                step.san?.slice(0, 2) !== 'O-') ||
            step.san?.slice(1, 2) === 'x'
        );
    };

    protected goPlyCore = (step: Step) => {
        const board = step.boardName === 'a' ? this.boardA : this.boardB;

        const fen = step.boardName === 'a' ? step.fen : step.fenB;
        const fenPartner = step.boardName === 'b' ? step.fen : step.fenB;

        const move = step.boardName === 'a' ? uci2LastMove(step.move) : uci2LastMove(step.moveB);
        const movePartner = step.boardName === 'b' ? uci2LastMove(step.move) : uci2LastMove(step.moveB);

        return { board, fen, fenPartner, move, movePartner };
    };
}

export function swap(nodeA: HTMLElement, nodeB: HTMLElement) {
    const parentA = nodeA.parentNode;
    const siblingA = nodeA.nextSibling === nodeB ? nodeA : nodeA.nextSibling;

    // Move `nodeA` to before the `nodeB`
    nodeB.parentNode!.insertBefore(nodeA, nodeB);

    // Move `nodeB` to before the sibling of `nodeA`
    parentA!.insertBefore(nodeB, siblingA);
}

export function switchBoards(ctrl: TwoBoardController) {
    // todo: not sure if best implementation below
    //       it manipulates the DOM directly switching places of elements identified by whether they are
    //       main/second board, instead of keeping info about the switch and rendering boards on elements
    //       called left/right
    let mainboardVNode = document.getElementById('mainboard');
    let mainboardPocket0 = document.getElementById('pocket00');
    let mainboardPocket1 = document.getElementById('pocket01');

    let bugboardVNode = document.getElementById('bugboard');
    let bugboardPocket0 = document.getElementById('pocket10');
    let bugboardPocket1 = document.getElementById('pocket11');

    let a = mainboardVNode!.style.gridArea || 'board';
    mainboardVNode!.style.gridArea = bugboardVNode!.style.gridArea || 'boardPartner';
    bugboardVNode!.style.gridArea = a;

    swap(mainboardPocket0!, bugboardPocket0!);
    swap(mainboardPocket1!, bugboardPocket1!);

    ctrl.boardA.chessground.redrawAll();
    ctrl.boardB.chessground.redrawAll();
}

export function initBoardSettings(b1: ChessgroundController, b2: ChessgroundController, variant: Variant) {
    const boardFamily = variant.boardFamily;
    boardSettings.updateZoom(boardFamily, b1.boardName);
    boardSettings.updateZoom(boardFamily, b2.boardName);
}
