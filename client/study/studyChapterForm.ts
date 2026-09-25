import { h, VNode } from 'snabbdom';
import { _ } from '../i18n';
import type { StudyChapterMode } from '../types';
import type { StudyPgnImportProgress, StudyPgnImportProgressCallback } from './studyPgnImport';
import { selectVariant, twoBoarsVariants, VARIANTS } from '../variants';

export interface StudyChapterCreateFormOptions {
    id?: string;
    chapterName?: string;
    orientation?: 'white' | 'black';
    mode?: StudyChapterMode;
    enabledModes?: readonly StudyChapterMode[];
    sync?: () => boolean;
    beforeSubmit?: () => Promise<boolean>;
    pgnImport?: (pgn: string, onProgress?: StudyPgnImportProgressCallback) => Promise<void>;
}

type StudyChapterModeOption = {
    value: StudyChapterMode;
    label: string;
    description: string;
    available: boolean;
};

const STUDY_CHAPTER_MODE_ORDER: readonly StudyChapterMode[] = ['normal', 'practice', 'conceal', 'gamebook'];
const STUDY_DEFAULT_ENABLED_MODES: readonly StudyChapterMode[] = ['normal', 'gamebook'];

type StudyChapterSource = 'setup' | 'pgn';

function studyChapterChess960State(variantName: string): { visible: boolean; checked: boolean } {
    const variant = VARIANTS[variantName];
    if (!variant) return { visible: false, checked: false };
    if (variant.randomStart) return { visible: false, checked: true };
    return { visible: variant.chess960, checked: false };
}

function updateStudyChapterChess960Field(form: HTMLFormElement, variantName: string): void {
    const field = form.querySelector<HTMLElement>('.study-chapter-chess960');
    const input = field?.querySelector<HTMLInputElement>('input[name="chess960"]');
    if (!field || !input) return;
    const state = studyChapterChess960State(variantName);
    field.hidden = !state.visible;
    input.checked = state.checked;
}

function studyChapterChess960Field(variantName: string): VNode {
    const state = studyChapterChess960State(variantName);
    return h('label.study-chapter-chess960', { attrs: { hidden: !state.visible } }, [
        h('input', {
            props: { type: 'checkbox', name: 'chess960', checked: state.checked },
            attrs: { value: '1' },
        }),
        h('span', 'Chess960'),
    ]);
}

function selectStudyChapterSource(form: HTMLFormElement, source: StudyChapterSource): void {
    form.dataset.studyChapterSource = source;
    form.querySelectorAll<HTMLButtonElement>('[data-study-chapter-source]').forEach(button => {
        const selected = button.dataset.studyChapterSource === source;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
    form.querySelectorAll<HTMLElement>('[data-study-chapter-source-panel]').forEach(panel => {
        const active = panel.dataset.studyChapterSourcePanel === source;
        panel.hidden = !active;
        panel
            .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')
            .forEach(control => {
                control.disabled = !active;
            });
    });
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.textContent = source === 'pgn' ? _('Import PGN') : _('Create chapter');
    const error = form.querySelector<HTMLElement>('.study-pgn-import__error');
    if (error) {
        error.hidden = true;
        error.textContent = '';
    }
}

function setStudyPgnImportProgress(form: HTMLFormElement, progress: StudyPgnImportProgress): void {
    const track = form.querySelector<HTMLElement>('.study-pgn-import__progress');
    const bar = track?.querySelector<HTMLElement>('span');
    if (!track || !bar) return;

    track.hidden = false;
    if (progress.phase === 'normalizing') {
        const fraction = progress.total > 0 ? Math.min(1, Math.max(0, progress.completed / progress.total)) : 0;
        const percent = Math.round(fraction * 100);
        track.classList.remove('indeterminate');
        track.setAttribute('aria-valuenow', String(percent));
        track.setAttribute('aria-valuetext', _('Preparing chapters: %1%', percent));
        bar.style.width = `${percent}%`;
    } else {
        track.classList.add('indeterminate');
        track.removeAttribute('aria-valuenow');
        track.setAttribute('aria-valuetext', progress.phase === 'parsing' ? _('Parsing PGN') : _('Saving chapters'));
        bar.style.removeProperty('width');
    }
}

function resetStudyPgnImportProgress(form: HTMLFormElement): void {
    const track = form.querySelector<HTMLElement>('.study-pgn-import__progress');
    const bar = track?.querySelector<HTMLElement>('span');
    if (!track || !bar) return;
    track.hidden = true;
    track.classList.remove('indeterminate');
    track.removeAttribute('aria-valuenow');
    track.removeAttribute('aria-valuetext');
    bar.style.removeProperty('width');
}

function studyPgnImportError(form: HTMLFormElement, error: unknown): void {
    const output = form.querySelector<HTMLElement>('.study-pgn-import__error');
    if (!output) return;
    output.textContent = error instanceof Error ? error.message : String(error);
    output.hidden = false;
}

function loadStudyPgnFile(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const form = input.form;
    const file = input.files?.[0];
    const textarea = form?.querySelector<HTMLTextAreaElement>('textarea[name="pgn"]');
    if (!form || !file || !textarea) return;

    const error = form.querySelector<HTMLElement>('.study-pgn-import__error');
    if (error) {
        error.hidden = true;
        error.textContent = '';
    }

    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result !== 'string') {
            studyPgnImportError(form, new Error(_('Could not read PGN file.')));
            return;
        }
        textarea.value = reader.result;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };
    reader.onerror = () => studyPgnImportError(form, new Error(_('Could not read PGN file.')));
    reader.readAsText(file);
}

