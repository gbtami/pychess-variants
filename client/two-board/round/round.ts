import { h, VNode } from 'snabbdom';

import { VARIANTS } from '../../variants';
import { GameInfoView } from '../common/gameInfo';
import { renderTimeago } from '../../datetime';
import { PyChessModel } from '../../types';
import { RoundControllerBughouse } from './roundCtrl';
import { MovelistView } from '../common/movelist';
import { RoundSeatView, RoundSeatViews } from './roundSeatView';
import { trackSquareUnit } from '../squareUnit';
import { boardZoom } from '@/boardSettings';
import { TabbedPanels } from '../common/tabs';
import { ChatPresetsView } from './chatPresets';
import { twoBoardSeats } from '../common/seatConfiguration';
import { _ } from '../../i18n';

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
    chatPresetsView: ChatPresetsView | undefined,
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
        chatPresetsView,
    );
    // window['onFSFline'] = ctrl.onFSFline;
}

export function roundView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];

    // Ordering is load-bearing: the short-landscape grid sizes its board tracks
    // from --bug-sq, so the property must exist before createBoards() runs.
    // chessgroundx memoizes its hit-test bounds when a board is constructed, and
    // nothing observes a board that merely moves — so a board built against a
    // grid that changes afterwards keeps stale bounds and mis-resolves clicks.
    //
    // The zoom is passed in rather than read there, because the unit is quantised
    // at the scale the board will draw at and squareUnit.ts must not depend on
    // boardSettings — boardSettings calls back into it when a slider moves, and the
    // two importing each other is a module-evaluation cycle. Read from the setting
    // rather than from `--zoom-a`, which nothing has written this early: the
    // stylesheet default is 100 while the board is about to be drawn at 80.
    const boardFamily = variant.boardFamily;
    trackSquareUnit({ a: boardZoom(boardFamily, 'a'), b: boardZoom(boardFamily, 'b') });

    renderTimeago();

    let mainboardVNode: VNode,
        bugboardVNode: VNode,
        mainboardPocket0: VNode,
        mainboardPocket1: VNode,
        bugboardPocket0: VNode,
        bugboardPocket1: VNode;

    const movelistView = new MovelistView();
    const gameInfoView = new GameInfoView();

    // A spectator has no partner to tell anything, so they get no presets — the
    // same condition the shared chat view used to apply, asked here instead, and
    // through the same seat logic the controller will use rather than a second
    // copy of it. When there are none, the Chat tab simply has one part.
    const chatPresetsView = twoBoardSeats(model, model.username).isSpectator()
        ? undefined
        : new ChatPresetsView(variant);

    const seatViews: RoundSeatViews = {
        a: [new RoundSeatView(0, 'a'), new RoundSeatView(1, 'a')],
        b: [new RoundSeatView(0, 'b'), new RoundSeatView(1, 'b')],
    };

    // One pocket per seat, handed to that seat's strip. The element itself still
    // belongs to the caller — chessgroundx is constructed against it below — but
    // where it sits is the strip's business, not the grid's.
    const pocket = (cls: string, id: string, keep: (vnode: VNode) => void): VNode =>
        h(`div.${cls}`, [
            h('div.' + variant.pieceFamily + '.twoboards', [
                h('div.cg-wrap.pocket', [h(`div#${id}`, { hook: { insert: keep } })]),
            ]),
        ]);

    const pocketA0 = pocket('pocket-top', 'pocket00', vnode => (mainboardPocket0 = vnode));
    const pocketA1 = pocket('pocket-bot', 'pocket01', vnode => (mainboardPocket1 = vnode));
    const pocketB0 = pocket('pocket-top-partner', 'pocket10', vnode => (bugboardPocket0 = vnode));
    const pocketB1 = pocket('pocket-bot-partner', 'pocket11', vnode => (bugboardPocket1 = vnode));

    // Each panel holds exactly one existing element, embedded as it is defined
    // elsewhere — their own `grid-area` declarations come along and are simply
    // inert now that they are panel children rather than grid items, the same way
    // the pockets' were when seats became strips. Every one is still rendered and
    // patched by its own owner, which is why they are embedded rather than rebuilt.
    const roundTabs = new TabbedPanels(
        'round-tabs',
        [
            // one part each for now: splitting a tab across places is what the
            // widget newly allows, and which tabs should be split is a separate
            // change — chat's two pieces are produced together inside the shared
            // chatView(), so dividing them is a change about chat, not about tabs
            // Two parts: the chat view, and the presets beside it. They are
            // mounted adjacent for now, so nothing moves on screen — but either
            // can be placed on its own, which is why the presets were pulled out
            // of the chat view in the first place.
            {
                label: _('Chat'),
                parts: [
                    { content: [h('div#bugroundchat')] },
                    // One part per preset group, so each can be placed on its own
                    // and they flow into the space under the board one at a time.
                    ...(chatPresetsView
                        ? chatPresetsView.parts().map((part, i) => ({
                              panelClass: `chatpresets-panel.chatpresets-panel-${i + 1}`,
                              content: [part],
                          }))
                        : []),
                ],
            },
            {
                label: _('Moves'),
                parts: [{ content: [h('div.movelist-block', [movelistView.placeholder(), h('div#move-controls')])] }],
            },
            { label: _('Info'), parts: [{ content: [gameInfoView.placeholder()] }] },
        ],
        _('Round tabs'),
    );

    return [
        // left in place but empty: the game-info placeholder it used to hold is
        // now the Info panel's content. Whether an empty aside should still
        // render is a layout question this change does not open.
        h('aside.sidebar-first'),
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
                            chatPresetsView,
                        );
                    },
                },
            },
            [
                // The viewer's own board and its two strips as one unit, exactly as the
                // partner's are grouped in `.bug-right-column`. They used to be three
                // separate items of the app's grid, stacked by three named rows —
                // which is a grid doing, for one board, what a container already does
                // for the other. The asymmetry cost more than the rows: anything a
                // stack needs, from the room a board's coordinates want to the height
                // a name takes when it leaves its strip, had to be expressed twice,
                // once as tracks here and once inside the group there. Now both boards
                // are the same kind of thing and each carries its own arrangement.
                //
                // Order is the arrangement: strip, board, strip, in block flow.
                h('div.bug-own-stack', [
                    seatViews.a[0].view(pocketA0),
                    h(`selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                        h('div.cg-wrap.' + variant.board.cg, {
                            hook: { insert: vnode => (mainboardVNode = vnode) /*runGround(vnode, model)*/ },
                        }),
                    ]),
                    seatViews.a[1].view(pocketA1),
                ]),
                // The draw/rematch prompt used to be here, as `.bug-offer-dialog`
                // holding `#offer-dialog` in its own full-width `toolsB` row below
                // both boards. An offer is now a look on the control that made it —
                // the draw button turns green to be accepted, the rematch button is
                // replaced in place by an accept/decline pair — so there is nothing
                // left for a strip to hold, and the row went with the element.
                // The tools column is this page's own element, carrying its
                // `grid-area: tools` and the `min-width: 0` that makes the column
                // yield before a board is pushed off screen; the widget supplies
                // only the two parts inside it. Panels first, so the tablist reads
                // as a bottom tab bar. Mounting them apart is possible and is the
                // point of the widget's shape, but this layout wants them together.
                //
                // The bar shares that bottom row between the tablist and the game
                // controls. #game-controls is only a placeholder here — roundControls
                // finds it by id after this patch and renders the draw and resign
                // buttons into it — so this moves where they sit and nothing else.
                // They are in this column because the row below the boards cannot be
                // reached in short landscape: they measured at y=546.67 in a 551px
                // viewport that does not scroll, leaving no way to resign a game.
                // Each tab's panels are mounted individually now that the widget
                // groups nothing. All of them land here for the moment, so the
                // column looks exactly as it did; a later change is free to mount
                // one of them somewhere else entirely.
                // The second column, as one element rather than as two separately
                // placed ones. A grid track is sized by its widest item, never by
                // two items side by side, so a column that is "the right board plus
                // the tools" has to be a single item holding both. It is also what
                // the tools need in order to flow under the board later: floating
                // happens among siblings in one container, not across grid items.
                //
                // The cost is that the two boards are no longer siblings in the
                // app's grid, so switching them cannot be a grid-area swap — see
                // switchBoardElements() and markRoles(), which both assumed it.
                h('div.bug-right-column', [
                    // The board and its two strips are grouped; the tab parts are
                    // not. That is the whole arrangement in one line.
                    //
                    // These three are one unit — they move together on a switch and
                    // size together — and three siblings cannot be floated as one
                    // thing, so the group has to exist for the board to be the
                    // fixed shape the parts arrange themselves around.
                    h('div.bug-partner-stack', [
                        seatViews.b[0].view(pocketB0),
                        h(
                            `selection#bugboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`,
                            [
                                h('div.cg-wrap.' + variant.board.cg, {
                                    hook: { insert: vnode => (bugboardVNode = vnode) /*runGround(vnode, model)*/ },
                                }),
                            ],
                        ),
                        seatViews.b[1].view(pocketB1),
                    ]),
                    // The parts. Grouped only so that portrait has something to
                    // place: there the tools are one block in their own grid area,
                    // and free-standing parts auto-placed into the partner board's
                    // rows, which left the chat 20.7px tall.
                    //
                    // The landscape modes make this element `display: contents`, so
                    // it forms no box and each part is placed individually by the
                    // column — which is what lets one of them take the space under a
                    // shrunken board. Each mode dissolves whichever container it
                    // does not want: landscape this one, portrait the two around it.
                    h('div.bug-parts', [
                        roundTabs.panel(0, 0),
                        ...(chatPresetsView ? [roundTabs.panel(0, 1), roundTabs.panel(0, 2)] : []),
                        roundTabs.panel(1, 0),
                        roundTabs.panel(2, 0),
                        // Where the end-of-game controls are rendered, empty until
                        // there is a result. It belongs to no tab — it must show
                        // whichever tab is selected — so it is a sibling of the
                        // parts rather than one of them, and it takes the place the
                        // presets vacate at the same moment.
                        h('div.bug-gameover'),
                        h('div.bug-round-tools-bar', [roundTabs.tabList(), h('div#game-controls')]),
                    ]),
                ]),
                // h('div.material.material-bottom.' + variant.pieceFamily + '.disabled'),
            ],
        ),
        h('under-left#spectators'),
        h('under-board', [h('div#janggi-setup-buttons'), h('div.ctable-container')]),
    ];
}
