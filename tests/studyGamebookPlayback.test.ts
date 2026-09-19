import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import type { Step } from '../client/messages';
import type { AnalysisController } from '../client/analysis/analysisCtrl';
import type { AnalysisTree, AnalysisTreeNode } from '../client/analysis/analysisTree';
import { StudyGamebookPlayback } from '../client/study/studyGamebookPlayback';

function step(move: string | undefined, turnColor: 'white' | 'black'): Step {
    return {
        fen: `${move ?? 'root'} ${turnColor === 'white' ? 'w' : 'b'} - - 0 1`,
        ...(move ? { move } : {}),
        check: false,
        turnColor,
        san: move ?? '',
        sanSAN: move ?? '',
    };
}

function node(
    id: string,
    path: string,
    ply: number,
    move: string | undefined,
    turnColor: 'white' | 'black',
    comment?: string,
): AnalysisTreeNode {
    return {
        id,
        path,
        ply,
        step: step(move, turnColor),
        children: [],
        ...(comment
            ? {
                  annotations: {
                      shapes: [],
                      comments: [{ id: `${id}-comment`, author: 'author', text: comment }],
                      nags: [],
                  },
              }
            : {}),
    };
}

function lessonTree(): AnalysisTree {
    const root = node('root', '', 0, undefined, 'white', 'Find the move.');
    root.gamebook = { hint: 'Control the center.' };
    root.annotations = {
        ...(root.annotations ?? { comments: [], nags: [] }),
        shapes: [{ orig: 'a1', dest: 'a2', brush: 'green' }],
    };
    const e4 = node('e4', 'e4', 1, 'e2e4', 'black', 'Good move.');
    const e5 = node('e5', 'e4.e5', 2, 'e7e5', 'white', 'Now develop.');
    const nf3 = node('nf3', 'e4.e5.nf3', 3, 'g1f3', 'black', 'Finished.');
    const d4 = node('d4', 'd4', 1, 'd2d4', 'black', 'Try a different central move.');
    root.children = [e4, d4];
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
        ]),
        nextId: 1,
    };
}

function makeCtrl(tree = lessonTree()) {
    const set = jest.fn();
    const setShapes = jest.fn();
    const setAutoShapes = jest.fn();
    const cancelPremove = jest.fn();
    const ctrl: any = {
        analysisTree: tree,
        analysisPath: '',
        turnColor: 'white',
        autoShapes: [],
        variant: {
            kingRoles: ['k-piece'],
            colors: { first: 'white', second: 'black' },
        },
        chessground: {
            state: { dimensions: { width: 8, height: 8 } },
            set,
            setShapes,
            setAutoShapes,
            cancelPremove,
        },
        applyAnalysisMove: jest.fn(() => true),
        getTreeNodeAtPath: jest.fn((path: string) => tree.byPath.get(path)),
    };
    ctrl.activateTreePath = jest.fn((path: string) => {
        ctrl.analysisPath = path;
        ctrl.turnColor = tree.byPath.get(path)?.step.turnColor ?? ctrl.turnColor;
    });
    return ctrl as AnalysisController & {
        chessground: AnalysisController['chessground'] & {
            set: jest.Mock;
            setShapes: jest.Mock;
            setAutoShapes: jest.Mock;
            cancelPremove: jest.Mock;
        };
        applyAnalysisMove: jest.Mock;
        activateTreePath: jest.Mock;
    };
}

function position(node: AnalysisTreeNode, origin: 'played-move' | 'automated-reply' | 'reset' = 'played-move') {
    return {
        origin,
        path: node.path,
        previousPath: '',
        ply: node.ply,
        fen: node.step.fen,
        node,
    } as const;
}

