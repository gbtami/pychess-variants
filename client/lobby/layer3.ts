import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { IVariant, VARIANTS } from '../chess';
import { variantBoard } from './layer1';
import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';

export function layer3variant (containerId: string, model: string, variantName: string, chess960: boolean): void {
    const variant: IVariant = VARIANTS[variantName];

    let leve2func;
    switch (containerId) {
    case 'layer2chesscont':
        leve2func = layer2chess; break;
    case 'layer2fairycont':
        leve2func = layer2fairy; break;
    case 'layer2armycont':
        leve2func = layer2army; break;
    case 'layer2makrukcont':
        leve2func = layer2makruk; break;
    case 'layer2shogicont':
        leve2func = layer2shogi; break;
    case 'layer2xiangqicont':
        leve2func = layer2xiangqi; break;
    }

    const layer3cont = h('div#chessl3cont.layer-3-container.chess-l3', [
        h('button.layer-2-category l3v', [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': variant.icon(chess960) } }, variant.displayName(chess960)),
            ]),
            h('ul.l3links-cont', [
                h('li.l3links', 'Create a game'),
                h('li.l3links', 'Challenge a friend'),
                h('li.l3links', 'Play against AI'),
                h('li.l3links', 'Play against RM'),
            ]),
            h('h5#chessl3back', { on: { click: () => leve2func(model, 'chessl3cont') } }, 'Go Back'),
        ]),
        h('button.layer-2-category l3img', [
            variantBoard(variant, variant.startFen),
        ]),
        h('button.layer-2-category l3t', [
            h('p.variant-extra-info', variant.tooltip()),
            h('a.variant-extra-info', { attrs: { href: model['home'] + '/variants/' + variant.name, target: '_blank' } }, 'Rules'),
            h('p.variant-extra-info', 'Tip: ' + proTip(variant.name, chess960)),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer3cont);
}

function proTip (variant: string, chess960: boolean) {
    switch (variant) {
// chess
    case 'chess':
    case 'crazyhouse':
    case 'atomic':
        if (chess960) {
            return 'Move the king on top of the rook to castle.';
        } else {
            return 'You can play more at www.lichess.org';
        }
    case 'placement':
        return 'Castling only possible if king and rook are dropped to their usual places like in standard chess.';
// fairy
    case 'capablanca':
        return 'You can choose different starting setups including Embassy Chess and Gothic Chess. For a drop (+/- 960) version, choose CAPAHOUSE from the dropdown menu.';
    case 'grand':
        return 'For a drop version, choose GRANDHOUSE from the dropdown menu.';
    case 'seirawan':
        return 'For a drop version, choose S-HOUSE from the dropdown menu.';
    case 'shogun':
        return 'The Queen actually demotes upon capture, so it is not worth as much.';
    case 'shako':
        return 'The cannon is a tricky piece that needs to be closely followed.';
    case 'hoppelpoppel':
        return 'Other piece sets are available, which may help.';
// army
    case 'orda':
    case 'shinobi':
    case 'empire':
    case 'synochess':
    case 'ordamirror':
        return 'Be aware of campmate - victory by moving your king into the 8th rank.';
// makruk
    case 'makruk':
        return '';
    case 'makpong':
        return 'Watch out for knight checks, since they cannot be blocked.';
    case 'sittuyin':
        return 'Be sure to review the nuances of pawn promotion rules.';
    case 'cambodian':
        return '';
// shogi
    case 'shogi':
    case 'minishogi':
    case 'gorogoro':
        return 'Internationalized sets are available by going to settings.';
    case 'dobutsu':
        return 'Despite the simple appearance, there is still quite a bit of depth underlying this game.';
    case 'kyotoshogi':
        return 'Sets that show both sides as available by going to settings.';
    case 'torishogi':
        return 'Reading the rules are a necessity to understanding the movements before playing.';
// xiangqi
    case 'xiangqi':
    case 'janggi':
    case 'minixiangqi':
    case 'manchu':
        return 'Internationalized sets are available by going to settings.';
    default:
        return '';
    }
}