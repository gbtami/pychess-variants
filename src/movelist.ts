import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

export function movelistView (ctrl) {
    var container = document.getElementById('move-controls') as HTMLElement;
    ctrl.moveControls = patch(container, h('div', [
            h('button#fastbackward', { on: { click: () => ctrl.goPly(0) } }, [h('i', {class: {"icon": true, "icon-fast-backward": true} } ), ]),
            h('button#stepbackward', { on: { click: () => ctrl.goPly(Math.max(ctrl.ply - 1, 0)) } }, [h('i', {class: {"icon": true, "icon-step-backward": true} } ), ]),
            h('button#stepforward', { on: { click: () => ctrl.goPly(Math.min(ctrl.ply + 1, ctrl.steps.length - 1)) } }, [h('i', {class: {"icon": true, "icon-step-forward": true} } ), ]),
            h('button#fastforward', { on: { click: () => ctrl.goPly(ctrl.steps.length - 1) } }, [h('i', {class: {"icon": true, "icon-fast-forward": true} } ), ]),
        ])
    );
    return h('div.moves', [h('ol.movelist#movelist')])
    }

export function updateMovelist (ctrl) {
    var container = document.getElementById('movelist') as HTMLElement;
    const ply = ctrl.steps.length - 1;
    const move = ctrl.steps[ply]['move'];
    patch(container, h('ol.movelist#movelist', [h('li.move', {attrs: {ply: ply}, on: { click: () => ctrl.goPly(ply) }}, move)]));
}