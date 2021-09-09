import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { IVariant, VARIANTS } from '../chess';
import { variantBoard } from './layer1';
import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';

export function layer3variant (container2Id: string, lobbyCtrl: LobbyController, variantName: string, chess960: boolean): void {
    const variant: IVariant = VARIANTS[variantName];

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
                h('li.l3links', { class: {"icon": true, "icon-crossedswords": true}, on: { click: () => lobbyCtrl.createGame(variantName, chess960) } }, _('Create a game')),
                h('li.l3links', { class: {"icon": true, "icon-crossedswords": true}, on: { click: () => lobbyCtrl.playFriend(variantName, chess960) } }, _('Challenge a friend')),
                h('li.l3links', { class: {"icon": true, "icon-bot": true}, on: { click: () => lobbyCtrl.playAI(variantName, chess960) } }, _('Play with AI')),
                h('li.l3links', { class: {"icon": true, "icon-droid": true}, on: { click: () => lobbyCtrl.playRM(variantName, chess960) } }, _('Practice with Random-Mover')),
            ]),
            h('h5#chessl3back', { class: {"icon": true, "icon-reply": true}, on: { click: () => leve2func(lobbyCtrl, container3Id) } }, _('Go Back')),
        ]),
        h('button.layer-2-category l3img', [
            variantBoard(variant, variant.startFen),
        ]),
        h('button.layer-2-category l3t', [
            h('p.variant-extra-info', (chess960) ? chess960Tooltip(variant.name) : variant.tooltip()),
            h('a.variant-extra-info', { class: {"icon": true, "icon-book": true}, attrs: { href: lobbyCtrl.model['home'] + '/variants/' + variant.name, target: '_blank' } }, _('Rules')),
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
    default:
        return '';
    }
}

function proTip (variant: string, chess960: boolean) {
    switch (variant) {
// chess
    case 'chess':
    case 'crazyhouse':
    case 'atomic':
        if (chess960) {
            return _('Move the king on top of the rook to castle.');
        } else {
            return _('You can play more at www.lichess.org.');
        }
    case 'placement':
        return _('Castling is only possible if the king and rook are dropped to their usual places like in standard Chess.');
// fairy
    case 'capablanca':
        return _('You can choose different starting setups including Embassy Chess and Gothic Chess.');
    case 'grand':
        return _('For a drop version, choose GRANDHOUSE from the dropdown menu.');
    case 'seirawan':
        return _('For a drop version, choose S-HOUSE from the dropdown menu.');
    case 'shogun':
        return _('The queen actually demotes upon capture, so it is not worth as much.');
    case 'shako':
        return _('The cannon is a tricky piece that needs to be closely followed.');
    case 'hoppelpoppel':
        return _('Other piece sets are available, which may help avoid confusion.');
// army
    case 'orda':
    case 'shinobi':
    case 'empire':
    case 'synochess':
    case 'ordamirror':
        return _('Be aware of campmate - victory by moving your king into the 8th rank.');
// makruk
    case 'makruk':
        return _('It is important to know the counting rules in endgames.');
    case 'makpong':
        return _('Watch out for knight checks, since they cannot be blocked.');
    case 'sittuyin':
        return _('Be sure to review the nuances of pawn promotion rules.');
    case 'cambodian':
        return _('King safety is important. Use the king leap move to save time.');
// shogi
    case 'shogi':
    case 'minishogi':
    case 'gorogoro':
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
