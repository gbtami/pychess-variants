import { h, type VNode } from 'snabbdom';

import { analysisUnderboard } from '../analysis';
import { analysisContext } from '../analysis/analysisContext';
import { AnalysisController } from '../analysis/analysisCtrl';
import { renderAnalysisPage } from '../analysis/analysisPage';
import { _ } from '../i18n';
import type { PyChessModel, StudyPageModel } from '../types';
import { studyAnalysisExtension } from './studySync';

function renameForm(action: string, value: string, label: string, maxLength: number): VNode {
    return h('form.study-side__rename', { attrs: { method: 'post', action } }, [
        h('input', {
            attrs: {
                type: 'text',
                name: 'name',
                value,
                maxlength: String(maxLength),
                autocomplete: 'off',
                'aria-label': label,
            },
        }),
        h('button.button', { attrs: { type: 'submit' } }, _('Rename')),
    ]);
}

function deleteForm(action: string, label: string, prompt: string, className?: string): VNode {
    return h(
        'form',
        {
            attrs: { method: 'post', action },
            class: className ? { [className]: true } : undefined,
            on: {
                submit: event => {
                    if (!window.confirm(prompt)) event.preventDefault();
                },
            },
        },
        [h('button.button.button-red', { attrs: { type: 'submit' } }, label)],
    );
}

function studySide(study: StudyPageModel, model: PyChessModel): VNode {
    const chapter = study.chapter;
    const chapters = study.chapters.map(item =>
        h('div.study-chapter__row', { class: { active: item.id === chapter.id } }, [
            h('a', { attrs: { href: `/study/${study.id}/${item.id}` } }, `${item.order}. ${item.name}`),
        ]),
    );

    return h('div.study-side', [
        h('div.study-side__header', [
            h('h2', { attrs: { title: study.name } }, study.name),
            h('a', { attrs: { href: '/study' } }, _('My studies')),
        ]),
        renameForm(`/study/${study.id}/edit`, study.name, _('Study name'), 100),
        h('div.study-chapters', chapters),
        renameForm(`/study/${study.id}/${chapter.id}/edit`, chapter.name, _('Chapter name'), 80),
        h('div.study-side__actions', [
            h('details.study-side__new-chapter', [
                h('summary', _('Add chapter')),
                h('form', { attrs: { method: 'post', action: `/study/${study.id}/chapter` } }, [
                    h('input', {
                        attrs: {
                            type: 'text',
                            name: 'chapterName',
                            maxlength: '80',
                            placeholder: _('Chapter name'),
                            autocomplete: 'off',
                        },
                    }),
                    h('input', {
                        attrs: {
                            type: 'text',
                            name: 'variant',
                            value: model.variant || 'chess',
                            placeholder: _('Variant'),
                            autocomplete: 'off',
                        },
                    }),
                    model.chess960 === 'True'
                        ? h('input', { attrs: { type: 'hidden', name: 'chess960', value: '1' } })
                        : '',
                    h('input', {
                        attrs: {
                            type: 'text',
                            name: 'fen',
                            placeholder: _('FEN (optional)'),
                            autocomplete: 'off',
                        },
                    }),
                    h('input', {
                        attrs: {
                            type: 'text',
                            name: 'gameId',
                            maxlength: '12',
                            placeholder: _('Game ID (optional)'),
                            autocomplete: 'off',
                        },
                    }),
                    h('button.button', { attrs: { type: 'submit' } }, _('Create chapter')),
                ]),
            ]),
            study.chapters.length > 1
                ? deleteForm(`/study/${study.id}/${chapter.id}/delete`, _('Delete chapter'), _('Delete this chapter?'))
                : '',
            deleteForm(`/study/${study.id}/delete`, _('Delete study'), _('Delete this study?'), 'study-side__danger'),
        ]),
    ]);
}

function runStudyGround(vnode: VNode, model: PyChessModel, study: StudyPageModel): void {
    const ctrl = new AnalysisController(
        vnode.elm as HTMLElement,
        model,
        studyAnalysisExtension({
            studyId: study.id,
            chapterId: study.chapter.id,
            revision: study.chapter.revision,
            tree: study.chapter.tree,
            orientation: study.chapter.orientation,
        }),
    );
    window['onFSFline'] = ctrl.onFSFline;
}

export function studyView(model: PyChessModel): VNode[] {
    const study = model.study;
    if (!study) return [h('div.box.box-pad', _('Study data is unavailable.'))];
    const context = analysisContext(model);

    return renderAnalysisPage(model, {
        side: studySide(study, model),
        underboard: analysisUnderboard(model, context, false),
        mountBoard: vnode => runStudyGround(vnode, model, study),
        ongoing: false,
    });
}