function submitStudyPgnImport(event: SubmitEvent, options: StudyChapterCreateFormOptions): void {
    const form = event.currentTarget as HTMLFormElement;
    event.preventDefault();
    if (form.dataset.studySettling === 'true' || !form.reportValidity()) return;
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="pgn"]');
    if (!textarea || !options.pgnImport) return;

    form.dataset.studySettling = 'true';
    form.setAttribute('aria-busy', 'true');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    const error = form.querySelector<HTMLElement>('.study-pgn-import__error');
    if (error) {
        error.hidden = true;
        error.textContent = '';
    }

    void (async () => {
        if (options.beforeSubmit && !(await options.beforeSubmit())) return;
        if (!form.isConnected || !form.reportValidity()) return;
        syncHiddenInput(form, options.sync);
        await options.pgnImport!(textarea.value, progress => setStudyPgnImportProgress(form, progress));
    })()
        .catch(importError => studyPgnImportError(form, importError))
        .finally(() => {
            delete form.dataset.studySettling;
            form.removeAttribute('aria-busy');
            if (submit) submit.disabled = false;
            resetStudyPgnImportProgress(form);
        });
}

export function studyEnabledModesFromJson(raw: string | null): StudyChapterMode[] {
    if (!raw) return [...STUDY_DEFAULT_ENABLED_MODES];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [...STUDY_DEFAULT_ENABLED_MODES];
        const enabled = new Set<StudyChapterMode>(['normal']);
        for (const value of parsed) {
            if (typeof value === 'string' && STUDY_CHAPTER_MODE_ORDER.includes(value as StudyChapterMode))
                enabled.add(value as StudyChapterMode);
        }
        return STUDY_CHAPTER_MODE_ORDER.filter(mode => enabled.has(mode));
    } catch {
        return [...STUDY_DEFAULT_ENABLED_MODES];
    }
}

function studyChapterModeOptions(
    enabledModes: readonly StudyChapterMode[] = STUDY_DEFAULT_ENABLED_MODES,
): StudyChapterModeOption[] {
    const enabled = new Set(enabledModes);
    enabled.add('normal');
    return [
        {
            value: 'normal',
            label: _('Normal analysis'),
            description: _('Explore and annotate the full move tree with the usual analysis tools.'),
            available: enabled.has('normal'),
        },
        {
            value: 'practice',
            label: _('Practice with computer'),
            description: _(
                "Play from the chapter's starting position against the computer. The saved moves do not control the computer's replies.",
            ),
            available: enabled.has('practice'),
        },
        {
            value: 'conceal',
            label: _('Hide next moves'),
            description: _('Hide unrevealed moves from viewers while the presenter advances the chapter.'),
            available: enabled.has('conceal'),
        },
        {
            value: 'gamebook',
            label: _('Interactive lesson'),
            description: _('Let viewers solve the authored main line with hints and feedback.'),
            available: enabled.has('gamebook'),
        },
    ];
}

export function studyChapterModeLabel(mode: StudyChapterMode): string {
    return studyChapterModeOptions().find(option => option.value === mode)?.label ?? _('Normal analysis');
}

