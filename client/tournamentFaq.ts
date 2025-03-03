import { h } from 'snabbdom';

import { _ } from './i18n';


export function faq(rated: string) {
let isRated;
if (rated === 'False') {
    isRated = _('This tournament is *not* rated and will *not* affect your rating.');
} else {
    isRated = _('This tournament is rated and will affect your rating.');
}
return h('div.tour-faq', [
h('p', _('You will be notified when the tournament starts, so it is safe to play in another tab while waiting.')),
h('h2', _('Is it rated?')),
h('p', isRated),
h('h2', _('How are scores calculated?')),
h('p', [
_('A win has a base score of 2 points, a draw 1 point, and a loss is worth no points.'),
h('br'),
_('If you win two games consecutively you will start a double point streak, represented by a flame icon.'),
h('br'),
_('The following games will continue to be worth double points until you fail to win a game.'),
h('br'),
_('That is, a win will be worth 4 points, a draw 2 points, and a loss will still not award any points.'),
h('br'),
_('For example, two wins followed by a draw will be worth 6 points: 2 + 2 + (2 × 1)'),
h('br'),
h('br'),
_('(Janggi scores are different. A win has a base score of 7 points, and a loss is worth no points. Point counting win and loss worth 4 and 2 points respectively.)'),
]),
h('h2', _('Arena Berserk')),
h('p', _('When a player clicks the Berserk button at the beginning of the game, they lose half of their clock time, but the win is worth one extra tournament point.')),
h('br'),
h('p', _('Going Berserk in time controls with an increment also cancels the increment. (1+2 is an exception, it gives 1+0)')),
h('br'),
h('p', _('Berserk is not available for games with zero initial time (0+1, 0+2).')),
h('br'),
h('p', _('Berserk only grants an extra point if you play at least 7 moves in the game.')),
h('h2', _('How is the winner decided?')),
h('p', _("The player(s) with the most points after the tournament's set time limit will be announced the winner(s).")),
h('br'),
h('p', _('When two or more players have the same number of points, the tournament performance is the tie break.')),
h('h2', _('How does the pairing work?')),
h('p', _('At the beginning of the tournament, players are paired based on their rating.')),
h('br'),
h('p', _('As soon as you finish a game, return to the tournament lobby: you will then be paired with a player close to your ranking. This ensures minimum wait time, however you may not face all other players in the tournament.')),
h('br'),
h('p', _('Play fast and return to the lobby to play more games and win more points.')),
h('h2', _('How does it end?')),
h('p', _("The tournament has a countdown clock. When it reaches zero, the tournament rankings are frozen, and the winner is announced. Games in progress must be finished, however they don't count for the tournament.")),
h('h2', _('Other important rules')),
h('p', _('There is a countdown for your first move. Failing to make a move within this time will forfeit the game to your opponent.')),
h('br'),
h('p', _('Drawing the game before each player has moved 5 times will earn neither player any points.')),
]);
}