describe('Study interactive lesson playback adapter', () => {
    beforeEach(() => {
        document.body.innerHTML =
            '<div class="analysis-tools"></div><div class="study-underboard"><div class="study-gamebook-play-buttons" hidden></div></div>';
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        document.body.replaceChildren();
    });

    test('announces lesson state and preserves keyboard focus across rerendered controls', async () => {
        const ctrl = makeCtrl();
        const playback = new StudyGamebookPlayback(ctrl, {
            chapterId: 'chapter-a11y',
            orientation: 'white',
            preview: false,
            canAnalyse: false,
            hasNextChapter: false,
        });

        const panel = document.querySelector<HTMLElement>('.study-gamebook-play')!;
        const status = panel.querySelector<HTMLElement>('.study-gamebook-play__status')!;
        expect(panel.getAttribute('role')).toBe('region');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.getAttribute('aria-atomic')).toBe('true');
        expect(status.getAttribute('aria-busy')).toBe('false');

        const hint = [...panel.querySelectorAll<HTMLButtonElement>('button')].find(button =>
            button.textContent?.includes('hint'),
        )!;
        hint.focus();
        hint.click();
        await Promise.resolve();

        expect(document.activeElement).toBe(panel.querySelector('.study-gamebook-play__hint'));
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Hide hint');
        expect(panel.querySelector<HTMLImageElement>('.study-gamebook-play__mascot')?.src).toContain(
            '/static/images/study/octopus.svg',
        );
        expect(panel.querySelector('.study-gamebook-play__title')?.textContent).toBe('Your turn');
        expect(panel.querySelector('.study-gamebook-play__message')?.textContent).toContain('white');
        expect(document.querySelector('.study-gamebook-play-buttons')?.textContent).toContain('View the solution');

        playback.destroy();
    });

    test('restricts board input and navigation while disabling queued premoves', () => {
        const ctrl = makeCtrl();
        const playback = new StudyGamebookPlayback(ctrl, {
            chapterId: 'chapter-1',
            orientation: 'white',
            preview: false,
            canAnalyse: false,
            hasNextChapter: false,
        });

        expect(ctrl.chessground.cancelPremove).toHaveBeenCalled();
        expect(ctrl.chessground.set).toHaveBeenCalledWith(expect.objectContaining({ premovable: { enabled: false } }));
        expect(playback.boardInput('white')).toBe('white');
        expect(playback.boardInput('black')).toBe(false);
        expect(playback.beforeMoveApplied({ move: 'e2e4', origin: 'played-move', path: '' })).toBe(true);
        ctrl.turnColor = 'black';
        expect(playback.beforeMoveApplied({ move: 'e2e4', origin: 'played-move', path: '' })).toBe(false);
        expect(playback.canActivatePath('e4', 'user-navigation')).toBe(false);
        expect(playback.canActivatePath('', 'shared-position')).toBe(false);
        expect(playback.canActivatePath('', 'reset')).toBe(true);
        expect(playback.allowTreeContextMenu()).toBe(false);
        expect(playback.areTreeNodeAnnotationsVisible()).toBe(false);
        expect(playback.isTreeNodeVisible(ctrl.analysisTree!.root)).toBe(true);
        expect(playback.isTreeNodeVisible(ctrl.analysisTree!.byPath.get('e4')!)).toBe(false);

        playback.destroy();
    });

    test('keeps solution auto-shapes separate from authored drawings and supports rank-10 coordinates safely', () => {
        const tree = lessonTree();
        tree.root.children[0].step.move = 'e9e10';
        const ctrl = makeCtrl(tree);
        ctrl.chessground.state.dimensions = { width: 10, height: 10 };
        const playback = new StudyGamebookPlayback(ctrl, {
            chapterId: 'chapter-1',
            orientation: 'white',
            preview: false,
            canAnalyse: false,
            hasNextChapter: false,
        });

        const solution = [...document.querySelectorAll<HTMLButtonElement>('.study-gamebook-play-buttons button')].find(
            button => button.textContent?.includes('View the solution'),
        );
        solution?.click();
        expect(ctrl.chessground.setAutoShapes).toHaveBeenLastCalledWith([
            expect.objectContaining({ orig: 'e9', dest: 'e:', brush: 'paleGreen' }),
        ]);

        playback.onShapesChanged();
        expect(ctrl.chessground.setShapes).toHaveBeenLastCalledWith([
            expect.objectContaining({ orig: 'a1', dest: 'a2' }),
        ]);

        playback.destroy();
        expect(ctrl.chessground.setAutoShapes).toHaveBeenLastCalledWith([]);

        const dropTree = lessonTree();
        dropTree.root.children[0].step.move = 'P@j10';
        const dropCtrl = makeCtrl(dropTree);
        dropCtrl.chessground.state.dimensions = { width: 10, height: 10 };
        const dropPlayback = new StudyGamebookPlayback(dropCtrl, {
            chapterId: 'chapter-drop',
            orientation: 'white',
            preview: false,
            canAnalyse: false,
            hasNextChapter: false,
        });
        const dropSolution = [
            ...document.querySelectorAll<HTMLButtonElement>('.study-gamebook-play-buttons button'),
        ].find(button => button.textContent?.includes('View the solution'));
        dropSolution?.click();
        expect(dropCtrl.chessground.setAutoShapes).toHaveBeenLastCalledWith([
            expect.objectContaining({ orig: 'j:', brush: 'paleGreen' }),
        ]);
        dropPlayback.destroy();
    });

    test('grades learner moves, guards scripted replies and exposes Analysis only after completion', () => {
        const ctrl = makeCtrl();
        const onAnalyse = jest.fn();
        const playback = new StudyGamebookPlayback(ctrl, {
            chapterId: 'chapter-1',
            orientation: 'white',
            preview: false,
            canAnalyse: true,
            hasNextChapter: false,
            onAnalyse,
        });

        const wrong = ctrl.analysisTree!.byPath.get('d4')!;
        ctrl.analysisPath = wrong.path;
        ctrl.turnColor = wrong.step.turnColor;
        playback.onPositionChanged(position(wrong));
        expect(document.querySelector('.study-gamebook-play__feedback.bad')?.textContent).toContain('Retry');
        expect(document.querySelector('.study-gamebook-play__feedback.bad .icon-refresh')).not.toBeNull();
        expect(document.querySelector('.study-gamebook-play__comment-content')?.textContent).toContain(
            'Try a different central move.',
        );
        expect(playback.beforeMoveApplied({ move: 'c2c4', origin: 'played-move', path: wrong.path })).toBe(false);

        document.querySelector<HTMLButtonElement>('.study-gamebook-play__feedback.bad')?.click();
        expect(ctrl.activateTreePath).toHaveBeenCalledWith('', true, 'reset');
        expect(document.querySelector('.study-gamebook-play__title')?.textContent).toBe('Your turn');

        const e4 = ctrl.analysisTree!.byPath.get('e4')!;
        ctrl.analysisPath = e4.path;
        ctrl.turnColor = e4.step.turnColor;
        playback.onPositionChanged(position(e4));
        expect(document.querySelector('.study-gamebook-play__feedback.good')?.textContent).toContain('Next');
        expect(document.querySelector('.study-gamebook-play__feedback.good .icon-play')).not.toBeNull();
        expect(document.body.textContent).not.toContain('Analysis');

        document.querySelector<HTMLButtonElement>('.study-gamebook-play__feedback.good')?.click();
        jest.runOnlyPendingTimers();
        expect(ctrl.applyAnalysisMove).toHaveBeenCalledWith('e7e5', 'automated-reply');
        expect(document.querySelector('.study-gamebook-play__title')?.textContent).toBe('Your turn');

        const nf3 = ctrl.analysisTree!.byPath.get('e4.e5.nf3')!;
        ctrl.analysisPath = nf3.path;
        ctrl.turnColor = nf3.step.turnColor;
        playback.onPositionChanged(position(nf3));
        const end = document.querySelector<HTMLElement>('.study-gamebook-play__feedback.end')!;
        expect(end.textContent).toContain('Play again');
        expect(end.querySelector('.study-gamebook-play__end-action.retry .icon-refresh')).not.toBeNull();
        expect(document.body.textContent).not.toContain('Next chapter');
        const analysis = [...document.querySelectorAll<HTMLButtonElement>('.study-gamebook-play button')].find(
            button => button.textContent === 'Analysis',
        );
        expect(analysis).toBeDefined();
        expect(analysis?.querySelector('.icon-microscope')).not.toBeNull();
        analysis?.click();
        expect(onAnalyse).toHaveBeenCalledTimes(1);

        playback.destroy();
    });

    test('matches lichess icon treatment for completed lesson actions', () => {
        const ctrl = makeCtrl();
        const nextChapter = jest.fn();
        const analyse = jest.fn();
        const playback = new StudyGamebookPlayback(ctrl, {
            chapterId: 'chapter-icons',
            orientation: 'white',
            preview: false,
            canAnalyse: true,
            hasNextChapter: true,
            onNextChapter: nextChapter,
            onAnalyse: analyse,
        });

        const e4 = ctrl.analysisTree!.byPath.get('e4')!;
        ctrl.analysisPath = e4.path;
        ctrl.turnColor = e4.step.turnColor;
        playback.onPositionChanged(position(e4));
        document.querySelector<HTMLButtonElement>('.study-gamebook-play__feedback.good')?.click();
        jest.runOnlyPendingTimers();

        const nf3 = ctrl.analysisTree!.byPath.get('e4.e5.nf3')!;
        ctrl.analysisPath = nf3.path;
        ctrl.turnColor = nf3.step.turnColor;
        playback.onPositionChanged(position(nf3));

        const end = document.querySelector<HTMLElement>('.study-gamebook-play__feedback.end')!;
        expect(end.querySelector('.study-gamebook-play__end-action.next .icon-play')).not.toBeNull();
        expect(end.querySelector('.study-gamebook-play__end-action.retry .icon-refresh')).not.toBeNull();
        expect(end.querySelector('.study-gamebook-play__end-action.analyse .icon-microscope')).not.toBeNull();

        playback.destroy();
    });

    test('freezes board input and stale timers while an authoritative script reload is pending', () => {
        const ctrl = makeCtrl();
        const playback = new StudyGamebookPlayback(ctrl, {
            chapterId: 'chapter-1',
            orientation: 'white',
            preview: false,
            canAnalyse: false,
            hasNextChapter: false,
        });

        playback.suspendForScriptReload();

        expect(playback.boardInput('white')).toBe(false);
        expect(playback.beforeMoveApplied({ move: 'e2e4', origin: 'played-move', path: '' })).toBe(false);
        expect(playback.canActivatePath('e4', 'played-move')).toBe(false);
        expect(playback.canActivatePath('', 'reset')).toBe(true);
        expect(document.querySelector('.study-gamebook-play__title')?.textContent).toBe('Lesson updated');
        expect(document.body.textContent).toContain('Reloading the latest lesson');
        jest.runOnlyPendingTimers();
        expect(ctrl.applyAnalysisMove).not.toHaveBeenCalled();

        playback.destroy();
    });

    test('Space activates feedback controls without re-enabling tree keyboard navigation', () => {
        const ctrl = makeCtrl();
        const playback = new StudyGamebookPlayback(ctrl, {
            chapterId: 'chapter-1',
            orientation: 'white',
            preview: true,
            canAnalyse: false,
            hasNextChapter: false,
            onReturnToEditor: jest.fn(),
        });
        const wrong = ctrl.analysisTree!.byPath.get('d4')!;
        ctrl.analysisPath = wrong.path;
        ctrl.turnColor = wrong.step.turnColor;
        playback.onPositionChanged(position(wrong));

        const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        document.body.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(ctrl.activateTreePath).toHaveBeenCalledWith('', true, 'reset');
        expect(playback.canActivatePath('e4', 'user-navigation')).toBe(false);
        expect(document.querySelector('.study-gamebook-play-buttons')?.textContent).toContain('Preview');

        playback.destroy();
    });
});
