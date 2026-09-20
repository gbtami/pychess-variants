import { describe, expect, jest, test } from '@jest/globals';

import type { Step } from '../client/messages';
import type { AnalysisAnnotations, AnalysisTree, AnalysisTreeNode } from '../client/analysis/analysisTree';
import {
    StudyGamebookPlayController,
    type StudyGamebookPlayActions,
    type StudyGamebookPlayScheduler,
} from '../client/study/studyGamebookPlay';

function step(move: string | undefined, turnColor: 'white' | 'black', san = move ?? ''): Step {
    return {
        fen: `${move ?? 'root'} ${turnColor === 'white' ? 'w' : 'b'} - - 0 1`,
        ...(move ? { move } : {}),
        check: false,
        turnColor,
        san,
        sanSAN: san,
    };
}

function comments(...texts: string[]): AnalysisAnnotations {
    return {
        shapes: [],
        comments: texts.map((text, index) => ({ id: `Comment${index}`, author: 'author', text })),
        nags: [],
    };
}

function makeNode(
    id: string,
    path: string,
    ply: number,
    move: string | undefined,
    turnColor: 'white' | 'black',
    options: {
        comment?: string;
        comments?: string[];
        hint?: string;
        deviation?: string;
        mainlinePly?: number;
    } = {},
): AnalysisTreeNode {
    const text = options.comments ?? (options.comment ? [options.comment] : []);
    return {
        id,
        path,
        ply,
        step: step(move, turnColor),
        children: [],
        ...(options.mainlinePly !== undefined ? { mainlinePly: options.mainlinePly } : {}),
        ...(text.length ? { annotations: comments(...text) } : {}),
        ...(options.hint || options.deviation
            ? {
                  gamebook: {
                      ...(options.hint ? { hint: options.hint } : {}),
                      ...(options.deviation ? { deviation: options.deviation } : {}),
                  },
              }
            : {}),
    };
}

function lessonTree(
    options: { rootTurn?: 'white' | 'black'; rootComment?: string; e4Comment?: string } = {},
): AnalysisTree {
    const root = makeNode('root', '', 0, undefined, options.rootTurn ?? 'white', {
        comments: ['', options.rootComment ?? 'Find the central move'],
        hint: 'Control the center',
        mainlinePly: 0,
    });
    const e4 = makeNode('e4', 'e4', 1, 'e2e4', 'black', {
        comment: options.e4Comment ?? 'Good. Now watch the reply.',
        deviation: 'The lesson expects 1. e4.',
        mainlinePly: 1,
    });
    const e5 = makeNode('e5', 'e4.e5', 2, 'e7e5', 'white', {
        comment: 'Develop a knight.',
        hint: 'Attack e5.',
        mainlinePly: 2,
    });
    const nf3 = makeNode('nf3', 'e4.e5.nf3', 3, 'g1f3', 'black', {
        comment: 'Lesson complete.',
        mainlinePly: 3,
    });
    const d4 = makeNode('d4', 'd4', 1, 'd2d4', 'black', { comment: 'That is a different opening.' });
    const c4 = makeNode('c4', 'c4', 1, 'c2c4', 'black');
    root.children = [e4, d4, c4];
    e4.children = [e5];
    e5.children = [nf3];
    return {
        root,
        byPath: new Map([
            ['', root],
            ['e4', e4],
            ['e4.e5', e5],
            ['e4.e5.nf3', nf3],
            ['d4', d4],
            ['c4', c4],
        ]),
        nextId: 1,
    };
}

class ManualScheduler implements StudyGamebookPlayScheduler {
    readonly tasks: Array<{ delayMs: number; action: () => void }> = [];

    schedule(delayMs: number, action: () => void): () => void {
        this.tasks.push({ delayMs, action });
        // Deliberately do not suppress execution when cancelled. The controller's
        // generation/chapter/path guards must make stale callbacks harmless too.
        return () => {};
    }

    runNext(): void {
        const task = this.tasks.shift();
        if (!task) throw new Error('No scheduled gamebook task');
        task.action();
    }
}

function controller(
    tree = lessonTree(),
    options: { chapterId?: string; orientation?: 'white' | 'black'; scheduler?: ManualScheduler } = {},
) {
    const scheduler = options.scheduler ?? new ManualScheduler();
    const actions: StudyGamebookPlayActions = {
        playScriptedMove: jest.fn(() => true),
        goToPath: jest.fn(),
        stateChanged: jest.fn(),
        nextChapter: jest.fn(),
    };
    const ctrl = new StudyGamebookPlayController({
        chapterId: options.chapterId ?? 'chapter-1',
        tree,
        orientation: options.orientation ?? 'white',
        actions,
        scheduler,
    });
    return { ctrl, actions, scheduler };
}

