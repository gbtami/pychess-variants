import type * as cg from 'chessgroundx/types';
import type { DrawShape } from 'chessgroundx/draw';
import * as util from 'chessgroundx/util';

import type { AnalysisController } from '../analysis/analysisCtrl';
import type {
    AnalysisMoveApplication,
    AnalysisNavigationOrigin,
    AnalysisPositionChange,
} from '../analysis/analysisExtension';
import type { AnalysisTreeNode } from '../analysis/analysisTree';
import { uci2cg } from '../chess';
import { _ } from '../i18n';
import { StudyGamebookPlayController, type StudyGamebookPlayState } from './studyGamebookPlay';

export interface StudyGamebookPlaybackOptions {
    chapterId: string;
    orientation: 'white' | 'black';
    preview: boolean;
    canAnalyse: boolean;
    hasNextChapter: boolean;
    onNextChapter?(): void;
    onReturnToEditor?(): void;
    onAnalyse?(): void;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
    const element = target instanceof HTMLElement ? target : null;
    return Boolean(element?.closest('button, input, textarea, select, a, [contenteditable="true"], [role="button"]'));
}

function boardKey(ctrl: AnalysisController, value: string): cg.Key | undefined {
    if (value.length !== 2) return undefined;
    const key = value as cg.Key;
    const [file, rank] = util.key2pos(key);
    const dimensions = ctrl.chessground.state.dimensions;
    if (file < 0 || rank < 0 || file >= dimensions.width || rank >= dimensions.height) return undefined;
    return key;
}

/**
 * Runtime adapter between the pure gamebook state machine and the shared analysis host.
 * The authored tree remains the frozen lesson script; learner attempts are disposable local nodes.
 */
export class StudyGamebookPlayback {
    private readonly controller: StudyGamebookPlayController;
    private readonly panel: HTMLElement;
    private readonly status: HTMLElement;
    private readonly playButtons?: HTMLElement;
    private applyingScriptedMove = false;
    private destroyed = false;
    private scriptReloadPending = false;
    private playbackState?: StudyGamebookPlayState;

    constructor(
        private readonly ctrl: AnalysisController,
        private readonly options: StudyGamebookPlaybackOptions,
    ) {
        const tree = this.ctrl.analysisTree;
        if (!tree) throw new Error('Interactive lesson requires an analysis tree.');
        const tools = document.querySelector<HTMLElement>('.analysis-tools');
        if (!tools) throw new Error('Interactive lesson requires the analysis tools panel.');

        this.panel = document.createElement('section');
        this.panel.className = 'study-gamebook-play';
        this.panel.setAttribute('aria-label', _('Interactive lesson'));
        this.panel.setAttribute('role', 'region');
        this.status = document.createElement('div');
        this.status.className = 'study-gamebook-play__status';
        this.status.setAttribute('aria-live', 'polite');
        this.status.setAttribute('aria-atomic', 'true');
        this.status.setAttribute('aria-busy', 'false');
        this.panel.append(this.status);
        tools.append(this.panel);

        this.playButtons = document.querySelector<HTMLElement>('.study-gamebook-play-buttons') ?? undefined;
        if (this.playButtons) this.playButtons.hidden = false;

        // A queued premove could otherwise become a second learner move immediately
        // after an authored reply. D2 deliberately disables premoves for playback.
        this.ctrl.chessground.cancelPremove();
        this.ctrl.chessground.set({ premovable: { enabled: false } });
        document.addEventListener('keydown', this.onKeyDown, true);

        this.controller = new StudyGamebookPlayController({
            chapterId: options.chapterId,
            tree,
            orientation: options.orientation,
            actions: {
                playScriptedMove: move => this.playScriptedMove(move),
                goToPath: path => this.ctrl.activateTreePath(path, true, 'reset'),
                stateChanged: state => this.onStateChanged(state),
                ...(options.onNextChapter ? { nextChapter: options.onNextChapter } : {}),
            },
        });
        this.onStateChanged(this.controller.state);
        this.restoreAuthoredShapes();
    }

    beforeMoveApplied(move: AnalysisMoveApplication): boolean {
        if (this.destroyed || this.scriptReloadPending) return false;
        if (move.origin === 'automated-reply') return this.applyingScriptedMove;
        return (
            move.origin === 'played-move' &&
            this.playbackState?.kind === 'prompt' &&
            this.ctrl.turnColor === this.options.orientation
        );
    }

