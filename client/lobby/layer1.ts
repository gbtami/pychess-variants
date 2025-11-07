import { h, VNode } from 'snabbdom';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';


export function variantPanels (lobbyCtrl: LobbyController): VNode {
    const assetUrl = lobbyCtrl.assetURL;

    return h('div#panel-container.panel-container', [
        h('div#variantcont.variants-container', [
            h('button#layer1chess.variant-category.chess', { on: { click: () => layer2chess(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Chess Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wR', { attrs: {src: assetUrl + '/images/pieces/merida/wR.svg', alt: "" } }),
                    h('img.wK', { attrs: {src: assetUrl + '/images/pieces/merida/wK.svg', alt: "" } }),
                    h('img.sliding-pieces.wB', { attrs: {src: assetUrl + '/images/pieces/merida/wB.svg', alt: "" } }),
                ]),
            ]),
            h('button#layer1fairy.variant-category.fairy', { on: { click: () => layer2fairy(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Fairy Piece Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wE', { attrs: {src: assetUrl + '/images/pieces/merida/shako/wE.svg', alt: "" } }),
                    h('img.wC', { attrs: {src: assetUrl + '/images/pieces/merida/wC.svg', alt: "" } }),
                    h('img.sliding-pieces.wH', { attrs: {src: assetUrl + '/images/pieces/merida/wH.svg', alt: "" } }),
                ]),
            ]),
            h('button#layer1army.variant-category.army', { on: { click: () => layer2army(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('New Army Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wJ', { attrs: {src: assetUrl + '/images/pieces/shinobi/merida/wJ.svg', alt: "" } }),
                    h('img.bK', { attrs: {src: assetUrl + '/images/pieces/orda/merida/bK.svg', alt: "" } }),
                    h('img.sliding-pieces.wD', { attrs: {src: assetUrl + '/images/pieces/empire/merida/wD.svg', alt: "" } }),
                ]),
            ]),
            h('button#layer1makruk.variant-category.makruk', { on: { click: () => layer2makruk(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Makruk Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.mN', { attrs: {src: assetUrl + '/images/pieces/makruk/cambodian/wP.svg', alt: "" } }),
                    h('img.mK', { attrs: {src: assetUrl + '/images/pieces/makruk/ada/wK.svg', alt: "" } }),
                    h('img.sliding-pieces.sQ', { attrs: {src: assetUrl + '/images/pieces/sittuyin/Ka_blackred/wP.svg', alt: "" } }),
                ]),
            ]),
            h('button#layer1shogi.variant-category.shogi', { on: { click: () => layer2shogi(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Shogi Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.ONG', { attrs: {src: assetUrl + '/images/pieces/shogi/ctk/0KI.svg', alt: "" } }),
                    h('img.OGY', { attrs: {src: assetUrl + '/images/pieces/shogi/2kanji/0GY.svg', alt: "" } }),
                    h('img.sliding-pieces.OKI', { attrs: {src: assetUrl + '/images/pieces/shogi/ctp/0KI.svg', alt: "" } }),
                ]),
            ]),
            h('button#layer1xiangqi.variant-category.xiangqi', { on: { click: () => layer2xiangqi(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Xiangqi Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.xC', { attrs: {src: assetUrl + '/images/pieces/xiangqi/ct2/black_cannon2.svg', alt: "" } }),
                    h('img.xK', { attrs: {src: assetUrl + '/images/pieces/xiangqi/hnz/black_king.svg', alt: "" } }),
                    h('img.sliding-pieces.jK', { attrs: {src: assetUrl + '/images/pieces/janggi/hanjablue/blue_king.svg', alt: "" } }),
                ]),
            ]),
        ]),
    ]);
}
