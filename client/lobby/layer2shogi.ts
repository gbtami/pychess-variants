
import { h } from 'snabbdom';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { patch } from '../document';
import { VARIANTS } from '../variants';
import { goBackToLayer1, variantBoard } from './util';
import { layer3variant } from './layer3';


export function layer2shogi (lobbyCtrl: LobbyController, containerId: string): void {
    const variant = VARIANTS['shogi'];
    const layer2cont = h('div#layer2shogicont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', _('Shogi Variants')),
                variantBoard(variant, variant.startFen),
                h('p.variant-category-description.shogi-desc', _('The Japanese version of chess, which involves drops and promotions.')),
                h('h5#shogil2back', { class: {"icon": true, "icon-reply": true}, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2shogicont') } }, _('Go Back')),
            ]),
        ]),
        h('div.button-grid', [
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'shogi', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['shogi'].icon(false) } }),
                    h('h3', VARIANTS['shogi'].displayName()),
                ]),
                h('p.variant-extra-info', _('Original Shogi')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'minishogi', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['minishogi'].icon(false) } }),
                    h('h3', VARIANTS['minishogi'].displayName()),
                ]),
                h('p.variant-extra-info', _('5x5 Shogi')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'kyotoshogi', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['kyotoshogi'].icon(false) } }),
                    h('h3', VARIANTS['kyotoshogi'].displayName()),
                ]),
                h('p.variant-extra-info', _('5x5, pieces flip each turn')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'dobutsu', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['dobutsu'].icon(false) } }),
                    h('h3', VARIANTS['dobutsu'].displayName()),
                ]),
                h('p.variant-extra-info', _('3x4 game to teach Shogi')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'gorogoroplus', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['gorogoroplus'].icon(false) } }),
                    h('h3', VARIANTS['gorogoroplus'].displayName()),
                ]),
                h('p.variant-extra-info', _('5x6 with Generals')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'torishogi', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['torishogi'].icon(false) } }),
                    h('h3', VARIANTS['torishogi'].displayName()),
                ]),
                h('p.variant-extra-info', _('7x7, Bird Shogi')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'cannonshogi', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['cannonshogi'].icon(false) } }),
                    h('h3', VARIANTS['cannonshogi'].displayName()),
                ]),
                h('p.variant-extra-info', _('Shogi with Cannons')),
            ]),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
