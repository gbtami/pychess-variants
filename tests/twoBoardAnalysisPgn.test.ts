import { beforeAll, expect, jest, test } from '@jest/globals';

import { PyChessModel } from '../client/types';
import { Step } from '../client/messages';

// pgn.ts pulls titleCase from the single-board analysis controller, whose module
// graph reaches ffish wasm — mock it with a faithful reimplementation.
jest.unstable_mockModule('../client/analysis/analysisCtrl', () => ({
    titleCase: (words: string) =>
        words
            .split(' ')
            .map(w => w.substring(0, 1).toUpperCase() + w.substring(1).toLowerCase())
            .join(' '),
}));

let getPgn: typeof import('../client/two-board/analysis/pgn').getPgn;
let TwoBoardSeats: typeof import('../client/two-board/common/players').TwoBoardSeats;
let createAnalysisTree: typeof import('../client/analysis/analysisTree').createAnalysisTree;
let renderBughouseTreePgnMoveText: typeof import('../client/two-board/analysis/analysisTreeTwoBoards').renderBughouseTreePgnMoveText;

beforeAll(async () => {
    ({ getPgn } = await import('../client/two-board/analysis/pgn'));
    ({ TwoBoardSeats } = await import('../client/two-board/common/players'));
    ({ createAnalysisTree } = await import('../client/analysis/analysisTree'));
    ({ renderBughouseTreePgnMoveText } = await import('../client/two-board/analysis/analysisTreeTwoBoards'));
});

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1';

function model(): PyChessModel {
    return {
        wplayer: 'Anna',
        wtitle: '',
        wrating: '2500',
        bplayer: 'Boris',
        btitle: '',
        brating: '1800',
        wplayerB: 'Carl',
        wtitleB: '',
        wratingB: '2000',
        bplayerB: 'Dana',
        btitleB: '',
        bratingB: '2200',
    } as PyChessModel;
}

// steps: root + 5 moves alternating boards; ply 3 has only san (no sanSAN) to pin the fallback
function steps(): Step[] {
    const mk = (boardName: 'a' | 'b', turnColor: 'white' | 'black', plyA: number, plyB: number, san: string, sanSAN?: string) =>
        ({ fen: START_FEN, boardName, turnColor, check: false, plyA, plyB, san, sanSAN }) as unknown as Step;
    return [
        { fen: START_FEN, check: false, turnColor: 'white', plyA: 0, plyB: 0 } as unknown as Step,
        mk('a', 'black', 1, 0, 'e4', 'e4'),
        mk('b', 'black', 1, 1, 'd4', 'd4'),
        mk('a', 'white', 2, 1, 'Nf6'), // san only
        mk('b', 'white', 2, 2, 'e6', 'e6'),
        mk('a', 'black', 3, 2, 'e5', 'e5'),
    ];
}

function stubCtrl(treeOverrides: object = {}, overrides: object = {}) {
    return {
        seats: new TwoBoardSeats(model(), 'Zora'),
        boardA: { home: 'https://pychess.org' },
        variant: { name: 'bughouse' },
        steps: steps(),
        ply: 5,
        tree: {
            hasAnalysisTree: () => false,
            analysisTree: undefined,
            ...treeOverrides,
        },
        ...overrides,
    } as unknown as Parameters<typeof getPgn>[0];
}

const today = () => new Date().toISOString().substring(0, 10).replace(/-/g, '.');

const HEADER =
    '[Event "?"]\n' +
    '[Site "https://pychess.org/analysis/bughouse"]\n' +
    `[Date "${today()}"]\n` +
    '[WhiteA "Anna"]\n' +
    '[BlackA "Boris"]\n' +
    '[WhiteB "Carl"]\n' +
    '[BlackB "Dana"]\n' +
    '[Result "*"]\n' +
    '[Variant "Bughouse"]\n' +
    `[FEN "${START_FEN}"]\n` +
    '[SetUp "1"]\n';

test('legacy mainline path: header tags, per-board move counters, sanSAN ?? san fallback', () => {
    expect(getPgn(stubCtrl())).toBe(HEADER + '\n1A.e4 1B.d4 1A.Nf6 1B.e6 2A.e5 *\n');
});

test('legacy mainline path respects the current ply', () => {
    expect(getPgn(stubCtrl({}, { ply: 2 }))).toBe(HEADER + '\n1A.e4 1B.d4 *\n');
});

test('tree path composes the header with the tree move-text renderer', () => {
    const tree = createAnalysisTree(steps());
    const ctrl = stubCtrl({ hasAnalysisTree: () => true, analysisTree: tree });
    const moveText = renderBughouseTreePgnMoveText(tree, node => node.step.sanSAN ?? node.step.san ?? '');

    expect(moveText).not.toBe('');
    expect(getPgn(ctrl)).toBe(HEADER + `\n${moveText} *\n`);
});
