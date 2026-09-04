import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { forceVariationAt, promoteNodePath } from '../client/analysis/analysisTree';
import { Step } from '../client/messages';
import { addStudyNodeToAnalysisTree, analysisTreeFromStudy, type StudyTreeNodeDto } from '../client/study/studyTree';

const updateMovelistMock = jest.fn();
jest.unstable_mockModule('../client/movelist', () => ({
    updateMovelist: updateMovelistMock,
}));

let StudyAnalysisExtension: typeof import('../client/study/studySync').StudyAnalysisExtension;

beforeAll(async () => {
    ({ StudyAnalysisExtension } = await import('../client/study/studySync'));
});

function rootStep(): Step {
    return {
        fen: 'start w - - 0 1',
        check: false,
        turnColor: 'white',
        san: '',
        sanSAN: '',
    };
}

function e4Node(): StudyTreeNodeDto {
    return {
        id: 'StudyNode1',
        parentId: null,
        order: 0,
        move: 'e2e4',
        fen: 'e4 b - - 0 1',
        turnColor: 'black',
        check: false,
        san: 'e4',
        sanSAN: 'e4',
    };
}

function makeCtrl() {
    const tree = analysisTreeFromStudy(rootStep(), { nodes: [] });
    const ctrl: any = {
        analysisTree: tree,
        analysisPath: '',
        steps: [tree.root.step],
        recordedMainlinePly: undefined,
        doSend: jest.fn(),
    };
    ctrl.activateTreePath = jest.fn((path: string) => {
        ctrl.analysisPath = path;
    });
    return ctrl;
}

