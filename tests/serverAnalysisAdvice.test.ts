import { describe, expect, test } from '@jest/globals';
import {
    addOrSelectChild,
    createAnalysisTree,
    mainlinePathAtPly,
    mergeServerAdvice,
    renderFullTreePgnMoveText,
    renderNodeAnnotations,
} from '../client/analysis/analysisTree';
import type { Ceval, Step } from '../client/messages';
import { updateMovelist } from '../client/movelist';

const step = (move: string | undefined, san: string, turnColor: Step['turnColor']): Step => ({
    move,
    san,
    sanSAN: san,
    fen: `${san} ${turnColor === 'white' ? 'w' : 'b'} - - 0 1`,
    turnColor,
    check: false,
});
const steps = (): Step[] => [
    step(undefined, 'start', 'white'),
    step('e2e4', 'e4', 'black'),
    step('e7e5', 'e5', 'white'),
];
const evaluation = (): Ceval => ({
    d: 18,
    s: { cp: 400 },
    p: 'f1c4 b8c6',
    advice: {
        nag: 4,
        comment: 'Blunder. c5 was best.',
        variation: [step('c7c5', 'c5', 'white'), step('g1f3', 'Nf3', 'black'), step('d7d6', 'd6', 'white')],
    },
});

describe('server analysis advice', () => {
    test('saved analysis renders comments, NAGs and the before-move alternative', () => {
        const saved = steps();
        saved[2].analysis = evaluation();
        const tree = createAnalysisTree(saved);
        const e4 = tree.root.children[0];
        expect(e4.children.map(node => node.step.move)).toEqual(['e7e5', 'c7c5']);
        expect(e4.children[0].annotations?.nags).toEqual([4]);
        expect(e4.children[1].mainlinePly).toBeUndefined();
        expect(e4.children[0].step.analysis?.p).toBe('f1c4 b8c6');
        expect(renderFullTreePgnMoveText(tree, node => node.step.san!, renderNodeAnnotations)).toBe(
            '1. e4 e5 $4 {Blunder. c5 was best.} (1... c5 2. Nf3 d6)',
        );
    });

    test('live overlapping results reuse branches and preserve human annotations', () => {
        const tree = createAnalysisTree(steps());
        const e4Path = mainlinePathAtPly(tree, 1);
        const c5Path = addOrSelectChild(tree, e4Path, evaluation().advice!.variation[0]);
        tree.byPath.get(c5Path)!.annotations = {
            shapes: [],
            comments: [{ id: 'human', author: 'tester', text: 'My line' }],
            nags: [5],
        };
        mergeServerAdvice(tree, 2, evaluation());
        const size = tree.byPath.size;
        mergeServerAdvice(tree, 2, evaluation());
        expect(tree.byPath.size).toBe(size);
        expect(tree.byPath.get(c5Path)!.annotations?.comments[0].text).toBe('My line');
        const e5 = tree.byPath.get(mainlinePathAtPly(tree, 2))!;
        expect(e5.annotations?.comments).toHaveLength(1);
        expect(e5.annotations?.nags).toEqual([4]);
    });

    test('post-game move list displays live advice and a selectable alternative', () => {
        document.body.innerHTML = '<div id="movelist"></div>';
        const saved = steps();
        const tree = createAnalysisTree(saved);
        let selected = mainlinePathAtPly(tree, 2);
        const ctrl = {
            steps: saved,
            status: 1,
            result: '*',
            ply: 2,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            variant: { name: 'chess' },
            fog: false,
            mycolor: 'white',
            spectator: true,
            recordedMainlinePly: 2,
            analysisTree: tree,
            hasAnalysisTree: () => true,
            isTreeInlineNotation: () => false,
            isTreeDisclosureMode: () => false,
            getTreeActivePath: () => selected,
            activateTreePath: (path: string) => {
                selected = path;
            },
            toggleTreeCollapsed: () => undefined,
        } as any;
        updateMovelist(ctrl, true, false, false);
        expect(document.querySelector('#movelist .tree-comment')).toBeNull();
        mergeServerAdvice(tree, 2, evaluation());
        updateMovelist(ctrl, true, false, false);
        expect(document.querySelector('#movelist .tree-comment')?.textContent).toBe('Blunder. c5 was best.');
        expect(document.querySelector('#movelist glyph.blunder')?.textContent).toBe('??');
        const alternative = tree.root.children[0].children[1];
        const move = document.querySelector<HTMLElement>(`#movelist move[data-path="${alternative.path}"]`)!;
        expect(move.textContent).toContain('c5');
        move.click();
        expect(selected).toBe(alternative.path);
    });

    test('old saved scores and PVs remain unchanged without synthesized annotations', () => {
        const saved = steps();
        saved[2].analysis = { d: 18, s: { cp: 400 }, p: 'f1c4 b8c6' };
        const tree = createAnalysisTree(saved);
        const e4 = tree.root.children[0];
        expect(e4.children).toHaveLength(1);
        expect(e4.children[0].annotations).toBeUndefined();
        expect(e4.children[0].step.analysis).toEqual(saved[2].analysis);
        expect(renderFullTreePgnMoveText(tree, node => node.step.san!, renderNodeAnnotations)).toBe('1. e4 e5');
    });
});
