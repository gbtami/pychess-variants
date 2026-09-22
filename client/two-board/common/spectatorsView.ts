import { h, VNode } from 'snabbdom';

import { patch } from '../../document';
import { renderSpectators, spectatorCount } from '../../spectators';

/* WHO IS WATCHING, AND HOW MANY — the two-board pages' own widget.
   ------------------------------------------------------------------------------------
   The single-board pages do this inside `GameController`, where `onMsgSpectators` and the
   parsing beside it are PRIVATE and the element is named for a position in that page's shell
   (`under-left`). The two-board controllers extend `TwoBoardController`, not that class, so
   nothing was inherited and the round page's socket dropped the message on the floor with the
   call commented out. This is the implementation that was missing, and it owns its node the way
   `AnalysisClockView` and `GameInfoView` own theirs: the page embeds the placeholder, the
   controller renders into it, and no template names it.

   The payload's two forms are read by the shared `client/spectators.ts`, which both families now
   use — see the note there. */

const SELECTOR = 'spectators#spectators';

/** What this widget needs of a tab strip, and nothing more — the same structural-host shape
 *  `toolsPlacement`'s `StandingTabHost` uses, so the widget does not depend on the whole
 *  `TabbedPanels` class to put a number on a tab. */
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

    /* THE COUNT GOES ON THE TAB THAT HOLDS THE LIST, which is the only place a reader who is not
       looking at the list can learn there is anything to look at. Bound after construction rather
       than taken by the constructor: the strip is built FROM this widget's placeholder, so the
       widget necessarily exists first. */
    countIn(host: TabLabelHost, index: number, label: string): void {
        this.tab = { host, index, label };
    }

    /** The message as drawn: the list in the panel, the count on the tab.
     *
     * NOTHING IN BRACKETS WHEN NOBODY IS WATCHING. A `(0)` is noise on a tab a reader sees for
     * the whole game, and "Info" is what the tab is called; the brackets are an exception the
     * presence of spectators earns. */
    render(raw: string): void {
        this.vnode = patch(this.vnode, h(SELECTOR, renderSpectators(raw)));

        if (this.tab === null) return;
        const count = spectatorCount(raw);
        this.tab.host.setLabel(this.tab.index, count > 0 ? `${this.tab.label} (${count})` : this.tab.label);
    }
}