function studyChapterModeHelp(
    mode: StudyChapterMode,
    enabledModes: readonly StudyChapterMode[] = STUDY_DEFAULT_ENABLED_MODES,
): string {
    const current = studyChapterModeOptions(enabledModes).find(option => option.value === mode);
    if (!current) return '';
    return current.available
        ? current.description
        : _(
              '%1 is disabled for new chapters right now. Existing chapter data is preserved; you can switch back to Normal analysis.',
              current.label,
          );
}

export function studyChapterModeField(
    mode: StudyChapterMode = 'normal',
    enabledModes: readonly StudyChapterMode[] = STUDY_DEFAULT_ENABLED_MODES,
): VNode {
    const options = studyChapterModeOptions(enabledModes);
    const available = options.filter(option => option.available || option.value === mode);
    return h('label.study-dialog__field.study-chapter-mode', [
        h('span', _('Analysis mode')),
        h(
            'select',
            {
                attrs: { name: 'mode' },
                on: {
                    change: (event: Event) => {
                        const select = event.currentTarget as HTMLSelectElement;
                        const help = select
                            .closest('.study-chapter-mode')
                            ?.querySelector<HTMLElement>('.study-dialog__help');
                        if (help)
                            help.textContent = studyChapterModeHelp(
                                select.value as StudyChapterMode,
                                enabledModes,
                            );
                    },
                },
            },
            available.map(option =>
                h(
                    'option',
                    {
                        attrs: { value: option.value, selected: option.value === mode },
                    },
                    option.label,
                ),
            ),
        ),
        h('small.study-dialog__help', studyChapterModeHelp(mode, enabledModes)),
    ]);
}

export function studyChapterOrientationField(orientation: 'white' | 'black' = 'white'): VNode {
    return h('label.study-dialog__field.study-chapter-orientation', [
        h('span', _('Orientation / learner side')),
        h('select', { attrs: { name: 'orientation' } }, [
            h('option', { attrs: { value: 'white', selected: orientation === 'white' } }, _('White')),
            h('option', { attrs: { value: 'black', selected: orientation === 'black' } }, _('Black')),
        ]),
        h('small.study-dialog__help', _('In training modes, this also chooses the learner side.')),
    ]);
}

function chapterField(name: string, label: string, value = '', maxLength?: number): VNode {
    return h('label', [
        h('span', label),
        h('input', {
            attrs: { type: 'text', name, value, ...(maxLength ? { maxlength: maxLength } : {}), autocomplete: 'off' },
        }),
    ]);
}

function syncHiddenInput(form: HTMLFormElement, sync?: () => boolean): void {
    if (!sync) return;
    const input = form.elements.namedItem('sync') as HTMLInputElement | null;
    if (input) input.value = sync() ? '1' : '0';
}

export function settleStudyFormSubmit(
    event: SubmitEvent,
    beforeSubmit: () => Promise<boolean>,
    beforeNativeSubmit?: () => void,
): void {
    const form = event.currentTarget as HTMLFormElement;
    event.preventDefault();
    if (form.dataset.studySettling === 'true' || !form.reportValidity()) return;
    form.dataset.studySettling = 'true';
    void beforeSubmit()
        .then(proceed => {
            if (!proceed || !form.isConnected || !form.reportValidity()) return;
            beforeNativeSubmit?.();
            // requestSubmit() would re-enter the Snabbdom submit listener. After the
            // asynchronous Study writes have settled we only need the native navigation;
            // validation has run again and these forms have no named submitter value to preserve.
            form.submit();
        })
        .finally(() => {
            delete form.dataset.studySettling;
        });
}

