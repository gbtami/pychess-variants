import { h, VNode } from 'snabbdom';

import { alertDialog } from './alertDialog';
import { patch } from './document';
import { checkRulesWithFsfWasm } from './fairyStockfish';
import { _ } from './i18n';
import { PyChessModel } from './types';
import {
    CataloguedVariantClientDocument,
    isBuiltinVariantName,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from './variants';

type VariantVisibility = 'private' | 'unlisted' | 'public';

type ManagedVariant = CataloguedVariantClientDocument & {
    author?: string;
    archived?: boolean;
    enabled?: boolean;
    gameCount?: number;
    locked?: boolean;
    visibility?: VariantVisibility;
};

type State = {
    loaded: boolean;
    saving: boolean;
    variants: ManagedVariant[];
    editing: ManagedVariant | null;
    message: string;
    formMessage: string;
    draftDisplayName: string;
    draftDescription: string;
    draftVisibility: VariantVisibility;
    draftIni: string;
};

const state: State = {
    loaded: false,
    saving: false,
    variants: [],
    editing: null,
    message: '',
    formMessage: '',
    draftDisplayName: '',
    draftDescription: '',
    draftVisibility: 'private',
    draftIni: '',
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

function readForm(): { displayName: string; description: string; visibility: VariantVisibility; ini: string } {
    return {
        displayName: (document.getElementById('catalogued-display-name') as HTMLInputElement | null)?.value ?? state.draftDisplayName,
        description: (document.getElementById('catalogued-description') as HTMLInputElement | null)?.value ?? state.draftDescription,
        visibility: ((document.getElementById('catalogued-visibility') as HTMLSelectElement | null)?.value as VariantVisibility | undefined) ?? state.draftVisibility,
        ini: (document.getElementById('catalogued-ini') as HTMLTextAreaElement | null)?.value ?? state.draftIni,
    };
}

function clearDraft(): void {
    state.draftDisplayName = '';
    state.draftDescription = '';
    state.draftVisibility = 'private';
    state.draftIni = '';
    state.formMessage = '';
}

function setDraftFromVariant(variant: ManagedVariant): void {
    state.draftDisplayName = variant.displayName ?? '';
    state.draftDescription = variant.tooltip === 'Catalogued variant' ? '' : variant.tooltip ?? '';
    state.draftVisibility = variant.visibility ?? 'private';
    state.draftIni = variant.ini ?? '';
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
    if (isBuiltinVariantName(name)) {
        throw new Error(_('This variant name conflicts with an existing site variant.'));
    }
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

async function checkRulesStrictly(ini: string): Promise<void> {
    await checkRulesWithFsfWasm(ini);
}

async function checkRulesOnServer(ini: string, currentName?: string | null): Promise<void> {
    const response = await fetch('/api/catalogued-variants/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ini, currentName }),
    });
    if (!response.ok) throw new Error(await responseError(response));
}

function currentRulesChanged(ini: string): boolean {
    if (!state.editing) return true;
    return ini.trim() !== (state.editing.ini ?? '').trim();
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
        state.saving = true;
        if (!currentRulesChanged(body.ini)) {
            state.formMessage = _('The rules are unchanged; metadata and visibility can still be saved.');
            return;
        }
        state.formMessage = `${_('Checking rules for')} ${name}...`;
        rerender(model);
        await checkRulesStrictly(body.ini.trim());
        await checkRulesOnServer(body.ini, currentName);
        state.formMessage = `${_('Fairy-Stockfish check passed for')} ${name}.`;
    } catch (err) {
        state.formMessage = err instanceof Error ? err.message : _('Variant check failed');
    } finally {
        state.saving = false;
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
        state.formMessage = err instanceof Error ? err.message : _('Variant check failed');
        rerender(model);
        return;
    }

    const rulesChanged = currentRulesChanged(body.ini);
    state.saving = true;
    state.formMessage = rulesChanged
        ? `${_('Checking rules for')} ${extractVariantName(body.ini.trim())}...`
        : _('Saving metadata and visibility...');
    rerender(model);

    const url = editingName ? `/api/catalogued-variants/${encodeURIComponent(editingName)}` : '/api/catalogued-variants';
    try {
        if (rulesChanged) await checkRulesStrictly(body.ini.trim());
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(await responseError(response));
        const payload = await response.json() as { oldName?: string; variant?: ManagedVariant };
        registerFromPayload(payload);
        state.editing = null;
        clearDraft();
        state.formMessage = editingName ? _('Variant updated.') : _('Variant uploaded.');
        await loadMine(model);
    } catch (err) {
        state.formMessage = err instanceof Error ? err.message : _('Failed to save variant');
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
    setDraftFromVariant(variant);
    state.formMessage = '';
    rerender(model);
    setTimeout(() => document.getElementById('catalogued-display-name')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
}

function cancelEdit(model: PyChessModel): void {
    state.editing = null;
    clearDraft();
    rerender(model);
}

function visibilityLabel(visibility: VariantVisibility | undefined): string {
    switch (visibility) {
    case 'public': return _('Public');
    case 'unlisted': return _('Unlisted');
    default: return _('Private');
    }
}

function visibilityHelp(visibility: VariantVisibility): string {
    switch (visibility) {
    case 'public':
        return _('Public variants appear on the Community variants page and can be found by search.');
    case 'unlisted':
        return _('Unlisted variants stay out of search but can be opened by direct link.');
    default:
        return _('Private variants are visible only to you and site admins.');
    }
}

function renderForm(model: PyChessModel): VNode {
    const editing = state.editing;
    return h('section.catalogued-card.catalogued-form', [
        h('div.catalogued-form-head', [
            h('h2', editing ? _('Edit variant') : _('Upload new variant')),
            h('p', _('Paste exactly one Fairy-Stockfish variant definition. Rules are locked after the first played game.')),
            h('p.catalogued-help', _('If you change the rules of an unused variant, also change the INI section name, because Fairy-Stockfish cannot replace an already loaded runtime variant.')),
            editing?.locked ? h('p.catalogued-help', _('This variant already has games. Only metadata and visibility can be changed; clone it to change the rules.')) : null,
        ]),
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
                        value: state.draftDisplayName,
                        placeholder: _('Display name'),
                        autocomplete: 'off',
                        disabled: state.saving,
                    },
                    on: {
                        input: (event: Event) => {
                            state.draftDisplayName = (event.target as HTMLInputElement).value;
                            state.formMessage = '';
                        },
                    },
                }),
            ]),
            h('label', [
                h('span', _('Short description')),
                h('input#catalogued-description', {
                    props: {
                        value: state.draftDescription,
                        placeholder: _('Short description'),
                        autocomplete: 'off',
                        disabled: state.saving,
                    },
                    on: {
                        input: (event: Event) => {
                            state.draftDescription = (event.target as HTMLInputElement).value;
                            state.formMessage = '';
                        },
                    },
                }),
            ]),
            h('label', [
                h('span', _('Visibility')),
                h('select#catalogued-visibility', {
                    props: {
                        value: state.draftVisibility,
                        disabled: state.saving,
                    },
                    on: {
                        change: (event: Event) => {
                            state.draftVisibility = (event.target as HTMLSelectElement).value as VariantVisibility;
                            state.formMessage = visibilityHelp(state.draftVisibility);
                        },
                    },
                }, [
                    h('option', { props: { value: 'private', selected: state.draftVisibility === 'private' } }, _('Private')),
                    h('option', { props: { value: 'unlisted', selected: state.draftVisibility === 'unlisted' } }, _('Unlisted')),
                    h('option', { props: { value: 'public', selected: state.draftVisibility === 'public' } }, _('Public')),
                ]),
                h('span.catalogued-help', visibilityHelp(state.draftVisibility)),
            ]),
            h('label', [
                h('span', _('Variant definition')),
                h('textarea#catalogued-ini', {
                    props: {
                        value: state.draftIni,
                        placeholder: '[myvariant:chess]\nvariantTemplate = chess\n',
                        spellcheck: false,
                        disabled: state.saving || !!state.editing?.locked,
                    },
                    on: {
                        input: (event: Event) => {
                            state.draftIni = (event.target as HTMLTextAreaElement).value;
                            state.formMessage = '';
                        },
                    },
                }),
            ]),
            h('div.catalogued-actions', [
                h(`button.button-primary.catalogued-primary-action${state.saving ? '.disabled' : ''}`, {
                    props: { type: 'submit', disabled: state.saving },
                }, editing ? _('Save changes') : _('Upload variant')),
                h('button.catalogued-secondary-action', {
                    props: { type: 'button', disabled: state.saving },
                    on: {
                        click: (event: Event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void validateCurrentForm(model);
                        },
                    },
                }, _('Check rules')),
                editing
                    ? h('button.catalogued-secondary-action', {
                        props: { type: 'button', disabled: state.saving },
                        on: { click: () => cancelEdit(model) },
                    }, _('Cancel'))
                    : null,
            ]),
            state.formMessage ? h('p.catalogued-message', { attrs: { 'aria-live': 'polite' } }, state.formMessage) : null,
        ]),
    ]);
}

