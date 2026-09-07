import { h, toVNode, type VNode } from 'snabbdom';
import ffishModule from 'ffish-es6';
import ffishAliceModule from 'ffish-alice-es6';

import { analysisUnderboard, renderEmbedPage } from '../analysis';
import { alertDialog } from '../alertDialog';
import { analysisContext } from '../analysis/analysisContext';
import { AnalysisController } from '../analysis/analysisCtrl';
import { renderAnalysisPage } from '../analysis/analysisPage';
import { copyTextToClipboard } from '../clipboard';
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

function dialogField(label: string, control: VNode): VNode {
    return h('label.study-dialog__field', [h('span', label), control]);
}

function studySettingsForm(study: StudyPageModel, formId: string): VNode {
    return h(`form#${formId}.study-dialog__form`, { attrs: { method: 'post', action: `/study/${study.id}/edit` } }, [
        dialogField(
            _('Name'),
            h('input', {
                attrs: {
                    type: 'text',
                    name: 'name',
                    value: study.name,
                    maxlength: '100',
                    autocomplete: 'off',
                },
            }),
        ),
        dialogField(
            _('Visibility'),
            h(
                'select',
                { attrs: { name: 'visibility' } },
                [
                    ['private', _('Private')],
                    ['unlisted', _('Unlisted')],
                    ['public', _('Public')],
                ].map(([value, label]) =>
                    h('option', { attrs: { value, selected: study.visibility === value } }, label),
                ),
            ),
        ),
    ]);
}

function chapterSettingsForm(
    study: StudyPageModel,
    chapter: StudyPageModel['chapters'][number],
    formId: string,
): VNode {
    return h(
        `form#${formId}.study-dialog__form`,
        { attrs: { method: 'post', action: `/study/${study.id}/${chapter.id}/edit` } },
        [
            dialogField(
                _('Name'),
                h('input', {
                    attrs: {
                        type: 'text',
                        name: 'name',
                        value: chapter.name,
                        maxlength: '80',
                        autocomplete: 'off',
                    },
                }),
            ),
            dialogField(
                _('Orientation'),
                h('select', { attrs: { name: 'orientation' } }, [
                    h('option', { attrs: { value: 'white', selected: chapter.orientation === 'white' } }, _('White')),
                    h('option', { attrs: { value: 'black', selected: chapter.orientation === 'black' } }, _('Black')),
                ]),
            ),
        ],
    );
}

function dialogActions(saveFormId: string, saveLabel: string, destructive?: VNode): VNode {
    return h('div.study-dialog__actions', [
        destructive ?? h('span'),
        h('button.button', { attrs: { type: 'submit', form: saveFormId } }, saveLabel),
    ]);
}

function deleteForm(
    action: string,
    label: string,
    prompt: string,
    className?: string,
    hiddenFields?: Record<string, string>,
): VNode {
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
        [
            ...Object.entries(hiddenFields ?? {}).map(([name, value]) =>
                h('input', { attrs: { type: 'hidden', name, value } }),
            ),
            h('button.button.button-red', { attrs: { type: 'submit' } }, label),
        ],
    );
}

// Layout and controls adapted from lila ui/analyse/src/study/studyView.ts
// and studyChapters.ts: chapters at the side, editing tools under the board.
function icon(name: string): VNode {
    return h(`i.icon.icon-${name}`, { attrs: { 'aria-hidden': 'true' } });
}

function studyLikeControl(study: StudyPageModel): VNode {
    const label = study.liked ? _('Unlike') : _('Like');
    const content = [icon('heart'), h('span.study-like__count', String(study.likes))];
    if (!study.canLike)
        return h(
            'span.study-like.study-like--readonly',
            {
                class: { liked: study.liked },
                attrs: {
                    title: ngettext('%1 like', '%1 likes', study.likes),
                    'data-study-like': '',
                },
            },
            content,
        );
    return h(
        'button.study-like',
        {
            class: { liked: study.liked },
            attrs: {
                type: 'button',
                title: label,
                'aria-label': label,
                'aria-pressed': study.liked ? 'true' : 'false',
                'data-study-like': '',
            },
            props: { disabled: Boolean(study.likePending) },
            on: { click: () => void toggleStudyLike(study) },
        },
        content,
    );
}

function studyMetadataTitle(study: StudyPageModel): VNode {
    return h('h2.study-underboard__title', [
        h('span.study-underboard__name', `${study.name}: ${study.chapter.name}`),
        studyLikeControl(study),
    ]);
}

function updateStudyLikeControl(study: StudyPageModel): void {
    const label = study.liked ? _('Unlike') : _('Like');
    document.querySelectorAll<HTMLElement>('[data-study-like]').forEach(element => {
        element.classList.toggle('liked', study.liked);
        const count = element.querySelector<HTMLElement>('.study-like__count');
        if (count) count.textContent = String(study.likes);
        if (element instanceof HTMLButtonElement) {
            element.title = label;
            element.setAttribute('aria-label', label);
            element.setAttribute('aria-pressed', study.liked ? 'true' : 'false');
            element.disabled = Boolean(study.likePending);
        } else element.title = ngettext('%1 like', '%1 likes', study.likes);
    });
}

