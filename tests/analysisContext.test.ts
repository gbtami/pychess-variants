import { describe, expect, test } from '@jest/globals';

import { analysisContext } from '../client/analysis/analysisContext';
import type { PyChessModel } from '../client/types';

function model(overrides: Partial<PyChessModel> = {}): PyChessModel {
    return {
        embed: false,
        puzzle: '',
        gameId: 'abcd1234',
        status: 1,
        ...overrides,
    } as PyChessModel;
}

describe('analysis context', () => {
    test('standalone analysis exposes the reusable analysis capabilities', () => {
        const context = analysisContext(model({ gameId: '' }));

        expect(context.mode).toBe('standalone');
        expect(context.analysisBoard).toBe(true);
        expect(context.embed).toBe(false);
        expect(context.puzzle).toBe(false);
        expect(context.ongoing).toBe(false);
        expect(context.capabilities).toEqual({
            resizableCharts: true,
            localAnalysisAllowed: true,
            editableTree: true,
            gamePanels: false,
            roundChat: false,
            engineTools: true,
            analysisTabs: true,
            usesRoundSocket: false,
            positionMetadata: true,
            evalCharts: true,
            positionEvaluation: true,
            serverAnalysisRequest: false,
            moveTimeChart: true,
        });
    });

    test('finished game analysis enables game panels, chat and the round socket', () => {
        const context = analysisContext(model());

        expect(context.mode).toBe('game');
        expect(context.capabilities.gamePanels).toBe(true);
        expect(context.capabilities.roundChat).toBe(true);
        expect(context.capabilities.usesRoundSocket).toBe(true);
        expect(context.capabilities.serverAnalysisRequest).toBe(true);
    });

    test('embed keeps its legacy socket and local-analysis eligibility but no editing chrome', () => {
        const context = analysisContext(model({ embed: true }));

        expect(context.mode).toBe('embed');
        expect(context.capabilities.usesRoundSocket).toBe(true);
        expect(context.capabilities.localAnalysisAllowed).toBe(true);
        expect(context.capabilities.editableTree).toBe(false);
        expect(context.capabilities.resizableCharts).toBe(false);
        expect(context.capabilities.engineTools).toBe(false);
        expect(context.capabilities.analysisTabs).toBe(false);
    });

    test('puzzle is distinct from an empty-game standalone analysis', () => {
        const context = analysisContext(model({ gameId: '', puzzle: '{"_id":"abcde"}' }));

        expect(context.mode).toBe('puzzle');
        expect(context.analysisBoard).toBe(false);
        expect(context.capabilities.usesRoundSocket).toBe(false);
        expect(context.capabilities.engineTools).toBe(true);
        expect(context.capabilities.editableTree).toBe(true);
        expect(context.capabilities.positionMetadata).toBe(false);
        expect(context.capabilities.evalCharts).toBe(false);
    });

    test('study is a persisted editable analysis mode without the round socket', () => {
        const context = analysisContext(
            model({
                gameId: '',
                study: {
                    id: 'study001',
                    name: 'Study',
                    chapter: {
                        id: 'chapter1',
                        name: 'Chapter 1',
                        revision: 0,
                        orientation: 'white',
                        tree: { nodes: [] },
                    },
                    chapters: [],
                },
            }),
        );

        expect(context.mode).toBe('study');
        expect(context.analysisBoard).toBe(true);
        expect(context.capabilities.editableTree).toBe(true);
        expect(context.capabilities.usesRoundSocket).toBe(false);
        expect(context.capabilities.serverAnalysisRequest).toBe(false);
        expect(context.capabilities.engineTools).toBe(true);
    });

    test('all negative game statuses use the ongoing capability set', () => {
        for (const status of [-1, -2]) {
            const context = analysisContext(model({ status }));

            expect(context.ongoing).toBe(true);
            expect(context.capabilities.localAnalysisAllowed).toBe(false);
            expect(context.capabilities.editableTree).toBe(false);
            expect(context.capabilities.gamePanels).toBe(false);
            expect(context.capabilities.roundChat).toBe(false);
            expect(context.capabilities.engineTools).toBe(false);
            expect(context.capabilities.usesRoundSocket).toBe(false);
            expect(context.capabilities.positionEvaluation).toBe(false);
        }
    });
});
