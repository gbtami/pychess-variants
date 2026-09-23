import type { AnalysisTree, AnalysisTreeNode } from '../analysis/analysisTree';
import { firstGamebookComment, studyGamebookMainline } from './studyGamebook';

export type StudyGamebookUnavailableReason = 'empty-script' | 'invalid-script' | 'scripted-move-rejected';
export type StudyGamebookMoveGrade = 'correct' | 'wrong' | 'ignored';

interface StudyGamebookStateBase {
    chapterId: string;
    path: string;
    comment?: string;
}

export interface StudyGamebookPromptState extends StudyGamebookStateBase {
    kind: 'prompt';
    hint?: string;
    hintVisible: boolean;
    solutionMove: string;
    solutionVisible: boolean;
}

export interface StudyGamebookCorrectFeedbackState extends StudyGamebookStateBase {
    kind: 'correct-feedback';
}

export interface StudyGamebookWrongFeedbackState extends StudyGamebookStateBase {
    kind: 'wrong-feedback';
    attemptedMove: string;
    attempts: number;
}

export interface StudyGamebookOpponentWaitState extends StudyGamebookStateBase {
    kind: 'opponent-wait';
    move: string;
    waitingForContinue: boolean;
}

export interface StudyGamebookCompleteState extends StudyGamebookStateBase {
    kind: 'complete';
}

export interface StudyGamebookUnavailableState extends StudyGamebookStateBase {
    kind: 'unavailable';
    reason: StudyGamebookUnavailableReason;
}

export type StudyGamebookPlayState =
    | StudyGamebookPromptState
    | StudyGamebookCorrectFeedbackState
    | StudyGamebookWrongFeedbackState
    | StudyGamebookOpponentWaitState
    | StudyGamebookCompleteState
    | StudyGamebookUnavailableState;

export interface StudyGamebookPlayScheduler {
    schedule(delayMs: number, action: () => void): () => void;
}

export interface StudyGamebookPlayActions {
    /** Apply an authored opponent move through the normal validated analysis move pipeline. */
    playScriptedMove(move: string): boolean;
    /** Return the disposable attempt to an authored position. */
    goToPath(path: string): void;
    stateChanged?(state: StudyGamebookPlayState): void;
    nextChapter?(): void;
}

export interface StudyGamebookPlayChapter {
    chapterId: string;
    tree: AnalysisTree;
    orientation: 'white' | 'black';
}

export interface StudyGamebookPlayOptions extends StudyGamebookPlayChapter {
    actions: StudyGamebookPlayActions;
    scheduler?: StudyGamebookPlayScheduler;
}

interface ScriptNode {
    path: string;
    turnColor: 'white' | 'black';
    incomingMove?: string;
    comment?: string;
    hint?: string;
    deviation?: string;
    wrongFeedback: ReadonlyMap<string, string>;
}

const INITIAL_REPLY_DELAY_MS = 300;
const OPPONENT_REPLY_DELAY_MS = 1000;
const RETRY_DELAY_MS = 800;

const browserScheduler: StudyGamebookPlayScheduler = {
    schedule(delayMs, action) {
        const timer = window.setTimeout(action, delayMs);
        return () => window.clearTimeout(timer);
    },
};

function snapshotNode(node: AnalysisTreeNode, incomingMove?: string): ScriptNode {
    const wrongFeedback = new Map<string, string>();
    for (const child of node.children.slice(1)) {
        const move = child.step.move;
        const comment = firstGamebookComment(child);
        if (move && comment && !wrongFeedback.has(move)) wrongFeedback.set(move, comment);
    }
    const comment = firstGamebookComment(node);
    return {
        path: node.path,
        turnColor: node.step.turnColor,
        ...(incomingMove ? { incomingMove } : {}),
        ...(comment ? { comment } : {}),
        ...(node.gamebook?.hint ? { hint: node.gamebook.hint } : {}),
        ...(node.gamebook?.deviation ? { deviation: node.gamebook.deviation } : {}),
        wrongFeedback,
    };
}

function snapshotScript(tree: AnalysisTree): ScriptNode[] | undefined {
    const nodes = studyGamebookMainline(tree);
    const script: ScriptNode[] = [snapshotNode(nodes[0])];
    for (let index = 1; index < nodes.length; index++) {
        const move = nodes[index].step.move;
        if (!move) return undefined;
        script.push(snapshotNode(nodes[index], move));
    }
    return script;
}

