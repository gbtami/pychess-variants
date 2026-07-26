import { beforeAll, beforeEach, expect, jest, test } from '@jest/globals';

import { Step } from '../client/messages';

// analysisTree.ts calls updateMovelist/scrollToActiveMove for re-render side effects;
// those are movelist/DOM concerns, not tree logic, so stub them out for pure unit tests.
const updateMovelistMock = jest.fn();
const scrollToActiveMoveMock = jest.fn();
jest.unstable_mockModule('../client/two-board/common/movelist', () => ({
    updateMovelist: updateMovelistMock,
    scrollToActiveMove: scrollToActiveMoveMock,
}));

let AnalysisTreeController: typeof import('../client/two-board/analysis/analysisTree').AnalysisTreeController;

beforeAll(async () => {
    ({ AnalysisTreeController } = await import('../client/two-board/analysis/analysisTree'));
});

// distinct fen/move per san so addOrSelectChild's "reuse existing child" dedup
// (matched on move/fen/moveB/fenB) never conflates two different test moves
function makeStep(
    boardName: 'a' | 'b',
    turnColor: 'white' | 'black',
    san: string,
    plyA: number,
    plyB: number,
): Step {
    return {
        fen: `fen-${san || 'start'}`,
        fenB: `fenB-${san || 'start'}`,
        move: san || undefined,
        check: false,
        turnColor,
        san,
        sanSAN: san,
        boardName,
        plyA,
        plyB,
    } as Step;
}

function stubCtrl(steps: Step[]) {
    return {
        steps,
        plyVari: 0,
        ply: 0,
        gameId: 'abcd1234',
        variant: { name: 'bughouse' },
        recordedMainlinePly: undefined as number | undefined,
        goPly: jest.fn(),
    };
}

let localStorageData: Record<string, string>;

beforeEach(() => {
    updateMovelistMock.mockClear();
    scrollToActiveMoveMock.mockClear();
    localStorageData = {};
    Object.defineProperty(global, 'localStorage', {
        value: new Proxy(
            {},
            {
                get: (_t, key: string) => localStorageData[key],
                set: (_t, key: string, value: string) => {
                    localStorageData[key] = value;
                    return true;
                },
            },
        ),
        configurable: true,
    });
});

function steps4() {
    return [
        makeStep('a', 'white', '', 0, 0),
        makeStep('a', 'black', 'e4', 1, 0),
        makeStep('b', 'black', 'd4', 1, 1),
        makeStep('a', 'white', 'Nf6', 2, 1),
    ];
}

test('initAnalysisTreeAtPly builds the tree and activates the mainline path at that ply', () => {
    const ctrl = stubCtrl(steps4());
    const tree = new AnalysisTreeController(ctrl as any);

    tree.initAnalysisTreeAtPly(2);

    expect(tree.hasAnalysisTree()).toBe(true);
    expect(tree.getTreeCurrentNode()?.ply).toBe(2);
    expect(ctrl.goPly).toHaveBeenCalledWith(2, 0);
});

test('getTreeNodeForPly finds nodes both on and off the active path', () => {
    const ctrl = stubCtrl(steps4());
    const tree = new AnalysisTreeController(ctrl as any);
    tree.initAnalysisTreeAtPly(3);

    expect(tree.getTreeNodeForPly(1)?.step.san).toBe('e4');
    expect(tree.getTreeNodeForPly(3)?.step.san).toBe('Nf6');
    // a ply beyond the tree's depth clamps to the mainline end (mainlinePathAtPly's own behavior)
    expect(tree.getTreeNodeForPly(99)?.step.san).toBe('Nf6');
});

test('branch/line navigation: parent, main child, mainline end', () => {
    const ctrl = stubCtrl(steps4());
    const tree = new AnalysisTreeController(ctrl as any);
    tree.initAnalysisTreeAtPly(0);

    const root = tree.getTreeActivePath();
    expect(root).toBe('');
    const firstChild = tree.getTreeMainChildPath();
    expect(firstChild).toBeDefined();

    tree.activateTreePath(firstChild!);
    expect(tree.getTreeParentPath()).toBe('');
    expect(tree.getTreeMainlineEndPath()).not.toBe('');
});

