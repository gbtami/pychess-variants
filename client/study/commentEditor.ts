import { _ } from '../i18n';
import type { AnalysisComment } from '../analysis/analysisTree';
import { newStudyNodeId } from './studyTree';

// Each existing comment keeps its identity (including imported comments). An
// ordinary position has one textarea; clearing its text deletes the comment.
export class StudyCommentEditor {
    private path?: string;
    private timer?: ReturnType<typeof setTimeout>;
    private readonly pending = new Map<string, { path: string; id: string; text: string }>();

    constructor(
        private readonly root: HTMLElement,
        private readonly save: (path: string, id: string, text: string) => void,
    ) {}

    update(path: string, comments: AnalysisComment[]): void {
        if (path !== this.path) {
            this.flush();
            this.root.replaceChildren();
            this.path = path;
        }
        const existing = new Map(
            [...this.root.querySelectorAll<HTMLTextAreaElement>('textarea')].map(input => [
                input.dataset.commentId!,
                input,
            ]),
        );
        const entries = comments.length
            ? comments
            : [{ id: existing.keys().next().value ?? newStudyNodeId(), author: '', text: '' }];
        for (const [index, comment] of entries.entries()) {
            let input = existing.get(comment.id);
            if (!input) {
                input = document.createElement('textarea');
                input.className = 'study-annotations__comment-input';
                input.dataset.commentId = comment.id;
                input.maxLength = 4000;
                input.rows = 3;
                input.placeholder = _('Add a comment');
                input.setAttribute('aria-label', index ? _('Study comment %1', index + 1) : _('Study comment'));
                const field = input;
                const schedule = () => {
                    this.pending.set(`${path}/${comment.id}`, { path, id: comment.id, text: field.value });
                    clearTimeout(this.timer);
                    this.timer = setTimeout(() => this.flush(), 500);
                };
                input.addEventListener('input', event => {
                    if (!(event as InputEvent).isComposing) schedule();
                });
                input.addEventListener('compositionend', schedule);
                this.root.append(input);
            }
            if (document.activeElement !== input && !this.pending.has(`${path}/${comment.id}`))
                input.value = comment.text;
        }
        for (const [id, input] of existing) if (!entries.some(comment => comment.id === id)) input.remove();
    }

    flush(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
        const changes = [...this.pending.values()];
        this.pending.clear();
        for (const change of changes) this.save(change.path, change.id, change.text);
    }
}
