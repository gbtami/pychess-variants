import type { AnalysisController } from '../analysis/analysisCtrl';
import type {
    AnalysisMoveApplication,
    AnalysisNavigationOrigin,
    AnalysisPositionChange,
} from '../analysis/analysisExtension';
import {
    AnalysisPracticeEngine,
    type AnalysisPracticeEngineEvent,
    type AnalysisPracticeUnavailableReason,
} from '../analysis/analysisPracticeEngine';
import { _ } from '../i18n';

export type StudyPracticeUnavailableReason =
    | 'computer-disabled'
    | 'active-game'
    | Extract<
          AnalysisPracticeUnavailableReason,
          'unsupported' | 'engine-not-ready' | 'engine-error' | 'timeout' | 'drain-timeout'
      >;

export interface StudyPracticeMove {
    move: string;
    fen: string;
    path: string;
    by: 'human' | 'engine';
}

export type StudyPracticeState =
    | Readonly<{ kind: 'initializing' }>
    | Readonly<{ kind: 'human-turn' }>
    | Readonly<{ kind: 'engine-thinking' }>
    | Readonly<{ kind: 'paused'; liveKind: 'human-turn' | 'engine-thinking'; browseIndex: number }>
    | Readonly<{ kind: 'ended'; result?: string }>
    | Readonly<{ kind: 'unavailable'; reason: StudyPracticeUnavailableReason; message?: string }>;

export type StudyPracticeAccess =
    | Readonly<{ available: true }>
    | Readonly<{ available: false; reason: 'computer-disabled' | 'active-game'; message?: string }>;

export interface StudyPracticeOptions {
    initialFen: string;
    learnerColor: 'white' | 'black';
    access(): StudyPracticeAccess;
    canAnalyse: boolean;
    onAnalyse?(): void;
}

type PracticeBoard = {
    delete(): void;
    isGameOver(claimDraw?: boolean): boolean;
    legalMoves(): string;
    push(move: string): void;
    result(claimDraw?: boolean): string;
};

const PRACTICE_SEARCH_NODES = 600_000;

/**
 * Disposable live-play session for Study "Practice with computer" chapters.
 *
 * The persisted Study tree is deliberately not the game source here. The session
 * starts from the chapter root FEN, replaces authored continuations with a local
 * attempt tree, and owns a second ffish Board whose uninterrupted move stack is
 * used for legality and terminal/result checks (including repetition-sensitive
 * rules). The browser engine receives the same root FEN + full attempt move list.
 */
export class StudyPracticeSession {
    private readonly engine: AnalysisPracticeEngine;
    private readonly panel: HTMLElement;
    private readonly status: HTMLElement;
    private historyBoard: PracticeBoard;
    private stateValue: StudyPracticeState = { kind: 'initializing' };
    private readonly history: StudyPracticeMove[] = [];
    private readonly paths: string[] = [''];
    private livePath = '';
    private applyingEngineReply = false;
    private destroyed = false;

    constructor(
        private readonly ctrl: AnalysisController,
        private readonly options: StudyPracticeOptions,
    ) {
        const tree = ctrl.analysisTree;
        if (!tree) throw new Error('Computer practice requires an analysis tree.');
        const tools = document.querySelector<HTMLElement>('.analysis-tools');
        if (!tools) throw new Error('Computer practice requires the analysis tools panel.');

        this.panel = document.createElement('section');
        // Reuse the already-served lesson-playback layout/styles. Practice has its
        // own semantic class but needs no additional stylesheet or cascade changes.
        this.panel.className = 'study-gamebook-play study-practice';
        this.panel.setAttribute('aria-label', _('Practice with computer'));
        this.status = document.createElement('div');
        this.status.className = 'study-gamebook-play__status';
        this.status.setAttribute('aria-live', 'polite');
        this.panel.append(this.status);
        tools.append(this.panel);

        this.historyBoard = this.createHistoryBoard();
        this.engine = new AnalysisPracticeEngine(
            {
                postMessage: command => this.ctrl.fsfPostMessage(command),
                availability: () =>
                    this.engineReady()
                        ? { available: true }
                        : { available: false, reason: 'engine-not-ready', message: _('Browser engine is not ready.') },
            },
            event => this.onEngineEvent(event),
        );

        // Ordinary infinite analysis and practice must never own the one browser
        // engine at the same time. This is local-only and does not change the user's
        // saved localAnalysis preference; a remounted normal analysis page restores it.
        this.ctrl.suspendLocalAnalysisForExtension();
        this.resetLocalAttemptTree();
        this.engine.beginSession();
        this.refreshAvailability();
    }

    get state(): StudyPracticeState {
        return this.stateValue;
    }

