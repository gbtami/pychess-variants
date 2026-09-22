import { h, VNode } from 'snabbdom';

import { patch } from '../../document';
import { renderSpectators, spectatorCount } from '../../spectators';

const SELECTOR = 'spectators#spectators';

export interface TabLabelHost {
    setLabel(index: number, label: string): void;
}

export class SpectatorsView {
    private vnode: VNode | HTMLElement;
    private tab: { host: TabLabelHost; index: number; label: string } | null = null;

    constructor() {
        this.vnode = h(SELECTOR);
    }

    placeholder(): VNode {
        return this.vnode as VNode;
    }

    // Bind after the tab strip is built from this view's placeholder.
    countIn(host: TabLabelHost, index: number, label: string): void {
        this.tab = { host, index, label };
    }

    /** Updates the list and tab count, omitting the count when nobody is watching. */
    render(raw: string): void {
        this.vnode = patch(this.vnode, h(SELECTOR, renderSpectators(raw)));

        if (this.tab === null) return;
        const count = spectatorCount(raw);
        this.tab.host.setLabel(this.tab.index, count > 0 ? `${this.tab.label} (${count})` : this.tab.label);
    }
}
