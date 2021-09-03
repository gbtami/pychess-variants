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


export function layer2fairy (model: string, containerId: string): void {
    const layer2cont = h('div#layer2fairycont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', 'Fairy piece Variants'),
                h('div.generic-image-container.fourarmykings', [ h('img', { attrs: { src: model['asset-url'] + "/images/4FairyPieces.svg" } }) ]),
                h('p.variant-category-description', 'These variants have new pieces to try! Many of them have larger boards, and some also have new rules.'),
                h('p.variant-category-description', [
                    'Several have random ',
                    h('img', { attrs: { src: model['asset-url'] + '/icons/960.svg' } }),
                    'and drop ',
                    h('img', { attrs: { src: model['asset-url'] + '/icons/Crazyhouse.svg' } }),
                    'variants.'
                ]),
                h('h5#fairyl2back', { on: { click: () => goBackToLayer1(model, 'layer2fairycont') } }, 'Go Back'),
            ]),
        ]),
        h('button.layer-2-category.capablanca', { on: { click: () => layer3variant('layer2fairycont', model, 'capablanca', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/capablanca.svg" } } ) ]),
                h('h3', 'Capablanca'),
            ]),
            h('div.option-icon-container', [
                h('img', { attrs: { src: model['asset-url'] + '/icons/Crazyhouse.svg' } }),
                h('img', { attrs: { src: model['asset-url'] + '/icons/960.svg' } }),
                h('img', { attrs: { src: model['asset-url'] + '/icons/Crazyhouse960.svg' } }),
            ]),
            h('p.variant-extra-info', 'Knight Hybrid Pieces'),
        ]),
        h('button.layer-2-category.schess', { on: { click: () => layer3variant('layer2fairycont', model, 'seirawan', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/schess.svg" } } ) ]),
                h('h3', 'S-Chess'),
            ]),
            h('div.option-icon-container', [
                h('img', { attrs: { src: model['asset-url'] + '/icons/Crazyhouse.svg' } }),
                h('img', { attrs: { src: model['asset-url'] + '/icons/960.svg' } }),
            ]),
            h('p.variant-extra-info', '8x8 with new pieces'),
        ]),
        h('button.layer-2-category.shako', { on: { click: () => layer3variant('layer2fairycont', model, 'shako', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/shako.svg" } } ) ]),
                h('h3', 'Shako'),
            ]),
            h('p.variant-extra-info', 'Cannon and Elephant from Xiangqi'),
        ]),
        h('button.layer-2-category.grand', { on: { click: () => layer3variant('layer2fairycont', model, 'grand', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/grand.svg" } } ) ]),
                h('h3', 'Grand'),
            ]),
            h('div.option-icon-container', [
                h('img', { attrs: { src: model['asset-url'] + '/icons/Crazyhouse.svg' } }),
            ]),
            h('p.variant-extra-info', '10x10 with new pieces'),
        ]),
        h('button.layer-2-category.shogun', { on: { click: () => layer3variant('layer2fairycont', model, 'shogun', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/shogun.svg" } } ) ]),
                h('h3', 'Shogun'),
            ]),
            h('p.variant-extra-info', 'Crazyhouse with promotions'),
        ]),
        h('button.layer-2-category.hoppelpoppel', { on: { click: () => layer3variant('layer2fairycont', model, 'hoppelpoppel', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/Hoppelpoppel.svg" } } ) ]),
                h('h3', 'Hoppelpoppel'),
            ]),
            h('p.variant-extra-info', 'Bishops and Knights swap moves'),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
