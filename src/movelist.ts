import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

import { gearButton, toggleOrientation } from './settings';
import RoundController from './roundCtrl';


export function selectMove (ctrl, ply) {
    console.log("selctMove()", ply);
    const active = document.querySelector('li.move.active');
    if (active) active.classList.remove('active');

    const elPly = document.querySelector(`li.move[ply="${ply}"]`);
    if (elPly) elPly.classList.add('active');

    ctrl.goPly(ply)
    scrollToPly(ctrl);
}

function scrollToPly (ctrl) {
    if (ctrl.steps.length < 9) return;
    const movesEl = document.getElementById('moves') as HTMLElement;
    const plyEl = movesEl.querySelector('li.move.active') as HTMLElement | undefined;

    const movelistblockEl = document.getElementById('movelist-block') as HTMLElement;
    let st: number | undefined = undefined;

    if (ctrl.ply == 0) st = 0;
    else if (ctrl.ply == ctrl.steps.length - 1) st = 99999;
    else if (plyEl) st = plyEl.offsetTop - movelistblockEl.offsetHeight + plyEl.offsetHeight;

    if (typeof st == 'number') {
        if (plyEl && ctrl instanceof RoundController) {
            var isSmoothScrollSupported = 'scrollBehavior' in document.documentElement.style;
            if(isSmoothScrollSupported) {
                plyEl.scrollIntoView({behavior: "smooth", block: "center"});
            } else {
                plyEl.scrollIntoView(false);
            }
        } else {
            console.log("scrollToPly", ctrl.ply, st);
            movelistblockEl.scrollTop = st;
        }
    }
}

export function movelistView (ctrl) {
    ctrl.vgear = gearButton(ctrl);
    var container = document.getElementById('move-controls') as HTMLElement;
    ctrl.moveControls = patch(container, h('div.btn-controls', [
            h('button#flip', { on: { click: () => toggleOrientation(ctrl) } }, [h('i', {props: {title: 'Flip board'}, class: {"icon": true, "icon-refresh": true} } ), ]),
            h('button', { on: { click: () => selectMove(ctrl, 0) } }, [h('i', {class: {"icon": true, "icon-fast-backward": true} } ), ]),
            h('button', { on: { click: () => selectMove(ctrl, Math.max(ctrl.ply - 1, 0)) } }, [h('i', {class: {"icon": true, "icon-step-backward": true} } ), ]),
            h('button', { on: { click: () => selectMove(ctrl, Math.min(ctrl.ply + 1, ctrl.steps.length - 1)) } }, [h('i', {class: {"icon": true, "icon-step-forward": true} } ), ]),
            h('button', { on: { click: () => selectMove(ctrl, ctrl.steps.length - 1) } }, [h('i', {class: {"icon": true, "icon-fast-forward": true} } ), ]),
            ctrl.vgear,
        ])
    );
    if (ctrl instanceof RoundController) {
        return h('div#moves', [h('ol.movelist#movelist')]);
    } else {
        return h('div.anal#moves', [h('ol.movelist#movelist')]);
    }
}

export function updateMovelist (ctrl) {
    var container = document.getElementById('movelist') as HTMLElement;
    const ply = ctrl.steps.length - 1;
    const move = ctrl.steps[ply]['san'];
    const active = document.querySelector('li.move.active');
    if (active) active.classList.remove('active');
    const el = h('li.move', {class: {active: true}, attrs: {ply: ply}, on: { click: () => selectMove(ctrl, ply) }}, move);
    if (ply % 2 == 0) {
        patch(container, h('ol.movelist#movelist', [el]));
    } else {
        patch(container, h('ol.movelist#movelist', [h('li.move.counter', (ply + 1) / 2), el]));
    }
    scrollToPly(ctrl);
}