/**
 * Deterministic interactive-lesson state machine.
 *
 * It snapshots the authored preferred mainline at session start. Learner attempts
 * never mutate that script, and grading uses canonical moves supplied by the normal
 * validated move pipeline rather than observing whichever node became first child.
 */
export class StudyGamebookPlayController {
    private readonly actions: StudyGamebookPlayActions;
    private readonly scheduler: StudyGamebookPlayScheduler;
    private script: ScriptNode[] = [];
    private learnerColor: 'white' | 'black' = 'white';
    private scriptIndex = 0;
    private generation = 0;
    private cancelDelayed?: () => void;
    private destroyed = false;
    private wrongAttempts = 0;
    private _chapterId: string;
    private _state: StudyGamebookPlayState;

    constructor(options: StudyGamebookPlayOptions) {
        this.actions = options.actions;
        this.scheduler = options.scheduler ?? browserScheduler;
        this._chapterId = options.chapterId;
        this._state = { kind: 'unavailable', chapterId: options.chapterId, path: '', reason: 'empty-script' };
        this.loadChapter(options, false);
    }

    get state(): StudyGamebookPlayState {
        return this._state;
    }

    get chapterId(): string {
        return this._chapterId;
    }

    /** Grade one already-validated canonical learner move. Wrong moves still belong to the disposable attempt. */
    gradeLearnerMove(move: string): StudyGamebookMoveGrade {
        if (this.destroyed || this._state.kind !== 'prompt') return 'ignored';
        const current = this.script[this.scriptIndex];
        const expected = this.script[this.scriptIndex + 1];
        if (!current || !expected?.incomingMove) {
            this.unavailable('invalid-script');
            return 'ignored';
        }

        this.invalidateDelayed();
        if (move !== expected.incomingMove) {
            this.wrongAttempts += 1;
            const comment = current.wrongFeedback.get(move) ?? expected.deviation;
            this.setState({
                kind: 'wrong-feedback',
                chapterId: this._chapterId,
                path: current.path,
                attemptedMove: move,
                attempts: this.wrongAttempts,
                ...(comment ? { comment } : {}),
            });
            if (!comment) this.schedule(RETRY_DELAY_MS, current.path, () => this.retry());
            return 'wrong';
        }

        this.wrongAttempts = 0;
        this.scriptIndex += 1;
        this.afterLearnerMove();
        return 'correct';
    }

    toggleHint(): boolean {
        if (this._state.kind !== 'prompt' || !this._state.hint) return false;
        this.setState({ ...this._state, hintVisible: !this._state.hintVisible });
        return this._state.hintVisible;
    }

    /** Reveal the authored canonical move without playing it. */
    viewSolution(): string | undefined {
        if (this._state.kind !== 'prompt') return undefined;
        this.setState({ ...this._state, solutionVisible: true });
        return this._state.solutionMove;
    }

    continue(): boolean {
        if (this.destroyed) return false;
        if (this._state.kind === 'correct-feedback') {
            this.beginOpponentWait(0, false);
            return true;
        }
        if (this._state.kind === 'opponent-wait' && this._state.waitingForContinue) {
            this.beginOpponentWait(0, false);
            return true;
        }
        return false;
    }

    retry(): boolean {
        if (this.destroyed || this._state.kind !== 'wrong-feedback') return false;
        this.invalidateDelayed();
        const path = this.script[this.scriptIndex]?.path ?? '';
        this.actions.goToPath(path);
        this.enterCurrentPosition(false);
        return true;
    }

    backToStart(): boolean {
        if (this.destroyed) return false;
        this.invalidateDelayed();
        this.scriptIndex = 0;
        this.wrongAttempts = 0;
        this.actions.goToPath('');
        this.enterCurrentPosition(true);
        return true;
    }

    replay(): boolean {
        if (this.destroyed || this._state.kind !== 'complete') return false;
        return this.backToStart();
    }

    nextChapter(): boolean {
        if (this.destroyed || this._state.kind !== 'complete' || !this.actions.nextChapter) return false;
        this.invalidateDelayed();
        this.actions.nextChapter();
        return true;
    }

    /** Replace the frozen script on an authoritative chapter/session switch. */
    switchChapter(chapter: StudyGamebookPlayChapter): void {
        if (this.destroyed) return;
        this.loadChapter(chapter, true);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.invalidateDelayed();
    }

