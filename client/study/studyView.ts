import { h, type VNode } from 'snabbdom';

import { analysisUnderboard } from '../analysis';
import { analysisContext } from '../analysis/analysisContext';
import { AnalysisController } from '../analysis/analysisCtrl';
import { renderAnalysisPage } from '../analysis/analysisPage';
import { _ } from '../i18n';
import type { PyChessModel, StudyPageModel } from '../types';
import { StudyAnalysisExtension, type StudyAnnotationState } from './studySync';

const NAG_BUTTONS = [
    [1, '!'],
    [2, '?'],
    [3, '!!'],
    [4, '??'],
    [5, '!?'],
    [6, '?!'],
] as const;

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

function annotationPanel(): VNode {
    return h('div.study-annotations', [
        h('details.study-annotations__position', { props: { open: true } }, [
            h('summary', _('Position annotations')),
            h('div.study-annotations__comments'),
            h('textarea.study-annotations__comment-input', {
                attrs: {
                    maxlength: '4000',
                    rows: '3',
                    placeholder: _('Add a comment'),
                    'aria-label': _('Study comment'),
                },
            }),
            h('button.button.study-annotations__add-comment', { attrs: { type: 'button' } }, _('Add comment')),
            h(
                'div.study-annotations__nags',
                NAG_BUTTONS.map(([nag, label]) =>
                    h(
                        'button.button.study-annotations__nag',
                        { attrs: { type: 'button', 'data-nag': String(nag), title: `$${nag}` } },
                        label,
                    ),
                ),
            ),
            h('button.button.study-annotations__clear', { attrs: { type: 'button' } }, _('Clear position annotations')),
        ]),
        h('details.study-annotations__description', [
            h('summary', _('Chapter description')),
            h('textarea', {
                attrs: { maxlength: '10000', rows: '5', 'aria-label': _('Chapter description') },
            }),
            h('button.button', { attrs: { type: 'button' } }, _('Save description')),
        ]),
        h('details.study-annotations__tags', [
            h('summary', _('PGN tags')),
            h('textarea', {
                attrs: {
                    rows: '5',
                    placeholder: 'Event=\nSite=\nDate=',
                    'aria-label': _('PGN tags'),
                },
            }),
            h('button.button', { attrs: { type: 'button' } }, _('Save tags')),
        ]),
    ]);
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
        annotationPanel(),
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

function tagsText(tags: Record<string, string>): string {
    return Object.entries(tags)
        .map(([name, value]) => `${name}=${value}`)
        .join('\n');
}

function parseTags(text: string): Record<string, string> {
    const tags: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const separator = trimmed.indexOf('=');
        if (separator <= 0) continue;
        const name = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();
        if (/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) && value) tags[name] = value.slice(0, 512);
    }
    return tags;
}

function updateAnnotationPanel(state: StudyAnnotationState, extension: StudyAnalysisExtension): void {
    const comments = document.querySelector('.study-annotations__comments');
    if (comments) {
        comments.replaceChildren(
            ...state.annotations.comments.map(comment => {
                const row = document.createElement('div');
                row.className = 'study-annotations__comment';
                const body = document.createElement('div');
                const author = document.createElement('strong');
                author.textContent = comment.author;
                const text = document.createElement('span');
                text.textContent = comment.text;
                body.append(author, document.createTextNode(': '), text);
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'button study-annotations__remove-comment';
                remove.textContent = '×';
                remove.title = _('Delete comment');
                remove.addEventListener('click', () => extension.setComment(comment.id, ''));
                row.append(body, remove);
                return row;
            }),
        );
    }

    document.querySelectorAll<HTMLButtonElement>('.study-annotations__nag').forEach(button => {
        const nag = Number(button.dataset.nag);
        button.classList.toggle('active', state.annotations.nags.includes(nag));
    });

    const description = document.querySelector<HTMLTextAreaElement>('.study-annotations__description textarea');
    if (description && document.activeElement !== description) description.value = state.description;
    const tags = document.querySelector<HTMLTextAreaElement>('.study-annotations__tags textarea');
    if (tags && document.activeElement !== tags) tags.value = tagsText(state.tags);
}

function bindAnnotationPanel(extension: StudyAnalysisExtension): void {
    const commentInput = document.querySelector<HTMLTextAreaElement>('.study-annotations__comment-input');
    document.querySelector<HTMLButtonElement>('.study-annotations__add-comment')?.addEventListener('click', () => {
        if (!commentInput) return;
        if (extension.addComment(commentInput.value)) commentInput.value = '';
    });

    document.querySelectorAll<HTMLButtonElement>('.study-annotations__nag').forEach(button => {
        button.addEventListener('click', () => {
            const nag = Number(button.dataset.nag);
            const current = extension.annotationState.annotations.nags;
            extension.setNags(current.includes(nag) ? current.filter(item => item !== nag) : [...current, nag]);
        });
    });
    document
        .querySelector<HTMLButtonElement>('.study-annotations__clear')
        ?.addEventListener('click', () => extension.clearAnnotations());

    const description = document.querySelector<HTMLTextAreaElement>('.study-annotations__description textarea');
    document
        .querySelector<HTMLButtonElement>('.study-annotations__description .button')
        ?.addEventListener('click', () => {
            if (description) extension.setDescription(description.value);
        });

    const tags = document.querySelector<HTMLTextAreaElement>('.study-annotations__tags textarea');
    document.querySelector<HTMLButtonElement>('.study-annotations__tags .button')?.addEventListener('click', () => {
        if (tags) extension.setTags(parseTags(tags.value));
    });
}

function runStudyGround(vnode: VNode, model: PyChessModel, study: StudyPageModel): void {
    let extension: StudyAnalysisExtension;
    const ctrl = new AnalysisController(vnode.elm as HTMLElement, model, analysisCtrl => {
        extension = new StudyAnalysisExtension(analysisCtrl, {
            studyId: study.id,
            chapterId: study.chapter.id,
            revision: study.chapter.revision,
            tree: study.chapter.tree,
            orientation: study.chapter.orientation,
            description: study.chapter.description,
            tags: study.chapter.tags,
            onAnnotationStateChanged: state => updateAnnotationPanel(state, extension),
        });
        return extension;
    });
    bindAnnotationPanel(extension!);
    updateAnnotationPanel(extension!.annotationState, extension!);
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