describe('Study interactive lesson deterministic playback', () => {
    test('empty or already-final roots are unavailable instead of completed', () => {
        const root = makeNode('root', '', 0, undefined, 'white', { comment: 'Nothing to play', mainlinePly: 0 });
        const { ctrl } = controller({ root, byPath: new Map([['', root]]), nextId: 1 });

        expect(ctrl.state).toEqual({ kind: 'unavailable', chapterId: 'chapter-1', path: '', reason: 'empty-script' });
        expect(ctrl.replay()).toBe(false);
        expect(ctrl.nextChapter()).toBe(false);
    });

    test('uses first nonempty comment, hint and solution without playing the solution', () => {
        const { ctrl, actions } = controller();

        expect(ctrl.state).toMatchObject({
            kind: 'prompt',
            path: '',
            comment: 'Find the central move',
            hint: 'Control the center',
            hintVisible: false,
            solutionMove: 'e2e4',
            solutionVisible: false,
        });
        expect(ctrl.toggleHint()).toBe(true);
        expect(ctrl.state).toMatchObject({ kind: 'prompt', hintVisible: true });
        expect(ctrl.viewSolution()).toBe('e2e4');
        expect(ctrl.state).toMatchObject({ kind: 'prompt', solutionVisible: true });
        expect(actions.playScriptedMove).not.toHaveBeenCalled();
    });

    test('pauses on correct feedback, plays the opponent reply, then completes the mainline', () => {
        const { ctrl, actions, scheduler } = controller();

        expect(ctrl.gradeLearnerMove('e2e4')).toBe('correct');
        expect(ctrl.state).toEqual({
            kind: 'correct-feedback',
            chapterId: 'chapter-1',
            path: 'e4',
            comment: 'Good. Now watch the reply.',
        });
        expect(actions.playScriptedMove).not.toHaveBeenCalled();

        expect(ctrl.continue()).toBe(true);
        expect(ctrl.state).toMatchObject({
            kind: 'opponent-wait',
            path: 'e4',
            move: 'e7e5',
            waitingForContinue: false,
        });
        expect(scheduler.tasks[0]?.delayMs).toBe(0);
        scheduler.runNext();
        expect(actions.playScriptedMove).toHaveBeenCalledWith('e7e5');
        expect(ctrl.state).toMatchObject({
            kind: 'prompt',
            path: 'e4.e5',
            comment: 'Develop a knight.',
            solutionMove: 'g1f3',
        });

        expect(ctrl.gradeLearnerMove('g1f3')).toBe('correct');
        expect(ctrl.state).toEqual({
            kind: 'complete',
            chapterId: 'chapter-1',
            path: 'e4.e5.nf3',
            comment: 'Lesson complete.',
        });
    });

    test('automatically schedules an uncommented opponent reply after a guarded delay', () => {
        const { ctrl, actions, scheduler } = controller(lessonTree({ e4Comment: '' }));

        expect(ctrl.gradeLearnerMove('e2e4')).toBe('correct');
        expect(ctrl.state).toMatchObject({
            kind: 'opponent-wait',
            path: 'e4',
            move: 'e7e5',
            waitingForContinue: false,
        });
        expect(scheduler.tasks[0]?.delayMs).toBe(1000);
        scheduler.runNext();
        expect(actions.playScriptedMove).toHaveBeenCalledWith('e7e5');
        expect(ctrl.state.kind).toBe('prompt');
    });

    test('supports a scripted first opponent move and pauses on the root introduction', () => {
        const root = makeNode('root', '', 0, undefined, 'black', { comment: 'Black moves first.', mainlinePly: 0 });
        const e5 = makeNode('e5', 'e5', 1, 'e7e5', 'white', { comment: 'Now respond.', mainlinePly: 1 });
        const nf3 = makeNode('nf3', 'e5.nf3', 2, 'g1f3', 'black', { mainlinePly: 2 });
        root.children = [e5];
        e5.children = [nf3];
        const tree: AnalysisTree = {
            root,
            byPath: new Map([
                ['', root],
                ['e5', e5],
                ['e5.nf3', nf3],
            ]),
            nextId: 1,
        };
        const { ctrl, actions, scheduler } = controller(tree);

        expect(ctrl.state).toMatchObject({
            kind: 'opponent-wait',
            path: '',
            move: 'e7e5',
            comment: 'Black moves first.',
            waitingForContinue: true,
        });
        expect(scheduler.tasks).toHaveLength(0);
        expect(ctrl.continue()).toBe(true);
        scheduler.runNext();
        expect(actions.playScriptedMove).toHaveBeenCalledWith('e7e5');
        expect(ctrl.state).toMatchObject({ kind: 'prompt', path: 'e5', comment: 'Now respond.' });
    });

    test('uses move-specific wrong feedback before fallback deviation and supports repeated retries', () => {
        const { ctrl, actions } = controller();

        expect(ctrl.gradeLearnerMove('d2d4')).toBe('wrong');
        expect(ctrl.state).toMatchObject({
            kind: 'wrong-feedback',
            path: '',
            attemptedMove: 'd2d4',
            attempts: 1,
            comment: 'That is a different opening.',
        });
        expect(ctrl.retry()).toBe(true);
        expect(actions.goToPath).toHaveBeenLastCalledWith('');
        expect(ctrl.state.kind).toBe('prompt');

        expect(ctrl.gradeLearnerMove('c2c4')).toBe('wrong');
        expect(ctrl.state).toMatchObject({
            kind: 'wrong-feedback',
            attemptedMove: 'c2c4',
            attempts: 2,
            comment: 'The lesson expects 1. e4.',
        });
        expect(ctrl.retry()).toBe(true);
        expect(ctrl.gradeLearnerMove('e2e4')).toBe('correct');
    });

    test('automatically retries a wrong move with no specific or fallback explanation', () => {
        const tree = lessonTree();
        tree.root.children[0].gamebook = undefined;
        const { ctrl, actions, scheduler } = controller(tree);

        expect(ctrl.gradeLearnerMove('a2a3')).toBe('wrong');
        expect(ctrl.state).toMatchObject({ kind: 'wrong-feedback', attemptedMove: 'a2a3' });
        expect(scheduler.tasks[0]?.delayMs).toBe(800);
        scheduler.runNext();
        expect(actions.goToPath).toHaveBeenCalledWith('');
        expect(ctrl.state.kind).toBe('prompt');
    });

    test('keeps simultaneous learner attempts independent over the same authored script', () => {
        const tree = lessonTree();
        const first = controller(tree).ctrl;
        const second = controller(tree).ctrl;

        expect(first.gradeLearnerMove('d2d4')).toBe('wrong');
        expect(first.state).toMatchObject({ kind: 'wrong-feedback', attempts: 1 });
        expect(second.state).toMatchObject({ kind: 'prompt', solutionMove: 'e2e4' });
        expect(second.gradeLearnerMove('e2e4')).toBe('correct');
        expect(first.state).toMatchObject({ kind: 'wrong-feedback', attempts: 1 });
    });

    test('supports a black learner and canonical promotion/drop solutions', () => {
        const blackRoot = makeNode('root', '', 0, undefined, 'black', { mainlinePly: 0 });
        const blackMove = makeNode('blackMove', 'blackMove', 1, 'c7c5', 'white', { mainlinePly: 1 });
        blackRoot.children = [blackMove];
        const black = controller(
            {
                root: blackRoot,
                byPath: new Map([
                    ['', blackRoot],
                    ['blackMove', blackMove],
                ]),
                nextId: 1,
            },
            { orientation: 'black' },
        ).ctrl;
        expect(black.state).toMatchObject({ kind: 'prompt', solutionMove: 'c7c5' });
        expect(black.gradeLearnerMove('c7c5')).toBe('correct');
        expect(black.state.kind).toBe('complete');

        for (const move of ['a7a8q', 'P@e4']) {
            const root = makeNode('root', '', 0, undefined, 'white', { mainlinePly: 0 });
            const end = makeNode('end', 'end', 1, move, 'black', { mainlinePly: 1 });
            root.children = [end];
            const attempt = controller({ root, byPath: new Map([['', root], ['end', end]]), nextId: 1 }).ctrl;
            expect(attempt.state).toMatchObject({ kind: 'prompt', solutionMove: move });
            expect(attempt.gradeLearnerMove(move)).toBe('correct');
            expect(attempt.state.kind).toBe('complete');
        }
    });

    test('the stable authored mainline cannot be replaced by a learner-created or reordered first child', () => {
        const tree = lessonTree();
        const { ctrl } = controller(tree);
        const originalExpected = tree.root.children[0];
        const wrong = tree.root.children[1];
        tree.root.children = [wrong, originalExpected, ...tree.root.children.slice(2)];

        expect(ctrl.gradeLearnerMove('d2d4')).toBe('wrong');
        expect(ctrl.retry()).toBe(true);
        expect(ctrl.gradeLearnerMove('e2e4')).toBe('correct');
    });

    test('uses actual side to move, so consecutive learner turns do not invent an opponent reply', () => {
        const root = makeNode('root', '', 0, undefined, 'white', { mainlinePly: 0 });
        const first = makeNode('first', 'first', 1, 'a1a2', 'white', { comment: 'Move again.', mainlinePly: 1 });
        const second = makeNode('second', 'first.second', 2, 'a2a3', 'black', { mainlinePly: 2 });
        root.children = [first];
        first.children = [second];
        const tree: AnalysisTree = {
            root,
            byPath: new Map([
                ['', root],
                ['first', first],
                ['first.second', second],
            ]),
            nextId: 1,
        };
        const { ctrl, actions, scheduler } = controller(tree);

        expect(ctrl.gradeLearnerMove('a1a2')).toBe('correct');
        expect(ctrl.state).toMatchObject({
            kind: 'prompt',
            path: 'first',
            comment: 'Move again.',
            solutionMove: 'a2a3',
        });
        expect(actions.playScriptedMove).not.toHaveBeenCalled();
        expect(scheduler.tasks).toHaveLength(0);
    });

    test('replay and next chapter are available only after completion', () => {
        const root = makeNode('root', '', 0, undefined, 'white', { mainlinePly: 0 });
        const end = makeNode('end', 'end', 1, 'e2e4', 'black', { mainlinePly: 1 });
        root.children = [end];
        const tree: AnalysisTree = {
            root,
            byPath: new Map([
                ['', root],
                ['end', end],
            ]),
            nextId: 1,
        };
        const { ctrl, actions } = controller(tree);

        expect(ctrl.replay()).toBe(false);
        expect(ctrl.backToStart()).toBe(true);
        expect(actions.goToPath).toHaveBeenCalledWith('');
        expect(ctrl.state.kind).toBe('prompt');
        expect(ctrl.nextChapter()).toBe(false);
        expect(ctrl.gradeLearnerMove('e2e4')).toBe('correct');
        expect(ctrl.state.kind).toBe('complete');
        expect(ctrl.nextChapter()).toBe(true);
        expect(actions.nextChapter).toHaveBeenCalledTimes(1);
        expect(ctrl.replay()).toBe(true);
        expect(actions.goToPath).toHaveBeenCalledWith('');
        expect(ctrl.state.kind).toBe('prompt');
    });

    test('scripted reply failure becomes explicitly unavailable', () => {
        const { ctrl, actions, scheduler } = controller(lessonTree({ e4Comment: '' }));
        (actions.playScriptedMove as jest.Mock).mockReturnValue(false);

        expect(ctrl.gradeLearnerMove('e2e4')).toBe('correct');
        scheduler.runNext();
        expect(ctrl.state).toMatchObject({ kind: 'unavailable', reason: 'scripted-move-rejected', path: 'e4' });
    });

    test('delayed retries are guarded against an explicit retry and destroy', () => {
        const tree = lessonTree();
        tree.root.children[0].gamebook = undefined;
        const scheduler = new ManualScheduler();
        const { ctrl, actions } = controller(tree, { scheduler });

        ctrl.gradeLearnerMove('a2a3');
        expect(ctrl.retry()).toBe(true);
        expect(actions.goToPath).toHaveBeenCalledTimes(1);
        scheduler.runNext();
        expect(actions.goToPath).toHaveBeenCalledTimes(1);

        ctrl.gradeLearnerMove('a2a3');
        ctrl.destroy();
        scheduler.runNext();
        expect(actions.goToPath).toHaveBeenCalledTimes(1);
        expect(ctrl.gradeLearnerMove('e2e4')).toBe('ignored');
    });

    test('chapter switch invalidates a delayed opponent action even if scheduler cancellation leaks', () => {
        const scheduler = new ManualScheduler();
        const { ctrl, actions } = controller(lessonTree({ e4Comment: '' }), { scheduler });
        ctrl.gradeLearnerMove('e2e4');

        const nextRoot = makeNode('root', '', 0, undefined, 'white', { mainlinePly: 0 });
        const nextMove = makeNode('next', 'next', 1, 'd2d4', 'black', { mainlinePly: 1 });
        nextRoot.children = [nextMove];
        ctrl.switchChapter({
            chapterId: 'chapter-2',
            tree: {
                root: nextRoot,
                byPath: new Map([
                    ['', nextRoot],
                    ['next', nextMove],
                ]),
                nextId: 1,
            },
            orientation: 'white',
        });
        expect(actions.goToPath).toHaveBeenCalledWith('');
        expect(ctrl.state).toMatchObject({ kind: 'prompt', chapterId: 'chapter-2', solutionMove: 'd2d4' });

        scheduler.runNext();
        expect(actions.playScriptedMove).not.toHaveBeenCalled();
        expect(ctrl.state).toMatchObject({ kind: 'prompt', chapterId: 'chapter-2' });
    });
});
