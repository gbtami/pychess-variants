import { VNode, init, classModule, attributesModule, propsModule, eventListenersModule, styleModule } from 'snabbdom';

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
const PIECE_CSS_IDX = 2;

export function changeBoardCSS(assetUrl: string, family: string, cssFile: string) {
    const link = document.querySelector('link[href*=board]') as HTMLLinkElement;
    const sheet = link!.sheet;
    const cssRules = sheet!.cssRules;
    for (let i = 0; i < cssRules.length; i++) {
        const rule = cssRules[i];
        if (!( rule instanceof CSSStyleRule)) {
            continue;
        }
        if (rule.selectorText === `.${family} cg-board`) {
            // console.log("changeBoardCSS", family, cssFile, i)
            sheet!.deleteRule(i)
            const newRule = `.${family} cg-board {background-image: url(${assetUrl}/images/board/${cssFile})}`;
            // console.log(newRule);
            sheet!.insertRule(newRule, i);
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
        case "spartan": cssLinkIndex += 22; break;
        case "mansindam": cssLinkIndex += 23; break;
        case "ataxx": cssLinkIndex += 24; break;
        case "cannonshogi": cssLinkIndex += 25; break;
        case "khans": cssLinkIndex += 26; break;
        case "dragon": cssLinkIndex += 27; break;
        default: throw "Unknown piece family " + family;
    }
    let newUrl = `${assetUrl}/piece-css/${family}/${cssFile}.css`;
    if (cssFile === 'letters') newUrl = `${assetUrl}/piece-css/letters.css`;
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
