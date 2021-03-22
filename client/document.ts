export function getDocumentData(name: string) {
    const elm = document.getElementById('pychess-variants');
    if (elm) {
        return elm.getAttribute('data-' + name.toLowerCase());
    } else {
        return "";
    }
}

export function getPieceImageUrl (role, color) {
    // console.log('getPieceImageUrl()', role, color);
    const el = document.querySelector(`piece.${role}.${color}`) as HTMLElement;
    if (el) {
        const image = window.getComputedStyle(el, null).getPropertyValue("background-image");
        if (image) {
            const url = image.split('"')[1];
            if (url) return url.slice(url.indexOf('/static'));
        }
    }
    return '/static/images/pieces/merida/';
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
        if (rule.selectorText === `.${family} .cg-wrap`) {
            console.log("changeBoardCSS", family, cssFile, i)
            sheet.deleteRule(i)
            const newRule = `.${family} .cg-wrap {background-image: url(${assetUrl}/images/board/${cssFile})}`;
            console.log(newRule);
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
        case "dobutsu": cssLinkIndex += 14; break;
        default: throw "Unknown piece family " + family;
    }
    const newUrl = `${assetUrl}/piece/${family}/${cssFile}.css`;
    console.log("changePieceCSS", family, cssFile, newUrl)
    changeCSS(cssLinkIndex, newUrl);
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