// NOTE: this pins a pre-existing quirk in the original (pre-extraction) sendMove logic,
// faithfully preserved rather than fixed here (behavior parity is this change's contract).
// The mainline-tail push condition is evaluated a second time AFTER addOrSelectChild has
// already mutated the parent's children array, so `currentNode.children[0] === undefined`
// is always false on that second check whenever a new child was actually created — meaning
// ctrl.steps/recordedMainlinePly are never advanced via this path. This has no observable
// effect today because every consumer (PGN, goPly, movelist) reads move data from the tree
// once one exists, never from ctrl.steps beyond its initial dummy entry.
test('recordMove creates a new tree node at the mainline tail (ctrl.steps bookkeeping is not reached)', () => {
    const ctrl = stubCtrl(steps4());
    const tree = new AnalysisTreeController(ctrl as any);
    ctrl.recordedMainlinePly = 3;
    tree.initAnalysisTreeAtPly(3);

    const newStep = makeStep('b', 'white', 'e6', 2, 2);
    const before = ctrl.steps.length;
    const childPath = tree.recordMove(newStep);

    expect(childPath).toBeDefined();
    expect(tree.getTreeNodeAtPath(childPath!)?.step).toBe(newStep);
    expect(ctrl.steps.length).toBe(before);
    expect(ctrl.recordedMainlinePly).toBe(3);
});

test('recordMove returns undefined when there is no tree yet', () => {
    const ctrl = stubCtrl(steps4());
    const tree = new AnalysisTreeController(ctrl as any);

    expect(tree.recordMove(makeStep('a', 'white', 'e5', 3, 1))).toBeUndefined();
});

test('recordMove branches into a variation without touching ctrl.steps when not at the mainline tail', () => {
    const ctrl = stubCtrl(steps4());
    const tree = new AnalysisTreeController(ctrl as any);
    ctrl.recordedMainlinePly = 3;
    tree.initAnalysisTreeAtPly(1); // active path is ply 1, not the mainline end (ply 3)

    const before = ctrl.steps.length;
    const childPath = tree.recordMove(makeStep('b', 'white', 'c4', 1, 1));

    expect(childPath).toBeDefined();
    expect(ctrl.steps.length).toBe(before); // variation node, not appended to the recorded step list
});

test('context menu open/close and coordinate math relative to the movelist container', () => {
    document.body.innerHTML = '<div id="movelist" style="position:relative;"></div>';
    const movelist = document.getElementById('movelist')!;
    jest.spyOn(movelist, 'getBoundingClientRect').mockReturnValue({
        left: 10,
        top: 20,
        right: 210,
        bottom: 220,
        width: 200,
        height: 200,
        x: 10,
        y: 20,
        toJSON: () => ({}),
    });
    Object.defineProperty(movelist, 'scrollLeft', { value: 5, configurable: true });
    Object.defineProperty(movelist, 'scrollTop', { value: 7, configurable: true });

    const ctrl = stubCtrl(steps4());
    const tree = new AnalysisTreeController(ctrl as any);
    tree.initAnalysisTreeAtPly(1);

    expect(tree.getTreeContextMenu()).toBeUndefined();
    tree.openTreeContextMenu('1', 50, 60);
    expect(tree.getTreeContextMenu()).toEqual({ path: '1', x: 50 - 10 + 5, y: 60 - 20 + 7 });

    tree.closeTreeContextMenu();
    expect(tree.getTreeContextMenu()).toBeUndefined();
});

// creates a second child (branch) at the ply-2 node, giving it 2 children so it becomes
// a real collapse toggle point (toggling is a no-op on nodes with fewer than 2 children).
// Activates the root (ply 0), not ply 3: activateTreePath/revealTreePath un-collapse every
// ancestor of the newly active path, so navigating through the branch node itself (as the
// ply-3 mainline continuation does) would immediately undo a persisted collapse on it.
function branchAtPlyTwo(tree: InstanceType<typeof AnalysisTreeController>): string {
    tree.initAnalysisTreeAtPly(0);
    const ply2Path = tree.getTreeNodeForPly(2)!.path;
    tree.activateTreePath(ply2Path);
    tree.recordMove(makeStep('b', 'black', 'c4', 2, 2));
    tree.activateTreePath('');
    return ply2Path;
}

test('collapse/expand persistence round-trips through localStorage per game id', () => {
    const ctrl = stubCtrl(steps4());
    const tree = new AnalysisTreeController(ctrl as any);
    const branchParentPath = branchAtPlyTwo(tree);

    tree.toggleTreeCollapsed(branchParentPath);
    expect(tree.someTreeCollapsed(true)).toBe(true);

    // a fresh controller for the same gameId picks up the persisted collapsed state
    const ctrl2 = stubCtrl(steps4());
    const tree2 = new AnalysisTreeController(ctrl2 as any);
    branchAtPlyTwo(tree2);

    expect(tree2.someTreeCollapsed(true)).toBe(true);

    tree.expandAllTree();
    const ctrl3 = stubCtrl(steps4());
    const tree3 = new AnalysisTreeController(ctrl3 as any);
    branchAtPlyTwo(tree3);
    expect(tree3.someTreeCollapsed(true)).toBe(false);
});
