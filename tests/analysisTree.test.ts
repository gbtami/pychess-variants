import { describe, expect, test } from '@jest/globals';

import {
    addOrSelectChild,
    branchStartPath,
    createAnalysisTree,
    currentLineEndPath,
    deleteNodePath,
    forceVariationAt,
    getNodeList,
    mainlineEndPath,
    mainlinePathAtPly,
    nextBranchPath,
    pathIsForcedVariation,
    pathIsMainline,
    promoteNodePath,
    previousBranchPath,
    projectPath,
    renderFullTreePgnMoveText,
    renderLinePgnMoveText,
    someCollapsedFrom,
    setCollapsedFrom,
    stepLinePath,
} from '../client/analysis/analysisTree';
import { Step } from '../client/messages';

function makeStep(fen: string, move: string | undefined, turnColor: 'white' | 'black', san?: string): Step {
    return {
        fen,
        move,
        check: false,
        turnColor,
        san,
        sanSAN: san,
    };
}

describe('analysis tree basics', () => {
    test('builds a mainline path from persisted steps', () => {
        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
        ];
        const tree = createAnalysisTree(steps);

        const ply2Path = mainlinePathAtPly(tree, 2);
        const nodes = getNodeList(tree, ply2Path);

        expect(nodes.map((n) => n.ply)).toEqual([0, 1, 2]);
        expect(mainlineEndPath(tree)).toBe(mainlinePathAtPly(tree, 99));
    });

    test('projects off-mainline path to legacy variation payload', () => {
        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
        ];
        const tree = createAnalysisTree(steps);

        const d4 = makeStep('v1 b - - 0 1', 'd2d4', 'black', 'd4');
        const d5 = makeStep('v2 w - - 0 1', 'd7d5', 'white', 'd5');
        const d4Path = addOrSelectChild(tree, '', d4, false);
        const d5Path = addOrSelectChild(tree, d4Path, d5, false);

        const projection = projectPath(tree, d5Path);

        expect(projection.isMainline).toBe(false);
        expect(projection.anchorPly).toBe(0);
        expect(projection.targetPly).toBe(2);
        expect(projection.variationSteps.map((s) => s.move)).toEqual(['d2d4', 'd7d5']);
        expect(branchStartPath(tree, d5Path)).toBe('');
    });

    test('keeps sub-variation bounds on the current branch', () => {
        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
            makeStep('s4 w - - 0 1', 'b8c6', 'white', 'Nc6'),
        ];
        const tree = createAnalysisTree(steps);

        const c5 = makeStep('v3 w - - 0 1', 'c7c5', 'white', 'c5');
        const nf6 = makeStep('v4 b - - 0 1', 'g8f6', 'black', 'Nf6');

        const pathAtPly2 = mainlinePathAtPly(tree, 2);
        const c5Path = addOrSelectChild(tree, pathAtPly2, c5, false);
        const nf6Path = addOrSelectChild(tree, c5Path, nf6, false);

        expect(branchStartPath(tree, nf6Path)).toBe(pathAtPly2);
        expect(currentLineEndPath(tree, c5Path)).toBe(nf6Path);
    });

    test('renders full PGN movetext with root and nested variations', () => {
        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
        ];
        const tree = createAnalysisTree(steps);

        const d4Path = addOrSelectChild(tree, '', makeStep('v1 b - - 0 1', 'd2d4', 'black', 'd4'), false);
        addOrSelectChild(tree, d4Path, makeStep('v2 w - - 0 1', 'd7d5', 'white', 'd5'), false);

        const ply1Path = mainlinePathAtPly(tree, 1);
        const c5Path = addOrSelectChild(tree, ply1Path, makeStep('v3 w - - 0 1', 'c7c5', 'white', 'c5'), false);
        addOrSelectChild(tree, c5Path, makeStep('v4 b - - 0 1', 'g1f3', 'black', 'Nf3'), false);

        expect(renderFullTreePgnMoveText(tree, (node) => node.step.sanSAN ?? '')).toBe(
            '1. e4 (1. d4 d5) (1... c5 2. Nf3) e5 2. Nf3',
        );
    });

    test('renders line PGN movetext without sibling variations', () => {
        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
        ];
        const tree = createAnalysisTree(steps);

        const c5Path = addOrSelectChild(tree, mainlinePathAtPly(tree, 1), makeStep('v1 w - - 0 1', 'c7c5', 'white', 'c5'), false);
        addOrSelectChild(tree, c5Path, makeStep('v2 b - - 0 1', 'g1f3', 'black', 'Nf3'), false);

        expect(renderLinePgnMoveText(tree, mainlinePathAtPly(tree, 3), (node) => node.step.sanSAN ?? '')).toBe(
            '1. e4 e5 2. Nf3',
        );
        expect(renderLinePgnMoveText(tree, c5Path, (node) => node.step.sanSAN ?? '')).toBe(
            '1... c5 2. Nf3',
        );
    });

    test('supports branch-aware keyboard navigation paths', () => {
        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
            makeStep('s4 w - - 0 1', 'b8c6', 'white', 'Nc6'),
        ];
        const tree = createAnalysisTree(steps);

        const c5Path = addOrSelectChild(
            tree,
            mainlinePathAtPly(tree, 2),
            makeStep('v1 w - - 0 1', 'c7c5', 'white', 'c5'),
            false,
        );
        const nf3FromC5Path = addOrSelectChild(
            tree,
            c5Path,
            makeStep('v2 b - - 0 1', 'g1f3', 'black', 'Nf3'),
            false,
        );
        const e6Path = addOrSelectChild(
            tree,
            mainlinePathAtPly(tree, 2),
            makeStep('v3 w - - 0 1', 'e7e6', 'white', 'e6'),
            false,
        );

        expect(pathIsMainline(tree, mainlinePathAtPly(tree, 3))).toBe(true);
        expect(pathIsMainline(tree, c5Path)).toBe(false);
        expect(previousBranchPath(tree, nf3FromC5Path)).toBe(mainlinePathAtPly(tree, 2));
        expect(nextBranchPath(tree, mainlinePathAtPly(tree, 2), 1)).toBe(mainlineEndPath(tree));
        expect(stepLinePath(tree, c5Path, 'next')).toBe(e6Path);
        expect(stepLinePath(tree, e6Path, 'prev')).toBe(c5Path);
    });

    test('promotes and deletes variation branches', () => {
        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
        ];
        const tree = createAnalysisTree(steps);

        const c5Path = addOrSelectChild(tree, mainlinePathAtPly(tree, 1), makeStep('v1 w - - 0 1', 'c7c5', 'white', 'c5'), false);
        const e6Path = addOrSelectChild(tree, mainlinePathAtPly(tree, 1), makeStep('v2 w - - 0 1', 'e7e6', 'white', 'e6'), false);

        promoteNodePath(tree, e6Path, false);
        expect(tree.root.children[0].children.map((node) => node.step.san)).toEqual(['e6', 'e5', 'c5']);

        promoteNodePath(tree, c5Path, true);
        expect(tree.root.children[0].children.map((node) => node.step.san)).toEqual(['c5', 'e6', 'e5']);

        deleteNodePath(tree, e6Path);
        expect(tree.root.children[0].children.map((node) => node.step.san)).toEqual(['c5', 'e5']);
    });

    test('collapses and expands branches from the tree root', () => {
        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
        ];
        const tree = createAnalysisTree(steps);
        addOrSelectChild(tree, mainlinePathAtPly(tree, 1), makeStep('v1 w - - 0 1', 'c7c5', 'white', 'c5'), false);

        expect(someCollapsedFrom(tree, false)).toBe(true);
        setCollapsedFrom(tree, '', true);
        expect(someCollapsedFrom(tree, true)).toBe(true);
        setCollapsedFrom(tree, '', false);
        expect(someCollapsedFrom(tree, true)).toBe(false);
    });

    test('force variation truncates displayed mainline and copies as a variation', () => {
        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
        ];
        const tree = createAnalysisTree(steps);
        const forcedPath = mainlinePathAtPly(tree, 2);

        forceVariationAt(tree, forcedPath, true);

        expect(pathIsForcedVariation(tree, forcedPath)).toBe(true);
        expect(currentLineEndPath(tree, mainlinePathAtPly(tree, 1))).toBe(mainlinePathAtPly(tree, 1));
        expect(renderLinePgnMoveText(tree, mainlinePathAtPly(tree, 1), (node) => node.step.san ?? '')).toBe('1. e4');
        expect(renderLinePgnMoveText(tree, forcedPath, (node) => node.step.san ?? '')).toBe('1... e5 2. Nf3');
        expect(renderFullTreePgnMoveText(tree, (node) => node.step.san ?? '')).toBe('1. e4 (1... e5 2. Nf3)');
    });
});
