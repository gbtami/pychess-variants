import { h, VNode } from 'snabbdom';

import AnalysisController from './analysisCtrl';
import { result } from '../result'
import { patch } from '../document';
import {RoundController} from "./roundCtrl";

export function selectMove (ctrl: AnalysisController | RoundController, ply: number, plyVari = 0): void {
    // if (ctrl.steps[ply].boardName==='a')
    //     ctrl.b1.goPly(ctrl.steps[ply].plyA!, plyVari);
    // else
    //     ctrl.b2.goPly(ctrl.steps[ply].plyB!, plyVari);
    ctrl.goPly(ply);
    if (plyVari === 0) {
        activatePly(ctrl);
        scrollToPly(ctrl);
    } else {
        activatePlyVari(ply + plyVari);
    }

}

function activatePly (ctrl: AnalysisController | RoundController ) {
    const active = document.querySelector('move-bug.active');
    if (active) active.classList.remove('active');

    const elPly = document.querySelector(`move-bug[ply="${ctrl.ply}"]`);
    if (elPly) elPly.classList.add('active');
}

function scrollToPly (ctrl: AnalysisController | RoundController) {
    if (ctrl.steps.length < 9) return;
    const movelistEl = document.getElementById('movelist') as HTMLElement;
    const plyEl = movelistEl.querySelector('move-bug.active') as HTMLElement | null;

    let st: number | undefined = undefined;

    if (ctrl.ply === 0) st = 0;
    else if (ctrl.ply === ctrl.steps.length - 1) st = 99999;
    else if (plyEl) st = plyEl.offsetTop - movelistEl.offsetHeight / 2 + plyEl.offsetHeight / 2;

    if (st !== undefined)
        movelistEl.scrollTop = st;
}

export function activatePlyVari (ply: number) {
    console.log('activatePlyVari()', ply);
    const active = document.querySelector('vari-move.active');
    if (active) active.classList.remove('active');

    const elPly = document.querySelector(`vari-move[ply="${ply}"]`);
    if (elPly) elPly.classList.add('active');
}

export function createMovelistButtons (ctrl: AnalysisController | RoundController ) {
    const container = document.getElementById('move-controls') as HTMLElement;
    const vari = /*todo;niki;comentout for now "plyVari" in ctrl*/ 1 > 2? ctrl.steps[ctrl.plyVari]['vari']: undefined;
    ctrl.moveControls = patch(container, h('div#btn-controls-top.btn-controls', [
        h('button#flip', { on: { click: () => ctrl.flipBoards() } }, [ h('i.icon.icon-refresh') ]),
        h('button#flip', { on: { click: () => ctrl.switchBoards() } }, [ h('i.icon.icon-refresh') ]),//todo:niki:another icon for switch boards rotated maybe or horizontal arrows
        h('button', { on: { click: () => selectMove(ctrl, 0) } }, [ h('i.icon.icon-fast-backward') ]),
        h('button', { on: { click: () => { 
            // this line is necessary, but I don't understand why
            ctrl.ply = Math.min(ctrl.ply, "plyVari" in ctrl && ctrl.plyVari > 0 && vari? vari.length - 1 : Number.MAX_VALUE);
            selectMove(ctrl, 
                (ctrl.ply === 0 && "plyVari" in ctrl && ctrl.plyVari > 0) ? ctrl.plyVari : Math.max(ctrl.ply - 1, 0),
                "plyVari" in ctrl ? (ctrl.ply === 0 && ctrl.plyVari > 0) ? 0 : ctrl.plyVari: 0 )
            } 
        } }, [ h('i.icon.icon-step-backward') ]),
        h('button', { on: { click: () => selectMove(ctrl, Math.min(ctrl.ply + 1, ("plyVari" in ctrl && ctrl.plyVari > 0 && vari? vari.length : ctrl.steps.length) - 1), "plyVari" in ctrl? ctrl.plyVari : 0) } }, [ h('i.icon.icon-step-forward') ]),
        h('button', { on: { click: () => selectMove(ctrl, ctrl.steps.length - 1) } }, [ h('i.icon.icon-fast-forward') ]),
    ]));
}