    canActivatePath(_path: string, origin: AnalysisNavigationOrigin): boolean {
        if (this.scriptReloadPending) return origin === 'reset';
        return origin === 'played-move' || origin === 'automated-reply' || origin === 'reset';
    }

    onPositionChanged(change: AnalysisPositionChange): void {
        if (this.destroyed) return;
        if (change.origin === 'played-move') {
            const move = change.node?.step.move;
            if (move) this.controller.gradeLearnerMove(move);
        }
        // AnalysisController applies the new FEN before this callback. Chessground can
        // clear manual drawings during that board update, so gamebook playback must
        // restore the authored drawings for the active lesson position. The ordinary
        // Study extension deliberately skips its own restoration while playback owns
        // the board annotations.
        this.restoreAuthoredShapes();
        this.syncBoardInput();
        this.renderPlayButtons(this.controller.state);
    }

    boardInput(turnColor: 'white' | 'black'): 'white' | 'black' | false {
        if (this.scriptReloadPending) return false;
        return this.playbackState?.kind === 'prompt' && turnColor === this.options.orientation
            ? this.options.orientation
            : false;
    }

    isTreeNodeVisible(node: AnalysisTreeNode): boolean {
        const path = this.ctrl.analysisPath ?? '';
        return node.path === path || path.startsWith(node.path ? `${node.path}.` : '');
    }

    areTreeNodeAnnotationsVisible(): boolean {
        // Comments/hints are deliberately rendered by the lesson panel so future
        // authored annotations cannot leak through the ordinary move tree.
        return false;
    }

    allowTreeContextMenu(): boolean {
        return false;
    }

    suspendForScriptReload(): void {
        if (this.destroyed || this.scriptReloadPending) return;
        this.scriptReloadPending = true;
        this.controller.destroy();
        this.clearSolutionShapes();
        this.syncBoardInput();
        this.status.replaceChildren();
        this.renderPlayButtons();

        const floor = document.createElement('div');
        floor.className = 'study-gamebook-play__floor';
        const feedback = document.createElement('div');
        feedback.className = 'study-gamebook-play__feedback info';
        const instruction = document.createElement('div');
        instruction.className = 'study-gamebook-play__instruction';
        const heading = document.createElement('strong');
        heading.className = 'study-gamebook-play__title';
        heading.textContent = _('Lesson updated');
        const message = document.createElement('em');
        message.className = 'study-gamebook-play__message';
        message.textContent = _('Reloading the latest lesson…');
        instruction.append(heading, message);
        feedback.append(instruction);
        floor.append(feedback, this.mascot());
        this.status.append(floor);
    }

    onShapesChanged(): void {
        // Learner drawing changes are local noise during playback. Always restore
        // authored drawings; solution hints live in autoShapes and never replace them.
        this.restoreAuthoredShapes();
    }

    private restoreAuthoredShapes(): void {
        const node = this.ctrl.analysisTree && this.ctrl.getTreeNodeAtPath(this.ctrl.analysisPath ?? '');
        this.ctrl.chessground.setShapes(node?.annotations?.shapes ?? []);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.controller.destroy();
        document.removeEventListener('keydown', this.onKeyDown, true);
        this.clearSolutionShapes();
        if (this.playButtons) {
            this.playButtons.replaceChildren();
            this.playButtons.hidden = true;
        }
        this.panel.remove();
    }

    private playScriptedMove(move: string): boolean {
        if (this.applyingScriptedMove || this.destroyed) return false;
        this.applyingScriptedMove = true;
        try {
            return this.ctrl.applyAnalysisMove(move, 'automated-reply');
        } finally {
            this.applyingScriptedMove = false;
        }
    }

    private onStateChanged(state: StudyGamebookPlayState): void {
        if (this.destroyed) return;
        this.playbackState = state;
        this.render(state);
        this.renderPlayButtons(state);
        this.syncBoardInput();
        this.syncSolutionShapes(state);
    }

    private syncBoardInput(): void {
        const color = this.boardInput(this.ctrl.turnColor);
        this.ctrl.chessground.cancelPremove();
        this.ctrl.chessground.set({
            movable: { color: color === false ? undefined : color },
            premovable: { enabled: false },
        });
    }

    private syncSolutionShapes(state: StudyGamebookPlayState): void {
        if (state.kind !== 'prompt' || !state.solutionVisible) {
            this.clearSolutionShapes();
            return;
        }
        const shapes = this.solutionShapes(state.solutionMove);
        this.ctrl.autoShapes = shapes.length ? [shapes] : [];
        this.ctrl.chessground.setAutoShapes(shapes);
    }

