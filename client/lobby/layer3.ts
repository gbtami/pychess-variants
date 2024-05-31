import { h } from 'snabbdom';

import { _ } from '../i18n';
import { createModeStr, LobbyController } from '../lobby';
import { patch } from '../document';
import { Variant, VARIANTS } from '../variants';
import { variantBoard } from './util';
import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';

export function layer3variant (container2Id: string, lobbyCtrl: LobbyController, variantName: string, chess960: boolean): void {
    const variant: Variant = VARIANTS[variantName];

    let leve2func: (lobbyCtrl: LobbyController, containerId: string) => void, container3Id: string='';
    switch (container2Id) {
    case 'layer2chesscont':
        leve2func = layer2chess; container3Id = 'chessl3cont'; break;
    case 'layer2fairycont':
        leve2func = layer2fairy; container3Id = 'fairyl3cont';  break;
    case 'layer2armycont':
        leve2func = layer2army; container3Id = 'armyl3cont';  break;
    case 'layer2makrukcont':
        leve2func = layer2makruk; container3Id = 'makrukl3cont';  break;
    case 'layer2shogicont':
        leve2func = layer2shogi; container3Id = 'shogil3cont';  break;
    case 'layer2xiangqicont':
        leve2func = layer2xiangqi; container3Id = 'xiangqil3cont';  break;
    }

    const layer3cont = h(`div#${container3Id}.layer-3-container.chess-l3` , [
        h('button.layer-2-category l3v', [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': variant.icon(chess960) } }, variant.displayName(chess960)),
            ]),
            h('ul.l3links-cont', [
                h('li.l3links', { class: {"icon": true, "icon-crossedswords": true}, on: { click: () => lobbyCtrl.createGame(variantName, chess960) } }, createModeStr('createGame')),
                h('li.l3links', { class: {"icon": true, "icon-crossedswords": true}, on: { click: () => lobbyCtrl.playFriend(variantName, chess960) } }, createModeStr('playFriend')),
                h('li.l3links', { class: {"icon": true, "icon-bot": true}, on: { click: () => lobbyCtrl.playAI(variantName, chess960) } }, createModeStr('playAI')),
            ]),
            h('h5#chessl3back', { class: {"icon": true, "icon-reply": true}, on: { click: () => leve2func(lobbyCtrl, container3Id) } }, _('Go Back')),
        ]),
        h('button.layer-2-category l3img', [
            variantBoard(variant, variant.startFen),
        ]),
        h('button.layer-2-category l3t', [
            h('p.variant-extra-info', (chess960) ? chess960Tooltip(variant.name) : variant.tooltip),
            h('a.variant-extra-info', { class: {"icon": true, "icon-book": true}, attrs: { href: lobbyCtrl.home + '/variants/' + variant.name + (chess960 ? '960': ''), target: '_blank' } }, _('Rules')),
            h('p.variant-extra-info', _('Tip: ') + proTip(variant.name, chess960)),
        ]),
    ]);

    const container = document.getElementById(container2Id) as HTMLElement;
    if (container) patch(container, layer3cont);
}

function chess960Tooltip(variant: string) {
    switch (variant) {
    case 'chess':
        return _('Fischer\'s random chess where the back row are randomized.');
    case 'crazyhouse':
        return _('Crazyhouse with random back row.');
    case 'atomic':
        return _('Atomic Chess with random back row.');
    case 'kingofthehill':
        return _('King of The Hill with random back row.');
    case '3check':
        return _('Three-Check with random back row.');
    case 'seirawan':
        return _('S-chess with random back row.');
    case 'capablanca':
        return _('Capablanca with random back row.');
    case 'capahouse':
        return _('Capahouse with random back row.');
    default:
        return '';
    }
}

function proTip (variant: string, chess960: boolean) {
    switch (variant) {
    case 'ataxx':
        return _('Quack.');
// chess
    case 'kingofthehill':
        return _('Immediately moving your king to the centre of the board is a bad idea.');
    case 'chess':
    case 'crazyhouse':
    case 'atomic':
    case '3check':
        if (chess960) {
            return _('Move the king on top of the rook to castle.');
        } else {
            return _('You can play more at lichess.org.');
        }
    case 'placement':
        return _('Castling is only possible if the king and rook are dropped to their usual places like in standard Chess.');
    case 'duck':
        return _('Quack.');
// fairy
    case 'capablanca':
        return _('You can choose different starting setups including Embassy Chess and Gothic Chess.');
    case 'grand':
        return _('For a drop version, choose GRANDHOUSE from the dropdown menu.');
    case 'seirawan':
        return _('For a drop version, choose S-HOUSE from the dropdown menu.');
    case 'dragon':
        return _("Dropping your Dragon too early may not be the best idea.");
    case 'grandhouse':
    case 'capahouse':
    case 'shouse':
        return _('Initiative is everything!');
    case 'shogun':
        return _('The queen actually demotes upon capture, so it is not worth as much.');
    case 'shako':
        return _('The cannon is a tricky piece that needs to be closely followed.');
    case 'hoppelpoppel':
        return _('Other piece sets are available, which may help avoid confusion.');
// army
    case 'orda':
    case 'khans':
    case 'shinobiplus':
    case 'empire':
    case 'synochess':
    case 'ordamirror':
        return _('Be aware of campmate - victory by moving your king into the 8th rank.');
    case 'chak':
        return _('Promoting the king prematurely can be dangerous.');
    case 'chennis':
        return _('Make sure to consider both forms of each piece.');
    case 'spartan':
        return _('Spartan kings can be a powerful addition to an offensive.');
// makruk
    case 'makruk':
        return _('Maximizing khon and met\'s effectiveness is the key.');
    case 'makpong':
        return _('Watch out for knight checks, since they cannot be blocked.');
    case 'sittuyin':
        return _('You can use placement to utilize your stronger pieces from the start.');
    case 'cambodian':
        return _('King safety is important. Use the king leap move to save time.');
    case 'asean':
        return _('The ability to promote to rook makes for a dynamic endgame.');
// shogi
    case 'mansindam':
    case 'shogi':
    case 'minishogi':
    case 'gorogoroplus':
    case 'cannonshogi':
        return _('Internationalized sets are available by going to settings.');
    case 'dobutsu':
        return _('Despite the simple appearance, there is still quite a bit of depth underlying this game.');
    case 'kyotoshogi':
        return _('Sets that show both sides are available by going to settings.');
    case 'torishogi':
        return _('Reading the rules are a necessity to understand the movements before playing.');
// xiangqi
    case 'xiangqi':
    case 'janggi':
    case 'minixiangqi':
    case 'manchu':
        return _('Internationalized sets are available by going to settings.');
    default:
        return '';
    }
}
