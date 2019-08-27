import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

import { pocketView } from './pocket';
import { needPockets } from './chess';
import { player } from './player';


function selectMove (ctrl, ply) {
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
    let st: number | undefined = undefined;
    const plyEl = movesEl.querySelector('li.move.active') as HTMLElement | undefined;
    if (ctrl.ply == 0) st = 0;
    else if (ctrl.ply == ctrl.steps.length - 1) st = 99999;
    else {
        if (plyEl) st = plyEl.offsetTop - movesEl.offsetHeight + plyEl.offsetHeight;
    }
    console.log("scrollToPly", ctrl.ply, st);
    if (typeof st == 'number') {
        if (st == 0 || st == 99999) movesEl.scrollTop = st;
        else if (plyEl) {
            var isSmoothScrollSupported = 'scrollBehavior' in document.documentElement.style;
            if(isSmoothScrollSupported) {
                plyEl.scrollIntoView({behavior: "smooth", block: "center"});
            } else {
                plyEl.scrollIntoView(false);
            }
        }
    }
}

// flip
function toggleOrientation (ctrl) {
    ctrl.flip = !ctrl.flip;
    ctrl.chessground.toggleOrientation();

    if (ctrl.variant === "shogi") {
        const color = ctrl.chessground.state.orientation === "white" ? "white" : "black";
        ctrl.setPieces(ctrl.variant, color);
    };
    
    console.log("FLIP");
    if (needPockets(ctrl.variant)) {
        const tmp_pocket = ctrl.pockets[0];
        ctrl.pockets[0] = ctrl.pockets[1];
        ctrl.pockets[1] = tmp_pocket;
        ctrl.vpocket0 = patch(ctrl.vpocket0, pocketView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(ctrl.vpocket1, pocketView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    }

    // TODO: moretime button
    const new_running_clck = (ctrl.clocks[0].running) ? ctrl.clocks[1] : ctrl.clocks[0];
    ctrl.clocks[0].pause(false);
    ctrl.clocks[1].pause(false);

    const tmp_clock = ctrl.clocks[0];
    const tmp_clock_time = tmp_clock.duration;
    ctrl.clocks[0].setTime(ctrl.clocks[1].duration);
    ctrl.clocks[1].setTime(tmp_clock_time);
    if (ctrl.status < 0) new_running_clck.start();

    ctrl.vplayer0 = patch(ctrl.vplayer0, player('player0', ctrl.titles[ctrl.flip ? 1 : 0], ctrl.players[ctrl.flip ? 1 : 0], ctrl.model["level"]));
    ctrl.vplayer1 = patch(ctrl.vplayer1, player('player1', ctrl.titles[ctrl.flip ? 0 : 1], ctrl.players[ctrl.flip ? 0 : 1], ctrl.model["level"]));
}

export function boardStyles (ctrl) {
    document.getElementById('movelist-block')!.style.display = (ctrl.stylesOn) ? 'none' : 'inline-grid';
    document.getElementById('board-styles')!.style.display = (ctrl.stylesOn) ? 'inline-grid': 'none';
}

export function movelistView (ctrl) {
    var container = document.getElementById('move-controls') as HTMLElement;
    ctrl.moveControls = patch(container, h('div.btn-controls', [
            h('button#flip-board', { on: { click: () => toggleOrientation(ctrl) } }, [h('i', {props: {title: 'Flip board'}, class: {"icon": true, "icon-refresh": true} } ), ]),
            h('button#fastbackward', { on: { click: () => selectMove(ctrl, 0) } }, [h('i', {class: {"icon": true, "icon-fast-backward": true} } ), ]),
            h('button#stepbackward', { on: { click: () => selectMove(ctrl, Math.max(ctrl.ply - 1, 0)) } }, [h('i', {class: {"icon": true, "icon-step-backward": true} } ), ]),
            h('button#stepforward', { on: { click: () => selectMove(ctrl, Math.min(ctrl.ply + 1, ctrl.steps.length - 1)) } }, [h('i', {class: {"icon": true, "icon-step-forward": true} } ), ]),
            h('button#fastforward', { on: { click: () => selectMove(ctrl, ctrl.steps.length - 1) } }, [h('i', {class: {"icon": true, "icon-fast-forward": true} } ), ]),
            h('button#gear', { on: { click: () => {ctrl.stylesOn = !ctrl.stylesOn; boardStyles(ctrl); }} }, [h('i', {props: {title: 'Settings'}, class: {"icon": true, "icon-cog": true} } ), ]),
        ])
    );
    return h('div#moves', [h('ol.movelist#movelist')])
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