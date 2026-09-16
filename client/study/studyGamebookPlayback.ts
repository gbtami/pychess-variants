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
        this.syncBoardInput();
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
        const heading = document.createElement('h2');
        heading.className = 'study-gamebook-play__title';
        heading.textContent = _('Lesson updated');
        const message = document.createElement('p');
        message.className = 'study-gamebook-play__message';
        message.textContent = _('Reloading the latest lesson…');
        this.status.append(heading, message);
    }

    onShapesChanged(): void {
        // Learner drawing changes are local noise during playback. Always restore
        // authored drawings; solution hints live in autoShapes and never replace them.
        const node = this.ctrl.analysisTree && this.ctrl.getTreeNodeAtPath(this.ctrl.analysisPath ?? '');
        this.ctrl.chessground.setShapes(node?.annotations?.shapes ?? []);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.controller.destroy();
        document.removeEventListener('keydown', this.onKeyDown, true);
        this.clearSolutionShapes();
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

    private render(state: StudyGamebookPlayState): void {
        this.status.replaceChildren();
        const heading = document.createElement('h2');
        heading.className = 'study-gamebook-play__title';
        const body = document.createElement('div');
        body.className = 'study-gamebook-play__body';
        const actions = document.createElement('div');
        actions.className = 'study-gamebook-play__actions';

        const addText = (text: string, className = 'study-gamebook-play__message') => {
            const paragraph = document.createElement('p');
            paragraph.className = className;
            paragraph.textContent = text;
            body.append(paragraph);
        };
        const addButton = (label: string, action: () => void, className = '') => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `button${className ? ` ${className}` : ''}`;
            button.textContent = label;
            button.addEventListener('click', event => {
                const restoreKeyboardFocus = event.detail === 0 || document.activeElement === button;
                action();
                if (
                    restoreKeyboardFocus &&
                    !this.destroyed &&
                    !this.panel.contains(document.activeElement)
                )
                    this.status.querySelector<HTMLButtonElement>('.study-gamebook-play__actions .button')?.focus();
            });
            actions.append(button);
        };

        this.status.setAttribute(
            'aria-busy',
            String(state.kind === 'opponent-wait' && !state.waitingForContinue),
        );

        if (state.kind === 'prompt') {
            heading.textContent = _('Your turn');
            if (state.comment) addText(state.comment);
            else addText(_('Find the best move.'));
            if (state.hintVisible && state.hint) addText(state.hint, 'study-gamebook-play__hint');
            if (state.hint)
                addButton(state.hintVisible ? _('Hide hint') : _('Show hint'), () => this.controller.toggleHint());
            addButton(_('View the solution'), () => this.controller.viewSolution(), 'button-empty');
        } else if (state.kind === 'wrong-feedback') {
            heading.textContent = _('Try again');
            addText(state.comment ?? _('That is not the move. Try another move.'));
            addButton(_('Retry'), () => this.controller.retry());
        } else if (state.kind === 'correct-feedback') {
            heading.textContent = _('Good move');
            if (state.comment) addText(state.comment);
            addButton(_('Continue'), () => this.controller.continue());
        } else if (state.kind === 'opponent-wait') {
            heading.textContent = state.waitingForContinue ? _('Continue the lesson') : _('Opponent is moving…');
            if (state.comment) addText(state.comment);
            if (state.waitingForContinue) addButton(_('Continue'), () => this.controller.continue());
        } else if (state.kind === 'complete') {
            heading.textContent = _('Lesson complete');
            if (state.comment) addText(state.comment);
            addButton(_('Replay'), () => this.controller.replay(), 'button-empty');
            if (this.options.hasNextChapter) addButton(_('Next chapter'), () => this.controller.nextChapter());
            if (this.options.canAnalyse && this.options.onAnalyse)
                addButton(_('Analysis'), this.options.onAnalyse, 'button-empty');
        } else {
            heading.textContent = _('Lesson unavailable');
            addText(_('This chapter does not contain a playable interactive lesson yet.'));
        }

        if (this.options.preview && this.options.onReturnToEditor) {
            addButton(_('Return to lesson editor'), this.options.onReturnToEditor, 'button-empty');
        }

        const shortcut = document.createElement('p');
        shortcut.className = 'study-gamebook-play__shortcut';
        shortcut.textContent = _('Keyboard: Space continues or retries when available.');
        body.append(shortcut);
        this.status.append(heading, body, actions);
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
