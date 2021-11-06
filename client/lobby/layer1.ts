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

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { changeBoardCSS, changePieceCSS } from '../document';
import { BOARD_FAMILIES, PIECE_FAMILIES, Variant } from '../chess';
import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';


export function variantPanels (lobbyCtrl: LobbyController): VNode {
    const assetUrl = lobbyCtrl.model['asset-url'];

    for (const family of Object.keys(BOARD_FAMILIES)) {
        let css: string;
        switch (family) {
            case 'makruk8x8': css = 'makruk.jpg'; break;
            case 'shogi9x9': css = 'ShogiOak.png'; break;
            case 'shogi7x7': css = 'ToriWood.svg'; break;
            case 'shogi5x5': css = 'MiniboardWood1.png'; break;
            case 'shogi5x6': css = 'GorogoroWood.png'; break;
            case 'xiangqi9x10': css = 'xiangqiWood.png'; break;
            case 'xiangqi7x7': css = 'minixiangqiw.png'; break;
            case 'janggi9x10': css = 'JanggiWood.png'; break;
            default: css = BOARD_FAMILIES[family].boardCSS[0]; break;
        };
        changeBoardCSS(assetUrl, family, css);
    }

    for (const family of Object.keys(PIECE_FAMILIES)) { 
        let css: string;
        switch (family) {
            case 'standard': css = 'green'; break;
            case 'makruk': css = 'makrukwb'; break;
            case 'shogi': css = 'shogikw3d'; break;
            case 'kyoto': css = 'kyotok'; break;
            case 'xiangqi': css = 'xiangqihnzw'; break;
            case 'janggi': css = 'janggikaw'; break;
            default: css = PIECE_FAMILIES[family].pieceCSS[0]; break;
        };
        changePieceCSS(assetUrl, family, css);
    }

    return h('div#panel-container.panel-container', [
        h('div#variantcont.variants-container', [
            h('button#layer1chess.variant-category.chess', { on: { click: () => layer2chess(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Chess Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wR', { attrs: {src: assetUrl + '/images/pieces/merida/wR.svg' } }),
                    h('img.wK', { attrs: {src: assetUrl + '/images/pieces/merida/wK.svg' } }),
                    h('img.sliding-pieces.wB', { attrs: {src: assetUrl + '/images/pieces/merida/wB.svg' } }),
                ]),
            ]),
            h('button#layer1fairy.variant-category.fairy', { on: { click: () => layer2fairy(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Fairy Piece Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wE', { attrs: {src: assetUrl + '/images/pieces/merida/shako/wE.svg' } }),
                    h('img.wC', { attrs: {src: assetUrl + '/images/pieces/merida/wC.svg' } }),
                    h('img.sliding-pieces.wH', { attrs: {src: assetUrl + '/images/pieces/merida/wH.svg' } }),
                ]),
            ]),
            h('button#layer1army.variant-category.army', { on: { click: () => layer2army(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('New Army Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.wJ', { attrs: {src: assetUrl + '/images/pieces/shinobi/merida/wJ.svg' } }),
                    h('img.bK', { attrs: {src: assetUrl + '/images/pieces/orda/merida/bK.svg' } }),
                    h('img.sliding-pieces.wD', { attrs: {src: assetUrl + '/images/pieces/empire/merida/wD.svg' } }),
                ]),
            ]),
            h('button#layer1makruk.variant-category.makruk', { on: { click: () => layer2makruk(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Makruk Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.mN', { attrs: {src: assetUrl + '/images/pieces/makruk/cambodian/wP.svg' } }),
                    h('img.mK', { attrs: {src: assetUrl + '/images/pieces/makruk/ada/wK.svg' } }),
                    h('img.sliding-pieces.sQ', { attrs: {src: assetUrl + '/images/pieces/sittuyin/Ka_blackred/wP.svg' } }),
                ]),
            ]),
            h('button#layer1shogi.variant-category.shogi', { on: { click: () => layer2shogi(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Shogi Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.ONG', { attrs: {src: assetUrl + '/images/pieces/shogi/ctk/0KI.svg' } }),
                    h('img.OGY', { attrs: {src: assetUrl + '/images/pieces/shogi/2kanji/0GY.svg' } }),
                    h('img.sliding-pieces.OKI', { attrs: {src: assetUrl + '/images/pieces/shogi/ctp/0KI.svg' } }),
                ]),
            ]),
            h('button#layer1xiangqi.variant-category.xiangqi', { on: { click: () => layer2xiangqi(lobbyCtrl, 'panel-container') } }, [
                h('div.variant-title', [h('h3', _('Xiangqi Variants'))]),
                h('div.piece-container', [
                    h('img.sliding-pieces.xC', { attrs: {src: assetUrl + '/images/pieces/xiangqi/ct2/black_cannon2.svg' } }),
                    h('img.xK', { attrs: {src: assetUrl + '/images/pieces/xiangqi/hnz/black_king.svg' } }),
                    h('img.sliding-pieces.jK', { attrs: {src: assetUrl + '/images/pieces/janggi/hanjablue/blue_king.svg' } }),
                ]),
            ]),
        ]),
    ]);
}

export function goBackToLayer1(lobbyCtrl: LobbyController, containerId: string): void {
    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, variantPanels(lobbyCtrl));
}

export function variantBoard(variant: Variant, fen: string, check: boolean=false, lastMove: cg.Key[] | undefined=undefined): VNode {
    return h(`selection#mainboard.${variant.board}.${variant.piece}`, [
        h(`div.cg-wrap.${variant.cg}`, {
            hook: {
                insert: vnode => {
                    Chessground(vnode.elm as HTMLElement,  {
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
