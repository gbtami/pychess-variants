import { h, type VNode } from 'snabbdom';

import { _ } from './i18n';
import { patch } from './document';
import type { Variant } from './variants';

interface ShortcutItem {
    keys: string[];
    description: string;
}

interface ShortcutSection {
    title: string;
    items: ShortcutItem[];
}

export interface GameKeyboardHelpHost {
    closeKeyboardHelp(): void;
    variant: Variant;
}

let keyboardHelpVNode: VNode | null = null;

export function isKeyboardHelpShortcut(event: KeyboardEvent) {
    return event.key === '?' || (event.key === '/' && event.shiftKey);
}

function formatKeyLabel(key: string) {
    return key
        .replace(/left/i, _('Left arrow'))
        .replace(/right/i, _('Right arrow'))
        .replace(/up/i, _('Up arrow'))
        .replace(/down/i, _('Down arrow'))
        .replace(/enter/i, _('Enter'));
}

function renderKey(key: string): VNode {
    return h('kbd', formatKeyLabel(key));
}

function renderKeys(keys: string[]): VNode {
    return h(
        'div.keys',
        keys.flatMap((key, index) => (index === 0 ? [renderKey(key)] : [h('span.sep', _('or')), renderKey(key)])),
    );
}

export function buildGameKeyboardHelpSections(
    ctrl: GameKeyboardHelpHost,
    options: { flipDescription?: string } = {},
): ShortcutSection[] {
    const sections: ShortcutSection[] = [
        {
            title: _('Navigation'),
            items: [
                { keys: ['left'], description: _('Previous move') },
                { keys: ['right'], description: _('Next move') },
                { keys: ['up'], description: _('First move') },
                { keys: ['down'], description: _('Last move') },
            ],
        },
        {
            title: _('Board'),
            items: [
                { keys: ['f'], description: options.flipDescription || _('Flip board') },
                { keys: ['?'], description: _('Show keyboard shortcuts') },
            ],
        },
    ];

    if (ctrl.variant.rules.gate || ctrl.variant.name === 'duck' || ctrl.variant.name === 'supply') {
        sections.push({
            title: _('Input'),
            items: [{ keys: ['enter'], description: _('Confirm current move input') }],
        });
    }

    return sections;
}

function view(ctrl: GameKeyboardHelpHost, sections: ShortcutSection[]): VNode {
    return h(
        'div.keyboard-help',
        {
            attrs: {
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'keyboard-help-title',
            },
            on: {
                click: (event: MouseEvent) => {
                    if (event.target === event.currentTarget) ctrl.closeKeyboardHelp();
                },
            },
        },
        [
            h('div.keyboard-help__content', [
                h('div.keyboard-help__header', [
                    h('h2#keyboard-help-title', _('Keyboard shortcuts')),
                    h(
                        'button.keyboard-help__close',
                        {
                            attrs: { type: 'button', 'aria-label': _('Close') },
                            on: { click: () => ctrl.closeKeyboardHelp() },
                            hook: {
                                insert: vnode => {
                                    (vnode.elm as HTMLButtonElement).focus();
                                },
                            },
                        },
                        '×',
                    ),
                ]),
                h(
                    'div.keyboard-help__grid',
                    sections.map(section =>
                        h('section.keyboard-help__section', [
                            h('h3', section.title),
                            h('table', [
                                h(
                                    'tbody',
                                    section.items.map(item =>
                                        h('tr', [
                                            h('td.keys-cell', renderKeys(item.keys)),
                                            h('td.description-cell', item.description),
                                        ]),
                                    ),
                                ),
                            ]),
                        ]),
                    ),
                ),
            ]),
        ],
    );
}

function ensureContainer() {
    let element = document.getElementById('keyboard-help');
    if (!element) {
        element = document.createElement('div');
        element.id = 'keyboard-help';
        document.body.appendChild(element);
    }
    element.style.display = 'flex';
    return element;
}

export function showGameKeyboardHelp(ctrl: GameKeyboardHelpHost, sections: ShortcutSection[]) {
    const container = ensureContainer();
    const vnode = view(ctrl, sections);

    if (keyboardHelpVNode === null) {
        container.innerHTML = '';
        const placeholder = document.createElement('div');
        container.appendChild(placeholder);
        keyboardHelpVNode = patch(placeholder, vnode);
    } else {
        keyboardHelpVNode = patch(keyboardHelpVNode, vnode);
    }
}

export function hideGameKeyboardHelp() {
    const container = document.getElementById('keyboard-help');
    if (container) container.style.display = 'none';
    keyboardHelpVNode = null;
}