    private solutionShapes(move: string): DrawShape[] {
        let converted = uci2cg(move);
        if (converted.startsWith('+')) converted = converted.slice(1);
        const at = converted.indexOf('@');
        if (at >= 0) {
            const dest = boardKey(this.ctrl, converted.slice(at + 1, at + 3));
            return dest ? [{ orig: dest, brush: 'paleGreen' }] : [];
        }

        const primary = converted.split(',', 1)[0];
        const orig = boardKey(this.ctrl, primary.slice(0, 2));
        const dest = boardKey(this.ctrl, primary.slice(2, 4));
        if (!orig || !dest) return [];
        const shapes: DrawShape[] = [
            { orig, dest, brush: 'paleGreen', piece: undefined, modifiers: { lineWidth: 14 } },
        ];
        if (converted.includes(',')) {
            const placement = boardKey(this.ctrl, converted.slice(-2));
            if (placement) shapes.push({ orig: placement, brush: 'paleGreen' });
        }
        return shapes;
    }

    private clearSolutionShapes(): void {
        this.ctrl.autoShapes = [];
        this.ctrl.chessground.setAutoShapes([]);
    }

    private actionIcon(name: string): HTMLElement {
        const icon = document.createElement('i');
        icon.className = `icon-${name}`;
        icon.setAttribute('aria-hidden', 'true');
        return icon;
    }

    private actionButton(label: string, action: () => void, className: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.addEventListener('click', event => {
            const restoreKeyboardFocus = event.detail === 0 || document.activeElement === button;
            action();
            if (restoreKeyboardFocus && !this.destroyed && !this.panel.contains(document.activeElement)) {
                this.panel.querySelector<HTMLButtonElement>('button')?.focus();
            }
        });
        return button;
    }

    private comment(state: StudyGamebookPlayState): HTMLElement | undefined {
        const content = state.comment ?? (state.kind === 'prompt' ? _('What would you play?') : undefined);
        if (!content && state.kind !== 'complete') return undefined;

        const comment = document.createElement('div');
        comment.className = 'study-gamebook-play__comment';
        const text = document.createElement('div');
        text.className = 'study-gamebook-play__comment-content';
        text.textContent = content ?? _('You completed this lesson.');
        comment.append(text);

        if (state.kind === 'prompt' && state.hint) {
            if (state.hintVisible) comment.classList.add('hinted');
            const hint = this.actionButton(
                state.hintVisible ? state.hint : _('Get a hint'),
                () => this.controller.toggleHint(),
                `study-gamebook-play__hint${state.hintVisible ? ' shown' : ''}`,
            );
            hint.setAttribute('aria-label', state.hintVisible ? _('Hide hint') : _('Get a hint'));
            comment.append(hint);
        }
        return comment;
    }

    private turnPiece(): HTMLElement {
        const mark = document.createElement('div');
        mark.className = 'study-gamebook-play__mark';
        const piece = document.createElement('piece');
        piece.classList.add(this.ctrl.variant.kingRoles[0] ?? 'k-piece', this.ctrl.turnColor);
        piece.setAttribute('aria-hidden', 'true');
        mark.append(piece);
        return mark;
    }

    private mascot(): HTMLImageElement {
        const mascot = document.createElement('img');
        mascot.className = 'study-gamebook-play__mascot';
        mascot.width = 120;
        mascot.height = 120;
        mascot.src = '/static/images/study/octopus.svg';
        mascot.alt = '';
        mascot.setAttribute('aria-hidden', 'true');
        return mascot;
    }

    private turnColorLabel(): string {
        return _(this.ctrl.turnColor === 'white' ? this.ctrl.variant.colors.first : this.ctrl.variant.colors.second);
    }

