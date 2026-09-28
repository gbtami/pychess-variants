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

/**
 * Open or close a header panel's button, keeping the class and the announcement together.
 *
 * `shown` was already the "is open" marker, set at seven sites across four files -- and one of them,
 * `gameCategoryIntro`, opened the settings panel without going through `settingsView` at all. An
 * `aria-expanded` added beside each `classList` call would have gone stale there the first time
 * anybody touched it. One function means the attribute cannot drift from the class.
 *
 * The buttons themselves are rendered once and never re-patched -- `redraw()` in each view patches
 * only the inner panel and updates the button's `aria-label` imperatively for exactly that reason --
 * so writing the attribute here is not undone by a later render.
 */
export function setHeaderPanelExpanded(buttonId: string, open: boolean): void {
    const button = document.getElementById(buttonId);
    if (button === null) return;
    button.classList.toggle('shown', open);
    button.setAttribute('aria-expanded', String(open));
}
