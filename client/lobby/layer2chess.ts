import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { VARIANTS } from '../chess';
import { goBackToLayer1, variantBoard } from './layer1';
import { layer3variant } from './layer3';

export function layer2chess (lobbyCtrl: LobbyController, containerId: string): void {
    const chess = VARIANTS['chess'];
    const placement = VARIANTS['placement'];
    const crazyhouse = VARIANTS['crazyhouse'];
    const atomic = VARIANTS['atomic'];
    const layer2cont = h('div#layer2chesscont.layer-2-container', [
        h('button.layer-2-category generic-variant-info.generic', [
            h('div.layer-two-category-info', [
                h('h4', _('Chess Variants')),
                variantBoard(chess, chess.startFen),
                h('p.variant-category-description', _('Variants using a basic chess set but with different rules.')),
                h('h5#chessl2back', { class: {"icon": true, "icon-reply": true}, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2chesscont') } }, _('Go Back')),
            ]),
        ]),
        h('button.layer-2-category.chess-l2', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'chess', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': chess.icon(false) } }),
                h('h3', 'Chess')
            ]),
        ]),
        h('button.layer-2-category.chess960', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'chess', true) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': chess.icon(true) } }),
                h('h3', 'Chess960')
            ]),
        ]),
        h('button.layer-2-category.placement', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'placement', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': placement.icon(false) } }),
                h('h3', 'Placement')
            ]),
        ]),
        h('button.layer-2-category.crazyhouse', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'crazyhouse', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': crazyhouse.icon(false) } }),
                h('h3', 'Crazyhouse')
            ]),
        ]),
        h('button.layer-2-category.crazyhouse960', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'crazyhouse', true) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': crazyhouse.icon(true) } }),
                h('h3', 'Crazyhouse960')
            ]),
        ]),
        h('button.layer-2-category.atomic', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'atomic', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': atomic.icon(false) } }),
                h('h3', 'Atomic')
            ]),
        ]),
        h('button.layer-2-category.atomic960', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'atomic', true) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': atomic.icon(true) } }),
                h('h3', 'Atomic960')
            ]),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
