import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import { Chessground } from 'chessgroundx';

import { patch } from '../document';
import { Variant } from '../variants';
import { LobbyController } from '../lobby';
import { variantPanels } from './layer1';

export function goBackToLayer1(lobbyCtrl: LobbyController, containerId: string): void {
    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, variantPanels(lobbyCtrl));
}

export function variantBoard(variant: Variant, fen: string, check: boolean=false, lastMove?: cg.Move): VNode {
    return h(`selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
        h(`div.cg-wrap.${variant.board.cg}`, {
            hook: {
                insert: (vnode: VNode) => {
                    Chessground(vnode.elm as HTMLElement,  {
                        fen: fen,
                        turnColor: fen.split(" ")[1] === "b" ? "white" : "black",
                        check: check,
                        lastMove: lastMove,
                        dimensions: variant.board.dimensions,
                        coordinates: false,
                        viewOnly: true
                    });
                }
            }
        }),
    ])
}