    get attemptHistory(): readonly StudyPracticeMove[] {
        return this.history.map(entry => ({ ...entry }));
    }

    beforeMoveApplied(move: AnalysisMoveApplication): boolean {
        if (this.destroyed) return false;
        if (move.origin === 'automated-reply')
            return this.applyingEngineReply && this.stateValue.kind === 'engine-thinking';
        return this.stateValue.kind === 'human-turn' && this.ctrl.turnColor === this.options.learnerColor;
    }

    boardInput(turnColor: 'white' | 'black'): 'white' | 'black' | false {
        if (this.destroyed || this.stateValue.kind !== 'human-turn' || turnColor !== this.options.learnerColor)
            return false;
        return this.options.learnerColor;
    }

    onPositionChanged(change: AnalysisPositionChange): void {
        if (this.destroyed) return;
        if (change.origin !== 'played-move' && change.origin !== 'automated-reply') {
            if (this.stateValue.kind === 'paused') this.render();
            return;
        }

        const move = change.node?.step.move;
        if (!move) {
            this.setUnavailable('engine-error', _('Practice move history could not be reconstructed.'));
            return;
        }

        const by = change.origin === 'automated-reply' ? 'engine' : 'human';
        if ((by === 'human') !== (this.stateValue.kind === 'human-turn')) {
            this.setUnavailable('engine-error', _('Practice move ownership became inconsistent.'));
            return;
        }

        const legalMoves = this.legalMoves();
        if (!legalMoves.has(move)) {
            this.setUnavailable('engine-error', _('A practice move was rejected by the saved variant rules.'));
            return;
        }

        try {
            this.historyBoard.push(move);
        } catch (error) {
            this.setUnavailable('engine-error', error instanceof Error ? error.message : String(error));
            return;
        }
        this.history.push({ move, fen: change.fen, path: change.path, by });
        this.paths.push(change.path);
        this.livePath = change.path;

        if (this.isTerminal()) {
            this.finish();
            return;
        }
        if (this.ctrl.turnColor === this.options.learnerColor) this.setState({ kind: 'human-turn' });
        else this.startEngineReply();
    }

    canActivatePath(path: string, origin: AnalysisNavigationOrigin): boolean {
        if (this.destroyed) return false;
        if (origin === 'played-move' || origin === 'automated-reply') return true;
        if (origin === 'reset') return path === '' || path === this.livePath || this.stateValue.kind === 'paused';
        return this.stateValue.kind === 'paused' && this.paths.includes(path);
    }

    allowTreeContextMenu(): boolean {
        return false;
    }

    /** Route engine lines before ordinary analysis consumes them. */
    onEngineLine(line: string): boolean {
        if (this.destroyed) return false;
        const consumed = this.engine.handleLine(line);
        if (!consumed && (line === 'readyok' || line.includes('uciok') || line.startsWith('option name UCI_Variant'))) {
            queueMicrotask(() => this.refreshAvailability());
        }
        return consumed;
    }

    refreshAvailability(): void {
        if (this.destroyed) return;
        // A timed-out stop/ready barrier means engine ownership is no longer
        // trustworthy. E1 deliberately fails closed here; only remounting the
        // page may construct a fresh adapter around the shared engine.
        if (this.stateValue.kind === 'unavailable' && this.stateValue.reason === 'drain-timeout') {
            this.render();
            return;
        }
        const access = this.options.access();
        if (!access.available) {
            this.engine.setBlocked('permission', access.message);
            this.setUnavailable(access.reason, access.message);
            return;
        }
        if (this.ctrl.variant.twoBoards) {
            this.engine.setBlocked('unsupported', _('Two-board variants are not supported by computer practice.'));
            this.setUnavailable('unsupported', _('Two-board variants are not supported by computer practice.'));
            return;
        }
        if (this.ctrl.uciOk && !this.ctrl.variantSupportedByFSF) {
            this.engine.setBlocked('unsupported', _('This variant is not supported by the browser engine.'));
            this.setUnavailable('unsupported', _('This variant is not supported by the browser engine.'));
            return;
        }
        if (!this.engineReady()) {
            this.setState({ kind: 'initializing' });
            return;
        }

        this.engine.setBlocked(null);
        if (this.isTerminal()) {
            this.finish();
            return;
        }
        if (this.stateValue.kind === 'paused' || this.stateValue.kind === 'ended') return;
        if (this.ctrl.turnColor === this.options.learnerColor) this.setState({ kind: 'human-turn' });
        else this.startEngineReply();
    }

