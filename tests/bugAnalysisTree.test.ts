import { describe, expect, test } from '@jest/globals';

import { addOrSelectChild, createAnalysisTree } from '../client/analysis/analysisTree';
import { renderBughouseTreePgnMoveText } from '../client/bug/analysisTreeBug';
import { Step } from '../client/messages';

function makeStep(
    fen: string,
    fenB: string,
    move: string | undefined,
    moveB: string | undefined,
    turnColor: 'white' | 'black',
    san: string | undefined,
    boardName?: 'a' | 'b',
    plyA?: number,
    plyB?: number,
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

describe('bughouse analysis tree', () => {
    test('does not merge branches that only differ on board B state', () => {
        const steps: Step[] = [
            makeStep('fa0', 'fb0', undefined, undefined, 'white', undefined),
            makeStep('fa1', 'fb0', 'a1', undefined, 'black', 'A1', 'a', 1, 0),
        ];
        const tree = createAnalysisTree(steps);

        const branch1 = makeStep('fa1', 'fb1', 'a1', 'b1', 'black', 'B1', 'b', 1, 1);
        const branch2 = makeStep('fa1', 'fb2', 'a1', 'b2', 'white', 'B2', 'b', 1, 1);

        const path1 = addOrSelectChild(tree, '01', branch1, false);
        const path2 = addOrSelectChild(tree, '01', branch2, false);

        expect(path1).not.toBe(path2);
    });

    test('renders recursive bughouse PGN movetext with board-specific prefixes', () => {
        const steps: Step[] = [
            makeStep('fa0', 'fb0', undefined, undefined, 'white', undefined),
            makeStep('fa1', 'fb0', 'a1', undefined, 'black', 'A1', 'a', 1, 0),
            makeStep('fa1', 'fb1', 'a1', 'b1', 'black', 'B1', 'b', 1, 1),
        ];
        const tree = createAnalysisTree(steps);

        const branch = makeStep('fa1', 'fb2', 'a1', 'b2', 'white', 'B2', 'b', 1, 1);
        const sub = makeStep('fa2', 'fb2', 'a2', 'b2', 'black', 'A2', 'a', 2, 1);
        const branchPath = addOrSelectChild(tree, '01', branch, false);
        addOrSelectChild(tree, branchPath, sub, false);

        expect(renderBughouseTreePgnMoveText(tree, (node) => node.step.sanSAN ?? '')).toBe(
            '1A. A1 (1b. B2 1A. A2) 1B. B1',
        );
    });
});
