import { h, VNode } from 'snabbdom';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { changeBoardCSS, changePieceCSS } from '../document';
import { BOARD_FAMILIES, PIECE_FAMILIES } from '../variants';
import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';


export function variantPanels (lobbyCtrl: LobbyController): VNode {
    const assetUrl = lobbyCtrl.assetURL;

    for (const family of Object.keys(BOARD_FAMILIES)) {
        let css: string;
        switch (family) {
            case 'makruk8x8': css = 'makruk.jpg'; break;
            case 'shogi9x9': css = 'ShogiOak.png'; break;
            case 'shogi7x7': css = 'ToriWood.svg'; break;
            case 'shogi5x5': css = 'MiniboardWood1.png'; break;
            case 'shogi5x6': css = 'GorogoroWood.png'; break;
            case 'xiangqi9x10': css = 'xiangqiWood.png'; break;
            case 'xiangqi7x7': css = 'minixiangqiw.png'; break;
            case 'janggi9x10': css = 'JanggiWood.png'; break;
            default: css = BOARD_FAMILIES[family].boardCSS[0]; break;
        };
        changeBoardCSS(assetUrl, family, css);
    }

    for (const family of Object.keys(PIECE_FAMILIES)) {
        let css: string;
        switch (family) {
            case 'standard': css = 'green'; break;
            case 'makruk': css = 'makrukwb'; break;
            case 'shogi': css = 'shogikw3d'; break;
            case 'kyoto': css = 'kyotok'; break;
            case 'xiangqi': css = 'xiangqihnzw'; break;
            case 'janggi': css = 'janggikaw'; break;
            default: css = PIECE_FAMILIES[family].pieceCSS[0]; break;
        };
        changePieceCSS(assetUrl, family, css);
    }

    return "";
}