    private feedback(state: StudyGamebookPlayState): HTMLElement {
        if (state.kind === 'wrong-feedback') {
            const retry = this.actionButton(
                _('Retry'),
                () => this.controller.retry(),
                'study-gamebook-play__feedback act bad',
            );
            const icon = this.actionIcon('refresh');
            icon.classList.add('study-gamebook-play__feedback-icon');
            retry.prepend(icon);
            return retry;
        }

        if (state.kind === 'correct-feedback' || (state.kind === 'opponent-wait' && state.waitingForContinue)) {
            const next = this.actionButton(
                _('Next'),
                () => this.controller.continue(),
                'study-gamebook-play__feedback act good',
            );
            const text = document.createElement('span');
            text.className = 'study-gamebook-play__feedback-text';
            text.append(this.actionIcon('play'), document.createTextNode(_('Next')));
            const key = document.createElement('kbd');
            key.textContent = 'space';
            next.replaceChildren(text, key);
            return next;
        }

        if (state.kind === 'complete') {
            const end = document.createElement('div');
            end.className = 'study-gamebook-play__feedback end';
            if (this.options.hasNextChapter) {
                const nextChapter = this.actionButton(
                    _('Next chapter'),
                    () => this.controller.nextChapter(),
                    'study-gamebook-play__end-action next',
                );
                nextChapter.prepend(this.actionIcon('play'));
                end.append(nextChapter);
            }
            const replay = this.actionButton(
                _('Play again'),
                () => this.controller.replay(),
                'study-gamebook-play__end-action retry',
            );
            replay.prepend(this.actionIcon('refresh'));
            end.append(replay);
            if (this.options.canAnalyse && this.options.onAnalyse) {
                const analysis = this.actionButton(
                    _('Analysis'),
                    this.options.onAnalyse,
                    'study-gamebook-play__end-action analyse',
                );
                analysis.prepend(this.actionIcon('microscope'));
                end.append(analysis);
            }
            return end;
        }

        const feedback = document.createElement('div');
        feedback.className = 'study-gamebook-play__feedback info';
        const instruction = document.createElement('div');
        instruction.className = 'study-gamebook-play__instruction';
        const heading = document.createElement('strong');
        heading.className = 'study-gamebook-play__title';
        const detail = document.createElement('em');
        detail.className = 'study-gamebook-play__message';

        if (state.kind === 'prompt') {
            feedback.classList.add('play');
            feedback.append(this.turnPiece());
            heading.textContent = _('Your turn');
            detail.textContent = _('Find the best move for %1.', this.turnColorLabel());
        } else if (state.kind === 'opponent-wait') {
            // Lichess keeps the transient authored reply visually quiet: after a
            // correct learner move it briefly shows "Good move", and an initial
            // opponent move advances without flashing a large status message.
            feedback.classList.add('good');
            if (state.path === '') feedback.classList.add('init');
            feedback.textContent = _('Good move');
            return feedback;
        } else {
            heading.textContent = _('Lesson unavailable');
            detail.textContent = _('This chapter does not contain a playable interactive lesson yet.');
        }

        instruction.append(heading, detail);
        feedback.append(instruction);
        return feedback;
    }

    private render(state: StudyGamebookPlayState): void {
        this.status.replaceChildren();
        this.status.setAttribute('aria-busy', String(state.kind === 'opponent-wait' && !state.waitingForContinue));

        const comment = this.comment(state);
        if (comment) this.status.append(comment);

        const floor = document.createElement('div');
        floor.className = 'study-gamebook-play__floor';
        floor.append(this.feedback(state), this.mascot());
        this.status.append(floor);
    }

    private renderPlayButtons(state?: StudyGamebookPlayState): void {
        if (!this.playButtons) return;
        this.playButtons.replaceChildren();
        this.playButtons.hidden = !state;
        if (!state) return;

        if ((this.ctrl.analysisPath ?? '') !== '') {
            const back = this.actionButton(
                _('Back'),
                () => this.controller.backToStart(),
                'study-gamebook-play-button back',
            );
            back.prepend(document.createTextNode('‹ '));
            this.playButtons.append(back);
        }
        if (state.kind === 'prompt') {
            const solution = this.actionButton(
                _('View the solution'),
                () => this.controller.viewSolution(),
                'study-gamebook-play-button solution',
            );
            solution.prepend(this.actionIcon('play'));
            this.playButtons.append(solution);
        }
        if (this.options.preview && this.options.onReturnToEditor) {
            const preview = this.actionButton(
                _('Preview'),
                this.options.onReturnToEditor,
                'study-gamebook-play-button preview active',
            );
            preview.prepend(document.createTextNode('◉ '));
            this.playButtons.append(preview);
        }
    }

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== ' ' || event.defaultPrevented || isInteractiveTarget(event.target)) return;
        const state = this.controller.state;
        let handled = false;
        if (state.kind === 'wrong-feedback') handled = this.controller.retry();
        else if (state.kind === 'correct-feedback' || (state.kind === 'opponent-wait' && state.waitingForContinue))
            handled = this.controller.continue();
        if (handled) event.preventDefault();
    };
}