    private loadChapter(chapter: StudyGamebookPlayChapter, navigateRoot: boolean): void {
        this.invalidateDelayed();
        this._chapterId = chapter.chapterId;
        this.learnerColor = chapter.orientation;
        this.scriptIndex = 0;
        this.wrongAttempts = 0;
        const script = snapshotScript(chapter.tree);
        if (navigateRoot) this.actions.goToPath('');
        if (script === undefined) {
            this.script = [];
            this.unavailable('invalid-script');
            return;
        }
        this.script = script;
        this.enterCurrentPosition(true);
    }

    private afterLearnerMove(): void {
        const current = this.script[this.scriptIndex];
        if (!current) {
            this.unavailable('invalid-script');
            return;
        }
        if (this.scriptIndex === this.script.length - 1) {
            this.complete();
            return;
        }
        if (current.turnColor === this.learnerColor) {
            this.prompt();
            return;
        }
        if (current.comment) {
            this.setState({
                kind: 'correct-feedback',
                chapterId: this._chapterId,
                path: current.path,
                comment: current.comment,
            });
            return;
        }
        this.beginOpponentWait(OPPONENT_REPLY_DELAY_MS, false);
    }

    private enterCurrentPosition(initial: boolean): void {
        const current = this.script[this.scriptIndex];
        if (!current) {
            this.unavailable('invalid-script');
            return;
        }
        if (this.scriptIndex === this.script.length - 1) {
            this.complete();
            return;
        }
        if (current.turnColor === this.learnerColor) {
            this.prompt();
            return;
        }
        this.beginOpponentWait(initial ? INITIAL_REPLY_DELAY_MS : OPPONENT_REPLY_DELAY_MS, Boolean(current.comment));
    }

    private prompt(): void {
        const current = this.script[this.scriptIndex];
        const expected = this.script[this.scriptIndex + 1];
        if (!current || !expected?.incomingMove) {
            this.unavailable('invalid-script');
            return;
        }
        this.setState({
            kind: 'prompt',
            chapterId: this._chapterId,
            path: current.path,
            solutionMove: expected.incomingMove,
            hintVisible: false,
            solutionVisible: false,
            ...(current.comment ? { comment: current.comment } : {}),
            ...(current.hint ? { hint: current.hint } : {}),
        });
    }

    private beginOpponentWait(delayMs: number, waitingForContinue: boolean): void {
        this.invalidateDelayed();
        const current = this.script[this.scriptIndex];
        const next = this.script[this.scriptIndex + 1];
        if (!current || !next?.incomingMove) {
            this.complete();
            return;
        }
        this.setState({
            kind: 'opponent-wait',
            chapterId: this._chapterId,
            path: current.path,
            move: next.incomingMove,
            waitingForContinue,
            ...(current.comment ? { comment: current.comment } : {}),
        });
        if (!waitingForContinue) this.schedule(delayMs, current.path, () => this.playOpponentMove());
    }

    private playOpponentMove(): void {
        const next = this.script[this.scriptIndex + 1];
        if (!next?.incomingMove) {
            this.complete();
            return;
        }
        if (!this.actions.playScriptedMove(next.incomingMove)) {
            this.unavailable('scripted-move-rejected');
            return;
        }
        this.scriptIndex += 1;
        this.enterCurrentPosition(false);
    }

    private complete(): void {
        this.invalidateDelayed();
        const current = this.script[this.scriptIndex];
        this.setState({
            kind: 'complete',
            chapterId: this._chapterId,
            path: current?.path ?? '',
            ...(current?.comment ? { comment: current.comment } : {}),
        });
    }

    private unavailable(reason: StudyGamebookUnavailableReason): void {
        this.invalidateDelayed();
        this.setState({
            kind: 'unavailable',
            chapterId: this._chapterId,
            path: this.script[this.scriptIndex]?.path ?? '',
            reason,
        });
    }

    private schedule(delayMs: number, path: string, action: () => void): void {
        const generation = this.generation;
        const chapterId = this._chapterId;
        const cancel = this.scheduler.schedule(delayMs, () => {
            if (
                this.destroyed ||
                generation !== this.generation ||
                chapterId !== this._chapterId ||
                path !== (this.script[this.scriptIndex]?.path ?? '')
            )
                return;
            this.cancelDelayed = undefined;
            action();
        });
        this.cancelDelayed = cancel;
    }

    private invalidateDelayed(): void {
        this.generation += 1;
        this.cancelDelayed?.();
        this.cancelDelayed = undefined;
    }

    private setState(state: StudyGamebookPlayState): void {
        this._state = state;
        this.actions.stateChanged?.(state);
    }
}