    pause(): boolean {
        if (this.destroyed) return false;
        if (this.stateValue.kind !== 'human-turn' && this.stateValue.kind !== 'engine-thinking') return false;
        const liveKind = this.stateValue.kind;
        this.engine.cancel();
        const browseIndex = Math.max(0, this.paths.indexOf(this.ctrl.analysisPath ?? this.livePath));
        this.setState({ kind: 'paused', liveKind, browseIndex });
        return true;
    }

    resume(): boolean {
        if (this.destroyed || this.stateValue.kind !== 'paused') return false;
        if ((this.ctrl.analysisPath ?? '') !== this.livePath) this.ctrl.activateTreePath(this.livePath, true, 'reset');
        if (this.isTerminal()) {
            this.finish();
            return true;
        }
        if (this.ctrl.turnColor === this.options.learnerColor) this.setState({ kind: 'human-turn' });
        else this.startEngineReply();
        return true;
    }

    browse(delta: -1 | 1): boolean {
        if (this.destroyed || this.stateValue.kind !== 'paused') return false;
        const current = this.paths.indexOf(this.ctrl.analysisPath ?? '');
        const next = Math.max(
            0,
            Math.min(this.paths.length - 1, (current < 0 ? this.paths.length - 1 : current) + delta),
        );
        const path = this.paths[next];
        if (path === undefined || path === (this.ctrl.analysisPath ?? '')) return false;
        this.ctrl.activateTreePath(path, true, 'user-navigation');
        this.setState({ ...this.stateValue, browseIndex: next });
        return true;
    }

    reset(): void {
        if (this.destroyed) return;
        this.engine.beginSession();
        this.ctrl.activateTreePath('', true, 'reset');
        this.resetLocalAttemptTree();
        this.historyBoard.delete();
        this.historyBoard = this.createHistoryBoard();
        this.history.length = 0;
        this.paths.splice(1);
        this.livePath = '';
        this.setState({ kind: 'initializing' });
        this.refreshAvailability();
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.engine.destroy();
        this.historyBoard.delete();
        this.panel.remove();
    }

    private createHistoryBoard(): PracticeBoard {
        return new this.ctrl.ffish.Board(
            this.ctrl.engineVariant,
            this.options.initialFen,
            this.ctrl.chess960,
        ) as PracticeBoard;
    }

    private resetLocalAttemptTree(): void {
        const tree = this.ctrl.analysisTree;
        if (!tree) return;
        for (const path of tree.byPath.keys()) if (path) tree.byPath.delete(path);
        tree.root.children = [];
        tree.root.mainlinePly = 0;
        this.ctrl.steps.splice(1);
        this.ctrl.recordedMainlinePly = 0;
        if ((this.ctrl.analysisPath ?? '') !== '') this.ctrl.activateTreePath('', true, 'reset');
    }

    private legalMoves(): Set<string> {
        try {
            return new Set(this.historyBoard.legalMoves().split(' ').filter(Boolean));
        } catch {
            return new Set();
        }
    }

    private isTerminal(): boolean {
        try {
            return this.historyBoard.isGameOver(true);
        } catch {
            return false;
        }
    }

    private finish(): void {
        this.engine.cancel();
        let result: string | undefined;
        try {
            result = this.historyBoard.result(true);
        } catch {
            result = undefined;
        }
        this.setState({ kind: 'ended', ...(result ? { result } : {}) });
    }

    private engineReady(): boolean {
        return (
            this.ctrl.localEngine &&
            this.ctrl.isEngineReady &&
            this.ctrl.variantSupportedByFSF &&
            !this.ctrl.localAnalysis &&
            this.ctrl.isPracticeEngineIdle()
        );
    }

    private startEngineReply(): void {
        if (this.destroyed) return;
        const access = this.options.access();
        if (!access.available) {
            this.setUnavailable(access.reason, access.message);
            return;
        }
        if (!this.engineReady()) {
            this.setState({ kind: 'initializing' });
            return;
        }
        this.setState({ kind: 'engine-thinking' });
        this.engine.search({
            initialFen: this.options.initialFen,
            moves: this.history.map(entry => entry.move),
            budget: { type: 'nodes', value: PRACTICE_SEARCH_NODES },
            multiPv: 1,
            options: [
                { name: 'UCI_Variant', value: this.ctrl.engineVariant },
                { name: 'UCI_Chess960', value: this.ctrl.chess960 },
                { name: 'Use NNUE', value: false },
            ],
        });
    }

