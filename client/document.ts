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
    const cssId = `piece-set-${family}`;
    let newUrl = sanitizeURL(`${assetUrl}/piece-css/${family}/${cssFile}.css`);
    if (cssFile === 'letters') newUrl = sanitizeURL(`${assetUrl}/piece-css/letters.css`);
    if (cssFile === 'invisible') newUrl = sanitizeURL(`${assetUrl}/piece-css/invisible.css`);
    // console.log("changePieceCSS", family, cssFile, newUrl)
    let link = document.getElementById(cssId) as HTMLLinkElement | null;
    if (!link) {
        link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        console.log('add CSS link', cssId, link);
        const anchor = document.querySelector('link[rel="stylesheet"][href*="extensions.css"]');
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(link, anchor);
        } else {
            document.head.appendChild(link);
        }
    } else {
        const anchor = document.querySelector('link[rel="stylesheet"][href*="extensions.css"]');
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(link, anchor);
        }
    }
    link.setAttribute("href", newUrl);
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
