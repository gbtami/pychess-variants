import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { _ } from '../i18n';
import { VARIANTS } from '../chess';
import { LobbyController } from '../lobby';
import { goBackToLayer1 } from './layer1';
import { layer3variant } from './layer3';


export function layer2fairy (lobbyCtrl: LobbyController, containerId: string): void {
    const assetUrl = lobbyCtrl.model['asset-url'];
    const layer2cont = h('div#layer2fairycont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', 'Fairy piece Variants'),
                h('div.generic-image-container.fourarmykings', [ h('img', { attrs: { src: assetUrl + "/images/4FairyPieces.svg" } }) ]),
                h('p.variant-category-description', _('These variants have new pieces to try! Many of them have larger boards, and some also have new rules.')),
                h('p.variant-category-description', [
                    _('Several have random '),
                    h('img', { attrs: { src: assetUrl + '/icons/960.svg' } }),
                    _(' and drop '),
                    h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse.svg' } }),
                    _(' variants.')
                ]),
                h('h5#fairyl2back', { class: {"icon": true, "icon-reply": true}, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2fairycont') } }, _('Go Back')),
            ]),
        ]),
        h('button.layer-2-category.capablanca', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'capablanca', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['capablanca'].icon(false) } }),
                h('h3', 'Capablanca'),
            ]),
            h('div.option-icon-container', [
                h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse.svg' } }),
                h('img', { attrs: { src: assetUrl + '/icons/960.svg' } }),
                h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse960.svg' } }),
            ]),
            h('p.variant-extra-info', _('Knight hybrid pieces')),
        ]),
        h('button.layer-2-category.schess', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'seirawan', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['seirawan'].icon(false) } }),
                h('h3', 'S-Chess'),
            ]),
            h('div.option-icon-container', [
                h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse.svg' } }),
                h('img', { attrs: { src: assetUrl + '/icons/960.svg' } }),
            ]),
            h('p.variant-extra-info', _('8x8 with new pieces')),
        ]),
        h('button.layer-2-category.shako', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'shako', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['shako'].icon(false) } }),
                h('h3', 'Shako'),
            ]),
            h('p.variant-extra-info', _('Cannon and Elephant from Xiangqi')),
        ]),
        h('button.layer-2-category.grand', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'grand', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['grand'].icon(false) } }),
                h('h3', 'Grand'),
            ]),
            h('div.option-icon-container', [
                h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse.svg' } }),
            ]),
            h('p.variant-extra-info', _('10x10 with new pieces')),
        ]),
        h('button.layer-2-category.shogun', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'shogun', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['shogun'].icon(false) } }),
                h('h3', 'Shogun'),
            ]),
            h('p.variant-extra-info', _('Crazyhouse with promotions')),
        ]),
        h('button.layer-2-category.hoppelpoppel', { on: { click: () => layer3variant('layer2fairycont', lobbyCtrl, 'hoppelpoppel', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['hoppelpoppel'].icon(false) } }),
                h('h3', 'Hoppel-poppel'),
            ]),
            h('p.variant-extra-info', _('Bishops and Knights swap their capture moves')),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