async function toggleStudyLike(study: StudyPageModel): Promise<void> {
    if (!study.canLike || study.likePending) return;
    const previousLiked = study.liked;
    const previousLikes = study.likes;
    study.likePending = true;
    study.liked = !previousLiked;
    study.likes = Math.max(0, previousLikes + (study.liked ? 1 : -1));
    updateStudyLikeControl(study);
    try {
        const response = await fetch(`/study/${study.id}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ liked: study.liked }),
        });
        if (!response.ok) throw new Error((await response.text()).trim() || response.statusText);
        const payload = (await response.json()) as { liked?: unknown; likes?: unknown };
        if (typeof payload.liked !== 'boolean' || !Number.isInteger(payload.likes) || (payload.likes as number) < 0)
            throw new Error(_('Invalid Study like response'));
        study.liked = payload.liked;
        study.likes = payload.likes as number;
    } catch (error) {
        study.liked = previousLiked;
        study.likes = previousLikes;
        void alertDialog({
            text: _('Could not update Study like: %1', error instanceof Error ? error.message : String(error)),
        });
    } finally {
        study.likePending = false;
        updateStudyLikeControl(study);
    }
}

function studyTopicHref(topic: string): string {
    return `/study/topic/${encodeURIComponent(topic)}`;
}

function studyTopicsView(study: StudyPageModel): VNode {
    return h('div.study-topics', { attrs: { 'data-study-topics': '' } }, [
        ...study.topics.map(topic => h('a.study-topic', { attrs: { href: studyTopicHref(topic) } }, topic)),
        ...(study.canWrite
            ? [
                  h(
                      'button.study-topics__manage',
                      {
                          attrs: { type: 'button' },
                          on: { click: () => openDialog('study-topics') },
                      },
                      _('Manage topics'),
                  ),
              ]
            : []),
    ]);
}

function updateStudyTopicsView(study: StudyPageModel): void {
    document
        .querySelectorAll<HTMLElement>('[data-study-topics]')
        .forEach(element => patch(toVNode(element), studyTopicsView(study)));
    const modal = document.querySelector<HTMLDialogElement>('#study-topics');
    const textarea = modal?.querySelector<HTMLTextAreaElement>('textarea[name="topics"]');
    if (textarea && !modal?.open) textarea.value = study.topics.join('\n');
}

function parseStudyTopics(value: string): string[] {
    const topics: string[] = [];
    for (const raw of value.split(/[\n,]+/)) {
        const topic = raw.trim().replace(/\s+/g, ' ');
        if (topic && !topics.includes(topic)) topics.push(topic);
    }
    return topics;
}

async function saveStudyTopics(study: StudyPageModel, form: HTMLFormElement): Promise<void> {
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="topics"]');
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!textarea || !button) return;
    const topics = parseStudyTopics(textarea.value);
    if (topics.length > study.maxTopics) {
        void alertDialog({ text: _('A study can have at most %1 topics.', study.maxTopics) });
        return;
    }
    button.disabled = true;
    try {
        const response = await fetch(`/study/${study.id}/topics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topics }),
        });
        if (!response.ok) throw new Error((await response.text()).trim() || response.statusText);
        const payload = (await response.json()) as { topics?: unknown };
        if (!Array.isArray(payload.topics) || !payload.topics.every(topic => typeof topic === 'string'))
            throw new Error(_('Invalid Study topics response'));
        study.topics = payload.topics as string[];
        textarea.value = study.topics.join('\n');
        updateStudyTopicsView(study);
        form.closest<HTMLDialogElement>('dialog')?.close();
    } catch (error) {
        void alertDialog({
            text: _('Could not update Study topics: %1', error instanceof Error ? error.message : String(error)),
        });
    } finally {
        button.disabled = false;
    }
}

function studyTopicsDialog(study: StudyPageModel): VNode {
    return dialog('study-topics', _('Topics'), [
        h('p.study-topics__help', [
            _('Add topics to help people discover this study. Enter one topic per line or separate them with commas.'),
        ]),
        h(
            'form.study-topics__form',
            {
                on: {
                    submit: event => {
                        event.preventDefault();
                        void saveStudyTopics(study, event.currentTarget as HTMLFormElement);
                    },
                },
            },
            [
                h(
                    'textarea',
                    {
                        attrs: {
                            name: 'topics',
                            rows: '8',
                            maxlength: String(study.maxTopics * 52),
                            placeholder: `${_('Opening')}\n${_('Endgame')}`,
                            'aria-label': _('Study topics'),
                        },
                    },
                    study.topics.join('\n'),
                ),
                h('div.study-topics__form-actions', [
                    h('span', ngettext('%1 topic maximum', '%1 topics maximum', study.maxTopics)),
                    h('button.button', { attrs: { type: 'submit' } }, _('Save')),
                ]),
            ],
        ),
    ]);
}

