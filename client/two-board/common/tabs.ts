import { h, VNode } from 'snabbdom';

// Reusable ARIA tablist/tabpanel widget for two-board pages.
//
// The widget builds mountable vnodes and nothing else: the **tablist**, and one
// **panel** per part of per tab. It deliberately does NOT build a container
// around any of them — not around the tablist and the panels, not around one
// tab's several parts, and not around the same part index across tabs. A page
// that wants any of them inside one element renders that element itself, which
// is what lets a page put the switcher somewhere other than directly above its
// content, and put one part of a tab somewhere other than beside its siblings.
//
// A tab is a list of PARTS. Each part is one dom-tree, mounted wherever the page
// wants it, and every part of every tab is an independent mount point: three tabs
// of two parts each give six. Part counts are per tab and unrelated — one tab may
// have three parts, the next one, the next two. Nothing is derived from a maximum
// and nothing is reserved for a part that was not declared.
//
// Parts are addressed positionally, by `panel(tabIndex, partIndex)`. The caller
// declared the tabs in order and each tab's parts in order, so it can name any
// part in the same terms it used to build it. A caller may equally keep the
// vnodes it passed in and mount those instead; both work. Note the accessor
// returns the panel this module wrapped around that content, not the content
// itself — the wrapper carries the ARIA attributes and the visibility that
// switching toggles, so the wrapper is the thing to mount.
//
// That freedom is real because switching never touches the DOM: `select()`
// addresses the tab and panel vnodes this object retains, through their `.elm`.
// There is no proximity requirement between any two parts, and no selector, id
// lookup or traversal anywhere in this module. Ids exist on the elements only
// because `aria-controls` and `aria-labelledby` are id references, and no
// behaviour here reads them. A tab controls several panels once it has several
// parts, which `aria-controls` expresses natively as an id-reference list.
//
// Callers never name a tab or a panel. The constructor id is a prefix:
// `<id>-tablist` for the tablist, `<id>-tab-<i>` for a tab and
// `<id>-panel-<tab>-<part>` for a panel, so two widgets on one page cannot
// collide.
//
// SIZING IS THE PAGE'S JOB. Because there is no panel container, nothing here
// claims space or passes it on; each panel is sized by wherever it is mounted.
// The round page's stylesheet does this for its panels, and any layout that
// mounts a part somewhere new has to say what that part does there.
//
// Selection is NOT a re-render. Re-patching would be the more idiomatic snabbdom
// approach, but panels hold content this module does not own — the round page's
// movelist and game-info views retain and patch their own vnodes, and its chat
// renders into its container after insertion. Diffing those subtrees can replace
// the very elements those owners hold, leaving them patching detached nodes, so
// their content would silently stop updating. Toggling element state leaves
// every panel's subtree untouched.
//
// The consequence is that the selected tab lives in the DOM rather than in a
// model: anything that re-patches a mounted part resets it to index 0. No
// two-board page does that — each owner patches inside a panel.

export interface TabPartDef {
    panelClass?: string; // extra class on this part's panel, e.g. 'chart-container'
    content: VNode[];
}

export interface TabPanelDef {
    label: string;
    parts: TabPartDef[];
}

export class TabbedPanels {
    // retained so select() can address the elements once the page's patch has
    // populated each vnode's .elm. Indexed [tab][part].
    private readonly panelVnodes: VNode[][];
    private readonly tabVnodes: VNode[];
    private readonly tabListVnode: VNode;

    constructor(id: string, panels: TabPanelDef[], ariaLabel: string) {
        const tabId = (t: number) => `${id}-tab-${t}`;
        const panelId = (t: number, p: number) => `${id}-panel-${t}-${p}`;

        this.panelVnodes = panels.map((panel, t) =>
            panel.parts.map((part, p) =>
                h(
                    part.panelClass ? `div.${part.panelClass}` : 'div',
                    {
                        attrs: {
                            id: panelId(t, p),
                            role: 'tabpanel',
                            tabindex: String(t),
                            'aria-labelledby': tabId(t),
                        },
                        // tab 0 is the default; every other tab's parts rely on the
                        // page stylesheet's `display: none` for [role=tabpanel]
                        style: t === 0 ? { display: 'flex' } : {},
                    },
                    part.content,
                ),
            ),
        );

        this.tabVnodes = panels.map((panel, t) =>
            h(
                'span',
                {
                    attrs: {
                        role: 'tab',
                        'aria-selected': t === 0 ? 'true' : 'false',
                        // an id-reference LIST: a tab controls every one of its parts
                        'aria-controls': panel.parts.map((_part, p) => panelId(t, p)).join(' '),
                        id: tabId(t),
                        tabindex: String(t),
                    },
                    on: { click: () => this.select(t) },
                },
                panel.label,
            ),
        );

        this.tabListVnode = h(
            'div',
            { attrs: { id: `${id}-tablist`, role: 'tablist', 'aria-label': ariaLabel } },
            this.tabVnodes,
        );
    }

    // The mountable parts. Both accessors return vnodes built in the constructor
    // and never build new ones: select() operates on the vnodes this object holds,
    // so handing out a fresh vnode would leave switching acting on an element that
    // was never mounted — and only sometimes, depending on how often the caller
    // asked. A page that wants no switcher simply does not mount tabList().
    tabList(): VNode {
        return this.tabListVnode;
    }

    // The panel wrapping one part, addressed as the caller declared it. Every part
    // must be mounted somewhere: one that is declared and never mounted simply
    // never appears, and its tab will look half-rendered when selected.
    panel(tabIndex: number, partIndex: number): VNode {
        return this.panelVnodes[tabIndex][partIndex];
    }

    // Runs only after the page's patch, so every .elm exists.
    private select(index: number): void {
        this.tabVnodes.forEach((tab, t) =>
            (tab.elm as HTMLElement).setAttribute('aria-selected', t === index ? 'true' : 'false'),
        );
        // every part of every tab, wherever each one happens to be mounted
        this.panelVnodes.forEach((parts, t) =>
            parts.forEach(panel => ((panel.elm as HTMLElement).style.display = t === index ? 'flex' : 'none')),
        );
    }
}
