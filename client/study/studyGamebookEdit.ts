import { _ } from '../i18n';
import { getNodeList, nodeAtPath, parentPath, type AnalysisTree } from '../analysis/analysisTree';

export type StudyGamebookField = 'hint' | 'deviation';

export interface StudyGamebookEditState {
    tree: AnalysisTree;
    path: string;
    orientation: 'white' | 'black';
    preview: boolean;
}

export interface StudyGamebookEditActions {
    editComment: () => void;
    saveGamebook: (field: StudyGamebookField, value: string, path: string) => void;
    togglePreview: () => void;
}

function button(label: string, onClick: () => void, className = 'button button-empty'): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
}

function paragraph(text: string, className = ''): HTMLParagraphElement {
    const el = document.createElement('p');
    if (className) el.className = className;
    el.textContent = text;
    return el;
}

export function gamebookPathIsMainline(tree: AnalysisTree, path: string): boolean {
    const nodes = getNodeList(tree, path);
    return nodes.every((node, index) => index === 0 || nodes[index - 1].children[0] === node);
}

function preferredMainlineLength(tree: AnalysisTree): number {
    let length = 0;
    let node = tree.root;
    while (node.children[0]) {
        node = node.children[0];
        length += 1;
    }
    return length;
}

function preferredMainlineEnd(tree: AnalysisTree) {
    let node = tree.root;
    while (node.children[0]) node = node.children[0];
    return node;
}

/**
 * Small authoring helper adapted from lila's gamebook editor. Ordinary comments
 * stay in the existing synchronized Study comment editor; this panel explains
 * where lesson text belongs and offers direct shortcuts to that editor.
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

        const header = document.createElement('div');
        header.className = 'study-gamebook-edit__header';
        header.append(paragraph(_('Interactive lesson script'), 'study-gamebook-edit__title'));
        const shortcuts = document.createElement('span');
        shortcuts.className = 'study-gamebook-edit__keys';
        shortcuts.setAttribute('aria-label', _('Keyboard: left and right arrows review the lesson line'));
        const left = document.createElement('kbd');
        left.textContent = '←';
        const right = document.createElement('kbd');
        right.textContent = '→';
        shortcuts.append(left, right, document.createTextNode(` ${_('review line')}`));
        header.append(shortcuts);
        this.root.append(header);

        const mainlineLength = preferredMainlineLength(state.tree);
        const end = preferredMainlineEnd(state.tree);
        if (!mainlineLength) {
            this.root.append(
                paragraph(_('This lesson has no moves yet. Add the expected line on the board.'), 'study-gamebook-edit__warning'),
            );
        } else if (end.step.turnColor === state.orientation) {
            this.root.append(
                paragraph(
                    _('This lesson ends after an opponent move. Add the learner reply, or keep the short lesson intentionally.'),
                    'study-gamebook-edit__warning',
                ),
            );
        }

        if (state.preview) {
            this.root.append(
                paragraph(_('Preview starts a local attempt from the chapter root. Preview moves are not saved.')),
                button(_('Return to lesson editor'), this.actions.togglePreview),
            );
            return;
        }

        const node = nodeAtPath(state.tree, state.path);
        if (!node) return;
        const onMainline = gamebookPathIsMainline(state.tree, state.path);
        const learnerTurn = node.step.turnColor === state.orientation;
        const comment = button(_('Edit position comment'), this.actions.editComment, 'button button-empty study-gamebook-edit__comment');

        if (!onMainline) {
            this.root.append(
                paragraph(_('This is a wrong-answer variation. Explain why this specific move is wrong in the ordinary comment.')),
                comment,
                paragraph(_('Promote the move to the main line if it should be the expected answer.')),
                button(_('Preview'), this.actions.togglePreview, 'button button-empty study-gamebook-edit__preview'),
            );
            return;
        }

        if (!state.path && !learnerTurn) {
            this.root.append(
                paragraph(_('Introduce the lesson in the root comment, then put the opponent\'s first scripted move on the board.')),
                comment,
            );
        } else if (learnerTurn) {
            this.root.append(
                paragraph(
                    state.path
                        ? _('Explain the opponent move and help the learner find the next expected move with the ordinary comment.')
                        : _('Help the learner find the initial move with the ordinary comment.'),
                ),
                comment,
                this.textarea('hint', state.path, node.gamebook?.hint ?? '', _('Optional hint'), _('Give a tip that helps find the expected move')),
            );
            if (!node.children[0])
                this.root.append(
                    paragraph(_('No expected learner continuation is authored from this position yet.'), 'study-gamebook-edit__warning'),
                );
        } else {
            this.root.append(
                paragraph(
                    _('The learner just played the expected move. Use the ordinary comment for correct feedback before the scripted opponent reply.'),
                ),
                comment,
                this.textarea(
                    'deviation',
                    state.path,
                    node.gamebook?.deviation ?? '',
                    _('Fallback wrong-answer explanation'),
                    _('Explain why any other move from the previous learner position is wrong'),
                ),
            );
            const parent = nodeAtPath(state.tree, parentPath(state.path));
            this.root.append(
                paragraph(
                    parent && parent.children.length > 1
                        ? _('Use ordinary comments on variations from the previous position for move-specific wrong-answer explanations.')
                        : _('Add variations from the previous position for move-specific wrong-answer explanations.'),
                ),
            );
            if (!node.children[0])
                this.root.append(
                    paragraph(
                        _('No scripted opponent continuation is authored from this position yet. End the lesson here only if that is intentional.'),
                        'study-gamebook-edit__warning',
                    ),
                );
        }

        this.root.append(button(_('Preview'), this.actions.togglePreview, 'button button-empty study-gamebook-edit__preview'));
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
        label: string,
        placeholder: string,
    ): HTMLElement {
        const wrapper = document.createElement('label');
        wrapper.className = `study-gamebook-edit__field study-gamebook-edit__field--${field}`;
        const title = document.createElement('span');
        title.textContent = label;
        const input = document.createElement('textarea');
        input.rows = 3;
        input.maxLength = 4000;
        input.value = value;
        input.placeholder = placeholder;
        input.setAttribute('aria-label', label);
        const schedule = () => {
            this.pending = { field, value: input.value, path };
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.flush(), 500);
        };
        input.addEventListener('input', event => {
            if (!(event as InputEvent).isComposing) schedule();
        });
        input.addEventListener('compositionend', schedule);
        wrapper.append(title, input);
        return wrapper;
    }
}
