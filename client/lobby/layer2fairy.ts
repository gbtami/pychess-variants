import { h } from 'snabbdom';

import { _ } from '../i18n';
import { VARIANTS } from '../variants';
import { patch } from '../document';
import { LobbyController } from '../lobby';
import { goBackToLayer1 } from './util';
import { layer3variant } from './layer3';


export function layer2fairy (lobbyCtrl: LobbyController, containerId: string): void {
    const assetUrl = lobbyCtrl.assetURL;
    const layer2cont = h('div#layer2fairycont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', _('Fairy Piece Variants')),
                h('div.generic-image-container.fourarmykings', [ h('img', { attrs: { src: assetUrl + "/images/4FairyPieces.svg" } }) ]),
                h('p.variant-category-description', _('These variants have new pieces to try! Many of them have larger boards, and some also have new rules.')),
                h('h5#fairyl2back', { class: {"icon": true, "icon-reply": true}, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2fairycont') } }, _('Go Back')),
            ]),
        ]),
        h('div.button-grid', [
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'capablanca', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['capablanca'].icon(false) } }),
                    h('h3', VARIANTS['capablanca'].displayName()),
                ]),
//                h('p.variant-extra-info', _('Knight hybrid pieces')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'capablanca', true) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['capablanca'].icon(true) } }),
                    h('h3', VARIANTS['capablanca'].displayName(true)),
                ]),
//                h('p.variant-extra-info', _('Knight hybrid pieces + 960')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'capahouse', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['capahouse'].icon(false) } }),
                    h('h3', VARIANTS['capahouse'].displayName()),
                ]),
//                h('p.variant-extra-info', _('Knight hybrid pieces + zh')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'capahouse', true) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['capahouse'].icon(true) } }),
                    h('h3', VARIANTS['capahouse'].displayName(true)),
                ]),
//                h('p.variant-extra-info', _('Knight hybrid pieces + zh960')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'dragon', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['dragon'].icon(false) } }),
                    h('h3', VARIANTS['dragon'].displayName()),
                ]),
//                h('p.variant-extra-info', _('8x8 with Dragon')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'seirawan', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['seirawan'].icon(false) } }),
                    h('h3', VARIANTS['seirawan'].displayName()),
                ]),
//                h('p.variant-extra-info', _('8x8 with new pieces')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'seirawan', true) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['seirawan'].icon(true) } }),
                    h('h3', VARIANTS['seirawan'].displayName(true)),
                ]),
//                h('p.variant-extra-info', _('8x8 with new pieces + 960')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'shouse', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['shouse'].icon(false) } }),
                    h('h3', VARIANTS['shouse'].displayName()),
                ]),
//                h('p.variant-extra-info', _('8x8 with new pieces + zh')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'shako', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['shako'].icon(false) } }),
                    h('h3', VARIANTS['shako'].displayName()),
                ]),
//                h('p.variant-extra-info', _('Cannon and Elephant from Xiangqi')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'grand', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['grand'].icon(false) } }),
                    h('h3', VARIANTS['grand'].displayName()),
                ]),
//                h('p.variant-extra-info', _('10x10 with new pieces')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'grandhouse', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['grandhouse'].icon(false) } }),
                    h('h3', VARIANTS['grandhouse'].displayName()),
                ]),
//                h('p.variant-extra-info', _('10x10 with new pieces + zh')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'shogun', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['shogun'].icon(false) } }),
                    h('h3', VARIANTS['shogun'].displayName()),
                ]),
//                h('p.variant-extra-info', _('Crazyhouse with promotions')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'hoppelpoppel', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['hoppelpoppel'].icon(false) } }),
                    h('h3', VARIANTS['hoppelpoppel'].displayName()),
                ]),
//                h('p.variant-extra-info', _('Bishops and Knights swap their capture moves')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'mansindam', false) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['mansindam'].icon(false) } }),
                    h('h3', VARIANTS['mansindam'].displayName()),
                ]),
            ]),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