describe('Study analysis websocket synchronization', () => {
    beforeEach(() => updateMovelistMock.mockClear());

    test('serializes optimistic mutations behind revision acknowledgements', () => {
        const ctrl = makeCtrl();
        const reload = jest.fn();
        const ids = ['Operation1', 'Operation2'];
        const extension = new StudyAnalysisExtension(ctrl, {
            studyId: 'study001',
            chapterId: 'chapter1',
            revision: 0,
            onReloadRequired: reload,
            opIdFactory: () => ids.shift()!,
        });
        const node = e4Node();
        expect(addStudyNodeToAnalysisTree(ctrl.analysisTree, '', node)).toBe(node.id);

        extension.onSocketOpen();
        extension.onNodeAdded('', ctrl.analysisTree.root.children[0]);
        forceVariationAt(ctrl.analysisTree, node.id, true);
        extension.onVariationForced(node.id, true);

        expect(ctrl.doSend).toHaveBeenCalledTimes(1);
        expect(ctrl.doSend).toHaveBeenNthCalledWith(1, {
            type: 'study_add_node',
            studyId: 'study001',
            chapterId: 'chapter1',
            clientOpId: 'Operation1',
            expectedRevision: 0,
            parentPath: '',
            move: 'e2e4',
            nodeId: 'StudyNode1',
        });
        expect(extension.pendingCount).toBe(2);

        extension.onSocketMessage('study_add_node', {
            type: 'study_add_node',
            studyId: 'study001',
            chapterId: 'chapter1',
            clientOpId: 'Operation1',
            revision: 1,
            changed: true,
            path: 'StudyNode1',
            parentPath: '',
            node,
        });

        expect(ctrl.doSend).toHaveBeenCalledTimes(2);
        expect(ctrl.doSend).toHaveBeenNthCalledWith(2, {
            type: 'study_force_variation',
            studyId: 'study001',
            chapterId: 'chapter1',
            clientOpId: 'Operation2',
            expectedRevision: 1,
            path: 'StudyNode1',
            force: true,
        });
        expect(extension.revision).toBe(1);
        expect(reload).not.toHaveBeenCalled();
    });

    test('applies a remote node incrementally and advances the revision', () => {
        const ctrl = makeCtrl();
        const reload = jest.fn();
        const extension = new StudyAnalysisExtension(ctrl, {
            studyId: 'study001',
            chapterId: 'chapter1',
            revision: 0,
            onReloadRequired: reload,
        });

        extension.onSocketMessage('study_add_node', {
            type: 'study_add_node',
            studyId: 'study001',
            chapterId: 'chapter1',
            clientOpId: 'Remote1',
            revision: 1,
            changed: true,
            parentPath: '',
            path: 'StudyNode1',
            node: e4Node(),
        });

        expect(ctrl.analysisTree.root.children[0].id).toBe('StudyNode1');
        expect(ctrl.steps.map((step: Step) => step.move)).toEqual([undefined, 'e2e4']);
        expect(extension.revision).toBe(1);
        expect(updateMovelistMock).toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    test('reloads instead of merging a competing remote edit while a local edit is pending', () => {
        const ctrl = makeCtrl();
        const reload = jest.fn();
        const extension = new StudyAnalysisExtension(ctrl, {
            studyId: 'study001',
            chapterId: 'chapter1',
            revision: 0,
            onReloadRequired: reload,
            opIdFactory: () => 'LocalOp1',
        });
        const node = e4Node();
        addStudyNodeToAnalysisTree(ctrl.analysisTree, '', node);
        extension.onSocketOpen();
        extension.onNodeAdded('', ctrl.analysisTree.root.children[0]);

        extension.onSocketMessage('study_force_variation', {
            type: 'study_force_variation',
            studyId: 'study001',
            chapterId: 'chapter1',
            clientOpId: 'RemoteOp',
            revision: 1,
            changed: true,
            path: 'StudyNode1',
            force: true,
        });

        expect(reload).toHaveBeenCalledWith('concurrent_edit');
    });

    test('reloads after a real websocket reconnect because broadcasts may have been missed', () => {
        const ctrl = makeCtrl();
        const reload = jest.fn();
        const extension = new StudyAnalysisExtension(ctrl, {
            studyId: 'study001',
            chapterId: 'chapter1',
            revision: 0,
            onReloadRequired: reload,
        });

        extension.onSocketOpen();
        extension.onSocketReconnect();
        extension.onSocketOpen();

        expect(reload).toHaveBeenCalledWith('reconnected');
    });

    test('ignores broadcasts for another chapter in the same Study room', () => {
        const ctrl = makeCtrl();
        const reload = jest.fn();
        const extension = new StudyAnalysisExtension(ctrl, {
            studyId: 'study001',
            chapterId: 'chapter1',
            revision: 3,
            onReloadRequired: reload,
        });

        expect(
            extension.onSocketMessage('study_delete_node', {
                type: 'study_delete_node',
                studyId: 'study001',
                chapterId: 'chapter2',
                clientOpId: 'RemoteOp',
                revision: 99,
                changed: true,
                path: 'StudyNode1',
            }),
        ).toBe(true);
        expect(extension.revision).toBe(3);
        expect(reload).not.toHaveBeenCalled();
    });

    test('keeps generic mainline steps aligned after a Study promotion', () => {
        const ctrl = makeCtrl();
        const e4 = e4Node();
        const d4: StudyTreeNodeDto = {
            ...e4,
            id: 'StudyNode2',
            order: 1,
            move: 'd2d4',
            fen: 'd4 b - - 0 1',
            san: 'd4',
            sanSAN: 'd4',
        };
        addStudyNodeToAnalysisTree(ctrl.analysisTree, '', e4);
        addStudyNodeToAnalysisTree(ctrl.analysisTree, '', d4);
        ctrl.steps = [ctrl.analysisTree.root.step, ctrl.analysisTree.root.children[0].step];
        const extension = new StudyAnalysisExtension(ctrl, {
            studyId: 'study001',
            chapterId: 'chapter1',
            revision: 0,
            onReloadRequired: jest.fn(),
            opIdFactory: () => 'PromoteOp',
        });

        promoteNodePath(ctrl.analysisTree, 'StudyNode2', true);
        extension.onVariationPromoted('StudyNode2', true);

        expect(ctrl.steps.map((step: Step) => step.move)).toEqual([undefined, 'd2d4']);
        expect(ctrl.analysisTree.root.children[0].mainlinePly).toBe(1);
        expect(ctrl.analysisTree.root.children[1].mainlinePly).toBeUndefined();
        expect(ctrl.recordedMainlinePly).toBeUndefined();
    });
});
