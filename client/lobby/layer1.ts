import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';


export function variantPanels (assetUrl) {
    return h('div#panel-container.panel-container', [
        h('div#variantcont.variants-container', [
            h('button#layer1chess.variant-category.chess', { on: { click: () => layer2chess(assetUrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Chess Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wR', { attrs: {src: assetUrl + '/images/pieces/merida/wR.svg' } }),
                    h('img.wK', { attrs: {src: assetUrl + '/images/pieces/merida/wK.svg' } }),
                    h('img.sliding-pieces.wB', { attrs: {src: assetUrl + '/images/pieces/merida/wB.svg' } }),
                ]),
            ]),
            h('button#layer1fairy.variant-category.fairy', { on: { click: () => layer2fairy(assetUrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Fairy Piece Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wE', { attrs: {src: assetUrl + '/images/pieces/merida/shako/wE.svg' } }),
                    h('img.wC', { attrs: {src: assetUrl + '/images/pieces/merida/wC.svg' } }),
                    h('img.sliding-pieces.wH', { attrs: {src: assetUrl + '/images/pieces/merida/wH.svg' } }),
                ]),
            ]),
            h('button#layer1army.variant-category.army', { on: { click: () => layer2army(assetUrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'New Army Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wJ', { attrs: {src: assetUrl + '/images/pieces/shinobi/merida/wJ.svg' } }),
                    h('img.bK', { attrs: {src: assetUrl + '/images/pieces/orda/merida/bK.svg' } }),
                    h('img.sliding-pieces.wD', { attrs: {src: assetUrl + '/images/pieces/empire/merida/wD.svg' } }),
                ]),
            ]),
            h('button#layer1makruk.variant-category.makruk', { on: { click: () => layer2makruk(assetUrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Makruk Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.mN', { attrs: {src: assetUrl + '/images/pieces/makruk/cambodian/wP.svg' } }),
                    h('img.mK', { attrs: {src: assetUrl + '/images/pieces/makruk/ada/wK.svg' } }),
                    h('img.sliding-pieces.sQ', { attrs: {src: assetUrl + '/images/pieces/sittuyin/Ka_blackred/wP.svg' } }),
                ]),
            ]),
            h('button#layer1shogi.variant-category.shogi', { on: { click: () => layer2shogi(assetUrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Shogi Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.ONG', { attrs: {src: assetUrl + '/images/pieces/shogi/ctk/0KI.svg' } }),
                    h('img.OGY', { attrs: {src: assetUrl + '/images/pieces/shogi/2kanji/0GY.svg' } }),
                    h('img.sliding-pieces.OKI', { attrs: {src: assetUrl + '/images/pieces/shogi/ctp/0KI.svg' } }),
                ]),
            ]),
            h('button#layer1xiangqi.variant-category.xiangqi', { on: { click: () => layer2xiangqi(assetUrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Xiangqi Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.xC', { attrs: {src: assetUrl + '/images/pieces/xiangqi/ct2/black_cannon2.svg' } }),
                    h('img.xK', { attrs: {src: assetUrl + '/images/pieces/xiangqi/hnz/black_king.svg' } }),
                    h('img.sliding-pieces.jK', { attrs: {src: assetUrl + '/images/pieces/janggi/hanjablue/blue_king.svg' } }),
                ]),
            ]),
        ]),
    ]);
}

export function goBackToLayer1(assetUrl, containerId) {
    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, variantPanels(assetUrl));
}
