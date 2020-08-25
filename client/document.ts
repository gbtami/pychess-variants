import { _ } from './i18n';

export function getDocumentData(name: string) {
    const elm = document.getElementById('pychess-variants');
    if (elm) {
        return elm.getAttribute('data-' + name.toLowerCase());
    } else {
        return "";
    }
}

export function debounce(callback, wait) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => callback.apply(context, args), wait);
    };
}

export function getCookie(name) {
    const cookies = document.cookie.split(';');
    for(let i = 0; i < cookies.length; i++) {
        const pair = cookies[i].trim().split('=');
        if(pair[0] == name)
            return pair[1];
    }
    return "";
}

export function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function changeCSS(cssLinkIndex: number, cssFile: string) {
    document.getElementsByTagName("link").item(cssLinkIndex)!.setAttribute("href", cssFile);
}

// css file index in template.html
const BOARD_CSS_START = 1;
const PIECE_CSS_START = 13;

export function changeBoardCSS(family: string, cssFile: string) {
    let cssLinkIndex = BOARD_CSS_START;
    switch (family) {
        case "makruk8x8": break;
        case "sittuyin8x8": cssLinkIndex += 1; break;
        case "shogi9x9": cssLinkIndex += 2; break;
        case "shogi5x5": cssLinkIndex += 3; break;
        case "janggi9x10": cssLinkIndex += 4; break;
        case "xiangqi9x10": cssLinkIndex += 5; break;
        case "xiangqi7x7": cssLinkIndex += 6; break;
        case "standard8x8": cssLinkIndex += 7; break;
        case "standard10x8": cssLinkIndex += 8; break;
        case "standard10x10": cssLinkIndex += 9; break;
        case "grand10x10": cssLinkIndex += 10; break;
        case "shogun8x8": cssLinkIndex += 11; break;
        default: throw "Unknown piece family " + family;
    }
    changeCSS(cssLinkIndex, "/static/board/" + family + "/" + cssFile + ".css");
}

export function changePieceCSS(family: string, cssFile: string) {
    let cssLinkIndex = PIECE_CSS_START;
    switch (family) {
        case "standard": break;
        case "seirawan": cssLinkIndex += 1; break;
        case "makruk": cssLinkIndex += 2; break;
        case "sittuyin": cssLinkIndex += 3; break;
        case "shogi": cssLinkIndex += 4; break;
        case "kyoto": cssLinkIndex += 5; break;
        case "xiangqi": cssLinkIndex += 6; break;
        case "capa": cssLinkIndex += 7; break;
        case "shako": cssLinkIndex += 8; break;
        case "shogun": cssLinkIndex += 9; break;
        case "janggi": cssLinkIndex += 10; break;
        case "orda": cssLinkIndex += 11; break;
        case "synochess": cssLinkIndex += 12; break;
        case "hoppel": cssLinkIndex += 13; break;
        default: throw "Unknown piece family " + family;
    }
    changeCSS(cssLinkIndex, "/static/piece/" + family + "/" + cssFile + ".css");
}

export function bind(eventName: string, f: (e: Event) => void, redraw) {
    return {
        insert(vnode) {
            vnode.elm.addEventListener(eventName, e => {
                const res = f(e);
                if (redraw) redraw();
                return res;
            });
        }
    };
}
