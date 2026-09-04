import { describe, expect, test } from '@jest/globals';

import { addOrSelectChild, createAnalysisTree, forceVariationAt } from '../client/analysis/analysisTree';
import { Step } from '../client/messages';
import {
    addStudyNodeToAnalysisTree,
    analysisTreeFromStudy,
    isStudyNodeId,
    newStudyNodeId,
    refreshStudyMainline,
    studyTreeFromAnalysisTree,
    StudyTreeDto,
} from '../client/study/studyTree';

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

describe('Study tree persistence adapter', () => {
    test('creates compact collision-resistant stable node IDs', () => {
        const ids = new Set(Array.from({ length: 200 }, () => newStudyNodeId()));
        expect(ids.size).toBe(200);
        expect([...ids].every(isStudyNodeId)).toBe(true);
    });

    test('round-trips analysis tree ordering and forceVariation through stable DTOs', () => {
        const rootStep = makeStep('start w - - 0 1', undefined, 'white');
        const e4 = makeStep('e4 b - - 0 1', 'e2e4', 'black', 'e4');
        const e5 = makeStep('e5 w - - 0 2', 'e7e5', 'white', 'e5');
        const tree = createAnalysisTree([rootStep, e4, e5]);
        const d4Path = addOrSelectChild(tree, '', makeStep('d4 b - - 0 1', 'd2d4', 'black', 'd4'), false);
        forceVariationAt(tree, d4Path, true);

        const dto = studyTreeFromAnalysisTree(tree);
        expect(dto.nodes).toHaveLength(3);
        expect(dto.nodes.every(node => isStudyNodeId(node.id))).toBe(true);
        expect(dto.nodes.filter(node => node.parentId === null).map(node => node.move)).toEqual(['e2e4', 'd2d4']);
        expect(dto.nodes.find(node => node.move === 'd2d4')?.forceVariation).toBe(true);

        const restored = analysisTreeFromStudy(rootStep, dto);
        expect(restored.root.children.map(node => node.step.move)).toEqual(['e2e4', 'd2d4']);
        expect(restored.root.children[1].forceVariation).toBe(true);
        expect(restored.root.children[0].children[0].step.move).toBe('e7e5');
        expect(restored.root.children[0].mainlinePly).toBe(1);
        expect(restored.root.children[1].mainlinePly).toBeUndefined();
    });

    test('loaded Study trees allocate stable IDs for newly explored moves', () => {
        const rootStep = makeStep('start w - - 0 1', undefined, 'white');
        const dto: StudyTreeDto = {
            nodes: [
                {
                    id: 'StudyNode1',
                    parentId: null,
                    order: 0,
                    move: 'e2e4',
                    fen: 'e4 b - - 0 1',
                    turnColor: 'black',
                    check: false,
                    san: 'e4',
                },
            ],
        };
        const tree = analysisTreeFromStudy(rootStep, dto);
        const newPath = addOrSelectChild(tree, 'StudyNode1', makeStep('c5 w - - 0 2', 'c7c5', 'white', 'c5'), false);
        const newId = newPath.split('.').at(-1);

        expect(isStudyNodeId(newId)).toBe(true);
        expect(newId).not.toBe('StudyNode1');
    });

    test('attaches one server Study node without rebuilding the tree', () => {
        const rootStep = makeStep('start w - - 0 1', undefined, 'white');
        const tree = analysisTreeFromStudy(rootStep, { nodes: [] });
        const node = {
            id: 'StudyNode1',
            parentId: null,
            order: 0,
            move: 'e2e4',
            fen: 'e4 b - - 0 1',
            turnColor: 'black' as const,
            check: false,
            san: 'e4',
        };

        expect(addStudyNodeToAnalysisTree(tree, '', node)).toBe('StudyNode1');
        expect(tree.root.children[0].id).toBe('StudyNode1');
        expect(
            addStudyNodeToAnalysisTree(tree, '', {
                ...node,
                id: 'StudyNode2',
                order: 2,
                move: 'd2d4',
            }),
        ).toBeUndefined();
    });

    test('recomputes mutable Study mainline metadata after tree reordering', () => {
        const rootStep = makeStep('start w - - 0 1', undefined, 'white');
        const tree = analysisTreeFromStudy(rootStep, {
            nodes: [
                {
                    id: 'StudyNode1',
                    parentId: null,
                    order: 0,
                    move: 'e2e4',
                    fen: 'e4 b - - 0 1',
                    turnColor: 'black',
                    check: false,
                    san: 'e4',
                },
                {
                    id: 'StudyNode2',
                    parentId: null,
                    order: 1,
                    move: 'd2d4',
                    fen: 'd4 b - - 0 1',
                    turnColor: 'black',
                    check: false,
                    san: 'd4',
                },
            ],
        });
        tree.root.children = [tree.root.children[1], tree.root.children[0]];

        const steps = refreshStudyMainline(tree);

        expect(steps.map(step => step.move)).toEqual([undefined, 'd2d4']);
        expect(tree.root.children[0].mainlinePly).toBe(1);
        expect(tree.root.children[1].mainlinePly).toBeUndefined();

        tree.root.children[0].forceVariation = true;
        expect(refreshStudyMainline(tree).map(step => step.move)).toEqual([undefined]);
        expect(tree.root.children[0].mainlinePly).toBeUndefined();
    });

    test('rejects invalid parent graphs instead of partially restoring them', () => {
        const rootStep = makeStep('start w - - 0 1', undefined, 'white');
        const cyclic: StudyTreeDto = {
            nodes: [
                {
                    id: 'StudyNode1',
                    parentId: 'StudyNode2',
                    order: 0,
                    move: 'e2e4',
                    fen: 'e4 b - - 0 1',
                    turnColor: 'black',
                    check: false,
                },
                {
                    id: 'StudyNode2',
                    parentId: 'StudyNode1',
                    order: 0,
                    move: 'e7e5',
                    fen: 'e5 w - - 0 2',
                    turnColor: 'white',
                    check: false,
                },
            ],
        };

        expect(() => analysisTreeFromStudy(rootStep, cyclic)).toThrow('parent cycle');
    });
});
