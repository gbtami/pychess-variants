import { h, VNode } from 'snabbdom';
import { _ } from '../i18n';
import type { StudyChapterMode } from '../types';
import { selectVariant, twoBoarsVariants } from '../variants';

export interface StudyChapterCreateFormOptions {
    id?: string;
    chapterName?: string;
    orientation?: 'white' | 'black';
    mode?: StudyChapterMode;
    sync?: () => boolean;
    beforeSubmit?: () => Promise<boolean>;
}

type StudyChapterModeOption = {
    value: StudyChapterMode;
    label: string;
    description: string;
    available: boolean;
};

function studyChapterModeOptions(): StudyChapterModeOption[] {
    return [
        {
            value: 'normal',
            label: _('Normal analysis'),
            description: _('Show the complete chapter tree and the usual analysis tools.'),
            available: true,
        },
        {
            value: 'practice',
            label: _('Practice with computer'),
            description: _('Play the saved position against the computer.'),
            available: false,
        },
        {
            value: 'conceal',
            label: _('Hide next moves'),
            description: _('Hide unrevealed continuations while the learner explores the position.'),
            available: true,
        },
        {
            value: 'gamebook',
            label: _('Interactive lesson'),
            description: _('Guide the learner through the authored main line with feedback and hints.'),
            available: false,
        },
    ];
}

export function studyChapterModeLabel(mode: StudyChapterMode): string {
    return studyChapterModeOptions().find(option => option.value === mode)?.label ?? _('Normal analysis');
}

function studyChapterModeHelp(mode: StudyChapterMode): string {
    const current = studyChapterModeOptions().find(option => option.value === mode);
    if (!current) return '';
    return current.available
        ? current.description
        : _(
              'This chapter uses %1, which is not available in the player yet. You can switch it back to Normal analysis.',
              current.label,
          );
}

export function studyChapterModeField(mode: StudyChapterMode = 'normal'): VNode {
    const options = studyChapterModeOptions();
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
                        if (help) help.textContent = studyChapterModeHelp(select.value as StudyChapterMode);
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
        h('small.study-dialog__help', studyChapterModeHelp(mode)),
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

export function settleStudyFormSubmit(event: SubmitEvent, beforeSubmit: () => Promise<boolean>): void {
    const form = event.currentTarget as HTMLFormElement;
    if (form.dataset.studySettled === 'true') {
        delete form.dataset.studySettled;
        return;
    }
    event.preventDefault();
    if (form.dataset.studySettling === 'true' || !form.reportValidity()) return;
    form.dataset.studySettling = 'true';
    const submitter = event.submitter instanceof HTMLElement ? event.submitter : undefined;
    void beforeSubmit()
        .then(proceed => {
            if (!proceed || !form.isConnected) return;
            form.dataset.studySettled = 'true';
            if (submitter instanceof HTMLButtonElement) form.requestSubmit(submitter);
            else form.requestSubmit();
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
    return h(
        'form.study-side__new-chapter',
        {
            attrs: {
                ...(options.id ? { id: options.id } : {}),
                method: 'post',
                action,
            },
            ...(options.sync || options.beforeSubmit
                ? {
                      on: {
                          submit: (event: SubmitEvent) => {
                              const form = event.currentTarget as HTMLFormElement;
                              syncHiddenInput(form, options.sync);
                              if (options.beforeSubmit) settleStudyFormSubmit(event, options.beforeSubmit);
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
            chess960 ? h('input', { attrs: { type: 'hidden', name: 'chess960', value: '1' } }) : '',
            studyChapterOrientationField(options.orientation ?? 'white'),
            studyChapterModeField(mode),
            chapterField('fen', _('FEN (optional)')),
            chapterField('gameId', _('Game ID (optional)'), '', 12),
            h('div.study-dialog__actions.study-dialog__actions--submit-only', [
                h('button.button', { attrs: { type: 'submit' } }, _('Create chapter')),
            ]),
        ],
    );
}
