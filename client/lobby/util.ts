import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import { Chessground } from 'chessgroundx';

import { patch } from '../document';
import { Variant } from '../chess';
import { LobbyController } from '../lobby';
import { variantPanels } from './layer1';

export function goBackToLayer1(lobbyCtrl: LobbyController, containerId: string): void {
    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, variantPanels(lobbyCtrl));
}

export function variantBoard(variant: Variant, fen: string, check: boolean=false, lastMove: cg.Key[] | undefined=undefined): VNode {
    return h(`selection#mainboard.${variant.board}.${variant.piece}.${variant.boardMark}`, [
        h(`div.cg-wrap.${variant.cg}`, {
            hook: {
                insert: (vnode: VNode) => {
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
