import { describe, expect, test } from '@jest/globals';

import type { AnalysisTreeNode } from '../client/analysis/analysisTree';
import type { Step } from '../client/messages';
import { StudyConcealController } from '../client/study/studyConceal';
import { studySessionPolicy } from '../client/study/studyMode';
import { analysisTreeFromStudy, type StudyTreeNodeDto } from '../client/study/studyTree';

function rootStep(): Step {
    return {
        fen: 'start w - - 0 1',
        check: false,
        turnColor: 'white',
        san: '',
        sanSAN: '',
    };
}

function node(
    id: string,
    parentId: string | null,
    order: number,
    move: string,
    san: string,
    turnColor: 'white' | 'black',
): StudyTreeNodeDto {
    return {
        id,
        parentId,
        order,
        move,
        fen: `${id} ${turnColor === 'white' ? 'w' : 'b'} - - 0 1`,
        turnColor,
        check: false,
        san,
        sanSAN: san,
    };
}

function fixture() {
    const tree = analysisTreeFromStudy(rootStep(), {
        nodes: [
            node('StudyNode1', null, 0, 'e2e4', 'e4', 'black'),
            node('StudyNode2', 'StudyNode1', 0, 'e7e5', 'e5', 'white'),
            node('StudyNode3', 'StudyNode2', 0, 'g1f3', 'Nf3', 'black'),
            node('StudyNode4', 'StudyNode1', 1, 'c7c5', 'c5', 'white'),
        ],
    });
    const get = (path: string): AnalysisTreeNode => {
        const result = tree.byPath.get(path);
        if (!result) throw new Error(`Missing fixture node ${path}`);
        return result;
    };
    return {
        tree,
        e4: get('StudyNode1'),
        e5: get('StudyNode1.StudyNode2'),
        nf3: get('StudyNode1.StudyNode2.StudyNode3'),
        c5: get('StudyNode1.StudyNode4'),
    };
}

function policy(canWrite: boolean) {
    return studySessionPolicy({
        mode: 'conceal',
        canWrite,
        computerAllowed: true,
        savedRecording: true,
        savedSynchronization: true,
        activeGame: false,
    });
}

describe('Study conceal presentation controller', () => {
    test('reader sees only the persisted reveal boundary until a move is actually played', () => {
        const { tree, e4, e5, nf3, c5 } = fixture();
        const host = { analysisTree: tree, analysisPath: 'StudyNode1' };
        const conceal = new StudyConcealController(host, 1, policy(false));

        expect(conceal.isTreeNodeVisible(tree.root)).toBe(true);
        expect(conceal.isTreeNodeVisible(e4)).toBe(true);
        expect(conceal.isTreeNodeVisible(e5)).toBe(false);
        expect(conceal.isTreeNodeVisible(nf3)).toBe(false);
        expect(conceal.isTreeNodeVisible(c5)).toBe(false);
        expect(conceal.canActivatePath(e5.path, 'user-navigation')).toBe(false);
        expect(conceal.canActivatePath(e5.path, 'played-move')).toBe(true);

        host.analysisPath = e5.path;
        expect(conceal.isTreeNodeVisible(e5)).toBe(true);
        expect(conceal.isTreeNodeVisible(nf3)).toBe(false);
        expect(conceal.isTreeNodeVisible(c5)).toBe(false);
        expect(conceal.areTreeNodeAnnotationsVisible(e5)).toBe(false);
        expect(conceal.canActivatePath(e4.path, 'user-navigation')).toBe(true);
    });

    test('only an immediate played child may enter a concealed path, while presenter sync is explicit', () => {
        const { tree, e4, e5, nf3, c5 } = fixture();
        const host = { analysisTree: tree, analysisPath: e4.path };
        const conceal = new StudyConcealController(host, 1, policy(false));

        expect(conceal.canActivatePath(nf3.path, 'played-move')).toBe(false);
        expect(conceal.canActivatePath(c5.path, 'user-navigation')).toBe(false);
        expect(conceal.canActivatePath(c5.path, 'shared-position')).toBe(true);

        conceal.setConcealPly(2);
        expect(conceal.canActivatePath(e5.path, 'user-navigation')).toBe(true);
        expect(conceal.areTreeNodeAnnotationsVisible(e5)).toBe(true);
    });

    test('author sees the full tree with unrevealed content marked', () => {
        const { tree, e4, e5, c5 } = fixture();
        const host = { analysisTree: tree, analysisPath: e4.path };
        const conceal = new StudyConcealController(host, 1, policy(true));

        expect(conceal.isTreeNodeVisible(e5)).toBe(true);
        expect(conceal.isTreeNodeVisible(c5)).toBe(true);
        expect(conceal.isTreeNodeConcealed(e4)).toBe(false);
        expect(conceal.isTreeNodeConcealed(e5)).toBe(true);
        expect(conceal.isTreeNodeConcealed(c5)).toBe(true);
        expect(conceal.allowTreeContextMenu()).toBe(true);
        expect(conceal.areBoardShapesVisible()).toBe(true);
    });
});