    private onEngineEvent(event: AnalysisPracticeEngineEvent): void {
        if (this.destroyed || !this.engine.isCurrent(event.owner)) return;
        if (event.type === 'unavailable') {
            if (event.reason === 'destroyed') return;
            const reason = event.reason === 'permission' ? 'computer-disabled' : event.reason;
            this.setUnavailable(reason, event.message);
            return;
        }
        if (event.type !== 'bestmove' || this.stateValue.kind !== 'engine-thinking') return;
        if (!event.move) {
            if (this.isTerminal()) this.finish();
            else this.setUnavailable('engine-error', _('The browser engine returned no legal move.'));
            return;
        }
        if (!this.legalMoves().has(event.move)) {
            this.setUnavailable('engine-error', _('The browser engine returned an illegal move.'));
            return;
        }

        this.applyingEngineReply = true;
        try {
            if (!this.ctrl.applyAnalysisMove(event.move, 'automated-reply')) {
                this.setUnavailable('engine-error', _('The browser engine move could not be applied.'));
            }
        } finally {
            this.applyingEngineReply = false;
        }
    }

    private setUnavailable(reason: StudyPracticeUnavailableReason, message?: string): void {
        this.engine.cancel();
        this.setState({ kind: 'unavailable', reason, ...(message ? { message } : {}) });
    }

    private setState(state: StudyPracticeState): void {
        if (this.destroyed) return;
        this.stateValue = state;
        this.syncBoardInput();
        this.render();
    }

    private syncBoardInput(): void {
        const color = this.boardInput(this.ctrl.turnColor);
        this.ctrl.chessground.cancelPremove();
        this.ctrl.chessground.set({
            movable: { color: color === false ? undefined : color },
            premovable: { enabled: false },
        });
    }

    private render(): void {
        const state = this.stateValue;
        this.status.replaceChildren();
        const heading = document.createElement('h2');
        heading.className = 'study-gamebook-play__title';
        const body = document.createElement('div');
        body.className = 'study-gamebook-play__body';
        const actions = document.createElement('div');
        actions.className = 'study-gamebook-play__actions';

        const addText = (text: string) => {
            const paragraph = document.createElement('p');
            paragraph.className = 'study-gamebook-play__message';
            paragraph.textContent = text;
            body.append(paragraph);
        };
        const addButton = (label: string, action: () => void, className = '') => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `button${className ? ` ${className}` : ''}`;
            button.textContent = label;
            button.addEventListener('click', action);
            actions.append(button);
        };

        if (state.kind === 'initializing') {
            heading.textContent = _('Starting computer practice');
            addText(_('Waiting for the browser engine…'));
        } else if (state.kind === 'human-turn') {
            heading.textContent = _('Your turn');
            addText(_('Play a move on the board.'));
            addButton(_('Pause'), () => this.pause(), 'button-empty');
            addButton(_('Reset'), () => this.reset(), 'button-empty');
        } else if (state.kind === 'engine-thinking') {
            heading.textContent = _('Computer is thinking…');
            addText(_('Your move history stays local to this practice attempt.'));
            addButton(_('Pause'), () => this.pause(), 'button-empty');
            addButton(_('Reset'), () => this.reset(), 'button-empty');
        } else if (state.kind === 'paused') {
            heading.textContent = _('Practice paused');
            addText(_('Browse the current attempt, then resume from the latest position.'));
            addButton(_('Previous'), () => this.browse(-1), 'button-empty');
            addButton(_('Next'), () => this.browse(1), 'button-empty');
            addButton(_('Resume'), () => this.resume());
            addButton(_('Reset'), () => this.reset(), 'button-empty');
        } else if (state.kind === 'ended') {
            heading.textContent = _('Practice complete');
            addText(state.result ? _('Game result: %1', state.result) : _('The position is terminal.'));
            addButton(_('Play again'), () => this.reset());
            if (this.options.canAnalyse && this.options.onAnalyse)
                addButton(_('Analysis'), this.options.onAnalyse, 'button-empty');
        } else {
            heading.textContent = _('Practice unavailable');
            addText(state.message ?? this.unavailableMessage(state.reason));
            if (state.reason !== 'drain-timeout')
                addButton(_('Retry'), () => this.refreshAvailability(), 'button-empty');
            if (this.options.canAnalyse && this.options.onAnalyse)
                addButton(_('Analysis'), this.options.onAnalyse, 'button-empty');
        }

        this.status.append(heading, body, actions);
    }

    private unavailableMessage(reason: StudyPracticeUnavailableReason): string {
        switch (reason) {
            case 'computer-disabled':
                return _('Computer analysis is disabled for this study.');
            case 'active-game':
                return _('Computer practice is unavailable while you have an active game.');
            case 'unsupported':
                return _('This variant is not supported by the browser engine.');
            case 'timeout':
                return _('The browser engine took too long to move.');
            case 'drain-timeout':
                return _('The browser engine could not safely restart. Reload the page to try again.');
            case 'engine-error':
                return _('The browser engine stopped unexpectedly.');
            case 'engine-not-ready':
                return _('Browser engine is not ready.');
        }
    }
}
