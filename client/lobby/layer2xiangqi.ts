import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { VARIANTS } from '../chess';
import { goBackToLayer1, variantBoard } from './layer1';
import { layer3variant } from './layer3';


export function layer2xiangqi (model: string, containerId: string): void {
    const variant = VARIANTS['xiangqi'];
    const layer2cont = h('div#layer2xiangqicont.layer-2-container.fairy-grid.two-grid', [
        h('button.layer-2-category generic-variant-info.generic-makruk', [
            h('div.layer-two-category-info', [
                h('h4', 'Xiangqi Variants'),
                variantBoard(variant, variant.startFen),
                h('p.variant-category-description.makruk-desc', 'The ancient game of Chinese Chess and its variants.'),
                h('h5#xiangqil2back', { on: { click: () => goBackToLayer1(model, 'layer2xiangqicont') } }, 'Go Back'),
            ]),
        ]),
        h('button.layer-2-category.makrukl2', { on: { click: () => layer3variant('layer2xiangqicont', model, 'xiangqi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/xiangqi.svg" } } ) ]),
                h('h3', 'Xiangqi'),
            ]),
            h('p.variant-extra-info', 'Chinese Chess, one of the most played games in the world'),
        ]),
        h('button.layer-2-category.chatrang', { on: { click: () => layer3variant('layer2xiangqicont', model, 'janggi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/Janggi.svg" } } ) ]),
                h('h3', 'Janggi'),
            ]),
            h('p.variant-extra-info', 'Korean Chess, based on Xiangqi but much different'),
        ]),
        h('button.layer-2-category.makpong', { on: { click: () => layer3variant('layer2xiangqicont', model, 'minixiangqi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/Minixiangqi.svg" } } ) ]),
                h('h3', 'Minixiangqi'),
            ]),
            h('p.variant-extra-info', 'Compact Xiangqi on a 7x7 board'),
        ]),
        h('button.layer-2-category.sittuyin', { on: { click: () => layer3variant('layer2xiangqicont', model, 'manchu', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/Manchu.svg" } } ) ]),
                h('h3', 'Manchu'),
            ]),
            h('p.variant-extra-info', 'Asymmetric variant with one side having a super piece'),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
