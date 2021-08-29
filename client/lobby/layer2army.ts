import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { goBackToLayer1 } from './layer1';


export function layer2army (assetUrl) {
    const layer2cont = h('div#layer2armycont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', 'New Army Variants'),
                h('div.generic-image-container.fourarmykings', [ h('img', { attrs: { src: assetUrl + "/images/4ArmyKings.svg" } }) ]),
                h('p.variant-category-description', 'These variants have new armies with completely new pieces! Most of these variants pit these armies against the standard Chess army.'),
                h('h5#armyl2back', { on: { click: () => goBackToLayer1(assetUrl, 'layer2armycont') } }, 'Go Back'),
            ]),
        ]),
        h('button.layer-2-category.capablanca', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/orda.svg" } } ) ]),
                h('h3', 'Orda'),
            ]),
            h('p.variant-extra-info', 'Horde: Horse-based army'),
        ]),
        h('button.layer-2-category.schess', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/empire.svg" } } ) ]),
                h('h3', 'Empire'),
            ]),
            h('p.variant-extra-info', 'Empire: Queen-based army'),
        ]),
        h('button.layer-2-category.shako', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/ordamirror.svg" } } ) ]),
                h('h3', 'Orda Mirror'),
            ]),
            h('p.variant-extra-info', 'Horde vs Horde'),
        ]),
        h('button.layer-2-category.grand', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/shinobi.svg" } } ) ]),
                h('h3', 'Shinobi'),
            ]),
            h('p.variant-extra-info', 'Clan: Drop-based army'),
        ]),
        h('button.layer-2-category.shogun', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/synochess.svg" } } ) ]),
                h('h3', 'Synochess'),
            ]),
            h('p.variant-extra-info', 'Dynasty: Xiangqi-based army'),
        ]),
    ]);

    const container = document.getElementById('panel-container') as HTMLElement;
    if (container) patch(container, layer2cont);
}
