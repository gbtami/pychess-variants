import { beforeEach, describe, expect, test } from '@jest/globals';
import { h } from 'snabbdom';

import { createAnalysisTree } from '../client/analysis/analysisTree';
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
});