function openDialog(id: string): void {
    const modal = document.querySelector<HTMLDialogElement>(`#${id}`);
    if (!modal) return;
    modal.showModal();
    const input = modal.querySelector<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], textarea');
    input?.focus();
    if (input instanceof HTMLInputElement) input.select();
}

function dialog(id: string, title: string, content: VNode[]): VNode {
    return h(
        `dialog#${id}.study-dialog`,
        { attrs: { 'aria-labelledby': `${id}-title` }, on: { keydown: event => event.stopPropagation() } },
        [
            h('div.study-dialog__header', [
                h(`h2#${id}-title`, title),
                h(
                    'button.study-icon-button.study-dialog__close',
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

function orderedStudyMembers(study: StudyPageModel): Array<[string, 'read' | 'write']> {
    return Object.entries(study.members).sort(([a, aRole], [b, bRole]) => {
        if (a === study.owner) return -1;
        if (b === study.owner) return 1;
        if (aRole !== bRole) return aRole === 'write' ? -1 : 1;
        return a.localeCompare(b);
    });
}

async function postStudyMemberAction(action: string, fields: Record<string, string>): Promise<void> {
    const response = await fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields),
        redirect: 'manual',
    });
    // Successful Study member mutations redirect back to the Study. With manual
    // redirect handling browsers expose that as an opaque redirect, avoiding an
    // unnecessary full-page GET while the websocket delivers the updated member map.
    if (response.type === 'opaqueredirect' || response.ok) return;
    const message = (await response.text()).trim();
    throw new Error(message || response.statusText || _('Could not update Study members'));
}

function reportStudyMemberError(error: unknown): void {
    void alertDialog({
        text: _('Could not update Study members: %1', error instanceof Error ? error.message : String(error)),
    });
}

function studyInviteDialog(study: StudyPageModel): VNode {
    const memberCount = Object.keys(study.members).length;
    return dialog('study-invite', _('Add members'), [
        h('p.study-invite__info', _('Add people you know and trust. New members start as read only.')),
        h(
            'form.study-invite__form',
            {
                attrs: { method: 'post', action: `/study/${study.id}/member` },
                on: {
                    submit: event => {
                        event.preventDefault();
                        const form = event.currentTarget as HTMLFormElement;
                        const input = form.elements.namedItem('username') as HTMLInputElement;
                        const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
                        const username = input.value.trim();
                        if (!username) return;
                        if (submit) submit.disabled = true;
                        void postStudyMemberAction(`/study/${study.id}/member`, { username, role: 'read' })
                            .then(() => {
                                input.value = '';
                                form.closest<HTMLDialogElement>('dialog')?.close();
                            })
                            .catch(reportStudyMemberError)
                            .finally(() => {
                                if (submit?.isConnected) submit.disabled = false;
                            });
                    },
                },
            },
            [
                h('input', {
                    attrs: {
                        type: 'text',
                        name: 'username',
                        required: true,
                        maxlength: '20',
                        autocomplete: 'off',
                        placeholder: _('Search by username'),
                        'aria-label': _('Username'),
                    },
                }),
                h('button.button', { attrs: { type: 'submit' } }, _('Add member')),
            ],
        ),
        h('p.study-invite__limit', `${memberCount} / ${study.maxMembers} ${_('members')}`),
    ]);
}

type StudyModeActions = {
    toggleSticky: () => void;
    toggleWrite: () => void;
};

function studyRecordingKey(studyId: string): string {
    return `study.rec:${studyId}`;
}

function initializeStudyModes(study: StudyPageModel): void {
    if (study.sticky === undefined) study.sticky = study.chapter.id === study.sharedChapter;
    if (study.behind === undefined) study.behind = 0;
    if (study.write === undefined) {
        const stored = localStorage.getItem(studyRecordingKey(study.id));
        study.write = study.canWrite && stored !== 'false';
    } else if (!study.canWrite) study.write = false;
}

function studyModeButtons(study: StudyPageModel, actions: StudyModeActions): VNode[] {
    const behind = study.behind ?? 0;
    const state = (on: boolean) => h('span.study-mode__state', on ? '✓' : '✕');
    return [
        h(
            'button.study-mode.study-mode--sync',
            {
                class: { on: Boolean(study.sticky) },
                attrs: {
                    type: 'button',
                    title: _('All Study members remain on the same position'),
                    'aria-pressed': String(Boolean(study.sticky)),
                },
                on: { click: () => actions.toggleSticky() },
            },
            [behind ? h('span.study-mode__behind', String(behind)) : state(Boolean(study.sticky)), 'SYNC'],
        ),
        ...(study.canWrite
            ? [
                  h(
                      'button.study-mode.study-mode--write',
                      {
                          class: { on: Boolean(study.write) },
                          attrs: {
                              type: 'button',
                              title: _('Share changes with Study members'),
                              'aria-pressed': String(Boolean(study.write)),
                          },
                          on: { click: () => actions.toggleWrite() },
                      },
                      [state(Boolean(study.write)), 'REC'],
                  ),
              ]
            : []),
    ];
}

function refreshStudyModeButtons(study: StudyPageModel): void {
    const update = (selector: string, on: boolean, behind = 0): void => {
        const button = document.querySelector<HTMLButtonElement>(`.study-tool-tabs > ${selector}`);
        if (!button) return;
        button.classList.toggle('on', on);
        button.setAttribute('aria-pressed', String(on));
        const indicator = button.querySelector<HTMLSpanElement>('.study-mode__state, .study-mode__behind');
        if (!indicator) return;
        indicator.className = behind ? 'study-mode__behind' : 'study-mode__state';
        indicator.textContent = behind ? String(behind) : on ? '✓' : '✕';
    };
    update('.study-mode--sync', Boolean(study.sticky), study.behind ?? 0);
    update('.study-mode--write', Boolean(study.write));
}

type StudySideTab = 'chapters' | 'members';

function selectStudySideTab(study: StudyPageModel, tab: StudySideTab, focus = false): void {
    study.sideTab = tab;
    const side = document.querySelector<HTMLElement>('.study-side');
    if (!side) return;
    side.querySelectorAll<HTMLButtonElement>('[data-study-side-tab]').forEach(button => {
        const selected = button.dataset.studySideTab === tab;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        if (selected && focus) button.focus();
    });
    side.querySelectorAll<HTMLElement>('[data-study-side-panel]').forEach(panel => {
        panel.hidden = panel.dataset.studySidePanel !== tab;
    });
    notifyChessgroundResize();
}

function studySideTabButton(study: StudyPageModel, tab: StudySideTab, label: string): VNode {
    const selected = (study.sideTab ?? 'chapters') === tab;
    return h(
        `button#study-side-tab-${tab}.study-side__tab`,
        {
            class: { active: selected },
            attrs: {
                type: 'button',
                role: 'tab',
                'aria-controls': `study-side-panel-${tab}`,
                'aria-selected': selected ? 'true' : 'false',
                tabindex: selected ? 0 : -1,
                'data-study-side-tab': tab,
            },
            on: {
                click: () => selectStudySideTab(study, tab),
                keydown: event => {
                    let next: StudySideTab | undefined;
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
                        next = tab === 'chapters' ? 'members' : 'chapters';
                    else if (event.key === 'Home') next = 'chapters';
                    else if (event.key === 'End') next = 'members';
                    if (!next) return;
                    event.preventDefault();
                    selectStudySideTab(study, next, true);
                },
            },
        },
        label,
    );
}

function selectStudyMemberConfig(study: StudyPageModel, username?: string): void {
    study.memberConfig = username && study.memberConfig !== username ? username : undefined;
    const side = document.querySelector<HTMLElement>('.study-side');
    if (!side) return;
    side.querySelectorAll<HTMLElement>('[data-study-member]').forEach(row => {
        row.classList.toggle('editing', row.dataset.studyMember === study.memberConfig);
    });
    side.querySelectorAll<HTMLButtonElement>('[data-study-member-config-button]').forEach(button => {
        button.setAttribute('aria-expanded', String(button.dataset.studyMemberConfigButton === study.memberConfig));
    });
    side.querySelectorAll<HTMLElement>('[data-study-member-config]').forEach(panel => {
        panel.hidden = panel.dataset.studyMemberConfig !== study.memberConfig;
    });
}

function studyMemberConfig(study: StudyPageModel, username: string, role: 'read' | 'write'): VNode {
    const contributor = role === 'write';
    return h(
        `div#study-member-config-${username}.study-members-side__config-panel`,
        {
            attrs: {
                'data-study-member-config': username,
                hidden: study.memberConfig !== username,
            },
        },
        [
            h('div.study-members-side__role-control', [
                h('label.switch', [
                    h('input', {
                        props: { type: 'checkbox', checked: contributor },
                        attrs: { 'aria-label': _('Contributor') },
                        on: {
                            change: event => {
                                const input = event.currentTarget as HTMLInputElement;
                                const nextRole = input.checked ? 'write' : 'read';
                                input.disabled = true;
                                selectStudyMemberConfig(study);
                                void postStudyMemberAction(`/study/${study.id}/member/role`, {
                                    username,
                                    role: nextRole,
                                }).catch(error => {
                                    input.checked = contributor;
                                    reportStudyMemberError(error);
                                });
                            },
                        },
                    }),
                    h('span.sw-slider'),
                ]),
                h('span', _('Contributor')),
            ]),
            h(
                'button.study-members-side__kick',
                {
                    attrs: {
                        type: 'button',
                        title: _('Remove %1 from this Study', username),
                        'aria-label': _('Remove %1 from this Study', username),
                    },
                    on: {
                        click: event => {
                            const button = event.currentTarget as HTMLButtonElement;
                            button.disabled = true;
                            selectStudyMemberConfig(study);
                            void postStudyMemberAction(`/study/${study.id}/member/remove`, { username }).catch(
                                error => {
                                    if (button.isConnected) button.disabled = false;
                                    reportStudyMemberError(error);
                                },
                            );
                        },
                    },
                },
                [h('span.study-members-side__kick-icon', { attrs: { 'aria-hidden': 'true' } }, '✖'), _('KICK')],
            ),
        ],
    );
}

function studyMembersSide(study: StudyPageModel, model: PyChessModel): VNode {
    const members = orderedStudyMembers(study);
    const myRole = model.username ? study.members[model.username] : undefined;
    const roleLabel = (username: string, role: 'read' | 'write') =>
        username === study.owner ? _('Owner') : role === 'write' ? _('Contributor') : _('Read only');

    if (study.memberConfig && !study.members[study.memberConfig]) study.memberConfig = undefined;

    return h('div.study-members-side', [
        h(
            'div.study-members-side__list',
            members.flatMap(([username, role]) => {
                const configurable = study.isOwner && username !== study.owner;
                const editing = study.memberConfig === username;
                return [
                    h(
                        'div.study-members-side__member',
                        {
                            class: { editing },
                            attrs: { 'data-study-member': username },
                        },
                        [
                            h('div.study-members-side__identity', [
                                h(
                                    `span.study-members-side__status.study-members-side__status--${role}`,
                                    {
                                        class: { current: username === model.username },
                                        attrs: {
                                            role: 'img',
                                            title: roleLabel(username, role),
                                            'aria-label': roleLabel(username, role),
                                        },
                                    },
                                    [h('i.study-members-side__role-icon', { attrs: { 'aria-hidden': 'true' } })],
                                ),
                                h('a', { attrs: { href: `/@/${username}` } }, username),
                            ]),
                            ...(configurable
                                ? [
                                      h(
                                          'button.study-icon-button.study-members-side__config',
                                          {
                                              attrs: {
                                                  type: 'button',
                                                  title: _('Manage %1', username),
                                                  'aria-label': _('Manage %1', username),
                                                  'aria-controls': `study-member-config-${username}`,
                                                  'aria-expanded': editing ? 'true' : 'false',
                                                  'data-study-member-config-button': username,
                                              },
                                              on: { click: () => selectStudyMemberConfig(study, username) },
                                          },
                                          [icon('cog')],
                                      ),
                                  ]
                                : []),
                        ],
                    ),
                    ...(configurable ? [studyMemberConfig(study, username, role)] : []),
                ];
            }),
        ),
        ...(study.isOwner && members.length < study.maxMembers
            ? [
                  h(
                      'button.study-side__add.study-members-side__add',
                      {
                          attrs: { type: 'button' },
                          on: { click: () => openDialog('study-invite') },
                      },
                      [icon('plus-square'), _('Add members')],
                  ),
              ]
            : []),
        ...(!study.isOwner && myRole
            ? [
                  h(
                      'form.study-members-side__leave',
                      {
                          attrs: { method: 'post', action: `/study/${study.id}/leave` },
                          on: {
                              submit: event => {
                                  if (!window.confirm(_('Leave this Study?'))) event.preventDefault();
                              },
                          },
                      },
                      [h('button.button.button-empty', { attrs: { type: 'submit' } }, _('Leave study'))],
                  ),
              ]
            : []),
    ]);
}

function studySide(study: StudyPageModel, model: PyChessModel): VNode {
    const chapter = study.chapter;
    const canWrite = study.canWrite;
    const activeTab = study.sideTab ?? 'chapters';
    const memberCount = Object.keys(study.members).length;
    return h('div.study-side', [
        h('div.study-side__tabs', { attrs: { role: 'tablist', 'aria-label': _('Study navigation') } }, [
            studySideTabButton(study, 'chapters', ngettext('%1 chapter', '%1 chapters', study.chapters.length)),
            studySideTabButton(study, 'members', ngettext('%1 member', '%1 members', memberCount)),
            ...(study.isOwner
                ? [
                      h(
                          'button.study-icon-button.study-side__more',
                          {
                              attrs: { type: 'button', title: _('Edit study'), 'aria-label': _('Edit study') },
                              on: { click: () => openDialog('study-settings') },
                          },
                          [icon('bars')],
                      ),
                  ]
                : [h('span.study-side__readonly', canWrite ? _('Contributor') : _('Read only'))]),
        ]),
        h(
            'section#study-side-panel-chapters.study-side__panel',
            {
                attrs: {
                    role: 'tabpanel',
                    'aria-labelledby': 'study-side-tab-chapters',
                    'data-study-side-panel': 'chapters',
                    hidden: activeTab !== 'chapters',
                },
            },
            [
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
                                [
                                    h('span.study-chapter__number', `${item.order}. `),
                                    h('span.study-chapter__name', item.name),
                                ],
                            ),
                            ...(canWrite
                                ? [
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
                                  ]
                                : []),
                        ]),
                    ),
                ),
                ...(canWrite
                    ? [
                          h(
                              'button.study-side__add',
                              {
                                  attrs: { type: 'button' },
                                  on: { click: () => openDialog('study-new-chapter') },
                              },
                              [icon('plus-square'), _('Add a new chapter')],
                          ),
                      ]
                    : []),
            ],
        ),
        h(
            'section#study-side-panel-members.study-side__panel',
            {
                attrs: {
                    role: 'tabpanel',
                    'aria-labelledby': 'study-side-tab-members',
                    'data-study-side-panel': 'members',
                    hidden: activeTab !== 'members',
                },
            },
            [studyMembersSide(study, model)],
        ),
        h('div.study-side__metadata', [
            h('h3', study.name),
            h('a', { attrs: { href: `/@/${study.owner}` } }, study.owner),
            study.isOwner
                ? h('a', { attrs: { href: '/study' } }, _('My studies'))
                : h('span.study-side__visibility', study.visibility),
        ]),
        ...(study.isOwner
            ? [
                  dialog('study-settings', _('Edit study'), [
                      studySettingsForm(study, 'study-settings-form'),
                      dialogActions(
                          'study-settings-form',
                          _('Save'),
                          deleteForm(
                              `/study/${study.id}/delete`,
                              _('Delete study'),
                              _('Delete this study?'),
                              'study-side__danger',
                          ),
                      ),
                  ]),
              ]
            : []),
        ...(canWrite
            ? [
                  studyTopicsDialog(study),
                  ...study.chapters.map(item =>
                      dialog(`chapter-settings-${item.id}`, _('Edit chapter'), [
                          chapterSettingsForm(study, item, `chapter-settings-form-${item.id}`),
                          dialogActions(
                              `chapter-settings-form-${item.id}`,
                              _('Save chapter'),
                              study.chapters.length > 1
                                  ? deleteForm(
                                        `/study/${study.id}/${item.id}/delete`,
                                        _('Delete chapter'),
                                        _('Delete this chapter?'),
                                    )
                                  : undefined,
                          ),
                      ]),
                  ),
                  dialog('study-new-chapter', _('Add a new chapter'), [
                      h(
                          'form.study-side__new-chapter',
                          { attrs: { method: 'post', action: `/study/${study.id}/chapter` } },
                          [
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
                          ],
                      ),
                  ]),
              ]
            : []),
        ...(study.isOwner && Object.keys(study.members).length < study.maxMembers ? [studyInviteDialog(study)] : []),
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

function studyShareLinks(study: StudyPageModel, model: PyChessModel): VNode {
    const studyUrl = `${model.home}/study/${study.id}`;
    const chapterUrl = `${model.home}/study/${study.id}/${study.chapter.id}`;
    const embedUrl = `${model.home}/study/embed/${study.id}/${study.chapter.id}`;
    const embedCode = `<iframe width="600" height="371" src="${embedUrl}" frameborder="0"></iframe>`;
    const shareLink = (label: string, value: string, options: { disabled?: boolean; copyLabel?: string } = {}) =>
        h('label.study-share__link', [
            h('span', label),
            h('span.study-share__copy', [
                h('input', {
                    attrs: {
                        type: 'text',
                        value,
                        readonly: true,
                        ...(options.disabled ? { disabled: true } : {}),
                    },
                }),
                h(
                    'button.button.button-empty',
                    {
                        attrs: {
                            type: 'button',
                            title: options.copyLabel ?? _('Copy link'),
                            'aria-label': options.copyLabel ?? _('Copy link'),
                            ...(options.disabled ? { disabled: true } : {}),
                        },
                        on: { click: () => copyTextToClipboard(value) },
                    },
                    [icon('clipboard')],
                ),
            ]),
        ]);

    return h('div.study-share__links', [
        shareLink(_('Study link'), studyUrl),
        shareLink(_('Current chapter link'), chapterUrl),
        shareLink(
            _('Embed this chapter'),
            study.visibility === 'private' ? _('Private Studies cannot be embedded.') : embedCode,
            {
                disabled: study.visibility === 'private',
                copyLabel: _('Copy embed code'),
            },
        ),
        ...(study.visibility === 'private'
            ? [h('p.study-share__private', _('This Study is private. Only authorized members can open these links.'))]
            : []),
    ]);
}

export function updateStudyUnderboardChapter(study: StudyPageModel, model: PyChessModel): void {
    const title = document.querySelector<HTMLElement>('.study-underboard__title');
    if (title) patch(toVNode(title), studyMetadataTitle(study));

    const shareLinks = document.querySelector<HTMLElement>('.study-share__links');
    if (shareLinks) patch(toVNode(shareLinks), studyShareLinks(study, model));
}

function studyUnderboard(study: StudyPageModel, model: PyChessModel, modeActions: StudyModeActions): VNode {
    const tabs: [StudyTab, string, VNode | string][] = [
        ['tags', _('PGN tags'), h('i.study-tag-icon', { attrs: { 'aria-hidden': 'true' } })],
        ...(study.canWrite
            ? ([
                  ['comments', _('Comment this position'), icon('comment-o')],
                  ['glyphs', _('Annotate with glyphs'), '!?'],
              ] as [StudyTab, string, VNode | string][])
            : []),
        ['description', _('Chapter description'), icon('book')],
        ['export', _('Share & export'), icon('download')],
    ];
    return h('div.study-underboard', [
        h('nav.study-tool-tabs', { attrs: { role: 'tablist', 'aria-label': _('Study tools') } }, [
            ...studyModeButtons(study, modeActions),
            ...tabs.map(([tab, label, symbol]) =>
                h(
                    `button#study-tab-${tab}`,
                    {
                        attrs: {
                            type: 'button',
                            role: 'tab',
                            title: label,
                            'aria-label': label,
                            'aria-controls': `study-panel-${tab}`,
                            'aria-selected': tab === 'tags' ? 'true' : 'false',
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
        ]),
        toolPanel('tags', [
            studyMetadataTitle(study),
            studyTopicsView(study),
            h('table.study-tags'),
            ...(study.canWrite
                ? [
                      h('details.study-annotations__tags', [
                          h('summary', _('Edit PGN tags')),
                          h('textarea', {
                              attrs: {
                                  rows: '6',
                                  'aria-label': _('PGN tags'),
                                  placeholder: 'Event=\nSite=\nDate=',
                              },
                          }),
                          h('button.button', { attrs: { type: 'button' } }, _('Save tags')),
                      ]),
                  ]
                : []),
        ]),
        ...(study.canWrite
            ? [
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
              ]
            : []),
        toolPanel('description', [
            study.canWrite
                ? h('div.study-annotations__description', [
                      h('label', { attrs: { for: 'study-description' } }, _('Chapter description')),
                      h('textarea#study-description', { attrs: { maxlength: '10000', rows: '5' } }),
                      h('button.button', { attrs: { type: 'button' } }, _('Save description')),
                  ])
                : h('p.study-description__readonly', study.chapter.description || _('No chapter description.')),
        ]),
        toolPanel('export', [
            studyShareLinks(study, model),
            h('div.study-export__actions', [
                ...(study.canClone
                    ? [
                          h(
                              'form.study-share__clone',
                              { attrs: { method: 'post', action: `/study/${study.id}/clone` } },
                              [h('button.button', { attrs: { type: 'submit' } }, _('Clone study'))],
                          ),
                      ]
                    : []),
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

function updateAnnotationPanel(state: StudyAnnotationState, editor?: StudyCommentEditor): void {
    editor?.update(state.path, state.annotations.comments);
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
    const readonlyDescription = document.querySelector<HTMLElement>('.study-description__readonly');
    if (readonlyDescription) readonlyDescription.textContent = state.description || _('No chapter description.');
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

function runStudyGround(
    vnode: VNode,
    model: PyChessModel,
    study: StudyPageModel,
    sideVNode: VNode,
    modeActions: StudyModeActions,
): void {
    let extension!: StudyAnalysisExtension;
    let ctrl!: AnalysisController;
    let navigation: StudyChapterNavigation | undefined;
    const paths = new Map<string, string>();
    const modules = new Map<boolean, Promise<PyChessModel['ffish']>>([
        [model.variant === 'alice', Promise.resolve(model.ffish)],
    ]);
    const commentsElement = document.querySelector<HTMLElement>('.study-annotations__comments');
    const editor =
        study.canWrite && commentsElement
            ? new StudyCommentEditor(commentsElement, (path, id, text) => extension.setComment(id, text, path))
            : undefined;
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
                onLocalPathChanged: path => {
                    if (!study.sticky) return;
                    if (study.canWrite && study.write) extension.sharePosition(study.chapter.id, path);
                    else {
                        study.sticky = false;
                        study.behind = Math.max(1, study.behind ?? 0);
                        refreshStudyModeButtons(study);
                    }
                },
                onSharedPositionChanged: (chapterId, path) => {
                    const changed = study.sharedChapter !== chapterId || study.sharedPath !== path;
                    study.sharedChapter = chapterId;
                    study.sharedPath = path;
                    if (!study.sticky) {
                        if (changed) study.behind = (study.behind ?? 0) + 1;
                        refreshStudyModeButtons(study);
                        return;
                    }
                    study.behind = 0;
                    refreshStudyModeButtons(study);
                    if (chapterId !== study.chapter.id) void navigation?.go(chapterId, 'replace');
                    else if (!extension.followSharedPath(path)) window.location.reload();
                },
                onMembersChanged: members => {
                    const previousCanWrite = study.canWrite;
                    study.members = { ...members };
                    if (study.memberConfig && !members[study.memberConfig]) study.memberConfig = undefined;
                    study.canWrite = model.username ? members[model.username] === 'write' : false;
                    if (!study.canWrite) study.write = false;
                    sideVNode = patch(sideVNode, studySide(study, model));
                    refreshStudyModeButtons(study);
                    if (study.canWrite !== previousCanWrite) window.location.reload();
                },
                onLikesChanged: likes => {
                    study.likes = likes;
                    updateStudyLikeControl(study);
                },
                onTopicsChanged: topics => {
                    study.topics = [...topics];
                    updateStudyTopicsView(study);
                },
                contextMenuActions: study.canWrite ? path => studyContextMenu(analysisCtrl, path) : undefined,
                writable: study.canWrite,
                recording: study.canWrite && Boolean(study.write),
            });
            return extension;
        });
        if (socket.ws.readyState === WebSocket.OPEN) extension.onSocketOpen();
        updateAnnotationPanel(extension.annotationState, editor);
        window['onFSFline'] = ctrl.onFSFline;
    };
    mount(vnode.elm as HTMLElement);
    if (study.canWrite) bindAnnotationPanel(() => extension);
    bindExportPanel(() => extension, study);

    navigation = new StudyChapterNavigation({
        studyId: study.id,
        currentChapter: () => study.chapter.id,
        flush: () => {
            editor?.flush();
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
            editor?.reset();
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
            updateStudyUnderboardChapter(study, model);
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
            refreshStudyModeButtons(study);
            mount(app.querySelector<HTMLElement>('#mainboard > .cg-wrap')!);
            if (study.sticky && study.chapter.id === study.sharedChapter) {
                if (!extension.followSharedPath(study.sharedPath)) window.location.reload();
            } else {
                const path = paths.get(study.chapter.id);
                if (path && ctrl.getTreeNodeAtPath(path)) ctrl.activateTreePath(path);
            }
            notifyChessgroundResize();
            if (window.fsf) {
                ctrl.loadVariantsIntoFsfEngine();
            }
        },
    });

    const followAuthoritativePosition = (): void => {
        study.behind = 0;
        refreshStudyModeButtons(study);
        if (study.sharedChapter !== study.chapter.id) void navigation?.go(study.sharedChapter, 'replace');
        else void navigation?.reload();
    };
    modeActions.toggleSticky = () => {
        study.sticky = !study.sticky;
        if (study.sticky) followAuthoritativePosition();
        else refreshStudyModeButtons(study);
    };
    modeActions.toggleWrite = () => {
        if (!study.canWrite) return;
        study.write = !study.write;
        localStorage.setItem(studyRecordingKey(study.id), String(study.write));
        extension.setRecording(Boolean(study.write));
        refreshStudyModeButtons(study);
        void navigation?.reload();
    };

    if (study.sticky && study.chapter.id === study.sharedChapter && study.sharedPath) {
        if (!extension.followSharedPath(study.sharedPath)) window.location.reload();
    }

    document.querySelector('.sidebar-first')!.addEventListener('click', event => {
        const mouse = event as MouseEvent;
        const link = (event.target as Element).closest<HTMLAnchorElement>('.study-chapters a');
        if (!link || mouse.button !== 0 || mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.altKey) return;
        event.preventDefault();
        const chapterId = new URL(link.href).pathname.split('/').pop()!;
        if (study.sticky) {
            if (study.canWrite && study.write && extension.sharePosition(chapterId, '')) return;
            study.sticky = false;
            study.behind = Math.max(1, study.behind ?? 0);
            refreshStudyModeButtons(study);
        }
        void navigation?.go(chapterId);
    });
    window.addEventListener('popstate', () => {
        const [prefix, studyId, chapterId] = window.location.pathname.split('/').filter(Boolean);
        if (prefix === 'study' && studyId === study.id && chapterId) {
            if (chapterId !== study.sharedChapter) {
                study.sticky = false;
                refreshStudyModeButtons(study);
            }
            void navigation?.go(chapterId, 'pop');
        }
    });
    window.addEventListener('beforeunload', event => {
        editor?.flush();
        if (extension.pendingCount > 0) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

function runStudyEmbedGround(vnode: VNode, model: PyChessModel, study: StudyPageModel): void {
    const ctrl = new AnalysisController(
        vnode.elm as HTMLElement,
        model,
        analysisCtrl =>
            new StudyAnalysisExtension(analysisCtrl, {
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
                writable: false,
            }),
    );
    window['onFSFline'] = ctrl.onFSFline;
}

export function studyEmbedView(model: PyChessModel): VNode[] {
    const study = model.study;
    if (!study) return [h('div.box.box-pad', _('Study data is unavailable.'))];

    return renderEmbedPage(
        model,
        vnode => runStudyEmbedGround(vnode, model, study),
        h(
            'a.gamelink',
            {
                attrs: {
                    rel: 'noopener',
                    target: '_blank',
                    href: `/study/${study.id}/${study.chapter.id}`,
                },
            },
            `${study.name} • ${study.chapter.name}`,
        ),
    );
}

export function studyView(model: PyChessModel): VNode[] {
    const study = model.study;
    if (!study) return [h('div.box.box-pad', _('Study data is unavailable.'))];

    initializeStudyModes(study);
    const modeActions: StudyModeActions = { toggleSticky: () => {}, toggleWrite: () => {} };
    const side = studySide(study, model);
    const page = renderAnalysisPage(model, {
        side,
        underboard: studyUnderboard(study, model, modeActions),
        mountBoard: vnode => runStudyGround(vnode, model, study, side, modeActions),
        ongoing: false,
    });
    page[0].data = { ...page[0].data, class: { 'study-app': true } };
    return page;
}
