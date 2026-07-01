import { h, VNode } from 'snabbdom';

import { alertDialog } from './alertDialog';
import { patch } from './document';
import { _ } from './i18n';
import { PyChessModel } from './types';
import {
    CataloguedVariantClientDocument,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from './variants';

type ManagedVariant = CataloguedVariantClientDocument & {
    author?: string;
    archived?: boolean;
    enabled?: boolean;
    gameCount?: number;
    locked?: boolean;
};

type State = {
    loaded: boolean;
    saving: boolean;
    variants: ManagedVariant[];
    editing: ManagedVariant | null;
    message: string;
};

const state: State = {
    loaded: false,
    saving: false,
    variants: [],
    editing: null,
    message: '',
};

let rootVNode: VNode | Element | null = null;

function rerender(model: PyChessModel): void {
    if (!rootVNode) return;
    rootVNode = patch(rootVNode, renderRoot(model));
}

async function responseError(response: Response): Promise<string> {
    const text = await response.text();
    return text || `${_('Request failed')} (${response.status})`;
}

async function loadMine(model: PyChessModel): Promise<void> {
    try {
        const response = await fetch('/api/catalogued-variants/mine');
        if (!response.ok) throw new Error(await responseError(response));
        const payload = await response.json() as { variants: ManagedVariant[] };
        state.variants = payload.variants || [];
        state.loaded = true;
        state.message = '';
    } catch (err) {
        state.loaded = true;
        state.message = err instanceof Error ? err.message : _('Failed to load variants');
    }
    rerender(model);
}

function readForm(): { displayName: string; description: string; ini: string } {
    return {
        displayName: (document.getElementById('catalogued-display-name') as HTMLInputElement | null)?.value ?? '',
        description: (document.getElementById('catalogued-description') as HTMLInputElement | null)?.value ?? '',
        ini: (document.getElementById('catalogued-ini') as HTMLTextAreaElement | null)?.value ?? '',
    };
}

function registerFromPayload(payload: { oldName?: string; variant?: ManagedVariant }): void {
    if (payload.oldName && payload.variant?.name && payload.oldName !== payload.variant.name) {
        unregisterCataloguedVariant(payload.oldName);
    }
    if (!payload.variant) return;
    if (payload.variant.enabled !== false && payload.variant.archived !== true) {
        registerCataloguedVariant(payload.variant);
    } else {
        unregisterCataloguedVariant(payload.variant.name);
    }
}

const SECTION_RE = /^\s*\[\s*([A-Za-z0-9_]+)(?::[^\]]+)?\s*\]\s*$/gm;
function extractVariantName(ini: string): string {
    const sections = [...ini.matchAll(SECTION_RE)].map(match => match[1]);
    if (sections.length !== 1) throw new Error(_('The INI must contain exactly one variant section.'));
    const name = sections[0];
    if (!/^[a-z][a-z0-9_]{2,31}$/.test(name)) {
        throw new Error(_('Variant names must be 3-32 chars, start with a lowercase letter, and contain only lowercase letters, digits, and underscores.'));
    }
    return name;
}

function validateVariantNameAvailable(name: string, editingName?: string): void {
    if (editingName && name === editingName) return;
    if (Object.prototype.hasOwnProperty.call(VARIANTS, name)) {
        throw new Error(_('A variant with this name already exists.'));
    }
}

function validateBasicIni(ini: string, editingName?: string): string {
    const name = extractVariantName(ini);
    validateVariantNameAvailable(name, editingName);

    const previousIni = state.editing?.ini ?? '';
    const rulesChanged = !!editingName && ini.trim() !== previousIni.trim();
    if (rulesChanged && name === editingName) {
        throw new Error(_('Changing rules requires a new variant section name, because Fairy-Stockfish cannot replace an already loaded runtime variant.'));
    }
    return name;
}


