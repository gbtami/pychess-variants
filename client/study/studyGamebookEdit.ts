import { _ } from '../i18n';
import { nodeAtPath, parentPath, type AnalysisTree, type AnalysisTreeNode } from '../analysis/analysisTree';
import { gamebookPathIsMainline } from './studyGamebook';

export type StudyGamebookField = 'hint' | 'deviation';

export interface StudyGamebookEditState {
    tree: AnalysisTree;
    path: string;
    orientation: 'white' | 'black';
}

export interface StudyGamebookEditActions {
    editComment: () => void;
    navigateToParent: (path: string) => void;
    saveGamebook: (field: StudyGamebookField, value: string, path: string) => void;
}

type LegendOptions = {
    icon?: 'comment-o' | 'info' | 'play';
    todo?: boolean;
    done?: boolean;
    onClick?: () => void;
};

function nodeHasComment(node: AnalysisTreeNode): boolean {
    return (node.annotations?.comments ?? []).some(comment => comment.text.trim().length > 2);
}

function legend(text: string, options: LegendOptions = {}): HTMLElement {
    const clickable = Boolean(options.onClick);
    const el = document.createElement(clickable ? 'button' : 'div');
    if (clickable) (el as HTMLButtonElement).type = 'button';
    el.className = 'study-gamebook-edit__legend';
    if (options.todo) el.classList.add('todo');
    if (options.done) el.classList.add('done');
    if (clickable) {
        el.classList.add('clickable');
        el.addEventListener('click', options.onClick!);
    }
    if (options.icon) {
        const icon = document.createElement('i');
        icon.className = `icon icon-${options.icon} study-gamebook-edit__legend-icon`;
        icon.setAttribute('aria-hidden', 'true');
        el.append(icon);
    }
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    el.append(paragraph);
    return el;
}

/**
 * Interactive-lesson authoring helper adapted from lila's gamebook editor.
 * The authored move tree stays in the ordinary analysis movelist while this
 * contextual panel explains which comments, variations, hints and fallback
 * messages belong to the currently selected position.
 */
export class StudyGamebookEditor {
    private timer?: ReturnType<typeof setTimeout>;
    private pending?: { field: StudyGamebookField; value: string; path: string };
    private lastPath?: string;

    constructor(
        private readonly root: HTMLElement,
        private readonly actions: StudyGamebookEditActions,
    ) {}

    update(state: StudyGamebookEditState): void {
        if (this.lastPath !== state.path) this.flush();
        this.lastPath = state.path;
        this.root.replaceChildren();

        const node = nodeAtPath(state.tree, state.path);
        if (!node) return;

        const learnerTurn = node.step.turnColor === state.orientation;
        const onMainline = gamebookPathIsMainline(state.tree, state.path);
        const commentDone = nodeHasComment(node);
        const commentLegend = (text: string, todo = false) =>
            legend(text, {
                icon: 'comment-o',
                todo,
                done: todo && commentDone,
                onClick: this.actions.editComment,
            });

        if (!state.path) {
            if (learnerTurn) {
                this.root.append(
                    commentLegend(_('Help the player find the initial move, with a comment.'), true),
                    this.textarea(
                        'hint',
                        state.path,
                        node.gamebook?.hint ?? '',
                        _('Optional, on-demand hint for the player:'),
                        _('Give the player a tip so they can find the right move'),
                        'info',
                    ),
                );
            } else {
                this.root.append(
                    commentLegend(_('Introduce the interactive lesson with a comment.')),
                    legend(_("Put the opponent's first move on the board."), {
                        icon: 'play',
                        todo: true,
                        done: Boolean(node.children[0]),
                    }),
                );
            }
            return;
        }

        if (!onMainline) {
            this.root.append(
                commentLegend(_('Explain why this move is wrong in a comment.'), true),
                legend(_('Or promote it as the main line if it is the right move.')),
            );
            return;
        }

        if (learnerTurn) {
            this.root.append(
                commentLegend(
                    _('Explain the opponent move, and help the player find the next move, with a comment.'),
                    true,
                ),
                this.textarea(
                    'hint',
                    state.path,
                    node.gamebook?.hint ?? '',
                    _('Optional, on-demand hint for the player:'),
                    _('Give the player a tip so they can find the right move'),
                    'info',
                ),
            );
            return;
        }

        const parent = nodeAtPath(state.tree, parentPath(state.path));
        const hasVariation = Boolean(parent && parent.children.length > 1);
        this.root.append(
            commentLegend(
                _(
                    "You may reflect on the player's correct move, with a comment; or leave empty to jump immediately to the next move.",
                ),
            ),
        );
        if (!hasVariation) {
            this.root.append(
                legend(_('Add variation moves to explain why specific other moves are wrong.'), {
                    icon: 'play',
                    onClick: () => this.actions.navigateToParent(state.path),
                }),
            );
        }
        this.root.append(
            this.textarea(
                'deviation',
                state.path,
                node.gamebook?.deviation ?? '',
                _('When any other wrong move is played:'),
                _('Explain why all other moves are wrong'),
                'comment-o',
                true,
            ),
        );
    }

    flush(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
        const pending = this.pending;
        this.pending = undefined;
        if (pending) this.actions.saveGamebook(pending.field, pending.value, pending.path);
    }

    reset(): void {
        this.flush();
        this.lastPath = undefined;
        this.root.replaceChildren();
    }

    private textarea(
        field: StudyGamebookField,
        path: string,
        value: string,
        legendText: string,
        placeholder: string,
        iconName: 'comment-o' | 'info',
        todo = false,
    ): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = `study-gamebook-edit__field study-gamebook-edit__field--${field}`;
        wrapper.append(
            legend(legendText, {
                icon: iconName,
                todo,
                done: todo && value.trim().length > 2,
            }),
        );
        const input = document.createElement('textarea');
        input.rows = 3;
        input.maxLength = 4000;
        input.value = value;
        input.placeholder = placeholder;
        input.setAttribute('aria-label', legendText);
        const schedule = () => {
            this.pending = { field, value: input.value, path };
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.flush(), 500);
        };
        input.addEventListener('input', event => {
            if (!(event as InputEvent).isComposing) schedule();
        });
        input.addEventListener('compositionend', schedule);
        wrapper.append(input);
        return wrapper;
    }
}
