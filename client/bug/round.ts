import { h, VNode } from "snabbdom";

import { VARIANTS } from '../chess';
// import { RoundController } from './roundCtrl';
import { gameInfo } from '../gameInfo';
import { renderTimeago } from '../datetime';
import { PyChessModel } from "../types";
import {RoundController} from "./roundCtrl";

// function runGround(vnode: VNode, model: PyChessModel) {
//     const el = vnode.elm as HTMLElement;
//     /*const ctrl =*/ new RoundController(el, model);
//     // const cg = ctrl.chessground;
//     // window['cg'] = cg;
// }



































function createBoards(mainboardVNode: VNode, bugboardVNode: VNode, mainboardPocket0: VNode, mainboardPocket1: VNode, bugboardPocket0: VNode, bugboardPocket1: VNode, model: PyChessModel) {
    /*this.ctrl = *//*const ctrl = */new RoundController(mainboardVNode.elm as HTMLElement,
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
            gameInfo(model),
            h('div#roundchat'),
        ]),
        h('div.round-app.bug', { hook: {insert: ()=>{createBoards(mainboardVNode, bugboardVNode, mainboardPocket0, mainboardPocket1, bugboardPocket0, bugboardPocket1, model)}}},[
            h(`selection#mainboard.${variant.board}.${variant.piece}.${variant.boardMark}`, [
                h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => mainboardVNode = vnode/*runGround(vnode, model)*/ } }),
            ]),
            h(`selection#bugboard.${variant.board}.${variant.piece}.${variant.boardMark}`, [
                h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => bugboardVNode = vnode/*runGround(vnode, model)*/ } }),
            ]),
            h('div.material.material-top.' + variant.piece + '.disabled'),
            h('div.pocket-top', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket00', { hook: { insert: (vnode)=>{mainboardPocket0=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.pocket-top-partner', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket10', { hook: { insert: (vnode)=>{bugboardPocket0=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.bug-round-tools', [
                h('div.info-wrap0', [
                    h('div.clock-wrap', [
                        h('div#clock0'),
                        h('div#more-time'),
                        h('div#berserk0'),
                    ]),
                    h('div#misc-info0'),
                ]),
                h('div#expiration-top'),
                h('round-player0#rplayer0'),
                h('div#move-controls'),
                h('div.movelist-block', [
                    h('div#movelist'),
                ]),
                h('div#offer-dialog'),
                h('div#game-controls'),
                h('round-player1#rplayer1'),
                h('div#expiration-bottom'),
                h('div.info-wrap1', [
                    h('div.clock-wrap', [
                        h('div#clock1'),
                        h('div#berserk1'),
                    ]),
                    h('div#misc-info1'),
                ]),
            ]),
            h('div.pocket-bot', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket01', { hook: { insert: (vnode)=>{mainboardPocket1=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.pocket-bot-partner', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket11', { hook: { insert: (vnode)=>{bugboardPocket1=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.material.material-bottom.' + variant.piece + '.disabled'),
        ]),
        h('under-left#spectators'),
        h('under-board', [
            h('div#janggi-setup-buttons'),
            h('div.ctable-container'),
        ]),
    ];
}
