import { h, VNode } from 'snabbdom';

// Reusable ARIA tablist/tabpanel widget for two-board pages. Callers never
// supply ids: renderTabbedPanels derives every tab/panel id, aria-selected, and
// tabindex purely from position in the panels array (index 0 is selected and
// default). Click-to-switch and the default panel's initial visibility are
// wired directly into the vnodes at creation time (snabbdom's `on`/`style`),
// not queried from `document` after the fact — so there is no controller/
// instance to thread through, and no post-insert wiring step — usable from
// any two-board page.

interface TabDef {
    id: string; // tab element id, e.g. 'tab-0'
    panelId: string; // id of the panel this tab controls, e.g. 'panel-0'
    label: string;
}

export interface TabPanelDef {
    label: string;
    panelClass?: string; // extra class on the panel's wrapper div, e.g. 'chart-container'
    content: VNode[];
}

function renderTabList(tabs: TabDef[], ariaLabel: string, hidden: boolean): VNode {
    return h(
        'div',
        {
            attrs: { role: 'tablist', 'aria-label': ariaLabel },
            style: hidden ? { display: 'none' } : {},
        },
        tabs.map((tab, idx) =>
            h(
                'span',
                {
                    attrs: {
                        role: 'tab',
                        'aria-selected': idx === 0 ? 'true' : 'false',
                        'aria-controls': tab.panelId,
                        id: tab.id,
                        tabindex: String(idx),
                    },
                    on: { click: onTabClick },
                },
                tab.label,
            ),
        ),
    );
}

// attrs for a tab's panel element; shares the same index-derived tabindex
// convention as renderTabList so index 0 always names the default panel
function tabPanelAttrs(tab: TabDef, index: number) {
    return { id: tab.panelId, role: 'tabpanel', tabindex: String(index), 'aria-labelledby': tab.id };
}

// builds the whole widget (panels + tablist) inside `container` from a list of
// { label, content, panelClass? } — ids are generated internally from position.
// `hideTabList` collapses to showing just the default panel with no visible
// tab switcher — used when there is nothing meaningful to switch to.
export function renderTabbedPanels(
    container: string,
    panels: TabPanelDef[],
    ariaLabel: string,
    hideTabList = false,
): VNode {
    const tabs: TabDef[] = panels.map((_p, i) => ({ id: `tab-${i}`, panelId: `panel-${i}`, label: panels[i].label }));

    return h(container, [
        ...panels.map((panel, i) =>
            h(
                panel.panelClass ? `div.${panel.panelClass}` : 'div',
                { attrs: tabPanelAttrs(tabs[i], i), style: i === 0 ? { display: 'flex' } : {} },
                panel.content,
            ),
        ),
        renderTabList(tabs, ariaLabel, hideTabList),
    ]);
}

function onTabClick(e: Event) {
    const target = e.target as Element;
    const parent = target.parentNode;
    const grandparent = parent!.parentNode;

    // Remove all current selected tabs
    parent!.querySelectorAll('[aria-selected="true"]').forEach(t => t.setAttribute('aria-selected', 'false'));

    // Set this tab as selected
    target.setAttribute('aria-selected', 'true');

    // Hide all tab panels
    grandparent!.querySelectorAll('[role="tabpanel"]').forEach(p => ((p as HTMLElement).style.display = 'none'));

    // Show the selected panel
    (
        grandparent!.parentNode!.querySelector(`#${target.getAttribute('aria-controls')}`)! as HTMLElement
    ).style.display = 'flex';
}
