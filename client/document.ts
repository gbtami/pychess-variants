import { VNode, init, classModule, attributesModule, propsModule, eventListenersModule, styleModule } from 'snabbdom';

import * as cg from "chessgroundx/types";

export const patch = init([classModule, attributesModule, propsModule, eventListenersModule, styleModule]);

export function downloadPgnText(filename: string) {
    const text = (document.getElementById('pgntext') as HTMLInputElement).innerHTML;
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

export function getDocumentData(name: string) {
    const elm = document.getElementById('pychess-variants');
    if (elm) {
        return elm.getAttribute('data-' + name.toLowerCase());
    } else {
        return "";
    }
}

export function getPieceImageUrl (variant: string, role: cg.Role, color: cg.Color, side: string): string {
    // Analysis drop move suggestion rendering needs piece images urls in chessground
    // We can use current variant .css to find appropriate images.

    const el = document.querySelector(`piece.${color}.${role}.${side}`) as HTMLElement;
    if (el) {
        const image = window.getComputedStyle(el, null).getPropertyValue("background-image");
        if (image) {
            const url = image.split('"')[1];
            if (url) return url.slice(url.indexOf('/static'));
        }
    }
    // In Kyoto Shogi and Chennis not all droppable pieces are rendered in the pockets
    // because they may be dropped with flipped side as well. To solve this problem
    // we will construct piece image url from unprotmoted piece urls here.
    if (variant === "kyotoshogi") {
        const kyotoPromotedPieceRoles = ['pp-piece', 'pl-piece', 'pn-piece', 'ps-piece'];
        const idx = kyotoPromotedPieceRoles.indexOf(role);
        if (idx !== -1) {
            const unpromoted = getPieceImageUrl(variant, role.slice(1) as cg.Role, color, side);
            const kyotoPromotedPieceNames = ['HI', 'TO', 'KI', 'KA'];
            return unpromoted.slice(0, unpromoted.lastIndexOf('/') + 2) + kyotoPromotedPieceNames[idx] + '.svg'
        }
    }
    if (variant === "chennis") {
        const chennisPromotedPieceRoles = ['pp-piece', 'pm-piece', 'ps-piece', 'pf-piece'];
        const idx = chennisPromotedPieceRoles.indexOf(role);
        if (idx !== -1) {
            const chennisPromotedPieceNames = ['R', 'N', 'B', 'C'];
            const unpromotedLetter = role.slice(1, 2).toUpperCase();
            const unpromotedUrl = getPieceImageUrl(variant, role.slice(1) as cg.Role, color, side);
            if (unpromotedUrl.includes('chennis')) {
                return unpromotedUrl.slice(0, unpromotedUrl.lastIndexOf('/') + 2) + chennisPromotedPieceNames[idx] + unpromotedLetter + '.svg'
            } else if (unpromotedUrl.includes('merida')) {
                const base = '/static/images/pieces/merida/'
                return ((unpromotedLetter === 'F') ? base + 'shako/' : base) + color.slice(0, 1) + chennisPromotedPieceNames[idx] + '.svg'
            } else {
                const base = '/static/images/pieces/green/'
                return ((unpromotedLetter === 'F') ? base + 'synoshako/' : base) + color.slice(0, 1) + chennisPromotedPieceNames[idx] + '.svg'
            }
        }
    }
    return '/static/images/pieces/merida/';
}

export function debounce(callback: any, wait: number) {
    let timeout: ReturnType<typeof setTimeout>;
    return function() {
        const context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => callback.apply(context, args), wait);
    };
}

export function getCookie(name: string) {
    const cookies = document.cookie.split(';');
    for(let i = 0; i < cookies.length; i++) {
        const pair = cookies[i].trim().split('=');
        if(pair[0] === name)
            return pair[1];
    }
    return "";
}

export function setCookie(cname: string, cvalue: string, exdays: number) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function changeCSS(cssLinkIndex: number, cssFile: string) {
    document.getElementsByTagName("link").item(cssLinkIndex)!.setAttribute("href", cssFile);
}

// css file index in templates/base.html
const BOARD_CSS_IDX = 1;
const PIECE_CSS_IDX = 2;

export function changeBoardCSS(assetUrl: string, family: string, cssFile: string) {
    const sheet = document.styleSheets[BOARD_CSS_IDX];
    const cssRules = sheet.cssRules;
    for (let i = 0; i < cssRules.length; i++) {
        const rule = cssRules[i];
        if (!( rule instanceof CSSStyleRule)) {
            continue;
        }
        if (rule.selectorText === `.${family} cg-board`) {
            // console.log("changeBoardCSS", family, cssFile, i)
            sheet.deleteRule(i)
            const newRule = `.${family} cg-board {background-image: url(${assetUrl}/images/board/${cssFile})}`;
            // console.log(newRule);
            sheet.insertRule(newRule, i);
            break;
        }
    }
}

export function changePieceCSS(assetUrl: string, family: string, cssFile: string) {
    let cssLinkIndex = PIECE_CSS_IDX;
    switch (family) {
        case "standard": break;
        case "seirawan": cssLinkIndex += 1; break;
        case "makruk": cssLinkIndex += 2; break;
        case "sittuyin": cssLinkIndex += 3; break;
        case "asean": cssLinkIndex += 4; break;
        case "shogi": cssLinkIndex += 5; break;
        case "kyoto": cssLinkIndex += 6; break;
        case "tori": cssLinkIndex += 7; break;
        case "xiangqi": cssLinkIndex += 8; break;
        case "capa": cssLinkIndex += 9; break;
        case "shako": cssLinkIndex += 10; break;
        case "shogun": cssLinkIndex += 11; break;
        case "janggi": cssLinkIndex += 12; break;
        case "orda": cssLinkIndex += 13; break;
        case "synochess": cssLinkIndex += 14; break;
        case "hoppel": cssLinkIndex += 15; break;
        case "dobutsu": cssLinkIndex += 16; break;
        case "shinobi": cssLinkIndex += 17; break;
        case "empire": cssLinkIndex += 18; break;
        case "ordamirror": cssLinkIndex += 19; break;
        case "chak": cssLinkIndex += 20; break;
        case "chennis": cssLinkIndex += 21; break;
        default: throw "Unknown piece family " + family;
    }
    const newUrl = `${assetUrl}/piece/${family}/${cssFile}.css`;
    // console.log("changePieceCSS", family, cssFile, newUrl)
    changeCSS(cssLinkIndex, newUrl);
}

export function bind(eventName: string, f: (e: Event) => void, redraw: null | (() => void)) {
    return {
        insert(vnode: VNode) {
            vnode.elm?.addEventListener(eventName, (e: Event) => {
                const res = f(e);
                if (redraw) redraw();
                return res;
            });
        }
    };
}
