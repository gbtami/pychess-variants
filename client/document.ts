import { VNode, init, classModule, attributesModule, propsModule, eventListenersModule, styleModule } from 'snabbdom';

import { sanitizeURL } from './url';

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

export function ensureBoardStyleOverride() {
    if (document.getElementById('board-style-override')) return;

    const style = document.createElement('style');
    style.id = 'board-style-override';
    style.textContent = '[data-board-variant] cg-board { background-image: var(--board-image); }';
    document.head.appendChild(style);
}

export function pieceStyleClass(family: string, cssFile: string) {
    if (cssFile === 'letters' || cssFile === 'invisible') return `piece-style-${cssFile}`;
    return `piece-style-${family}-${cssFile}`;
}

export function ensurePieceCSS(assetUrl: string, family: string, cssFile: string) {
    const cssId = (cssFile === 'letters' || cssFile === 'invisible') ?
        `piece-set-${cssFile}` :
        `piece-set-${family}-${cssFile}`;
    let newUrl = sanitizeURL(`${assetUrl}/piece-css/${family}/${cssFile}.css`);
    if (cssFile === 'letters') newUrl = sanitizeURL(`${assetUrl}/piece-css/letters.css`);
    if (cssFile === 'invisible') newUrl = sanitizeURL(`${assetUrl}/piece-css/invisible.css`);

    if (document.getElementById(cssId)) return;

    const link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.setAttribute("href", newUrl);

    const anchor = document.querySelector('link[rel="stylesheet"][href*="extensions.css"]');
    if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(link, anchor);
    } else {
        document.head.appendChild(link);
    }
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
