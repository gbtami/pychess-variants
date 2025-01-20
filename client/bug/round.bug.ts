import { h, VNode } from "snabbdom";

import { VARIANTS } from "../variants"
import { gameInfoBug } from './gameInfo.bug';
import { renderTimeago } from '../datetime';
import { PyChessModel } from "../types";
import { RoundControllerBughouse } from "./roundCtrl.bug";

function createBoards(mainboardVNode: VNode, bugboardVNode: VNode, mainboardPocket0: VNode, mainboardPocket1: VNode, bugboardPocket0: VNode, bugboardPocket1: VNode, model: PyChessModel) {
    /*this.ctrl = *//*const ctrl = */new RoundControllerBughouse(mainboardVNode.elm as HTMLElement,
        mainboardPocket0.elm as HTMLElement,
        mainboardPocket1.elm as HTMLElement,
        bugboardVNode.elm as HTMLElement,
        bugboardPocket0.elm as HTMLElement, bugboardPocket1.elm as HTMLElement,
        model);
    // window['onFSFline'] = ctrl.onFSFline;
}

export function roundView(model: PyChessModel): VNode[] {



    const variant = VARIANTS[model.variant];

    renderTimeago();

    let mainboardVNode: VNode, bugboardVNode: VNode, mainboardPocket0: VNode, mainboardPocket1: VNode, bugboardPocket0: VNode, bugboardPocket1: VNode;

    return [
        h('aside.sidebar-first', [
            gameInfoBug(model),
        ]),
        h('div.round-app.bug', { hook: {insert: ()=>{createBoards(mainboardVNode, bugboardVNode, mainboardPocket0, mainboardPocket1, bugboardPocket0, bugboardPocket1, model)}}},[
            h(`selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                h('div.cg-wrap.' + variant.board.cg, { hook: { insert: (vnode) => mainboardVNode = vnode/*runGround(vnode, model)*/ } }),
            ]),
            h(`selection#bugboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                h('div.cg-wrap.' + variant.board.cg, { hook: { insert: (vnode) => bugboardVNode = vnode/*runGround(vnode, model)*/ } }),
            ]),
            // h('div.material.material-top.' + variant.piece + '.disabled'),
            h('div.pocket-top', [
                h('div.' + variant.pieceFamily + '.twoboards', [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket00', { hook: { insert: (vnode)=>{mainboardPocket0=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.pocket-top-partner', [
                h('div.' + variant.pieceFamily + '.twoboards', [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket10', { hook: { insert: (vnode)=>{bugboardPocket0=vnode}}}),
                    ]),
                ]),
            ]),


            h('div.info-wrap0', [
                h('div.clock-wrap', [
                    h('div#clock0a'),
                    // h('div#more-time'),
                    h('div#berserk0a'),
                ]),
                h('round-player0#rplayer0a'),
                h('div#misc-info0a'),
            ]),
            h('div.info-wrap0.bug', [
                h('div.clock-wrap.bug', [
                    h('div#clock0b'),
                    // h('div#more-time'),
                    h('div#berserk0b'),
                ]),
                h('round-player0.bug#rplayer0b'),
                h('div#misc-info0b'),
            ]),
            h('div.bug-round-tools-part', [
                h('div.movelist-block', [
                    h('div#movelist'),
                    h('div#move-controls'),
                ]),
                h('div#offer-dialog'),
                h('div#game-controls'),
            ]),
            h('div.bug-round-tools', [
                h('div#bugroundchat'),

                // h('div#expiration-top'),
                // h('div#expiration-bottom'),
            ]),
            h('div.info-wrap1', [
                h('div.clock-wrap', [
                    h('div#clock1a'),
                    h('div#berserk1a'),
                ]),
                h('round-player1#rplayer1a'),
                h('div#misc-info1a'),
            ]),
            h('div.info-wrap1.bug', [
                h('div.clock-wrap.bug', [
                    h('div#clock1b'),
                    h('div#berserk1b'),
                ]),
                h('round-player1.bug#rplayer1b'),
                h('div#misc-info1b'),
            ]),
            h('div.pocket-bot', [
                h('div.' + variant.pieceFamily + '.twoboards', [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket01', { hook: { insert: (vnode)=>{mainboardPocket1=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.pocket-bot-partner', [
                h('div.' + variant.pieceFamily + '.twoboards', [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket11', { hook: { insert: (vnode)=>{bugboardPocket1=vnode}}}),
                    ]),
                ]),
            ]),
            // h('div.material.material-bottom.' + variant.pieceFamily + '.disabled'),
        ]),
        h('under-left#spectators'),
        h('under-board', [
            h('div#janggi-setup-buttons'),
            h('div.ctable-container'),
        ]),
    ];
}
