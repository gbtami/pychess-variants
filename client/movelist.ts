import { h, VNode } from 'snabbdom';

import { boardSettings } from './boardSettings';
import AnalysisController from './analysisCtrl';
import RoundController from './roundCtrl';
import { result } from './profile'
import { Step } from './messages';
import { patch } from './document';

export function selectMove (ctrl: AnalysisController | RoundController, ply: number, plyVari = 0): void {
    ctrl.goPly(ply, plyVari);
    if (plyVari === 0) {
        activatePly(ctrl);
        scrollToPly(ctrl);
    } else {
        activatePlyVari(ply + plyVari);
    }

}

function activatePly (ctrl: AnalysisController | RoundController) {
    const active = document.querySelector('move.active');
    if (active) active.classList.remove('active');

    const elPly = document.querySelector(`move[ply="${ctrl.ply}"]`);
    if (elPly) elPly.classList.add('active');
}

function scrollToPly (ctrl: AnalysisController | RoundController) {
    if (ctrl.steps.length < 9) return;
    const movelistEl = document.getElementById('movelist') as HTMLElement;
    const plyEl = movelistEl.querySelector('move.active') as HTMLElement | null;

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

export function createMovelistButtons (ctrl: AnalysisController | RoundController) {
    const container = document.getElementById('move-controls') as HTMLElement;
    const vari = "plyVari" in ctrl? ctrl.steps[ctrl.plyVari]['vari']: undefined;
    ctrl.moveControls = patch(container, h('div#btn-controls-top.btn-controls', [
        h('button#flip', { on: { click: () => boardSettings.toggleOrientation() } }, [ h('i.icon.icon-refresh') ]),
        h('button', { on: { click: () => selectMove(ctrl, 0) } }, [ h('i.icon.icon-fast-backward') ]),
        h('button', { on: { click: () => { 
            // this line is necessary, but I don't understand why
            ctrl.ply = Math.min(ctrl.ply, "plyVari" in ctrl && ctrl.plyVari > 0 && vari? vari.length - 1 : Number.MAX_VALUE);
            selectMove(ctrl, 
                (ctrl.ply === 0 && "plyVari" in ctrl && ctrl.plyVari > 0) ? ctrl.plyVari : Math.max(ctrl.ply - 1, 0),
                "plyVari" in ctrl ? (ctrl.ply === 0 && ctrl.plyVari > 0) ? 0 : ctrl.plyVari: 0 )
            } 
        } }, [ h('i.icon.icon-step-backward') ]),
        h('button', { on: { click: () => 
            selectMove(ctrl, Math.min(ctrl.ply + 1, ("plyVari" in ctrl && ctrl.plyVari > 0 && vari? vari.length : ctrl.steps.length) - 1), "plyVari" in ctrl? ctrl.plyVari : 0) } },
            [ h('i.icon.icon-step-forward') ]),
        h('button', { on: { click: () => selectMove(ctrl, ctrl.steps.length - 1) } }, [ h('i.icon.icon-fast-forward') ]),
    ]));
}

export function updateMovelist (ctrl: AnalysisController | RoundController, full = true, activate = true, needResult = true) {
    const plyFrom = (full) ? 1 : ctrl.steps.length -1
    const plyTo = ctrl.steps.length;

    const moves: VNode[] = [];
    for (let ply = plyFrom; ply < plyTo; ply++) {
        const move = ctrl.steps[ply].san;
        if (move === null) continue;

        const moveEl = [ h('san', move) ];
        const scoreStr = ctrl.steps[ply]['scoreStr'] ?? '';
        moveEl.push(h('eval#ply' + ply, scoreStr));

        if (ply % 2 !== 0)
            moves.push(h('move.counter', (ply + 1) / 2));

        const el = h('move', {
            class: { active: ((ply === plyTo - 1) && activate) },
            attrs: { ply: ply },
            on: { click: () => selectMove(ctrl, ply) },
        }, moveEl);

        moves.push(el);
        
        if (ctrl.steps[ply]['vari'] !== undefined && "plyVari" in ctrl) {
            const variMoves = ctrl.steps[ply]['vari'];

            if (ply % 2 !== 0) moves.push(h('move', '...'));

            moves.push(h('vari#vari' + ctrl.plyVari,
                variMoves?
                    variMoves.map((x: Step, idx: number) => {
                    const currPly = ctrl.plyVari + idx;
                    const moveCounter = (currPly % 2 !== 0) ? (currPly + 1) / 2 + '. ' : (idx === 0) ? Math.floor((currPly + 1) / 2) + '...' : ' ';
                    return h('vari-move', {
                        attrs: { ply: currPly },
                        on: { click: () => selectMove(ctrl, idx, ctrl.plyVari) },
                        }, [ h('san', moveCounter + x['san']) ]
                    );
                }) : []
            ));

            if (ply % 2 !== 0) {
                moves.push(h('move.counter', (ply + 1) / 2));
                moves.push(h('move', '...'));
            }
        }
    }

    if (ctrl.status >= 0 && needResult) {
        moves.push(h('div#result', result(ctrl.variant, ctrl.status, ctrl.result)));
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
    ctrl.vmovelist = patch(container, h('div#movelist', [h('div#result', result(ctrl.variant, ctrl.status, ctrl.result))]));
    container.scrollTop = 99999;
}
