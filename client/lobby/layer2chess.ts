import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { goBackToLayer1 } from './layer1';


export function layer2chess (assetUrl) {
    const layer2cont = h('div#layer2chesscont.layer-2-container', [
        h('button.layer-2-category generic-variant-info.generic', [
            h('div.layer-two-category-info', [
                h('h4', 'Chess Variants'),
                h('div.generic-image-container', [ h('img', { attrs: { src: assetUrl + "/images/Chess.png" } }) ]),
                h('p.variant-category-description', 'Variants using a basic chess set but with different rules'),
                h('h5#chessl2back', { on: { click: () => goBackToLayer1(assetUrl, 'layer2chesscont') } }, 'Go Back'),
            ]),
        ]),
        h('button.layer-2-category.chess-l2', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/chess.svg" } } ) ]),
                h('h3', 'Chess')
            ]),
        ]),
        h('button.layer-2-category.chess960', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/960.svg" } } ) ]),
                h('h3', 'Chess960')
            ]),
        ]),
        h('button.layer-2-category.placement', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/placement.svg" } } ) ]),
                h('h3', 'Placement')
            ]),
        ]),
        h('button.layer-2-category.crazyhouse', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/Crazyhouse.svg" } } ) ]),
                h('h3', 'Crazyhouse')
            ]),
        ]),
        h('button.layer-2-category.crazyhouse960', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/Crazyhouse960.svg" } } ) ]),
                h('h3', 'Crazyhouse960')
            ]),
        ]),
        h('button.layer-2-category.atomic', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/Atomic.svg" } } ) ]),
                h('h3', 'Atomic')
            ]),
        ]),
        h('button.layer-2-category.atomic960', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/Atomic960.svg" } } ) ]),
                h('h3', 'Atomic960')
            ]),
        ]),
    ]);

    const container = document.getElementById('panel-container') as HTMLElement;
    if (container) patch(container, layer2cont);
}
