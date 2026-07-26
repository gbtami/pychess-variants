import { h, VNode } from 'snabbdom';

import { _ } from '../../i18n';
import { colorIcon } from '../../chess';
import { VARIANTS } from '../../variants';
import { aiLevel, gameType } from '../../result';
import { timeago } from '../../datetime';
import { timeControlStr } from '../../view';
import { PyChessModel } from '../../types';
import { displayUsername, userLink } from '../../user';
import { Seat, TwoBoardSeats } from './players';

export function gameInfoBug(model: PyChessModel): VNode {
    // console.log("roundView model=", model);
    const seats = new TwoBoardSeats(model, model.username);
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);

    return h('div.game-info', [
        h('section', [
            h('div.info0.icon', { attrs: { 'data-icon': dataIcon } }, [
                h('div.info2', [
                    h('div.tc', [
                        timeControlStr(model['base'], model['inc'], model['byo']) +
                            ' • ' +
                            gameType(model['rated']) +
                            ' • ',
                        h(
                            'a.user-link',
                            {
                                attrs: {
                                    target: '_blank',
                                    href: '/variants/' + model['variant'] + (chess960 ? '960' : ''),
                                },
                            },
                            variant.displayName(chess960),
                        ),
                    ]),
                    Number(model['status']) >= 0
                        ? h('info-date', { attrs: { timestamp: model['date'] } }, timeago(model['date']))
                        : _('Playing right now'),
                ]),
            ]),
            h('div.player-data', [
                h('i-side.icon', { class: { [colorIcon(model.variant, variant.colors.first)]: true } }),
                h('player', playerInfo(seats.byBoardAndColor('a', 'white'), model)),
                h('div', { style: { display: 'inline', paddingRight: '8px' } }, '+'),
                h('i-side.icon', { class: { [colorIcon(model.variant, variant.colors.second)]: true } }),
                h('player', playerInfo(seats.byBoardAndColor('b', 'black'), model)),
            ]),
            h('div.player-data', [
                h('i-side.icon', { class: { [colorIcon(model.variant, variant.colors.second)]: true } }),
                h('player', playerInfo(seats.byBoardAndColor('b', 'white'), model)),
                h('div', { style: { display: 'inline', paddingRight: '8px' } }, '+'),
                h('i-side.icon', { class: { [colorIcon(model.variant, variant.colors.first)]: true } }),
                h('player', playerInfo(seats.byBoardAndColor('a', 'black'), model)),
            ]),
        ]),
        h('section', [
            h(
                'div.tourney',
                model['tournamentId']
                    ? [
                          h(
                              'a.icon.icon-trophy',
                              { attrs: { href: '/tournament/' + model['tournamentId'] } },
                              model['tournamentname'],
                          ),
                      ]
                    : [],
            ),
        ]),
    ]);
}

function playerInfo(seat: Seat, model: PyChessModel) {
    const { username, title, rating } = seat.player;
    const color = seat.color === 'white' ? 'w' : 'b';

    const level = model.level;
    const displayName = displayUsername(username);

    return userLink(username, [
        h('player-title', ' ' + title + ' '),
        displayName + aiLevel(title, level) + (title !== 'BOT' ? ' (' + rating + ') ' : ''),
        h('rdiff#' + color + 'rdiff'),
        h('berserk#' + color + 'berserk'),
    ]);
}
