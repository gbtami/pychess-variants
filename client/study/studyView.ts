import { h, type VNode } from 'snabbdom';

import { analysisUnderboard } from '../analysis';
import { analysisContext } from '../analysis/analysisContext';
import { AnalysisController } from '../analysis/analysisCtrl';
import { renderAnalysisPage } from '../analysis/analysisPage';
import { _ } from '../i18n';
import type { PyChessModel, StudyPageModel } from '../types';
import { studyAnalysisExtension } from './studySync';

function postForm(action: string, label: string, className?: string): VNode {
    return h('form', { attrs: { method: 'post', action }, class: className ? { [className]: true } : undefined }, [
        h('button.button', { attrs: { type: 'submit' } }, label),
    ]);
}

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

function studySide(study: StudyPageModel): VNode {
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
            postForm(`/study/${study.id}/chapter`, _('Add chapter')),
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
        side: studySide(study),
        underboard: analysisUnderboard(model, context, false),
        mountBoard: vnode => runStudyGround(vnode, model, study),
        ongoing: false,
    });
}
