import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { goBackToLayer1 } from './layer1';
import { layer3variant } from './layer3';


export function layer2army (model: string, containerId: string): void {
    const layer2cont = h('div#layer2armycont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', 'New Army Variants'),
                h('div.generic-image-container.fourarmykings', [ h('img', { attrs: { src: model['asset-url'] + "/images/4ArmyKings.svg" } }) ]),
                h('p.variant-category-description', 'These variants have new armies with completely new pieces! Most of these variants pit these armies against the standard Chess army.'),
                h('h5#armyl2back', { on: { click: () => goBackToLayer1(model, 'layer2armycont') } }, 'Go Back'),
            ]),
        ]),
        h('button.layer-2-category.capablanca', { on: { click: () => layer3variant('layer2armycont', model, 'orda', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/orda.svg" } } ) ]),
                h('h3', 'Orda'),
            ]),
            h('p.variant-extra-info', 'Horde: Horse-based army'),
        ]),
        h('button.layer-2-category.schess', { on: { click: () => layer3variant('layer2armycont', model, 'empire', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/empire.svg" } } ) ]),
                h('h3', 'Empire'),
            ]),
            h('p.variant-extra-info', 'Empire: Queen-based army'),
        ]),
        h('button.layer-2-category.shako', { on: { click: () => layer3variant('layer2armycont', model, 'ordamirror', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/ordamirror.svg" } } ) ]),
                h('h3', 'Orda Mirror'),
            ]),
            h('p.variant-extra-info', 'Horde vs Horde'),
        ]),
        h('button.layer-2-category.grand', { on: { click: () => layer3variant('layer2armycont', model, 'shinobi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/shinobi.svg" } } ) ]),
                h('h3', 'Shinobi'),
            ]),
            h('p.variant-extra-info', 'Clan: Drop-based army'),
        ]),
        h('button.layer-2-category.shogun', { on: { click: () => layer3variant('layer2armycont', model, 'synochess', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/synochess.svg" } } ) ]),
                h('h3', 'Synochess'),
            ]),
            h('p.variant-extra-info', 'Dynasty: Xiangqi-based army'),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
