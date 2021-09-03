import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';
import { VNode } from "snabbdom/vnode";

import * as cg from 'chessgroundx/types';
import { Chessground } from 'chessgroundx';

import { IVariant } from '../chess';
import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';


export function variantPanels (model): VNode {
    return h('div#panel-container.panel-container', [
        h('div#variantcont.variants-container', [
            h('button#layer1chess.variant-category.chess', { on: { click: () => layer2chess(model, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Chess Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wR', { attrs: {src: model['asset-url'] + '/images/pieces/merida/wR.svg' } }),
                    h('img.wK', { attrs: {src: model['asset-url'] + '/images/pieces/merida/wK.svg' } }),
                    h('img.sliding-pieces.wB', { attrs: {src: model['asset-url'] + '/images/pieces/merida/wB.svg' } }),
                ]),
            ]),
            h('button#layer1fairy.variant-category.fairy', { on: { click: () => layer2fairy(model, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Fairy Piece Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wE', { attrs: {src: model['asset-url'] + '/images/pieces/merida/shako/wE.svg' } }),
                    h('img.wC', { attrs: {src: model['asset-url'] + '/images/pieces/merida/wC.svg' } }),
                    h('img.sliding-pieces.wH', { attrs: {src: model['asset-url'] + '/images/pieces/merida/wH.svg' } }),
                ]),
            ]),
            h('button#layer1army.variant-category.army', { on: { click: () => layer2army(model, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'New Army Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wJ', { attrs: {src: model['asset-url'] + '/images/pieces/shinobi/merida/wJ.svg' } }),
                    h('img.bK', { attrs: {src: model['asset-url'] + '/images/pieces/orda/merida/bK.svg' } }),
                    h('img.sliding-pieces.wD', { attrs: {src: model['asset-url'] + '/images/pieces/empire/merida/wD.svg' } }),
                ]),
            ]),
            h('button#layer1makruk.variant-category.makruk', { on: { click: () => layer2makruk(model, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Makruk Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.mN', { attrs: {src: model['asset-url'] + '/images/pieces/makruk/cambodian/wP.svg' } }),
                    h('img.mK', { attrs: {src: model['asset-url'] + '/images/pieces/makruk/ada/wK.svg' } }),
                    h('img.sliding-pieces.sQ', { attrs: {src: model['asset-url'] + '/images/pieces/sittuyin/Ka_blackred/wP.svg' } }),
                ]),
            ]),
            h('button#layer1shogi.variant-category.shogi', { on: { click: () => layer2shogi(model, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Shogi Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.ONG', { attrs: {src: model['asset-url'] + '/images/pieces/shogi/ctk/0KI.svg' } }),
                    h('img.OGY', { attrs: {src: model['asset-url'] + '/images/pieces/shogi/2kanji/0GY.svg' } }),
                    h('img.sliding-pieces.OKI', { attrs: {src: model['asset-url'] + '/images/pieces/shogi/ctp/0KI.svg' } }),
                ]),
            ]),
            h('button#layer1xiangqi.variant-category.xiangqi', { on: { click: () => layer2xiangqi(model, 'panel-container') } }, [
                h('div.variant-title', [h('h3', 'Xiangqi Variants')]),
                h('div.piece-container', [
                    h('img.sliding-pieces.xC', { attrs: {src: model['asset-url'] + '/images/pieces/xiangqi/ct2/black_cannon2.svg' } }),
                    h('img.xK', { attrs: {src: model['asset-url'] + '/images/pieces/xiangqi/hnz/black_king.svg' } }),
                    h('img.sliding-pieces.jK', { attrs: {src: model['asset-url'] + '/images/pieces/janggi/hanjablue/blue_king.svg' } }),
                ]),
            ]),
        ]),
    ]);
}

export function goBackToLayer1(model: string, containerId: string): void {
    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, variantPanels(model));
}

export function variantBoard(variant: IVariant, fen: string, check: boolean=false, lastMove: cg.Key[] | undefined=undefined): VNode {
    return h(`selection#mainboard.${variant.board}.${variant.piece}`, [
        h(`div.cg-wrap.${variant.cg}`, {
            hook: {
                insert: vnode => {
                    Chessground(vnode.elm as HTMLElement, {
                        fen: fen,
                        turnColor: fen.split(" ")[1] === "b" ? "white" : "black",
                        check: check,
                        lastMove: lastMove,
                        geometry: variant.geometry,
                        coordinates: false,
                        viewOnly: true
                    });
                }
            }
        }),
    ])
}