export function studyChapterCreateForm(
    action: string,
    variant: string,
    options: StudyChapterCreateFormOptions = {},
): VNode {
    const mode = options.mode ?? 'normal';
    const setupFields: VNode[] = [
        chapterField('chapterName', _('Chapter name'), options.chapterName ?? '', 80),
        h('label', [
            h('span', _('Variant')),
            selectVariant(
                'variant',
                variant,
                event => {
                    const select = event.currentTarget as HTMLSelectElement;
                    if (select.form) updateStudyChapterChess960Field(select.form, select.value);
                },
                () => {},
                twoBoarsVariants,
            ),
        ]),
        studyChapterChess960Field(variant),
        studyChapterOrientationField(options.orientation ?? 'white'),
        studyChapterModeField(mode, options.enabledModes),
        chapterField('fen', _('FEN (optional)')),
        chapterField('gameId', _('Game ID (optional)'), '', 12),
    ];
    const sourceTabs = options.pgnImport
        ? [
              h('div.study-chapter-source-tabs', { attrs: { role: 'tablist', 'aria-label': _('Chapter source') } }, [
                  h(
                      'button.study-chapter-source-tab.active',
                      {
                          attrs: {
                              type: 'button',
                              role: 'tab',
                              'aria-selected': 'true',
                              'data-study-chapter-source': 'setup',
                          },
                          on: {
                              click: event =>
                                  selectStudyChapterSource((event.currentTarget as HTMLButtonElement).form!, 'setup'),
                          },
                      },
                      _('Setup'),
                  ),
                  h(
                      'button.study-chapter-source-tab',
                      {
                          attrs: {
                              type: 'button',
                              role: 'tab',
                              'aria-selected': 'false',
                              tabindex: '-1',
                              'data-study-chapter-source': 'pgn',
                          },
                          on: {
                              click: event =>
                                  selectStudyChapterSource((event.currentTarget as HTMLButtonElement).form!, 'pgn'),
                          },
                      },
                      'PGN',
                  ),
              ]),
          ]
        : [];

    return h(
        'form.study-side__new-chapter',
        {
            attrs: {
                ...(options.id ? { id: options.id } : {}),
                method: 'post',
                action,
                ...(options.pgnImport ? { 'data-study-chapter-source': 'setup' } : {}),
            },
            ...(options.sync || options.beforeSubmit || options.pgnImport
                ? {
                      on: {
                          submit: (event: SubmitEvent) => {
                              const form = event.currentTarget as HTMLFormElement;
                              syncHiddenInput(form, options.sync);
                              if (form.dataset.studyChapterSource === 'pgn' && options.pgnImport) {
                                  submitStudyPgnImport(event, options);
                                  return;
                              }
                              if (options.beforeSubmit)
                                  settleStudyFormSubmit(event, options.beforeSubmit, () =>
                                      syncHiddenInput(form, options.sync),
                                  );
                          },
                      },
                  }
                : {}),
        },
        [
            ...(options.sync
                ? [
                      h('input', {
                          attrs: { type: 'hidden', name: 'sync', value: options.sync() ? '1' : '0' },
                      }),
                  ]
                : []),
            ...sourceTabs,
            ...(options.pgnImport
                ? [
                      h(
                          'div.study-chapter-source-panel',
                          { attrs: { 'data-study-chapter-source-panel': 'setup' } },
                          setupFields,
                      ),
                      h(
                          'div.study-chapter-source-panel.study-pgn-import',
                          { attrs: { 'data-study-chapter-source-panel': 'pgn', hidden: true } },
                          [
                              h('label.study-dialog__field', [
                                  h('span', _('PGN')),
                                  h('textarea', {
                                      attrs: {
                                          name: 'pgn',
                                          rows: '12',
                                          required: true,
                                          disabled: true,
                                          spellcheck: 'false',
                                          placeholder: _(
                                              'Paste PGN text here. Multiple games become separate chapters.',
                                          ),
                                      },
                                  }),
                              ]),
                              ...(typeof FileReader === 'undefined'
                                  ? []
                                  : [
                                        h('label.study-dialog__field.study-pgn-import__file', [
                                            h('span', _('PGN file')),
                                            h('input', {
                                                attrs: { type: 'file', accept: '.pgn', disabled: true },
                                                on: { change: loadStudyPgnFile },
                                            }),
                                        ]),
                                    ]),
                              h(
                                  'small.study-dialog__help',
                                  _(
                                      'PGN tags and embedded Study metadata determine variants, chapter names and annotations.',
                                  ),
                              ),
                              h(
                                  'div.study-pgn-import__progress',
                                  {
                                      attrs: {
                                          role: 'progressbar',
                                          'aria-label': _('PGN import progress'),
                                          'aria-valuemin': '0',
                                          'aria-valuemax': '100',
                                          hidden: true,
                                      },
                                  },
                                  [h('span')],
                              ),
                              h('p.study-pgn-import__error', { attrs: { role: 'alert', hidden: true } }),
                          ],
                      ),
                  ]
                : setupFields),
            h('div.study-dialog__actions.study-dialog__actions--submit-only', [
                h('button.button', { attrs: { type: 'submit' } }, _('Create chapter')),
            ]),
        ],
    );
}