async function validateCurrentForm(model: PyChessModel): Promise<void> {
    const body = readForm();
    if (!body.ini.trim()) {
        await alertDialog({ text: _('Paste one Fairy-Stockfish variant definition first.') });
        return;
    }

    const currentName = state.editing?.name;
    try {
        const name = validateBasicIni(body.ini.trim(), currentName);
        const response = await fetch('/api/catalogued-variants/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ini: body.ini, currentName }),
        });
        if (!response.ok) throw new Error(await responseError(response));
        state.message = `${_('Fairy-Stockfish check passed for')} ${name}.`;
    } catch (err) {
        state.message = err instanceof Error ? err.message : _('Variant check failed');
    }
    rerender(model);
}

async function saveVariant(model: PyChessModel): Promise<void> {
    const body = readForm();
    if (!body.ini.trim()) {
        await alertDialog({ text: _('Paste one Fairy-Stockfish variant definition first.') });
        return;
    }

    const editingName = state.editing?.name;
    try {
        validateBasicIni(body.ini.trim(), editingName);
    } catch (err) {
        state.message = err instanceof Error ? err.message : _('Variant check failed');
        rerender(model);
        return;
    }

    state.saving = true;
    rerender(model);

    const url = editingName ? `/api/catalogued-variants/${encodeURIComponent(editingName)}` : '/api/catalogued-variants';
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(await responseError(response));
        const payload = await response.json() as { oldName?: string; variant?: ManagedVariant };
        registerFromPayload(payload);
        state.editing = null;
        state.message = editingName ? _('Variant updated.') : _('Variant uploaded.');
        await loadMine(model);
    } catch (err) {
        state.message = err instanceof Error ? err.message : _('Failed to save variant');
    } finally {
        state.saving = false;
        rerender(model);
    }
}

async function postAction(model: PyChessModel, variant: ManagedVariant, action: 'delete' | 'archive' | 'restore' | 'clone'): Promise<void> {
    const labels = {
        delete: _('delete'),
        archive: _('archive'),
        restore: _('restore'),
        clone: _('clone'),
    };
    if ((action === 'delete' || action === 'archive') && !window.confirm(`${labels[action]} ${variant.displayName}?`)) return;

    state.saving = true;
    rerender(model);
    try {
        const response = await fetch(`/api/catalogued-variants/${encodeURIComponent(variant.name)}/${action}`, { method: 'POST' });
        if (!response.ok) throw new Error(await responseError(response));
        const payload = await response.json() as { deleted?: string; archived?: string; variant?: ManagedVariant };
        if (payload.deleted) unregisterCataloguedVariant(payload.deleted);
        if (payload.archived) unregisterCataloguedVariant(payload.archived);
        registerFromPayload(payload);
        state.message = _('Done.');
        await loadMine(model);
    } catch (err) {
        state.message = err instanceof Error ? err.message : _('Action failed');
    } finally {
        state.saving = false;
        rerender(model);
    }
}

function playVariant(model: PyChessModel, variant: ManagedVariant): void {
    if (variant.archived || variant.enabled === false) return;
    localStorage.seek_variant = variant.name;
    window.location.assign(`${model.home}/?any`);
}

