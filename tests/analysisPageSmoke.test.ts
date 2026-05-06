import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { h, type VNode } from 'snabbdom';

import { createAnalysisTree } from '../client/analysisTree';
import { patch } from '../client/document';
import { Step } from '../client/messages';
import { updateMovelist } from '../client/movelist';
import { PyChessModel } from '../client/types';

jest.useFakeTimers();

jest.unstable_mockModule('../client/analysisCtrl', () => ({
    AnalysisController: class AnalysisController {},
}));
jest.unstable_mockModule('../client/puzzleCtrl', () => ({
    PuzzleController: class PuzzleController {},
}));
jest.unstable_mockModule('../client/roundCtrl', () => ({
    RoundController: class RoundController {},
}));
jest.unstable_mockModule('../client/analysisSettings', () => ({
    analysisSettings: {
        view: () => h('div.analysis-settings'),
    },
    EngineSettings: class EngineSettings {
        view() {
            return h('div.engine-toggle');
        }
    },
}));

const { analysisView, embedView } = await import('../client/analysis');
const { puzzleView } = await import('../client/puzzle');
const { roundView } = await import('../client/round');

function makeModel(overrides: Partial<PyChessModel> = {}): PyChessModel {
    return {
        ffish: {} as PyChessModel['ffish'],
        username: 'tester',
        home: 'http://127.0.0.1:8080',
        anon: '',
        profileid: '',
        title: '',
        variant: 'chess',
        chess960: 'False',
        rated: '0',
        corr: '',
        level: 8,
        gameId: '',
        gameCategory: 'all',
        tournamentId: '',
        tournamentname: '',
        simulId: '',
        simulname: '',
        tournamentcreator: '',
        inviter: '',
        challengeId: '',
        ply: 0,
        ct: '',
        board: '',
        wplayer: 'White',
        wtitle: '',
        wrating: '1500',
        wrdiff: 0,
        wberserk: '',
        bplayer: 'Black',
        btitle: '',
        brating: '1500',
        brdiff: 0,
        bberserk: '',
        fen: 'rn1qkbnr/pppb1ppp/8/3pp3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        posnum: 0,
        initialFen: 'rn1qkbnr/pppb1ppp/8/3pp3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        base: 300,
        inc: 5,
        byo: 0,
        result: '*',
        status: 1,
        tsystem: 0,
        rounds: 0,
        date: '2026-05-06T12:00:00Z',
        tv: false,
        embed: false,
        seekEmpty: false,
        tournamentDirector: false,
        assetURL: '',
        puzzle: '',
        wplayerB: '',
        wtitleB: '',
        wratingB: '',
        bplayerB: '',
        btitleB: '',
        bratingB: '',
        blogs: '',
        corrGames: '',
        simulGames: '',
        simulHost: false,
        oauthUsernameSelection: null,
        ...overrides,
    };
}

function renderNodes(nodes: VNode[]): HTMLElement {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const vnode = patch(host, h('div.test-root', nodes));
    return vnode.elm as HTMLElement;
}

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

beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(globalThis, 'DataTransfer', {
        configurable: true,
        writable: true,
        value: class DataTransfer {
            items = {
                add: (_file: File) => undefined,
            };
            files = [] as unknown as FileList;
        },
    });
});

afterEach(() => {
    jest.clearAllTimers();
    document.body.innerHTML = '';
});

describe('analysis page smoke coverage', () => {
    test('standalone analysis page keeps PGN tools and move controls', () => {
        const root = renderNodes(analysisView(makeModel({ gameId: '', status: 1 })));

        expect(root.querySelector('#movelist')).not.toBeNull();
        expect(root.querySelector('#move-controls')).not.toBeNull();
        expect(root.querySelector('#pgntext')).not.toBeNull();
        expect(root.querySelectorAll('[role="tab"]').length).toBeGreaterThan(0);
    });

    test('finished-game analysis page keeps chat, PGN and controls', () => {
        const root = renderNodes(analysisView(makeModel({ gameId: 'cPeP5Di1', status: 1 })));

        expect(root.querySelector('#roundchat')).not.toBeNull();
        expect(root.querySelector('#movelist')).not.toBeNull();
        expect(root.querySelector('#move-controls')).not.toBeNull();
        expect(root.querySelector('#pgntext')).not.toBeNull();
    });

    test('embed view stays lean and does not render PGN tab content', () => {
        const root = renderNodes(embedView(makeModel({ gameId: 'cPeP5Di1', embed: true })));

        expect(root.querySelector('#movelist')).not.toBeNull();
        expect(root.querySelector('#move-controls')).not.toBeNull();
        expect(root.querySelector('#pgntext')).toBeNull();
        expect(root.querySelector('.footer .gamelink')).not.toBeNull();
    });

    test('puzzle view keeps analysis tools but omits PGN tab content', () => {
        const root = renderNodes(puzzleView(makeModel({
            gameId: '',
            puzzle: JSON.stringify({
                _id: 'abcde',
                v: 'chess',
                f: 'rn1qkbnr/pppb1ppp/8/3pp3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                m: 'e2e4,e7e5',
                t: 'advantage',
                e: '+1.2',
            }),
        })));

        expect(root.querySelector('#movelist')).not.toBeNull();
        expect(root.querySelector('#move-controls')).not.toBeNull();
        expect(root.querySelector('.analysis-settings')).not.toBeNull();
        expect(root.querySelector('#pgntext')).toBeNull();
    });

    test('round view stays on the legacy round chrome', () => {
        const root = renderNodes(roundView(makeModel({ gameId: 'cPeP5Di1', status: -1 })));

        expect(root.querySelector('#movelist')).not.toBeNull();
        expect(root.querySelector('#move-controls')).not.toBeNull();
        expect(root.querySelector('#game-controls')).not.toBeNull();
        expect(root.querySelector('#pgntext')).toBeNull();
    });
});

describe('analysis tree movelist gating', () => {
    test('tree mode applies analysis-tree classes only when explicitly enabled', () => {
        document.body.innerHTML = '<div id="movelist"></div>';

        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
        ];
        const tree = createAnalysisTree(steps);

        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 2,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            variant: { name: 'chess' },
            fog: false,
            mycolor: 'white',
            spectator: true,
            analysisTree: tree,
            hasAnalysisTree: () => true,
            isTreeInlineNotation: () => false,
            getTreeActivePath: () => tree.root.children[0].children[0].path,
            activateTreePath: () => undefined,
        } as any;

        updateMovelist(ctrl, true, false, false);

        const movelist = document.getElementById('movelist')!;
        expect(movelist.classList.contains('analysis-tree')).toBe(true);
        expect(movelist.classList.contains('tview2-column')).toBe(true);
    });

    test('legacy controllers keep the old movelist structure', () => {
        document.body.innerHTML = '<div id="movelist"></div>';

        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
        ];

        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 2,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            variant: { name: 'chess' },
            fog: false,
            mycolor: 'white',
            spectator: true,
            goPly: () => undefined,
        } as any;

        updateMovelist(ctrl, true, false, false);

        const movelist = document.getElementById('movelist')!;
        expect(movelist.classList.contains('analysis-tree')).toBe(false);
        expect(movelist.classList.contains('tview2-column')).toBe(false);
        expect(movelist.querySelector('move.counter')).not.toBeNull();
    });
});
