import { h, VNode } from 'snabbdom';

import { _ } from '../../i18n';
import { patch } from '../../document';
import { colorIcon } from '../../chess';
import { aiLevel, gameType } from '../../result';
import { timeago } from '../../datetime';
import { timeControlStr } from '../../view';
import { displayUsername, userLink } from '../../user';
import { Seat } from './seat';
import type { TwoBoardController } from '../twoBoardCtrl';

// The bughouse sidebar's game-info panel: time control, variant, date/status and
// the two team rows. Built ctrl-free so round.ts/analysis.ts can embed the
// placeholder directly; the controller renders the content into it once, from its
// own state, so this no longer builds a second seat container of its own.
export class GameInfoView {
    private vnode: VNode | HTMLElement;

    constructor() {
        this.vnode = h('div.game-info');
    }

    placeholder(): VNode {
        return this.vnode as VNode;
    }

    render(ctrl: TwoBoardController): void {
        // the placeholder is only embedded when the page has a game to describe —
        // the plain analysis board puts a variant selector there instead
        if (ctrl.gameId === '') return;
        this.vnode = patch(this.vnode, this.view(ctrl));
    }

    private view(ctrl: TwoBoardController): VNode {
        const model = ctrl.model;
        const variant = ctrl.variant;
        const chess960 = model.chess960 === 'True';
        const dataIcon = variant.icon(chess960);
        const seat = (board: 'a' | 'b', color: 'white' | 'black') => ctrl.seats.byBoardAndColor(board, color);

        return h('div.game-info', [
            h('section', [
                h('div.info0.icon', { attrs: { 'data-icon': dataIcon } }, [
                    h('div.info2', [
                        h('div.tc', [
                            timeControlStr(ctrl.base, ctrl.inc, model.byo) + ' • ' + gameType(model.rated) + ' • ',
                            h(
                                'a.user-link',
                                {
                                    attrs: {
                                        target: '_blank',
                                        href: '/variants/' + model.variant + (chess960 ? '960' : ''),
                                    },
                                },
                                variant.displayName(chess960),
                            ),
                        ]),
                        ctrl.status >= 0
                            ? h('info-date', { attrs: { timestamp: model.date } }, timeago(model.date))
                            : _('Playing right now'),
                    ]),
                ]),
                h('div.player-data', [
                    h('i-side.icon', { class: { [colorIcon(model.variant, variant.colors.first)]: true } }),
                    h('player', [
                        playerInfo(seat('a', 'white'), model.level),
                    ]),
                    h('div', { style: { display: 'inline', paddingRight: '8px' } }, '+'),
                    h('i-side.icon', { class: { [colorIcon(model.variant, variant.colors.second)]: true } }),
                    h('player', [
                        playerInfo(seat('b', 'black'), model.level),
                    ]),
                ]),
                h('div.player-data', [
                    h('i-side.icon', { class: { [colorIcon(model.variant, variant.colors.second)]: true } }),
                    h('player', [
                        playerInfo(seat('b', 'white'), model.level),
                    ]),
                    h('div', { style: { display: 'inline', paddingRight: '8px' } }, '+'),
                    h('i-side.icon', { class: { [colorIcon(model.variant, variant.colors.first)]: true } }),
                    h('player', [
                        playerInfo(seat('a', 'black'), model.level),
                    ]),
                ]),
            ]),
            h('section', [
                h(
                    'div.tourney',
                    model.tournamentId
                        ? [
                              h(
                                  'a.icon.icon-trophy',
                                  { attrs: { href: '/tournament/' + model.tournamentId } },
                                  model.tournamentname,
                              ),
                          ]
                        : [],
                ),
            ]),
        ]);
    }
}

function playerInfo(seat: Seat, level: number) {
    const { username, title, rating } = seat.player;
    const color = seat.color === 'white' ? 'w' : 'b';

    const displayName = displayUsername(username);

    return userLink(username, [
        h('player-title', ' ' + title + ' '),
        displayName + aiLevel(username, level) + (title !== 'BOT' ? ' (' + rating + ') ' : ''),
        h('rdiff#' + color + 'rdiff'),
        h('berserk#' + color + 'berserk'),
    ]);
}
