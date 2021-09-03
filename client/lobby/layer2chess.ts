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

export function layer2chess (model: string, containerId: string): void {
    const variant = VARIANTS['chess'];
    const layer2cont = h('div#layer2chesscont.layer-2-container', [
        h('button.layer-2-category generic-variant-info.generic', [
            h('div.layer-two-category-info', [
                h('h4', 'Chess Variants'),
                variantBoard(variant, variant.startFen),
                h('p.variant-category-description', 'Variants using a basic chess set but with different rules'),
                h('h5#chessl2back', { on: { click: () => goBackToLayer1(model, 'layer2chesscont') } }, 'Go Back'),
            ]),
        ]),
        h('button.layer-2-category.chess-l2', { on: { click: () => layer3variant('layer2chesscont', model, 'chess', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/chess.svg" } } ) ]),
                h('h3', 'Chess')
            ]),
        ]),
        h('button.layer-2-category.chess960', { on: { click: () => layer3variant('layer2chesscont', model, 'chess', true) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/960.svg" } } ) ]),
                h('h3', 'Chess960')
            ]),
        ]),
        h('button.layer-2-category.placement', { on: { click: () => layer3variant('layer2chesscont', model, 'placement', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/placement.svg" } } ) ]),
                h('h3', 'Placement')
            ]),
        ]),
        h('button.layer-2-category.crazyhouse', { on: { click: () => layer3variant('layer2chesscont', model, 'crazyhouse', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/Crazyhouse.svg" } } ) ]),
                h('h3', 'Crazyhouse')
            ]),
        ]),
        h('button.layer-2-category.crazyhouse960', { on: { click: () => layer3variant('layer2chesscont', model, 'crazyhouse', true) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/Crazyhouse960.svg" } } ) ]),
                h('h3', 'Crazyhouse960')
            ]),
        ]),
        h('button.layer-2-category.atomic', { on: { click: () => layer3variant('layer2chesscont', model, 'atomic', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/Atomic.svg" } } ) ]),
                h('h3', 'Atomic')
            ]),
        ]),
        h('button.layer-2-category.atomic960', { on: { click: () => layer3variant('layer2chesscont', model, 'atomic', true) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: model['asset-url'] + "/icons/Atomic960.svg" } } ) ]),
                h('h3', 'Atomic960')
            ]),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
