import { h } from 'snabbdom';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { patch } from '../document';
import { VARIANTS } from '../variants';
import { goBackToLayer1, variantBoard } from './util';
import { layer3variant } from './layer3';

export function layer2chess (lobbyCtrl: LobbyController, containerId: string): void {
    const chess = VARIANTS['chess'];
    const placement = VARIANTS['placement'];
    const crazyhouse = VARIANTS['crazyhouse'];
    const atomic = VARIANTS['atomic'];
    const kingofthehill = VARIANTS['kingofthehill'];
    const duck = VARIANTS['duck'];
    const threecheck = VARIANTS['3check'];
    const layer2cont = h('div#layer2chesscont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', _('Chess Variants')),
                variantBoard(chess, chess.startFen),
                h('p.variant-category-description', _('Variants using a basic chess set but with different rules.')),
                h('h5#chessl2back', { class: {"icon": true, "icon-reply": true}, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2chesscont') } }, _('Go Back')),
            ]),
        ]),
        h('div.button-grid', [
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'chess', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': chess.icon(false) } }),
                    h('h3', VARIANTS['chess'].displayName())
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'chess', true) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': chess.icon(true) } }),
                    h('h3', VARIANTS['chess'].displayName(true))
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'crazyhouse', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': crazyhouse.icon(false) } }),
                    h('h3', VARIANTS['crazyhouse'].displayName())
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'crazyhouse', true) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': crazyhouse.icon(true) } }),
                    h('h3', VARIANTS['crazyhouse'].displayName(true))
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'atomic', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': atomic.icon(false) } }),
                    h('h3', VARIANTS['atomic'].displayName())
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'atomic', true) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': atomic.icon(true) } }),
                    h('h3', VARIANTS['atomic'].displayName(true))
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'kingofthehill', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': kingofthehill.icon(false) } }),
                    h('h3', VARIANTS['kingofthehill'].displayName())
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'kingofthehill', true) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': kingofthehill.icon(true) } }),
                    h('h3', VARIANTS['kingofthehill'].displayName(true))
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, '3check', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': threecheck.icon(false) } }),
                    h('h3', VARIANTS['3check'].displayName())
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, '3check', true) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': threecheck.icon(true) } }),
                    h('h3', VARIANTS['3check'].displayName(true))
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'placement', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': placement.icon(false) } }),
                    h('h3', VARIANTS['placement'].displayName())
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2chesscont', lobbyCtrl, 'duck', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': duck.icon(false) } }),
                    h('h3', VARIANTS['duck'].displayName())
                ]),
            ]),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
