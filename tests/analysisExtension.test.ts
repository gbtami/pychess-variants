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