export function updateMovelist (ctrl: AnalysisController | RoundController, full = true, activate = true, needResult = true) {
    const plyFrom = (full) ? 1 : ctrl.steps.length -1
    const plyTo = ctrl.steps.length;

    const moves: VNode[] = [];
    let lastColIdx = 0;
    let plyA: number = 0;//maybe make it part of Steps - maybe have some function to calculate these - i feel i will need this logic again somewhere
    let plyB: number = 0;
    for (let ply = plyFrom; ply < plyTo; ply++) {
        const move = ctrl.steps[ply].san;
        if (move === null) continue;

        ctrl.steps[ply].boardName === 'a'? plyA++ : plyB++;

        const colIdx = ctrl.steps[ply].boardName === 'a'? ctrl.steps[ply].turnColor === 'black'/*meaning move was made by white and now black's turn*/? 1 : 2 : ctrl.steps[ply].turnColor === 'black'? 3 : 4 ;
        const countOfEmptyCellsToAdd = colIdx > lastColIdx? colIdx - lastColIdx - 1: 4 + colIdx - lastColIdx - 1;
        for (let i = 0; i<countOfEmptyCellsToAdd;i++) {
            moves.push(h('move-bug.counter'));
            const el = h('move-bug', {});
            moves.push(el);
        }
        lastColIdx = colIdx;

        const moveEl = [ h('san', move) ];
        const scoreStr = ctrl.steps[ply]['scoreStr'] ?? '';
        moveEl.push(h('eval#ply' + ply, scoreStr));

        moves.push(h('move-bug.counter',  Math.floor(ctrl.steps[ply].boardName === 'a'? (plyA + 1) / 2 : (plyB + 1) / 2 ) ) );

        const el = h('move-bug', {
            class: { active: ((ply === plyTo - 1) && activate) },
            attrs: { ply: ply },
            on: { click: () => selectMove(ctrl, ply) },
        }, moveEl);

        moves.push(el);
        
        // if (ctrl.steps[ply]['vari'] !== undefined && "plyVari" in ctrl) {
        //     const variMoves = ctrl.steps[ply]['vari'];
        //
        //     if (ply % 2 !== 0) moves.push(h('move-bug', '...'));
        //
        //     moves.push(h('vari#vari' + ctrl.plyVari,
        //         variMoves?
        //             variMoves.map((x: Step, idx: number) => {
        //             const currPly = ctrl.plyVari + idx;
        //             const moveCounter = (currPly % 2 !== 0) ? (currPly + 1) / 2 + '. ' : (idx === 0) ? Math.floor((currPly + 1) / 2) + '...' : ' ';
        //             return h('vari-move', {
        //                 attrs: { ply: currPly },
        //                 on: { click: () => selectMove(ctrl, idx, ctrl.plyVari) },
        //                 }, [ h('san', moveCounter + x['san']) ]
        //             );
        //         }) : []
        //     ));
        //
        //     if (ply % 4 == 1) {
        //         moves.push(h('move.counter', (ply + 1) / 2));
        //         moves.push(h('move-bug', '...'));
        //     }
        // }
    }

    if (ctrl.status >= 0 && needResult) {
        moves.push(h('div#result', result(ctrl.b1.variant, ctrl.status, ctrl.result)));
    }

    const container = document.getElementById('movelist') as HTMLElement;
    if (full) {
        while (container.lastChild) {
            container.removeChild(container.lastChild);
        }
    }
    ctrl.vmovelist = patch(container, h('div#movelist', moves));

    if (activate) {
        activatePly(ctrl);
        scrollToPly(ctrl);
    }
}

export function updateResult (ctrl: AnalysisController | RoundController) {
    if (ctrl.status < 0) return;

    // Prevent to render it twice
    const resultEl = document.getElementById('result') as HTMLElement;
    if (resultEl) return;

    const container = document.getElementById('movelist') as HTMLElement;
    ctrl.vmovelist = patch(container, h('div#movelist', [h('div#result', result(ctrl.b1.variant, ctrl.status, ctrl.result))]));
    container.scrollTop = 99999;
}
