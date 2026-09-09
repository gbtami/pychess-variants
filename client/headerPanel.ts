import { toVNode, type VNode } from 'snabbdom';

import { patch } from './document';

function removeFormattingWhitespace(node: Node): void {
    Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) child.remove();
        else removeFormattingWhitespace(child);
    });
}

/**
 * Upgrade a server-rendered header panel without replacing its stable controls.
 *
 * The header button shells are present in the initial HTML to avoid a flash of
 * missing controls during full-page navigation. Jinja indentation produces
 * whitespace text nodes that are absent from the client VNodes, so discard only
 * that formatting whitespace before converting the live DOM for Snabbdom.
 */
export function hydrateHeaderPanel(panel: HTMLElement, view: VNode): HTMLElement {
    removeFormattingWhitespace(panel);
    return patch(toVNode(panel), view).elm as HTMLElement;
}
