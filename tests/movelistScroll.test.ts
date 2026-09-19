import { afterEach, expect, jest, test } from '@jest/globals';

import { createAnalysisTree } from '../client/analysis/analysisTree';
import type { GameController } from '../client/gameCtrl';
import type { Step } from '../client/messages';
import { selectMove, updateMovelist } from '../client/movelist';

afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
});

function rect(top: number, height: number): DOMRect {
    return { top, bottom: top + height, height } as DOMRect;
}

test.each(['inner', 'outer'])('navigation scrolls the %s container using viewport geometry', scroller => {
    document.body.innerHTML =
        '<div class="movelist-block"><div id="movelist"><line><move ply="1">e4</move></line></div></div>';
    const list = document.getElementById('movelist')!;
    const block = list.parentElement!;
    const active = list.querySelector<HTMLElement>('move')!;
    Object.defineProperty(list, 'scrollHeight', { value: scroller === 'inner' ? 1000 : 200 });
    Object.defineProperty(list, 'clientHeight', { value: 200 });
    const container = scroller === 'inner' ? list : block;
    container.scrollTop = 400;
    jest.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(100, 200));
    jest.spyOn(active, 'getBoundingClientRect').mockReturnValue(rect(500, 20));
    // offsetTop belongs to the positioned variation line, not the scroll panel.
    Object.defineProperty(active, 'offsetTop', { value: 0 });
    const ctrl = {
        ply: 1,
        steps: [{}, {}],
        goPly: jest.fn(),
    } as unknown as GameController;

    selectMove(ctrl, 1);

    expect(container.scrollTop).toBe(710);
    expect((scroller === 'inner' ? block : list).scrollTop).toBe(0);
    expect(active.classList.contains('active')).toBe(true);
});

test('returning to the initial position scrolls to the top', () => {
    document.body.innerHTML = '<div id="movelist"></div>';
    const list = document.getElementById('movelist')!;
    list.scrollTop = 400;
    selectMove({ ply: 0, steps: [{}], goPly: jest.fn() } as unknown as GameController, 0);
    expect(list.scrollTop).toBe(0);
});

test.each(['inner', 'outer'])('a tree redraw preserves %s scrolling without navigation', scroller => {
    document.body.innerHTML =
        '<div class="movelist-block"><div id="movelist" class="tview2"><move>e4</move></div></div>';
    const list = document.getElementById('movelist')!;
    const block = list.parentElement!;
    jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.id === 'movelist' && scroller === 'inner' ? 1000 : 200;
    });
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    const container = scroller === 'inner' ? list : block;
    container.scrollTop = 400;
    const root = { fen: 'start w - - 0 1', turnColor: 'white', san: '' } as Step;
    const tree = createAnalysisTree([root]);
    const ctrl = {
        analysisTree: tree,
        hasAnalysisTree: () => true,
        ply: 0,
        status: -1,
    } as unknown as GameController;

    updateMovelist(ctrl, true, false);

    const newList = document.getElementById('movelist')!;
    expect((scroller === 'inner' ? newList : block).scrollTop).toBe(400);
});

test('tree selectMove keeps ordinary analysis navigation unchanged without an extension', () => {
    document.body.innerHTML = '<div id="movelist"></div>';
    const steps = [
        { fen: 'start w - - 0 1', turnColor: 'white', san: '' },
        { fen: 's1 b - - 0 1', move: 'e2e4', turnColor: 'black', san: 'e4' },
    ] as Step[];
    const tree = createAnalysisTree(steps);
    const goPly = jest.fn();
    const activateTreePly = jest.fn();
    const ctrl = {
        steps,
        status: -1,
        result: '*',
        ply: 1,
        plyVari: 0,
        variant: { name: 'chess' },
        fog: false,
        mycolor: 'white',
        spectator: true,
        analysisTree: tree,
        hasAnalysisTree: () => true,
        isTreeInlineNotation: () => false,
        getTreeActivePath: () => tree.root.children[0].path,
        goPly,
        activateTreePly,
    } as unknown as GameController;

    selectMove(ctrl, 1);

    expect(goPly).toHaveBeenCalledWith(1, 0);
    expect(activateTreePly).not.toHaveBeenCalled();
});

test('tree selectMove routes navigation through the policy-aware active-line controller', () => {
    const activateTreePly = jest.fn();
    const ctrl = {
        hasAnalysisTree: () => true,
        analysisExtension: {},
        activateTreePly,
    } as unknown as GameController;

    selectMove(ctrl, 3);

    expect(activateTreePly).toHaveBeenCalledWith(3);
});

test('tree visibility policy omits hidden continuations from the rendered movelist', () => {
    document.body.innerHTML = '<div id="movelist"></div>';
    const steps = [
        { fen: 'start w - - 0 1', turnColor: 'white', san: '' },
        { fen: 's1 b - - 0 1', move: 'e2e4', turnColor: 'black', san: 'e4' },
        { fen: 's2 w - - 0 1', move: 'e7e5', turnColor: 'white', san: 'e5' },
    ] as Step[];
    const tree = createAnalysisTree(steps);
    const hiddenPath = tree.root.children[0].children[0].path;
    const ctrl = {
        steps,
        status: -1,
        result: '*',
        ply: 1,
        plyVari: 0,
        variant: { name: 'chess' },
        fog: false,
        mycolor: 'white',
        spectator: true,
        analysisTree: tree,
        analysisExtension: { isTreeNodeVisible: (node: { path: string }) => node.path !== hiddenPath },
        hasAnalysisTree: () => true,
        isTreeInlineNotation: () => false,
        getTreeActivePath: () => tree.root.children[0].path,
        activateTreePath: () => undefined,
    } as unknown as GameController;

    updateMovelist(ctrl, true, false, false);

    expect([...document.querySelectorAll('#movelist move:not(.empty)')].map(node => node.textContent)).toEqual(['e4']);
});