function renderRows(model: PyChessModel): VNode {
    if (!state.loaded) return h('p', _('Loading...'));
    if (state.variants.length === 0) return h('p.catalogued-empty', _('You have not uploaded any variants yet.'));

    return h('div.catalogued-table-wrap', [
        h('table.catalogued-table', [
            h('thead', h('tr', [
                h('th', _('Name')),
                h('th', _('Status')),
                h('th', _('Visibility')),
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
                    h('td', visibilityLabel(variant.visibility)),
                    h('td', String(variant.gameCount ?? 0)),
                    h('td.catalogued-row-actions', [
                        h('button.button-primary.catalogued-row-button', {
                            props: { type: 'button', disabled: archived },
                            on: { click: () => playVariant(model, variant) },
                        }, _('Play')),
                        h('button.catalogued-row-button.catalogued-secondary-action', {
                            props: { type: 'button', disabled: state.saving },
                            attrs: { title: lockTitle },
                            on: { click: () => editVariant(model, variant) },
                        }, _('Edit')),
                        h('button.catalogued-row-button.catalogued-secondary-action', {
                            props: { type: 'button', disabled: locked || state.saving },
                            attrs: { title: lockTitle },
                            on: { click: () => void postAction(model, variant, 'delete') },
                        }, _('Delete')),
                        archived
                            ? h('button.catalogued-row-button.catalogued-secondary-action', {
                                props: { type: 'button', disabled: state.saving },
                                on: { click: () => void postAction(model, variant, 'restore') },
                            }, _('Restore'))
                            : h('button.catalogued-row-button.catalogued-secondary-action', {
                                props: { type: 'button', disabled: state.saving },
                                on: { click: () => void postAction(model, variant, 'archive') },
                            }, _('Archive')),
                        h('button.catalogued-row-button.catalogued-secondary-action', {
                            props: { type: 'button', disabled: state.saving },
                            on: { click: () => void postAction(model, variant, 'clone') },
                        }, _('Clone')),
                    ]),
                ]);
            })),
        ]),
    ]);
}

function renderRoot(model: PyChessModel): VNode {
    return h('main#my-variants.my-variants', {
        hook: {
            insert: (vnode: VNode) => {
                rootVNode = vnode;
                if (!state.loaded) void loadMine(model);
            },
        },
    }, [
        h('header.catalogued-page-header', [
            h('h1', _('Manage my variants')),
            h('p', _('Uploaded variants stay out of the regular variant catalog. They are always casual/unrated, but can be played from this page against humans or Fairy-Stockfish.')),
            h('p', [
                h('a', { attrs: { href: `${model.home}/variants/community` } }, _('Browse community variants')),
            ]),
        ]),
        model.anon === 'True'
            ? h('section.catalogued-card', [
                h('h2', _('Sign in required')),
                h('p', _('Please sign in to upload and manage your variants.')),
            ])
            : h('div.catalogued-layout', [
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
