import { beforeEach, describe, expect, test } from '@jest/globals';
import { h } from 'snabbdom';

import { addOrSelectChild, createAnalysisTree, mainlinePathAtPly, nodeAtPath } from '../client/analysis/analysisTree';
import { patch } from '../client/document';
import { Step } from '../client/messages';
import { updateMovelist } from '../client/bug/movelist.bug';

function makeStep(
    fen: string,
    fenB: string,
    move: string | undefined,
    moveB: string | undefined,
    turnColor: 'white' | 'black',
    san: string,
    boardName: 'a' | 'b',
    plyA: number,
    plyB: number,
): Step {
    return {
        fen,
        fenB,
        move,
        moveB,
        check: false,
        turnColor,
        san,
        sanSAN: san,
        boardName,
        plyA,
        plyB,
    };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('bughouse analysis mainline navigation', () => {
    test('mainline move clicks use the explicit mainline jump in tree mode', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        patch(host, h('div#movelist'));

        const steps: Step[] = [
            makeStep('fa0', 'fb0', undefined, undefined, 'white', '', 'a', 0, 0),
            makeStep('fa1', 'fb0', 'a1', undefined, 'black', 'A1', 'a', 1, 0),
            makeStep('fa1', 'fb1', 'a1', 'b1', 'black', 'B1', 'b', 1, 1),
        ];
        const tree = createAnalysisTree(steps);

        let selectedMainlinePly: number | undefined;
        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 2,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            analysisTree: tree,
            hasAnalysisTree: () => true,
            getTreeActivePath: () => tree.root.children[0].children[0].path,
            activateTreePath: () => undefined,
            activateTreeMainlinePly: (ply: number) => {
                selectedMainlinePly = ply;
            },
            b1: { variant: { name: 'bughouse' } },
            teamFirst: [['wA', '', ''], ['bB', '', '']],
            teamSecond: [['bA', '', ''], ['wB', '', '']],
        } as any;

        updateMovelist(ctrl, true, false, false);

        const mainlineMove = document.querySelector('move-bug[ply="2"]') as HTMLElement | null;
        expect(mainlineMove).not.toBeNull();

        mainlineMove!.click();

        expect(selectedMainlinePly).toBe(2);
    });

    test('variation rows expose the selected child path in tree mode', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        patch(host, h('div#movelist'));

        const steps: Step[] = [
            makeStep('fa0', 'fb0', undefined, undefined, 'white', '', 'a', 0, 0),
            makeStep('fa1', 'fb0', 'a1', undefined, 'black', 'A1', 'a', 1, 0),
            makeStep('fa1', 'fb1', 'a1', 'b1', 'black', 'B1', 'b', 1, 1),
        ];
        const tree = createAnalysisTree(steps);
        const selectedPath = addOrSelectChild(
            tree,
            tree.root.children[0].path,
            makeStep('fa1', 'fb2', 'a1', 'b2', 'white', 'B2', 'b', 1, 1),
            false,
        );

        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 2,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            analysisTree: tree,
            hasAnalysisTree: () => true,
            getTreeActivePath: () => tree.root.children[0].children[0].path,
            getTreeSelectedChildPath: () => selectedPath,
            activateTreePath: () => undefined,
            activateTreeMainlinePly: () => undefined,
            b1: { variant: { name: 'bughouse' } },
            teamFirst: [['wA', '', ''], ['bB', '', '']],
            teamSecond: [['bA', '', ''], ['wB', '', '']],
        } as any;

        updateMovelist(ctrl, true, false, false);

        const selectedMove = document.querySelector('vari-move.selected') as HTMLElement | null;
        expect(selectedMove).not.toBeNull();
        expect(selectedMove?.textContent).toContain('B2');
    });

    test('disclosure button is attached to the branched reply and hides bughouse sidelines', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        patch(host, h('div#movelist'));

        const steps: Step[] = [
            makeStep('fa0', 'fb0', undefined, undefined, 'white', '', 'a', 0, 0),
            makeStep('fa1', 'fb0', 'a1', undefined, 'black', 'A1', 'a', 1, 0),
            makeStep('fa1', 'fb1', 'a1', 'b1', 'black', 'B1', 'b', 1, 1),
            makeStep('fa2', 'fb1', 'a2', 'b1', 'white', 'A2', 'a', 2, 1),
        ];
        const tree = createAnalysisTree(steps);
        const a1Path = mainlinePathAtPly(tree, 1);
        addOrSelectChild(tree, a1Path, makeStep('fa1', 'fb2', 'a1', 'b2', 'black', 'B2', 'b', 1, 1), false);
        addOrSelectChild(tree, a1Path, makeStep('fa1', 'fb3', 'a1', 'b3', 'black', 'B3', 'b', 1, 1), false);

        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 3,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            analysisTree: tree,
            hasAnalysisTree: () => true,
            getTreeActivePath: () => tree.root.children[0].children[0].children[0].path,
            getTreeSelectedChildPath: () => undefined,
            activateTreePath: () => undefined,
            activateTreeMainlinePly: () => undefined,
            toggleTreeCollapsed: (path: string) => {
                const node = nodeAtPath(tree, path);
                if (!node) return;
                node.collapsed = !node.collapsed;
                updateMovelist(ctrl as any, true, false, false);
            },
            b1: { variant: { name: 'bughouse' } },
            teamFirst: [['wA', '', ''], ['bB', '', '']],
            teamSecond: [['bA', '', ''], ['wB', '', '']],
        } as any;

        updateMovelist(ctrl, true, false, false);

        const disclosureMove = document.querySelector('move-bug[ply="2"]') as HTMLElement | null;
        expect(disclosureMove?.textContent).toContain('B1');
        expect(disclosureMove?.querySelector('button.disclosure')).not.toBeNull();
        expect(document.getElementById('movelist')?.textContent).toContain('B2');
        expect(document.getElementById('movelist')?.textContent).toContain('B3');

        (disclosureMove?.querySelector('button.disclosure') as HTMLButtonElement).click();

        expect(document.getElementById('movelist')?.textContent).toContain('B1');
        expect(document.getElementById('movelist')?.textContent).not.toContain('B2');
        expect(document.getElementById('movelist')?.textContent).not.toContain('B3');
    });

    test('mainline bughouse tree context menu exposes mainline actions', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        patch(host, h('div#movelist'));

        const steps: Step[] = [
            makeStep('fa0', 'fb0', undefined, undefined, 'white', '', 'a', 0, 0),
            makeStep('fa1', 'fb0', 'a1', undefined, 'black', 'A1', 'a', 1, 0),
            makeStep('fa1', 'fb1', 'a1', 'b1', 'black', 'B1', 'b', 1, 1),
            makeStep('fa2', 'fb1', 'a2', 'b1', 'white', 'A2', 'a', 2, 1),
        ];
        const tree = createAnalysisTree(steps);
        const a1Path = mainlinePathAtPly(tree, 1);
        addOrSelectChild(tree, a1Path, makeStep('fa1', 'fb2', 'a1', 'b2', 'black', 'B2', 'b', 1, 1), false);

        let copiedPath: string | undefined;
        let deletedPath: string | undefined;
        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 3,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            analysisTree: tree,
            hasAnalysisTree: () => true,
            getTreeActivePath: () => tree.root.children[0].children[0].children[0].path,
            getTreeSelectedChildPath: () => undefined,
            getTreeNodeAtPath: (path: string) => nodeAtPath(tree, path),
            getTreeContextMenu: () => ({ path: tree.root.children[0].children[0].path, x: 12, y: 14 }),
            pathIsTreeMainline: () => true,
            canPromoteTreeVariation: () => false,
            someTreeCollapsed: (collapsed: boolean) => !collapsed,
            activateTreePath: () => undefined,
            activateTreeMainlinePly: () => undefined,
            toggleTreeCollapsed: () => undefined,
            copyTreeLinePgn: (path: string) => {
                copiedPath = path;
            },
            deleteTreeNode: (path: string) => {
                deletedPath = path;
            },
            b1: { variant: { name: 'bughouse' } },
            teamFirst: [['wA', '', ''], ['bB', '', '']],
            teamSecond: [['bA', '', ''], ['wB', '', '']],
        } as any;

        updateMovelist(ctrl, true, false, false);

        const labels = Array.from(document.querySelectorAll('.tree-context-menu button span')).map((el) => el.textContent);
        expect(labels).toEqual(expect.arrayContaining(['Collapse all', 'Copy main line PGN', 'Delete from here']));
        expect(labels).not.toContain('Make main line');

        (document.querySelectorAll('.tree-context-menu button')[1] as HTMLButtonElement).click();
        expect(copiedPath).toBe(tree.root.children[0].children[0].path);

        (document.querySelectorAll('.tree-context-menu button')[2] as HTMLButtonElement).click();
        expect(deletedPath).toBe(tree.root.children[0].children[0].path);
    });

    test('sideline bughouse tree context menu exposes variation actions', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        patch(host, h('div#movelist'));

        const steps: Step[] = [
            makeStep('fa0', 'fb0', undefined, undefined, 'white', '', 'a', 0, 0),
            makeStep('fa1', 'fb0', 'a1', undefined, 'black', 'A1', 'a', 1, 0),
            makeStep('fa1', 'fb1', 'a1', 'b1', 'black', 'B1', 'b', 1, 1),
            makeStep('fa2', 'fb1', 'a2', 'b1', 'white', 'A2', 'a', 2, 1),
        ];
        const tree = createAnalysisTree(steps);
        const a1Path = mainlinePathAtPly(tree, 1);
        addOrSelectChild(tree, a1Path, makeStep('fa1', 'fb2', 'a1', 'b2', 'black', 'B2', 'b', 1, 1), false);
        const b3Path = addOrSelectChild(tree, a1Path, makeStep('fa1', 'fb3', 'a1', 'b3', 'black', 'B3', 'b', 1, 1), false);

        let promoted: { path: string; toMainline: boolean } | undefined;
        let copiedPath: string | undefined;
        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 3,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            analysisTree: tree,
            hasAnalysisTree: () => true,
            getTreeActivePath: () => tree.root.children[0].children[0].children[0].path,
            getTreeSelectedChildPath: () => undefined,
            getTreeNodeAtPath: (path: string) => nodeAtPath(tree, path),
            getTreeContextMenu: () => ({ path: b3Path, x: 12, y: 14 }),
            pathIsTreeMainline: () => false,
            canPromoteTreeVariation: () => true,
            someTreeCollapsed: () => false,
            activateTreePath: () => undefined,
            activateTreeMainlinePly: () => undefined,
            toggleTreeCollapsed: () => undefined,
            promoteTreeVariation: (path: string, toMainline: boolean) => {
                promoted = { path, toMainline };
            },
            copyTreeLinePgn: (path: string) => {
                copiedPath = path;
            },
            deleteTreeNode: () => undefined,
            b1: { variant: { name: 'bughouse' } },
            teamFirst: [['wA', '', ''], ['bB', '', '']],
            teamSecond: [['bA', '', ''], ['wB', '', '']],
        } as any;

        updateMovelist(ctrl, true, false, false);

        const labels = Array.from(document.querySelectorAll('.tree-context-menu button span')).map((el) => el.textContent);
        expect(labels).toEqual(expect.arrayContaining(['Promote variation', 'Make main line', 'Copy variation PGN', 'Delete from here']));

        (document.querySelectorAll('.tree-context-menu button')[0] as HTMLButtonElement).click();
        expect(promoted).toEqual({ path: b3Path, toMainline: false });

        (document.querySelectorAll('.tree-context-menu button')[1] as HTMLButtonElement).click();
        expect(promoted).toEqual({ path: b3Path, toMainline: true });

        (document.querySelectorAll('.tree-context-menu button')[2] as HTMLButtonElement).click();
        expect(copiedPath).toBe(b3Path);
    });
});
