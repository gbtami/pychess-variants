import { h } from 'snabbdom';

import { _ } from './i18n';
import { Variant } from './variants';

export function gameType(rated: string | number) {
    switch (rated) {
    case "True":
    case "1":
    case 1:
        return _("Rated");
    case "2":
    case 2:
        return _("IMPORT");
    default:
        return _("Casual");
    }
}

export function aiLevel(title: string, level: number) {
    return (title === 'BOT' && level >= 0) ? ' ' + _('level %1', level): '';
}

export function renderRdiff(rdiff: number) {
    if (rdiff === undefined) {
        return h('span');
    } else if (rdiff === 0) {
        return h('span', '±0');
    } else if (rdiff < 0) {
        return h('bad', rdiff);
    } else if (rdiff > 0) {
        return h('good', '+' + rdiff);
    } else {
        return h('span');
    }
}

export function result(variant: Variant, status: number, result: string) {
    console.log("result:" + "status:" + status);
    let text = '';
    const variantName = variant.name;
    // console.log("result()", variantName, status, result);
    const first = _(variant.colors.first);
    const second = _(variant.colors.second);
    switch (status) {
        case -2:
        case -1:
            text = _('Playing right now');
            break;
        case 0:
            text = _('Game aborted');
            break;
        case 1:
            text = _('Checkmate');
            break;
        case 2:
            text = _('%1 resigned', (result === '1-0') ? second : first);
            break;
        case 3:
            text = _('Stalemate');
            break;
        case 4:
            text = _('Time out');
            break;
        case 5:
            text = _('Draw');
            break;
        case 6:
            text = _('Time out');
            break;
        case 7:
            text = _('%1 abandoned the game', (result === '1-0') ? second : first);
            break;
        case 8:
            text = _('Cheat detected');
            break;
        case 9:
            text = _('Not started');
            break;
        case 10:
            text = _('Invalid move');
            break;
        case 11:
            text = _('Unknown reason');
            break;
        case 12:
            switch (variantName) {
                case 'orda':
                case 'synochess':
                case 'dobutsu':
                case 'shinobi':
                case 'empire':
                case 'ordamirror':
                    text = _('Campmate');
                    break;
                case 'chak':
                    text = _('Altar mate');
                    break;
                case 'atomic':
                    text = _('Explosion of king');
                    break;
                case 'duck':
                    text = _('King captured');
                    break;
                default:
                    text = _('Point counting');
                    break;
            }
            break;
        case 13:
            switch (variantName) {
                case 'janggi':
                    text = _('Point counting');
                    break;
                default:
                    text = _('Repetition');
                    break;
            }
            break;
        default:
            text = '*';
            break
    }

    if(status == 2 && result === '1-0') {
      text = text + " - " + "White Wins!";
    } else if(status == 2 && result === '0-1'){
      text = text + " - " + "Black Wins!";
    }
    if(status == 1 && result === '1-0') {
      text = text + " - " + "White Wins!";
    } else if(status == 1 && result === '0-1'){
      text = text + " - " + "Black Wins!";
    }
    if((status == 4 || status == 6) && result === '1-0') {
      text = text + " - " + "White Wins!";
    } else if((status == 4 || status == 6) && result === '0-1'){
      text = text + " - " + "Black Wins!";
    }
    if(status <= 0 || status == 1 || status == 2 || status == 4 || status == 6) {
      return text;
    } else {
      return text + ', ' + result;
    }
    //return (status <= 0) ? text : text + ', ' + result;
}
