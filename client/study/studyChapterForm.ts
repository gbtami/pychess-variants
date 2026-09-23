import { h, VNode } from 'snabbdom';
import { _ } from '../i18n';
import type { StudyChapterMode } from '../types';
import { selectVariant, twoBoarsVariants } from '../variants';

export interface StudyChapterCreateFormOptions {
    id?: string;
    chapterName?: string;
    orientation?: 'white' | 'black';
    mode?: StudyChapterMode;
    enabledModes?: readonly StudyChapterMode[];
    sync?: () => boolean;
    beforeSubmit?: () => Promise<boolean>;
    pgnImport?: (pgn: string) => Promise<void>;
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

function studyPgnImportError(form: HTMLFormElement, error: unknown): void {
    const output = form.querySelector<HTMLElement>('.study-pgn-import__error');
    if (!output) return;
    output.textContent = error instanceof Error ? error.message : String(error);
    output.hidden = false;
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
        await options.pgnImport!(textarea.value);
    })()
        .catch(importError => studyPgnImportError(form, importError))
        .finally(() => {
            delete form.dataset.studySettling;
            form.removeAttribute('aria-busy');
            if (submit) submit.disabled = false;
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
    chess960: boolean,
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
                () => {},
                () => {},
                twoBoarsVariants,
            ),
        ]),
        ...(chess960 ? [h('input', { attrs: { type: 'hidden', name: 'chess960', value: '1' } })] : []),
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
                              h(
                                  'small.study-dialog__help',
                                  _(
                                      'PGN tags and embedded Study metadata determine variants, chapter names and annotations.',
                                  ),
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
