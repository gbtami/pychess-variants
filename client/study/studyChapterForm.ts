import { h, VNode } from 'snabbdom';
import { _ } from '../i18n';
import { selectVariant, twoBoarsVariants } from '../variants';

export interface StudyChapterCreateFormOptions {
    id?: string;
    chapterName?: string;
}

function chapterField(name: string, label: string, value = '', maxLength?: number): VNode {
    return h('label', [
        h('span', label),
        h('input', {
            attrs: { type: 'text', name, value, ...(maxLength ? { maxlength: maxLength } : {}), autocomplete: 'off' },
        }),
    ]);
}

export function studyChapterCreateForm(
    action: string,
    variant: string,
    chess960: boolean,
    options: StudyChapterCreateFormOptions = {},
): VNode {
    return h(
        'form.study-side__new-chapter',
        {
            attrs: {
                ...(options.id ? { id: options.id } : {}),
                method: 'post',
                action,
            },
        },
        [
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
            chapterField('fen', _('FEN (optional)')),
            chapterField('gameId', _('Game ID (optional)'), '', 12),
            h('div.study-dialog__actions.study-dialog__actions--submit-only', [
                h('button.button', { attrs: { type: 'submit' } }, _('Create chapter')),
            ]),
        ],
    );
}
