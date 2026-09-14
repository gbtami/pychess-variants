import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('chessgroundx', () => ({ Chessground: jest.fn() }));

const { AnalysisController } = await import('../client/analysis/analysisCtrl');

test('analysis delegates unknown websocket messages to the optional extension', () => {
    const onSocketMessage = jest.fn(() => true);
    const ctrl = Object.create(AnalysisController.prototype) as InstanceType<typeof AnalysisController> & {
        analysisExtension: { onSocketMessage: typeof onSocketMessage };
    };
    Object.defineProperty(ctrl, 'analysisExtension', {
        value: { onSocketMessage },
        configurable: true,
    });

    (ctrl as any).onMessage(
        new MessageEvent('message', {
            data: JSON.stringify({ type: 'study_node_added', path: '01.02' }),
        }),
    );

    expect(onSocketMessage).toHaveBeenCalledWith('study_node_added', {
        type: 'study_node_added',
        path: '01.02',
    });
});

test('analysis session generation cancels stale callbacks and runs registered cleanup', () => {
    const ctrl = Object.create(AnalysisController.prototype) as any;
    ctrl.destroyed = false;
    ctrl.analysisSessionGeneration = 0;
    ctrl.analysisSessionCleanups = new Set<() => void>();
    const cleanup = jest.fn();

    const first = ctrl.beginAnalysisSession();
    expect(ctrl.isAnalysisSessionCurrent(first)).toBe(true);
    ctrl.addAnalysisSessionCleanup(first, cleanup);

    const second = ctrl.beginAnalysisSession();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(ctrl.isAnalysisSessionCurrent(first)).toBe(false);
    expect(ctrl.isAnalysisSessionCurrent(second)).toBe(true);

    const staleCleanup = jest.fn();
    ctrl.addAnalysisSessionCleanup(first, staleCleanup);
    expect(staleCleanup).toHaveBeenCalledTimes(1);
});

test('completed position applies board-input policy before notifying the extension', () => {
    const calls: string[] = [];
    const chessground = {
        set: jest.fn(() => calls.push('board')),
    };
    const onPositionChanged = jest.fn(() => calls.push('position'));
    const ctrl = Object.create(AnalysisController.prototype) as any;
    ctrl.tree = { analysisPath: '01', analysisTree: undefined };
    ctrl.ply = 1;
    ctrl.turnColor = 'black';
    ctrl.fullfen = 'fen-after';
    ctrl.chessground = chessground;
    Object.defineProperty(ctrl, 'analysisExtension', {
        value: {
            boardInput: jest.fn(() => false),
            onPositionChanged,
        },
        configurable: true,
    });

    ctrl.completeAnalysisPositionChange('played-move', '', '01');

    expect(chessground.set).toHaveBeenCalledWith({ movable: { color: undefined } });
    expect(onPositionChanged).toHaveBeenCalledWith({
        origin: 'played-move',
        path: '01',
        previousPath: '',
        ply: 1,
        fen: 'fen-after',
        node: undefined,
    });
    expect(calls).toEqual(['board', 'position']);
});

test('evaluation delivery can be observed and suppress ordinary presentation', () => {
    const onEvaluation = jest.fn(() => false);
    const ctrl = Object.create(AnalysisController.prototype) as any;
    Object.defineProperty(ctrl, 'analysisExtension', {
        value: { onEvaluation },
        configurable: true,
    });
    const delivery = {
        source: 'local' as const,
        ply: 4,
        fen: 'position',
        ceval: { d: 12, multipv: 1, p: 'e2e4', s: { cp: 23 } },
        scoreStr: '0.2',
    };

    expect(ctrl.shouldDisplayAnalysisEvaluation(delivery)).toBe(false);
    expect(onEvaluation).toHaveBeenCalledWith(delivery);
});

test('move application can be rejected before the analysis board is mutated', () => {
    const beforeMoveApplied = jest.fn(() => false);
    const ctrl = Object.create(AnalysisController.prototype) as any;
    ctrl.tree = {
        analysisPath: '01',
        hasAnalysisTree: () => true,
    };
    ctrl.activateTreePath = jest.fn();
    Object.defineProperty(ctrl, 'analysisExtension', {
        value: { beforeMoveApplied },
        configurable: true,
    });

    expect(ctrl.applyAnalysisMove('e2e4', 'played-move')).toBe(false);
    expect(beforeMoveApplied).toHaveBeenCalledWith({ move: 'e2e4', origin: 'played-move', path: '01' });
    expect(ctrl.activateTreePath).toHaveBeenCalledWith('01', true, 'reset');
});
