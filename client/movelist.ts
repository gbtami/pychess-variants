import { h, VNode } from 'snabbdom';

import { GameController } from './gameCtrl';
import { result } from './result'
import { Step } from './messages';
import { patch } from './document';

export function selectMove (ctrl: GameController, ply: number, plyVari = 0): void {
    //console.log("selectMove()", ply, plyVari);

    let plyMax = ctrl.steps.length - 1;
    const vari = "plyVari" in ctrl ? ctrl.steps[ctrl.plyVari]['vari']: undefined;
    if (vari && ctrl.plyVari > 0) plyMax = ctrl.plyVari + vari.length - 1;

    if (ply < 0 || ply > plyMax) {
        return
    }

    if (plyVari > 0 && ply < plyVari) {
        // back to the main line
        plyVari = 0;
    }

    ctrl.goPly(ply, plyVari);

    if (plyVari === 0) {
        activatePly(ctrl);
        scrollToPly(ctrl);
    } else {
        activatePlyVari(ply);
    }

}

function activatePly (ctrl: GameController) {
    //console.log('activatePly()', ctrl.ply, ctrl.plyVari);
    const active = document.querySelector('move.active');
    if (active) active.classList.remove('active');

    const elPly = document.querySelector(`move[ply="${ctrl.ply}"]`);
    if (elPly) elPly.classList.add('active');
}

function scrollToPly (ctrl: GameController) {
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
    //console.log('activatePlyVari()', ply);
    const active = document.querySelector('vari-move.active');
    if (active) active.classList.remove('active');

    const elPly = document.querySelector(`vari-move[ply="${ply}"]`);
    if (elPly) elPly.classList.add('active');
}

export function createMovelistButtons (ctrl: GameController) {
    const container = document.getElementById('move-controls') as HTMLElement;
    let buttons = [
        h('button#flip', { on: { click: () => ctrl.toggleOrientation() } }, [ h('i.icon.icon-refresh') ]),
        h('button', { on: { click: () => selectMove(ctrl, 0) } }, [ h('i.icon.icon-fast-backward') ]),
        h('button', { on: { click: () => selectMove(ctrl, ctrl.ply - 1, ctrl.plyVari) } }, [ h('i.icon.icon-step-backward') ]),
        h('button', { on: { click: () => selectMove(ctrl, ctrl.ply + 1, ctrl.plyVari) } }, [ h('i.icon.icon-step-forward') ]),
        h('button', { on: { click: () => selectMove(ctrl, ctrl.steps.length - 1) } }, [ h('i.icon.icon-fast-forward') ]),
    ];
    if ("localEngine" in ctrl) {
        buttons.push(h('button#bars', { on: { click: () => ctrl.toggleSettings() } }, [ h('i.icon.icon-bars') ]));
    }
    
    ctrl.moveControls = patch(container, h('div#btn-controls-top.btn-controls', buttons));
}

export function updateMovelist (ctrl: GameController, full = true, activate = true, needResult = true) {
    const plyFrom = (full) ? 1 : ctrl.steps.length -1
    const plyTo = ctrl.steps.length;

    const moves: VNode[] = [];

    const blackStarts = ctrl.steps[0].turnColor === 'black';
    if (blackStarts && plyFrom === 1) {
        moves.push(h('move.counter', 1));
        moves.push(h('move', '...'));
    }

    for (let ply = plyFrom; ply < plyTo; ply++) {
        const move = ctrl.steps[ply].san;
        if (move === null) continue;

        const whiteMove = ctrl.steps[ply].turnColor === 'black';
        const moveEl = [ h('san', move) ];
        const scoreStr = ctrl.steps[ply]['scoreStr'] ?? '';
        moveEl.push(h('eval#ply' + ply, scoreStr));

        if (whiteMove)
            moves.push(h('move.counter', Math.ceil((ply + 1) / 2)));

        const el = h('move', {
            class: { active: ((ply === plyTo - 1) && activate) },
            attrs: { ply: ply },
            on: { click: () => selectMove(ctrl, ply) },
        }, moveEl);

        moves.push(el);
        
        if (ctrl.steps[ply]['vari'] !== undefined && "plyVari" in ctrl) {
            const variMoves = ctrl.steps[ply]['vari'];

            if (whiteMove) moves.push(h('move', '...'));

            moves.push(h('vari#vari' + ctrl.plyVari,
                variMoves?
                    variMoves.map((x: Step, idx: number) => {
                    const currPly = ctrl.plyVari + idx + ((blackStarts) ? 1 : 0);
                    const moveCounter = (currPly % 2 !== 0) ? (currPly + 1) / 2 + '. ' : (idx === 0) ? Math.floor((currPly + 1) / 2) + '...' : ' ';
                    return h('vari-move', {
                        attrs: { ply: ctrl.plyVari + idx },
                        on: { click: () => selectMove(ctrl, ctrl.plyVari + idx, ctrl.plyVari) },
                        }, [ h('san', moveCounter + x['san']) ]
                    );
                }) : []
            ));

            if (whiteMove) {
                moves.push(h('move.counter', Math.ceil((ply + 1) / 2)));
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

export function updateResult (ctrl: GameController) {
    if (ctrl.status < 0) return;

    // Prevent to render it twice
    const resultEl = document.getElementById('result') as HTMLElement;
    if (resultEl) return;

    const container = document.getElementById('movelist') as HTMLElement;
    ctrl.vmovelist = patch(container, h('div#movelist', [h('div#result', result(ctrl.variant, ctrl.status, ctrl.result))]));
    container.scrollTop = 99999;
}
