import { h, toVNode, type VNode } from 'snabbdom';
import ffishModule from 'ffish-es6';
import ffishAliceModule from 'ffish-alice-es6';

import { analysisUnderboard } from '../analysis';
import { alertDialog } from '../alertDialog';
import { analysisContext } from '../analysis/analysisContext';
import { AnalysisController } from '../analysis/analysisCtrl';
import { renderAnalysisPage } from '../analysis/analysisPage';
import { downloadText, notifyChessgroundResize, patch } from '../document';
import { _, ngettext } from '../i18n';
import type { PyChessModel, StudyPageModel } from '../types';
import { selectVariant, twoBoarsVariants, loadCataloguedVariantsFromJson, variantConfigIni } from '../variants';
import { variantsIni } from '../variantsIni';
import { createWebsocket } from '../socket/webSocketUtils';
import { StudyChapterNavigation } from './chapterNavigation';
import { analysisTreeFromStudy } from './studyTree';
import { StudyAnalysisExtension, type StudyAnnotationState } from './studySync';
import { GLYPH_GROUPS, toggleGlyph } from '../analysis/glyphs';
import { StudyCommentEditor } from './commentEditor';
import { fetchStudyChapterExportData, renderStudyChapterPgn, renderStudyPgn, studyPgnFilename } from './studyPgn';

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

// Layout and controls adapted from lila ui/analyse/src/study/studyView.ts
// and studyChapters.ts: chapters at the side, editing tools under the board.
function icon(name: string): VNode {
    return h(`i.icon.icon-${name}`, { attrs: { 'aria-hidden': 'true' } });
}

function openDialog(id: string): void {
    document.querySelector<HTMLDialogElement>(`#${id}`)?.showModal();
}

function dialog(id: string, title: string, content: VNode[]): VNode {
    return h(
        `dialog#${id}.study-dialog`,
        { attrs: { 'aria-labelledby': `${id}-title` }, on: { keydown: event => event.stopPropagation() } },
        [
            h('div.study-dialog__header', [
                h(`h2#${id}-title`, title),
                h(
                    'button.study-icon-button',
                    {
                        attrs: { type: 'button', 'aria-label': _('Close') },
                        on: { click: event => (event.currentTarget as HTMLElement).closest('dialog')?.close() },
                    },
                    '×',
                ),
            ]),
            ...content,
        ],
    );
}

