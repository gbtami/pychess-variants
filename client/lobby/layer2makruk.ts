import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { goBackToLayer1 } from './layer1';


export function layer2makruk (assetUrl, containerId) {
    const layer2cont = h('div#layer2makrukcont.layer-2-container.fairy-grid.two-grid', [
        h('button.layer-2-category generic-variant-info.generic-makruk', [
            h('div.layer-two-category-info', [
                h('h4', 'Makruk Variants'),
                h('div.generic-image-container.generic-shogi', [ h('img', { attrs: { src: assetUrl + "/images/makruk.png" } }) ]),
                h('p.variant-category-description.makruk-desc', 'Southeast Asian variants, closely related to western Chess.'),
                h('h5#makrukl2back', { on: { click: () => goBackToLayer1(assetUrl, 'layer2makrukcont') } }, 'Go Back'),
            ]),
        ]),
        h('button.layer-2-category.makrukl2', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/makruk.svg" } } ) ]),
                h('h3', 'Makruk'),
            ]),
            h('p.variant-extra-info', 'Thai Chess. Similar to chess but with a different queen and bishop.'),
        ]),
        h('button.layer-2-category.makpong', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/makpong.svg" } } ) ]),
                h('h3', 'Makpong'),
            ]),
            h('p.variant-extra-info', 'Kings cannot move when checked.'),
        ]),
        h('button.layer-2-category.chatrang', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/cambodian.svg" } } ) ]),
                h('h3', 'Ouk Chatrang'),
            ]),
            h('p.variant-extra-info', 'Cambodian Chess. Makruk with an extra king starting move.'),
        ]),
        h('button.layer-2-category.sittuyin', [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/sittuyin.svg" } } ) ]),
                h('h3', 'Sittuyin'),
            ]),
            h('p.variant-extra-info', 'Burmese chess. You may place your starting pieces.'),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
