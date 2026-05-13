import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { h, type VNode } from 'snabbdom';

import { addOrSelectChild, createAnalysisTree, mainlinePathAtPly } from '../client/analysis/analysisTree';
import { patch } from '../client/document';
import { Step } from '../client/messages';
import { updateMovelist } from '../client/movelist';
import { PyChessModel } from '../client/types';

jest.useFakeTimers();

jest.unstable_mockModule('../client/analysis/analysisCtrl', () => ({
    AnalysisController: class AnalysisController {},
}));
jest.unstable_mockModule('../client/puzzleCtrl', () => ({
    PuzzleController: class PuzzleController {},
}));
jest.unstable_mockModule('../client/roundCtrl', () => ({
    RoundController: class RoundController {},
}));
jest.unstable_mockModule('../client/analysis/analysisSettings', () => ({
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

    test('disclosure mode hides collapsed sidelines but leaves them visible when disabled', () => {
        document.body.innerHTML = '<div id="movelist"></div>';

        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
        ];
        const tree = createAnalysisTree(steps);
        const ply1Path = mainlinePathAtPly(tree, 1);
        addOrSelectChild(tree, ply1Path, makeStep('v1 w - - 0 1', 'c7c5', 'white', 'c5'), false);
        const parent = tree.root.children[0];
        parent.collapsed = true;

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
            isTreeInlineNotation: () => true,
            isTreeDisclosureMode: () => true,
            getTreeActivePath: () => tree.root.children[0].children[0].path,
            getTreeSelectedChildPath: () => tree.root.children[0].children[0].path,
            activateTreePath: () => undefined,
            toggleTreeCollapsed: () => undefined,
        } as any;

        updateMovelist(ctrl, true, false, false);
        expect(document.getElementById('movelist')!.textContent).not.toContain('c5');
        expect(document.querySelector('#movelist button.disclosure')).not.toBeNull();

        ctrl.isTreeDisclosureMode = () => false;
        updateMovelist(ctrl, true, false, false);
        expect(document.getElementById('movelist')!.textContent).toContain('c5');
    });

    test('inline notation keeps sibling sidelines as siblings, not nested sub-variations', () => {
        document.body.innerHTML = '<div id="movelist"></div>';

        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
            makeStep('s4 w - - 0 1', 'g8f6', 'white', 'Nf6'),
        ];
        const tree = createAnalysisTree(steps);
        const blackReplyPath = mainlinePathAtPly(tree, 3);
        addOrSelectChild(tree, blackReplyPath, makeStep('v1 w - - 0 1', 'h7h6', 'white', 'h6'), false);
        addOrSelectChild(tree, blackReplyPath, makeStep('v2 w - - 0 1', 'd7d5', 'white', 'd5'), false);

        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 4,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            variant: { name: 'chess' },
            fog: false,
            mycolor: 'white',
            spectator: true,
            analysisTree: tree,
            hasAnalysisTree: () => true,
            isTreeInlineNotation: () => true,
            isTreeDisclosureMode: () => false,
            getTreeActivePath: () => mainlinePathAtPly(tree, 4),
            getTreeSelectedChildPath: () => undefined,
            activateTreePath: () => undefined,
            toggleTreeCollapsed: () => undefined,
        } as any;

        updateMovelist(ctrl, true, false, false);

        const sans = [...document.querySelectorAll('#movelist san')].map((el) => el.textContent);
        expect(sans.filter((san) => san === 'h6')).toHaveLength(1);
        expect(sans.filter((san) => san === 'd5')).toHaveLength(1);
        expect(document.querySelectorAll('#movelist inline inline')).toHaveLength(0);
    });

    test('column disclosure button is rendered on the branched reply move', () => {
        document.body.innerHTML = '<div id="movelist"></div>';

        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
            makeStep('s4 w - - 0 1', 'b8c6', 'white', 'Nc6'),
            makeStep('s5 b - - 0 1', 'f1b5', 'black', 'Bb5'),
            makeStep('s6 w - - 0 1', 'a7a6', 'white', 'a6'),
            makeStep('s7 b - - 0 1', 'b5a4', 'black', 'Ba4'),
        ];
        const tree = createAnalysisTree(steps);
        const white4Path = mainlinePathAtPly(tree, 5);
        addOrSelectChild(tree, white4Path, makeStep('v1 w - - 0 1', 'g8f6', 'white', 'Nf6'), false);
        addOrSelectChild(tree, white4Path, makeStep('v2 w - - 0 1', 'f8c5', 'white', 'Bc5'), false);
        addOrSelectChild(tree, white4Path, makeStep('v3 w - - 0 1', 'd7d6', 'white', 'd6'), false);

        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 7,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            variant: { name: 'chess' },
            fog: false,
            mycolor: 'white',
            spectator: true,
            analysisTree: tree,
            hasAnalysisTree: () => true,
            isTreeInlineNotation: () => false,
            isTreeDisclosureMode: () => true,
            getTreeActivePath: () => tree.root.children[0].children[0].children[0].children[0].children[0].children[0].children[0].path,
            getTreeSelectedChildPath: () => undefined,
            activateTreePath: () => undefined,
            toggleTreeCollapsed: () => undefined,
        } as any;

        updateMovelist(ctrl, true, false, false);

        expect(document.querySelectorAll('#movelist button.disclosure')).toHaveLength(1);

        const disclosureMove = document.querySelector('#movelist > move button.disclosure')?.parentElement;
        expect(disclosureMove?.textContent).toContain('a6');
        expect(disclosureMove?.textContent).not.toContain('Ba4');
    });

    test('tree nodes expose selected-line state and split SAN glyph suffixes', () => {
        document.body.innerHTML = '<div id="movelist"></div>';

        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4!'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
        ];
        const tree = createAnalysisTree(steps);
        const e4Path = mainlinePathAtPly(tree, 1);
        addOrSelectChild(tree, e4Path, makeStep('v1 w - - 0 1', 'c7c5', 'white', 'c5?!'), false);

        const ctrl = {
            steps,
            status: 1,
            result: '*',
            ply: 3,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            variant: { name: 'chess' },
            fog: false,
            mycolor: 'white',
            spectator: true,
            recordedMainlinePly: 3,
            analysisTree: tree,
            hasAnalysisTree: () => true,
            isTreeInlineNotation: () => true,
            isTreeDisclosureMode: () => false,
            getTreeActivePath: () => tree.root.children[0].children[0].children[0].path,
            getTreeSelectedChildPath: () => tree.root.children[0].children[0].children[0].path,
            activateTreePath: () => undefined,
            toggleTreeCollapsed: () => undefined,
        } as any;

        updateMovelist(ctrl, true, false, false);

        const firstMove = document.querySelector('#movelist move[data-path="01"]') as HTMLElement | null;
        expect(firstMove?.classList.contains('recorded')).toBe(true);
        expect(firstMove?.classList.contains('currentline')).toBe(true);
        expect(firstMove?.querySelector('san')?.textContent).toBe('e4');
        expect(firstMove?.querySelector('glyph.good')?.textContent).toBe('!');

        const sidelineMove = document.querySelector('#movelist move[data-path="01.04"]') as HTMLElement | null;
        expect(sidelineMove?.classList.contains('sideline')).toBe(true);
        expect(sidelineMove?.querySelector('san')?.textContent).toBe('c5');
        expect(sidelineMove?.querySelector('glyph.inaccuracy')?.textContent).toBe('?!');
    });

    test('tree context menu renders lichess-style actions for the selected move', () => {
        document.body.innerHTML = '<div id="movelist"></div>';

        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
            makeStep('s4 w - - 0 1', 'b8c6', 'white', 'Nc6'),
            makeStep('s5 b - - 0 1', 'f1b5', 'black', 'Bb5'),
            makeStep('s6 w - - 0 1', 'a7a6', 'white', 'a6'),
        ];
        const tree = createAnalysisTree(steps);
        const branchPath = mainlinePathAtPly(tree, 5);
        addOrSelectChild(tree, branchPath, makeStep('v1 w - - 0 1', 'g8f6', 'white', 'Nf6'), false);

        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 6,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            variant: { name: 'chess' },
            fog: false,
            mycolor: 'white',
            spectator: true,
            analysisTree: tree,
            hasAnalysisTree: () => true,
            isTreeInlineNotation: () => false,
            isTreeDisclosureMode: () => true,
            getTreeActivePath: () => tree.root.children[0].children[0].children[0].children[0].children[0].children[0].path,
            getTreeSelectedChildPath: () => undefined,
            getTreeNodeAtPath: (path: string) => path === branchPath ? tree.root.children[0].children[0].children[0].children[0].children[0] : undefined,
            pathIsTreeMainline: () => false,
            canPromoteTreeVariation: () => true,
            someTreeCollapsed: (collapsed: boolean) => !collapsed,
            getTreeContextMenu: () => ({ path: branchPath, x: 12, y: 18 }),
            activateTreePath: () => undefined,
            toggleTreeCollapsed: () => undefined,
            copyTreeLinePgn: () => undefined,
            promoteTreeVariation: () => undefined,
            collapseAllTree: () => undefined,
            expandAllTree: () => undefined,
            deleteTreeNode: () => undefined,
            closeTreeContextMenu: () => undefined,
        } as any;

        updateMovelist(ctrl, true, false, false);

        const menu = document.querySelector('#movelist .tree-context-menu') as HTMLElement | null;
        expect(menu).not.toBeNull();
        expect(menu?.textContent).toContain('Bb5');
        expect(menu?.textContent).toContain('Copy variation PGN');
        expect(menu?.textContent).toContain('Promote variation');
        expect(menu?.textContent).toContain('Make main line');
        expect(menu?.textContent).toContain('Collapse all');
        expect(menu?.textContent).toContain('Delete from here');
        expect(menu?.querySelectorAll('button i.icon').length).toBeGreaterThanOrEqual(5);
        expect(menu?.textContent).not.toContain('Copy full tree PGN');
        expect(menu?.textContent).not.toContain('Jump to branch point');
    });

    test('tree context menu keeps delete action on mainline nodes', () => {
        document.body.innerHTML = '<div id="movelist"></div>';

        const steps: Step[] = [
            makeStep('start w - - 0 1', undefined, 'white'),
            makeStep('s1 b - - 0 1', 'e2e4', 'black', 'e4'),
            makeStep('s2 w - - 0 1', 'e7e5', 'white', 'e5'),
            makeStep('s3 b - - 0 1', 'g1f3', 'black', 'Nf3'),
        ];
        const tree = createAnalysisTree(steps);
        const mainlinePath = mainlinePathAtPly(tree, 2);
        const mainlineNode = tree.root.children[0].children[0];

        const ctrl = {
            steps,
            status: -1,
            result: '*',
            ply: 3,
            plyVari: 0,
            vmovelist: document.getElementById('movelist'),
            variant: { name: 'chess' },
            fog: false,
            mycolor: 'white',
            spectator: true,
            analysisTree: tree,
            hasAnalysisTree: () => true,
            isTreeInlineNotation: () => false,
            isTreeDisclosureMode: () => false,
            getTreeActivePath: () => mainlinePath,
            getTreeSelectedChildPath: () => undefined,
            getTreeNodeAtPath: (path: string) => path === mainlinePath ? mainlineNode : undefined,
            pathIsTreeMainline: () => true,
            pathIsTreeForcedVariation: () => false,
            canPromoteTreeVariation: () => false,
            someTreeCollapsed: () => false,
            getTreeContextMenu: () => ({ path: mainlinePath, x: 12, y: 18 }),
            activateTreePath: () => undefined,
            toggleTreeCollapsed: () => undefined,
            copyTreeLinePgn: () => undefined,
            promoteTreeVariation: () => undefined,
            forceTreeVariation: () => undefined,
            collapseAllTree: () => undefined,
            expandAllTree: () => undefined,
            deleteTreeNode: () => undefined,
            closeTreeContextMenu: () => undefined,
        } as any;

        updateMovelist(ctrl, true, false, false);

        const menu = document.querySelector('#movelist .tree-context-menu') as HTMLElement | null;
        expect(menu).not.toBeNull();
        expect(menu?.textContent).toContain('Convert to variation');
        expect(menu?.textContent).toContain('Copy main line PGN');
        expect(menu?.textContent).toContain('Delete from here');
    });
});
