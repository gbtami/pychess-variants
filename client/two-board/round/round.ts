import { h, VNode } from 'snabbdom';

import { VARIANTS } from '../../variants';
import { GameInfoView } from '../common/gameInfo';
import { renderTimeago } from '../../datetime';
import { PyChessModel } from '../../types';
import { RoundControllerBughouse } from './roundCtrl';
import { MovelistView } from '../common/movelist';
import { RoundSeatView, RoundSeatViews } from './roundSeatView';

function createBoards(
    mainboardVNode: VNode,
    bugboardVNode: VNode,
    mainboardPocket0: VNode,
    mainboardPocket1: VNode,
    bugboardPocket0: VNode,
    bugboardPocket1: VNode,
    model: PyChessModel,
    movelistView: MovelistView,
    gameInfoView: GameInfoView,
    seatViews: RoundSeatViews,
) {
    /*this.ctrl = */ /*const ctrl = */ new RoundControllerBughouse(
        mainboardVNode.elm as HTMLElement,
        mainboardPocket0.elm as HTMLElement,
        mainboardPocket1.elm as HTMLElement,
        bugboardVNode.elm as HTMLElement,
        bugboardPocket0.elm as HTMLElement,
        bugboardPocket1.elm as HTMLElement,
        model,
        movelistView,
        gameInfoView,
        seatViews,
    );
    // window['onFSFline'] = ctrl.onFSFline;
}

export function roundView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];

    renderTimeago();

    let mainboardVNode: VNode,
        bugboardVNode: VNode,
        mainboardPocket0: VNode,
        mainboardPocket1: VNode,
        bugboardPocket0: VNode,
        bugboardPocket1: VNode;

    const movelistView = new MovelistView();
    const gameInfoView = new GameInfoView();

    const seatViews: RoundSeatViews = {
        a: [new RoundSeatView(0, 'a'), new RoundSeatView(1, 'a')],
        b: [new RoundSeatView(0, 'b'), new RoundSeatView(1, 'b')],
    };

    return [
        h('aside.sidebar-first', [gameInfoView.placeholder()]),
        h(
            'div.round-app.bug',
            {
                hook: {
                    insert: () => {
                        createBoards(
                            mainboardVNode,
                            bugboardVNode,
                            mainboardPocket0,
                            mainboardPocket1,
                            bugboardPocket0,
                            bugboardPocket1,
                            model,
                            movelistView,
                            gameInfoView,
                            seatViews,
                        );
                    },
                },
            },
            [
                h(`selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                    h('div.cg-wrap.' + variant.board.cg, {
                        hook: { insert: vnode => (mainboardVNode = vnode) /*runGround(vnode, model)*/ },
                    }),
                ]),
                h(`selection#bugboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                    h('div.cg-wrap.' + variant.board.cg, {
                        hook: { insert: vnode => (bugboardVNode = vnode) /*runGround(vnode, model)*/ },
                    }),
                ]),
                // h('div.material.material-top.' + variant.piece + '.disabled'),
                h('div.pocket-top', [
                    h('div.' + variant.pieceFamily + '.twoboards', [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket00', {
                                hook: {
                                    insert: vnode => {
                                        mainboardPocket0 = vnode;
                                    },
                                },
                            }),
                        ]),
                    ]),
                ]),
                h('div.pocket-top-partner', [
                    h('div.' + variant.pieceFamily + '.twoboards', [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket10', {
                                hook: {
                                    insert: vnode => {
                                        bugboardPocket0 = vnode;
                                    },
                                },
                            }),
                        ]),
                    ]),
                ]),

                seatViews.a[0].view(),
                seatViews.b[0].view(),
                h('div.bug-round-tools-part', [
                    h('div.movelist-block', [movelistView.placeholder(), h('div#move-controls')]),
                    h('div#offer-dialog'),
                    h('div#game-controls'),
                ]),
                h('div.bug-round-tools', [
                    h('div#bugroundchat'),

                    // h('div#expiration-top'),
                    // h('div#expiration-bottom'),
                ]),
                seatViews.a[1].view(),
                seatViews.b[1].view(),
                h('div.pocket-bot', [
                    h('div.' + variant.pieceFamily + '.twoboards', [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket01', {
                                hook: {
                                    insert: vnode => {
                                        mainboardPocket1 = vnode;
                                    },
                                },
                            }),
                        ]),
                    ]),
                ]),
                h('div.pocket-bot-partner', [
                    h('div.' + variant.pieceFamily + '.twoboards', [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket11', {
                                hook: {
                                    insert: vnode => {
                                        bugboardPocket1 = vnode;
                                    },
                                },
                            }),
                        ]),
                    ]),
                ]),
                // h('div.material.material-bottom.' + variant.pieceFamily + '.disabled'),
            ],
        ),
        h('under-left#spectators'),
        h('under-board', [h('div#janggi-setup-buttons'), h('div.ctable-container')]),
    ];
}
