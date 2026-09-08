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