function editVariant(model: PyChessModel, variant: ManagedVariant): void {
    state.editing = variant;
    state.message = '';
    rerender(model);
    setTimeout(() => document.getElementById('catalogued-display-name')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
}

function cancelEdit(model: PyChessModel): void {
    state.editing = null;
    state.message = '';
    rerender(model);
}

function renderForm(model: PyChessModel): VNode {
    const editing = state.editing;
    return h('section.catalogued-card.catalogued-form', [
        h('h2', editing ? _('Edit variant') : _('Upload new variant')),
        h('p', _('Paste exactly one Fairy-Stockfish variant definition. Rules are locked after the first played game.')),
        h('p.catalogued-help', _('If you change the rules of an unused variant, also change the INI section name, because Fairy-Stockfish cannot replace an already loaded runtime variant.')),
        h('form', {
            on: {
                submit: (event: Event) => {
                    event.preventDefault();
                    void saveVariant(model);
                },
            },
        }, [
            h('label', [
                h('span', _('Display name')),
                h('input#catalogued-display-name', {
                    props: {
                        value: editing?.displayName ?? '',
                        placeholder: _('Display name'),
                        autocomplete: 'off',
                        disabled: state.saving,
                    },
                }),
            ]),
            h('label', [
                h('span', _('Short description')),
                h('input#catalogued-description', {
                    props: {
                        value: editing?.tooltip === 'Catalogued variant' ? '' : editing?.tooltip ?? '',
                        placeholder: _('Short description'),
                        autocomplete: 'off',
                        disabled: state.saving,
                    },
                }),
            ]),
            h('label', [
                h('span', _('Variant definition')),
                h('textarea#catalogued-ini', {
                    props: {
                        value: editing?.ini ?? '',
                        placeholder: '[myvariant:chess]\nvariantTemplate = chess\n',
                        spellcheck: false,
                        disabled: state.saving,
                    },
                }),
            ]),
            h('div.catalogued-actions', [
                h('button.lobby-button', { props: { type: 'submit', disabled: state.saving } }, editing ? _('Save changes') : _('Upload variant')),
                h('button', { props: { type: 'button', disabled: state.saving }, on: { click: () => void validateCurrentForm(model) } }, _('Check rules')),
                editing ? h('button', { props: { type: 'button', disabled: state.saving }, on: { click: () => cancelEdit(model) } }, _('Cancel')) : null,
            ]),
        ]),
    ]);
}

function renderRows(model: PyChessModel): VNode {
    if (!state.loaded) return h('p', _('Loading...'));
    if (state.variants.length === 0) return h('p.catalogued-empty', _('You have not uploaded any variants yet.'));

    return h('table.catalogued-table', [
        h('thead', h('tr', [
            h('th', _('Name')),
            h('th', _('Status')),
            h('th', _('Games')),
            h('th', _('Actions')),
        ])),
        h('tbody', state.variants.map(variant => {
            const locked = !!variant.locked;
            const archived = !!variant.archived || variant.enabled === false;
            const lockTitle = locked ? _('This variant already has games. Clone it to change the rules.') : '';
            return h('tr', { class: { archived } }, [
                h('td', [
                    h('strong', variant.displayName),
                    h('code', variant.name),
                    variant.tooltip ? h('p', variant.tooltip) : null,
                ]),
                h('td', archived ? _('Archived') : locked ? _('Locked') : _('Editable')),
                h('td', String(variant.gameCount ?? 0)),
                h('td.catalogued-row-actions', [
                    h('button', { props: { type: 'button', disabled: archived }, on: { click: () => playVariant(model, variant) } }, _('Play')),
                    h('button', { props: { type: 'button', disabled: locked || state.saving }, attrs: { title: lockTitle }, on: { click: () => editVariant(model, variant) } }, _('Edit')),
                    h('button', { props: { type: 'button', disabled: locked || state.saving }, attrs: { title: lockTitle }, on: { click: () => void postAction(model, variant, 'delete') } }, _('Delete')),
                    archived
                        ? h('button', { props: { type: 'button', disabled: state.saving }, on: { click: () => void postAction(model, variant, 'restore') } }, _('Restore'))
                        : h('button', { props: { type: 'button', disabled: state.saving }, on: { click: () => void postAction(model, variant, 'archive') } }, _('Archive')),
                    h('button', { props: { type: 'button', disabled: state.saving }, on: { click: () => void postAction(model, variant, 'clone') } }, _('Clone')),
                ]),
            ]);
        })),
    ]);
}

function renderRoot(model: PyChessModel): VNode {
    return h('main#my-variants.my-variants', {
        hook: {
            insert: vnode => {
                rootVNode = vnode;
                if (!state.loaded) void loadMine(model);
            },
        },
    }, [
        h('header', [
            h('h1', _('Manage my variants')),
            h('p', _('Uploaded variants appear in the Other group of the game creation dialog. They are always casual/unrated, but can be played against humans or Fairy-Stockfish.')),
        ]),
        model.anon === 'True'
            ? h('section.catalogued-card', [
                h('h2', _('Sign in required')),
                h('p', _('Please sign in to upload and manage your variants.')),
            ])
            : h('div', [
                state.message ? h('p.catalogued-message', state.message) : null,
                renderForm(model),
                h('section.catalogued-card', [
                    h('h2', _('My variants')),
                    renderRows(model),
                ]),
            ]),
    ]);
}

export function myVariantsView(model: PyChessModel): VNode[] {
    return [renderRoot(model)];
}
