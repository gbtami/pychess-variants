import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { goBackToLayer1 } from './layer1';


export function layer2fairy (assetUrl) {
    const layer2cont = h('div#layer2fairycont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', 'Fairy piece Variants'),
                h('div.generic-image-container.fourarmykings', [ h('img', { attrs: { src: assetUrl + "/images/4FairyPieces.svg" } }) ]),
                h('p.variant-category-description', 'These variants have new pieces to try! Many of them have larger boards, and some also have new rules.'),
                h('p.variant-category-description', [
                    'Several have random ',
                    h('img', { attrs: { src: assetUrl + '/icons/960.svg' } }),
                    'and drop ',
                    h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse.svg' } }),
                    'variants.'
                ]),
                h('h5#fairyl2back', { on: { click: () => goBackToLayer1(assetUrl, 'layer2fairycont') } }, 'Go Back'),
            ]),
        ]),
        h('button.layer-2-category.capablanca', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/capablanca.svg" } } ) ]),
                h('h3', 'Capablanca'),
            ]),
            h('div.option-icon-container', [
                h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse.svg' } }),
                h('img', { attrs: { src: assetUrl + '/icons/960.svg' } }),
                h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse960.svg' } }),
            ]),
            h('p.variant-extra-info', 'Knight Hybrid Pieces'),
        ]),
        h('button.layer-2-category.schess', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/schess.svg" } } ) ]),
                h('h3', 'S-Chess'),
            ]),
            h('div.option-icon-container', [
                h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse.svg' } }),
                h('img', { attrs: { src: assetUrl + '/icons/960.svg' } }),
            ]),
            h('p.variant-extra-info', '8x8 with new pieces'),
        ]),
        h('button.layer-2-category.shako', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/shako.svg" } } ) ]),
                h('h3', 'Shako'),
            ]),
            h('p.variant-extra-info', 'Cannon and Elephant from Xiangqi'),
        ]),
        h('button.layer-2-category.grand', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/grand.svg" } } ) ]),
                h('h3', 'Grand'),
            ]),
            h('div.option-icon-container', [
                h('img', { attrs: { src: assetUrl + '/icons/Crazyhouse.svg' } }),
            ]),
            h('p.variant-extra-info', '10x10 with new pieces'),
        ]),
        h('button.layer-2-category.shogun', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/shogun.svg" } } ) ]),
                h('h3', 'Shogun'),
            ]),
            h('p.variant-extra-info', 'Crazyhouse with promotions'),
        ]),
        h('button.layer-2-category.hoppelpoppel', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/Hoppelpoppel.svg" } } ) ]),
                h('h3', 'Hoppelpoppel'),
            ]),
            h('p.variant-extra-info', 'Bishops and Knights swap moves'),
        ]),
    ]);

    const container = document.getElementById('panel-container') as HTMLElement;
    if (container) patch(container, layer2cont);
}
