import { h } from 'snabbdom';

import { patch } from '../document';
import { _ } from '../i18n';

export interface StudyChoice {
    id: string;
    name: string;
}

export interface AddToStudyChoice {
    studyId?: string;
    studyName?: string;
    chapterName: string;
}

interface StudyChoicesResponse {
    studies?: StudyChoice[];
    error?: string;
}

let pendingResolve: ((value: AddToStudyChoice | null) => void) | null = null;
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

function ensureDialogElement(): HTMLElement {
    let element = document.getElementById('study-add-dialog');
    if (!element) {
        element = document.createElement('div');
        element.id = 'study-add-dialog';
        element.className = 'confirm-dialog-root';
        document.body.appendChild(element);
    }
    return element;
}

function closeDialog(result: AddToStudyChoice | null): void {
    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }
    const element = document.getElementById('study-add-dialog');
    if (element) element.style.display = 'none';
    if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(result);
    }
}

function selectedChoice(element: HTMLElement): AddToStudyChoice {
    const study = element.querySelector<HTMLSelectElement>('.study-add-dialog__study');
    const studyName = element.querySelector<HTMLInputElement>('.study-add-dialog__study-name');
    const chapterName = element.querySelector<HTMLInputElement>('.study-add-dialog__chapter-name');
    const studyId = study?.value || undefined;
    return {
        studyId,
        studyName: studyId ? undefined : studyName?.value.trim() || undefined,
        chapterName: chapterName?.value.trim() || _('Analysis'),
    };
}

function renderDialog(studies: StudyChoice[], defaultChapterName: string): void {
    const element = ensureDialogElement();

    const updateNewStudyState = () => {
        const select = element.querySelector<HTMLSelectElement>('.study-add-dialog__study');
        const input = element.querySelector<HTMLInputElement>('.study-add-dialog__study-name');
        if (input) input.disabled = Boolean(select?.value);
    };

    const vnode = h('div.confirm-dialog-wrap', [
        h('div.confirm-dialog-backdrop', { on: { click: () => closeDialog(null) } }),
        h(
            'div.confirm-dialog-content',
            { attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'study-add-dialog-title' } },
            [
                h('h2#study-add-dialog-title', _('Add to Study')),
                h('div.study-add-dialog-form', [
                    h('label', [
                        h('span', _('Study')),
                        h(
                            'select.study-add-dialog__study',
                            {
                                attrs: { 'aria-label': _('Study') },
                                on: { change: updateNewStudyState },
                            },
                            [
                                h('option', { attrs: { value: '' } }, _('New study')),
                                ...studies.map(study => h('option', { attrs: { value: study.id } }, study.name)),
                            ],
                        ),
                    ]),
                    h('label', [
                        h('span', _('Study name')),
                        h('input.study-add-dialog__study-name', {
                            attrs: { type: 'text', maxlength: '100', autocomplete: 'off' },
                        }),
                    ]),
                    h('label', [
                        h('span', _('Chapter name')),
                        h('input.study-add-dialog__chapter-name', {
                            attrs: {
                                type: 'text',
                                maxlength: '80',
                                autocomplete: 'off',
                                value: defaultChapterName,
                            },
                        }),
                    ]),
                ]),
                h('div.confirm-dialog-actions', [
                    h(
                        'button.button.button-empty',
                        { attrs: { type: 'button' }, on: { click: () => closeDialog(null) } },
                        _('Cancel'),
                    ),
                    h(
                        'button.button.confirm-dialog-confirm.study-add-dialog__submit',
                        {
                            attrs: { type: 'button' },
                            on: { click: () => closeDialog(selectedChoice(element)) },
                        },
                        _('Add'),
                    ),
                ]),
            ],
        ),
    ]);

    element.innerHTML = '';
    const placeholder = document.createElement('div');
    element.appendChild(placeholder);
    patch(placeholder, vnode);
    element.style.display = 'flex';
    window.requestAnimationFrame(() => {
        updateNewStudyState();
        element.querySelector<HTMLSelectElement>('.study-add-dialog__study')?.focus();
    });
}

export async function chooseStudy(defaultChapterName: string): Promise<AddToStudyChoice | null> {
    if (pendingResolve) closeDialog(null);
    const response = await fetch('/study/choices', { headers: { Accept: 'application/json' } });
    const payload = (await response.json()) as StudyChoicesResponse;
    if (!response.ok) throw new Error(payload.error || _('Could not load Studies.'));
    const studies = Array.isArray(payload.studies)
        ? payload.studies.filter(study => typeof study.id === 'string' && typeof study.name === 'string')
        : [];
    renderDialog(studies, defaultChapterName);

    keydownHandler = event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog(null);
        }
    };
    document.addEventListener('keydown', keydownHandler);

    return new Promise(resolve => {
        pendingResolve = resolve;
    });
}