function studySide(study: StudyPageModel, model: PyChessModel): VNode {
    const chapter = study.chapter;
    return h('div.study-side', [
        h('div.study-side__header', [
            h('h2', ngettext('%1 chapter', '%1 chapters', study.chapters.length)),
            h(
                'button.study-icon-button',
                {
                    attrs: { type: 'button', title: _('Edit study'), 'aria-label': _('Edit study') },
                    on: { click: () => openDialog('study-settings') },
                },
                [icon('bars')],
            ),
        ]),
        h(
            'nav.study-chapters',
            { attrs: { 'aria-label': _('Chapters') } },
            study.chapters.map(item =>
                h('div.study-chapter__row', { class: { active: item.id === chapter.id } }, [
                    h(
                        'a',
                        {
                            attrs: {
                                href: `/study/${study.id}/${item.id}`,
                                'aria-current': item.id === chapter.id ? 'page' : 'false',
                            },
                        },
                        [h('span.study-chapter__number', `${item.order}. `), h('span.study-chapter__name', item.name)],
                    ),
                    h(
                        'button.study-icon-button.study-chapter__edit',
                        {
                            attrs: {
                                type: 'button',
                                title: _('Edit chapter'),
                                'aria-label': _('Edit chapter: %1', item.name),
                            },
                            on: { click: () => openDialog(`chapter-settings-${item.id}`) },
                        },
                        [icon('cog')],
                    ),
                ]),
            ),
        ),
        h(
            'button.study-side__add',
            {
                attrs: { type: 'button' },
                on: { click: () => openDialog('study-new-chapter') },
            },
            [icon('plus-square'), _('Add a new chapter')],
        ),
        h('div.study-side__metadata', [
            h('h3', study.name),
            h('a', { attrs: { href: `/@/${study.owner}` } }, study.owner),
            h('a', { attrs: { href: '/study' } }, _('My studies')),
        ]),
        dialog('study-settings', _('Edit study'), [
            renameForm(`/study/${study.id}/edit`, study.name, _('Study name'), 100),
            deleteForm(`/study/${study.id}/delete`, _('Delete study'), _('Delete this study?'), 'study-side__danger'),
        ]),
        ...study.chapters.map(item =>
            dialog(`chapter-settings-${item.id}`, _('Edit chapter'), [
                renameForm(`/study/${study.id}/${item.id}/edit`, item.name, _('Chapter name'), 80),
                ...(study.chapters.length > 1
                    ? [
                          deleteForm(
                              `/study/${study.id}/${item.id}/delete`,
                              _('Delete chapter'),
                              _('Delete this chapter?'),
                          ),
                      ]
                    : []),
            ]),
        ),
        dialog('study-new-chapter', _('Add a new chapter'), [
            h('form.study-side__new-chapter', { attrs: { method: 'post', action: `/study/${study.id}/chapter` } }, [
                chapterField('chapterName', _('Chapter name'), '', 80),
                h('label', [
                    h('span', _('Variant')),
                    selectVariant(
                        'variant',
                        model.variant || 'chess',
                        () => {},
                        () => {},
                        twoBoarsVariants,
                    ),
                ]),
                model.chess960 === 'True'
                    ? h('input', { attrs: { type: 'hidden', name: 'chess960', value: '1' } })
                    : '',
                chapterField('fen', _('FEN (optional)')),
                chapterField('gameId', _('Game ID (optional)'), '', 12),
                h('button.button', { attrs: { type: 'submit' } }, _('Create chapter')),
            ]),
        ]),
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

type StudyTab = 'tags' | 'comments' | 'glyphs' | 'description' | 'export';

function selectStudyTab(tab: string, focus = false): void {
    document.querySelectorAll<HTMLButtonElement>('[data-study-tab]').forEach(button => {
        const selected = button.dataset.studyTab === tab;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        if (selected && focus) button.focus();
    });
    document.querySelectorAll<HTMLElement>('[data-study-panel]').forEach(panel => {
        panel.hidden = panel.dataset.studyPanel !== tab;
    });
    notifyChessgroundResize();
}

function toolPanel(tab: StudyTab, children: VNode[]): VNode {
    return h(
        `section#study-panel-${tab}.study-tool-panel`,
        {
            attrs: {
                role: 'tabpanel',
                'aria-labelledby': `study-tab-${tab}`,
                'data-study-panel': tab,
                hidden: tab !== 'tags',
            },
        },
        children,
    );
}

function studyUnderboard(study: StudyPageModel, model: PyChessModel): VNode {
    const tabs: [StudyTab, string, VNode | string][] = [
        ['tags', _('PGN tags'), h('i.study-tag-icon', { attrs: { 'aria-hidden': 'true' } })],
        ['comments', _('Comment this position'), icon('comment-o')],
        ['glyphs', _('Annotate with glyphs'), '!?'],
        ['description', _('Chapter description'), icon('book')],
        ['export', _('PGN export'), icon('download')],
    ];
    return h('div.study-underboard', [
        h(
            'nav.study-tool-tabs',
            { attrs: { role: 'tablist', 'aria-label': _('Study tools') } },
            tabs.map(([tab, label, symbol]) =>
                h(
                    `button#study-tab-${tab}`,
                    {
                        attrs: {
                            type: 'button',
                            role: 'tab',
                            title: label,
                            'aria-label': label,
                            'aria-controls': `study-panel-${tab}`,
                            'aria-selected': tab === 'tags',
                            tabindex: tab === 'tags' ? 0 : -1,
                            'data-study-tab': tab,
                        },
                        on: {
                            click: () => selectStudyTab(tab),
                            keydown: event => {
                                const index = tabs.findIndex(([key]) => key === tab);
                                let next: number;
                                if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                                else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
                                else if (event.key === 'Home') next = 0;
                                else if (event.key === 'End') next = tabs.length - 1;
                                else return;
                                event.preventDefault();
                                event.stopPropagation();
                                selectStudyTab(tabs[next][0], true);
                            },
                        },
                    },
                    [
                        symbol,
                        ...(tab === 'comments' || tab === 'glyphs'
                            ? [h('span.study-tool-count', { attrs: { 'data-count-for': tab } })]
                            : []),
                    ],
                ),
            ),
        ),
        toolPanel('tags', [
            h('h2.study-underboard__title', `${study.name}: ${study.chapter.name}`),
            h('table.study-tags'),
            h('details.study-annotations__tags', [
                h('summary', _('Edit PGN tags')),
                h('textarea', {
                    attrs: { rows: '6', 'aria-label': _('PGN tags'), placeholder: 'Event=\nSite=\nDate=' },
                }),
                h('button.button', { attrs: { type: 'button' } }, _('Save tags')),
            ]),
        ]),
        toolPanel('comments', [h('div.study-annotations__comments')]),
        toolPanel('glyphs', [
            h(
                'div.study-annotations__nags',
                Object.entries(GLYPH_GROUPS).map(([group, glyphs]) =>
                    h(
                        `div.study-glyph-group.study-glyph-group--${group}`,
                        glyphs.map(glyph =>
                            h(
                                'button.study-annotations__nag',
                                {
                                    attrs: {
                                        type: 'button',
                                        'data-nag': String(glyph.id),
                                        'data-symbol': glyph.symbol,
                                        'aria-pressed': 'false',
                                    },
                                },
                                glyph.name(),
                            ),
                        ),
                    ),
                ),
            ),
        ]),
        toolPanel('description', [
            h('div.study-annotations__description', [
                h('label', { attrs: { for: 'study-description' } }, _('Chapter description')),
                h('textarea#study-description', { attrs: { maxlength: '10000', rows: '5' } }),
                h('button.button', { attrs: { type: 'button' } }, _('Save description')),
            ]),
        ]),
        toolPanel('export', [
            h('div.study-export__actions', [
                h('button.button.study-export__chapter', { attrs: { type: 'button' } }, _('Download chapter PGN')),
                h('button.button.study-export__study', { attrs: { type: 'button' } }, _('Download study PGN')),
            ]),
            h('details.study-position-export', [
                h('summary', _('FEN & PGN')),
                ...analysisUnderboard(model, analysisContext(model), false),
            ]),
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

function updateAnnotationPanel(state: StudyAnnotationState, editor: StudyCommentEditor): void {
    editor.update(state.path, state.annotations.comments);
    document.querySelectorAll<HTMLButtonElement>('.study-annotations__nag').forEach(button => {
        const nag = Number(button.dataset.nag);
        button.classList.toggle('active', state.annotations.nags.includes(nag));
        button.setAttribute('aria-pressed', String(state.annotations.nags.includes(nag)));
        button.disabled = state.path === '';
    });

    document.querySelectorAll<HTMLElement>('[data-count-for]').forEach(count => {
        const value =
            count.dataset.countFor === 'comments' ? state.annotations.comments.length : state.annotations.nags.length;
        count.textContent = value ? String(value) : '';
    });
    const table = document.querySelector('.study-tags');
    if (table)
        table.replaceChildren(
            ...Object.entries(state.tags).map(([key, value]) => {
                const row = document.createElement('tr');
                const name = document.createElement('th');
                name.scope = 'row';
                name.textContent = key;
                const cell = document.createElement('td');
                cell.textContent = value;
                row.append(name, cell);
                return row;
            }),
        );

    const description = document.querySelector<HTMLTextAreaElement>('.study-annotations__description textarea');
    if (description && document.activeElement !== description) description.value = state.description;
    const tags = document.querySelector<HTMLTextAreaElement>('.study-annotations__tags textarea');
    if (tags && document.activeElement !== tags) tags.value = tagsText(state.tags);
}

function bindAnnotationPanel(getExtension: () => StudyAnalysisExtension): void {
    document.querySelectorAll<HTMLButtonElement>('.study-annotations__nag').forEach(button => {
        button.addEventListener('click', () => {
            const nag = Number(button.dataset.nag);
            const current = getExtension().annotationState.annotations.nags;
            getExtension().setNags(toggleGlyph(current, nag));
        });
    });
    const description = document.querySelector<HTMLTextAreaElement>('.study-annotations__description textarea');
    document
        .querySelector<HTMLButtonElement>('.study-annotations__description .button')
        ?.addEventListener('click', () => {
            if (description) getExtension().setDescription(description.value);
        });

    const tags = document.querySelector<HTMLTextAreaElement>('.study-annotations__tags textarea');
    document.querySelector<HTMLButtonElement>('.study-annotations__tags .button')?.addEventListener('click', () => {
        if (tags) getExtension().setTags(parseTags(tags.value));
    });
}

function bindExportPanel(getExtension: () => StudyAnalysisExtension, study: StudyPageModel): void {
    const chapterButton = document.querySelector<HTMLButtonElement>('.study-export__chapter');
    chapterButton?.addEventListener('click', () => {
        const pgnStudy = getExtension().pgnStudy;
        const chapter = getExtension().pgnChapter;
        if (!pgnStudy || !chapter) return;
        downloadText(studyPgnFilename(study.name, chapter.name), renderStudyChapterPgn(pgnStudy, chapter));
    });

    const studyButton = document.querySelector<HTMLButtonElement>('.study-export__study');
    studyButton?.addEventListener('click', async () => {
        const pgnStudy = getExtension().pgnStudy;
        const currentChapter = getExtension().pgnChapter;
        if (!pgnStudy || !currentChapter || !studyButton) return;
        studyButton.disabled = true;
        try {
            const chapters = [];
            for (const preview of [...study.chapters].sort((a, b) => a.order - b.order)) {
                chapters.push(
                    preview.id === currentChapter.id
                        ? currentChapter
                        : await fetchStudyChapterExportData(study.id, preview.id),
                );
            }
            downloadText(studyPgnFilename(study.name), renderStudyPgn(pgnStudy, chapters));
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            await alertDialog({ text: _('Could not export Study PGN: %1', detail) });
        } finally {
            studyButton.disabled = false;
        }
    });
}

function studyContextMenu(ctrl: AnalysisController, path: string): VNode[] {
    const action = (tab: 'comments' | 'glyphs', label: string, symbol: VNode | string) =>
        h(
            'button',
            {
                attrs: { type: 'button' },
                on: {
                    click: () => {
                        ctrl.activateTreePath(path);
                        ctrl.closeTreeContextMenu();
                        selectStudyTab(tab);
                        document
                            .querySelector<HTMLElement>(
                                `#study-panel-${tab} ${tab === 'comments' ? 'textarea' : 'button'}`,
                            )
                            ?.focus();
                    },
                },
            },
            [typeof symbol === 'string' ? h('i.study-glyph-icon', symbol) : symbol, h('span', label)],
        );
    return [
        action('comments', _('Comment on this move'), icon('comment-o')),
        action('glyphs', _('Annotate with glyphs'), '!?'),
    ];
}

function runStudyGround(vnode: VNode, model: PyChessModel, study: StudyPageModel, sideVNode: VNode): void {
    let extension: StudyAnalysisExtension;
    let ctrl: AnalysisController;
    const paths = new Map<string, string>();
    const modules = new Map<boolean, Promise<PyChessModel['ffish']>>([
        [model.variant === 'alice', Promise.resolve(model.ffish)],
    ]);
    const editor = new StudyCommentEditor(
        document.querySelector<HTMLElement>('.study-annotations__comments')!,
        (path, id, text) => extension.setComment(id, text, path),
    );
    const socket = createWebsocket(
        `wsstudy/${study.id}`,
        () => extension.onSocketOpen(),
        () => extension.onSocketReconnect(),
        () => extension.onSocketClose(),
        event => {
            if (event.data === '/n') return;
            const message = JSON.parse(event.data);
            extension.onSocketMessage(message.type, message);
        },
    );
    const mount = (el: HTMLElement) => {
        ctrl = new AnalysisController(el, model, analysisCtrl => {
            extension = new StudyAnalysisExtension(analysisCtrl, {
                socket,
                studyId: study.id,
                chapterId: study.chapter.id,
                revision: study.chapter.revision,
                tree: study.chapter.tree,
                orientation: study.chapter.orientation,
                description: study.chapter.description,
                tags: study.chapter.tags,
                studyName: study.name,
                chapterName: study.chapter.name,
                chapterOrder: study.chapter.order,
                owner: study.owner,
                home: model.home,
                variant: study.chapter.variant,
                chess960: study.chapter.chess960,
                initialFen: study.chapter.initialFen,
                variantIni: study.chapter.variantIni ?? undefined,
                createdAt: study.chapter.createdAt,
                onAnnotationStateChanged: state => updateAnnotationPanel(state, editor),
                contextMenuActions: path => studyContextMenu(analysisCtrl, path),
            });
            return extension;
        });
        if (socket.ws.readyState === WebSocket.OPEN) extension.onSocketOpen();
        updateAnnotationPanel(extension.annotationState, editor);
        window['onFSFline'] = ctrl.onFSFline;
    };
    mount(vnode.elm as HTMLElement);
    bindAnnotationPanel(() => extension);
    bindExportPanel(() => extension, study);

    const navigation = new StudyChapterNavigation({
        studyId: study.id,
        currentChapter: () => study.chapter.id,
        flush: () => {
            editor.flush();
            return extension.whenIdle();
        },
        busy: busy => {
            const app = document.querySelector<HTMLElement>('.study-app')!;
            app.setAttribute('aria-busy', String(busy));
            for (const child of app.children) {
                if (!child.classList.contains('sidebar-first')) (child as HTMLElement).inert = busy;
            }
        },
        error: error => {
            console.error('Could not load chapter', error);
            void alertDialog({ text: _('Could not load chapter: %1', String(error)) });
        },
        apply: async (data, isCurrent) => {
            // Validate the tree and load the required WASM module before touching
            // the current board. Alice and the ordinary variants use separate modules.
            analysisTreeFromStudy(data.board.steps[0], data.study.chapter.tree);
            const alice = data.study.chapter.variant === 'alice';
            if (!modules.has(alice)) {
                const script = document.querySelector<HTMLScriptElement>('script[src*="/static/pychess-variants.js"]');
                const version = script ? new URL(script.src).search : '';
                modules.set(
                    alice,
                    (alice ? ffishAliceModule : ffishModule)({
                        locateFile: (path: string, prefix: string) =>
                            path.endsWith('.wasm') ? `/static/${path}${version}` : prefix + path,
                    }).catch((error: unknown) => {
                        modules.delete(alice);
                        throw error;
                    }),
                );
            }
            const ffish = await modules.get(alice)!;
            await ctrl.whenEngineConfigured();
            if (!isCurrent()) return;
            paths.set(study.chapter.id, ctrl.analysisPath);
            ctrl.destroy();
            editor.reset();
            Object.assign(study, data.study);
            model = {
                ...model,
                study,
                ffish,
                board: data.board,
                variant: study.chapter.variant,
                chess960: study.chapter.chess960 ? 'True' : 'False',
                initialFen: study.chapter.initialFen,
                fen: study.chapter.initialFen,
                ply: 0,
            };
            loadCataloguedVariantsFromJson(JSON.stringify(data.cataloguedVariants));
            ffish.loadVariantConfig(variantConfigIni(variantsIni, model.variant));
            document.body.dataset.variant = model.variant;
            document.title = `${study.name} • PyChess`;
            // Patch only chapter-dependent parts. The main grid, sidebar, tool tabs
            // and underboard editors remain mounted throughout the switch.
            const next = renderAnalysisPage(model, {
                side: [],
                underboard: [],
                ongoing: false,
                mountBoard: () => {},
            })[0];
            const app = document.querySelector<HTMLElement>('.study-app')!;
            const selectors = [
                '#mainboard',
                '#gauge',
                '.pocket-top',
                '.analysis-tools',
                '.analysis-settings',
                '#move-controls',
                '.pocket-bot',
            ];
            for (const selector of selectors) {
                const current = app.querySelector<HTMLElement>(
                    `:scope > ${selector === '#move-controls' ? '#btn-controls-top' : selector}`,
                );
                if (selector === '.analysis-settings') current?.replaceChildren();
                const replacement = (next.children as VNode[]).find(child => child.sel?.includes(selector));
                if (current && replacement) patch(toVNode(current), replacement);
            }
            sideVNode = patch(sideVNode, studySide(study, model));
            mount(app.querySelector<HTMLElement>('#mainboard > .cg-wrap')!);
            const path = paths.get(study.chapter.id);
            if (path && ctrl.getTreeNodeAtPath(path)) ctrl.activateTreePath(path);
            notifyChessgroundResize();
            if (window.fsf) {
                ctrl.loadVariantsIntoFsfEngine();
            }
        },
    });
    document.querySelector('.sidebar-first')!.addEventListener('click', event => {
        const mouse = event as MouseEvent;
        const link = (event.target as Element).closest<HTMLAnchorElement>('.study-chapters a');
        if (!link || mouse.button !== 0 || mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.altKey) return;
        event.preventDefault();
        void navigation.go(new URL(link.href).pathname.split('/').pop()!);
    });
    window.addEventListener('popstate', () => {
        const [prefix, studyId, chapterId] = window.location.pathname.split('/').filter(Boolean);
        if (prefix === 'study' && studyId === study.id && chapterId) void navigation.go(chapterId, 'pop');
    });
    window.addEventListener('beforeunload', event => {
        editor.flush();
        if (extension.pendingCount > 0) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

export function studyView(model: PyChessModel): VNode[] {
    const study = model.study;
    if (!study) return [h('div.box.box-pad', _('Study data is unavailable.'))];

    const side = studySide(study, model);
    const page = renderAnalysisPage(model, {
        side,
        underboard: studyUnderboard(study, model),
        mountBoard: vnode => runStudyGround(vnode, model, study, side),
        ongoing: false,
    });
    page[0].data = { ...page[0].data, class: { 'study-app': true } };
    return page;
}
