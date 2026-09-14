import { describe, expect, test } from '@jest/globals';

import {
    studySessionPolicy,
    type StudyLocalModeOverride,
    type StudySessionPolicyInput,
} from '../client/study/studyMode';
import type { StudyChapterMode } from '../client/types';

function policy(mode: StudyChapterMode, overrides: Partial<Omit<StudySessionPolicyInput, 'mode'>> = {}) {
    return studySessionPolicy({
        mode,
        canWrite: true,
        computerAllowed: true,
        savedRecording: true,
        savedSynchronization: true,
        activeGame: false,
        ...overrides,
    });
}

function expectSavedPreferencesUntouched(
    mode: StudyChapterMode,
    override: StudyLocalModeOverride,
    expected: { recording: boolean; synchronization: boolean },
) {
    const input: StudySessionPolicyInput = {
        mode,
        canWrite: true,
        computerAllowed: true,
        savedRecording: true,
        savedSynchronization: true,
        activeGame: false,
        override,
    };
    const snapshot = { ...input };

    const result = studySessionPolicy(input);

    expect(input).toEqual(snapshot);
    expect(result.recording).toBe(expected.recording);
    expect(result.synchronization).toBe(expected.synchronization);
}

describe('Study effective session policy', () => {
    test('normal analysis preserves writable REC/SYNC behavior and all analysis tools', () => {
        const result = policy('normal');

        expect(result).toMatchObject({
            session: 'normal-analysis',
            training: false,
            preview: false,
            startPath: 'current',
            recording: true,
            synchronization: true,
            canPersistEdits: true,
            canPublishSharedPosition: true,
            canFollowSharedPosition: true,
            tools: {
                fullTree: true,
                annotations: true,
                computerSearch: true,
                computerOutput: true,
                evaluationDisplay: true,
                serverAnalysis: true,
            },
        });
    });

    test('conceal author view preserves REC/SYNC and exposes the full author tree', () => {
        const result = policy('conceal');

        expect(result.session).toBe('conceal-author');
        expect(result.recording).toBe(true);
        expect(result.synchronization).toBe(true);
        expect(result.tools.fullTree).toBe(true);
        expect(result.tools.computerOutput).toBe(true);
    });

    test('conceal reader cannot persist but may follow the presenter and starts from shared-or-root', () => {
        const result = policy('conceal', { canWrite: false });

        expect(result).toMatchObject({
            session: 'conceal-reader',
            startPath: 'shared-or-root',
            recording: false,
            synchronization: true,
            canPersistEdits: false,
            canPublishSharedPosition: false,
            canFollowSharedPosition: true,
            tools: {
                fullTree: false,
                annotations: false,
                computerSearch: false,
                computerOutput: false,
                evaluationDisplay: false,
                serverAnalysis: false,
            },
        });
    });

    test('conceal reader with SYNC disabled starts at root and remains detached', () => {
        const result = policy('conceal', { canWrite: false, savedSynchronization: false });

        expect(result.startPath).toBe('root');
        expect(result.synchronization).toBe(false);
        expect(result.canFollowSharedPosition).toBe(false);
    });

    test('conceal Preview uses reader visibility without changing saved collaboration preferences', () => {
        expectSavedPreferencesUntouched('conceal', 'preview', { recording: false, synchronization: false });
        const result = policy('conceal', { override: 'preview' });

        expect(result).toMatchObject({
            session: 'conceal-preview',
            override: 'preview',
            preview: true,
            startPath: 'root',
            canPersistEdits: false,
            canPublishSharedPosition: false,
            canFollowSharedPosition: false,
            tools: { fullTree: false },
        });
    });

    test('interactive lesson contributors author with their saved REC/SYNC preferences', () => {
        const result = policy('gamebook');

        expect(result).toMatchObject({
            session: 'gamebook-author',
            startPath: 'current',
            recording: true,
            synchronization: true,
            canPersistEdits: true,
            tools: { fullTree: true, annotations: true },
        });
    });

    test('interactive lesson readers enter local playback at root with REC/SYNC effectively off', () => {
        const result = policy('gamebook', { canWrite: false });

        expect(result).toMatchObject({
            session: 'gamebook-play',
            training: true,
            startPath: 'root',
            recording: false,
            synchronization: false,
            canPersistEdits: false,
            canPublishSharedPosition: false,
            canFollowSharedPosition: false,
            tools: {
                fullTree: false,
                annotations: false,
                computerSearch: false,
                computerOutput: false,
                evaluationDisplay: false,
                serverAnalysis: false,
            },
        });
    });

    test('interactive lesson Preview is a fresh local attempt and does not overwrite saved REC/SYNC', () => {
        expectSavedPreferencesUntouched('gamebook', 'preview', { recording: false, synchronization: false });
        const result = policy('gamebook', { override: 'preview' });

        expect(result.session).toBe('gamebook-preview');
        expect(result.preview).toBe(true);
        expect(result.startPath).toBe('root');
    });

    test('interactive lesson Analysis override restores ordinary read-only analysis policy', () => {
        const result = policy('gamebook', { canWrite: false, override: 'analysis' });

        expect(result).toMatchObject({
            session: 'gamebook-analysis',
            override: 'analysis',
            training: false,
            startPath: 'current',
            recording: false,
            synchronization: true,
            canPersistEdits: false,
            canFollowSharedPosition: true,
            tools: {
                fullTree: true,
                annotations: false,
                computerSearch: true,
                computerOutput: true,
                evaluationDisplay: true,
                serverAnalysis: false,
            },
        });
    });

    test('computer practice is always a local root session until a contributor returns to analysis', () => {
        const result = policy('practice');

        expect(result).toMatchObject({
            session: 'practice-play',
            training: true,
            startPath: 'root',
            recording: false,
            synchronization: false,
            canPersistEdits: false,
            canPublishSharedPosition: false,
            canFollowSharedPosition: false,
            tools: {
                fullTree: false,
                annotations: false,
                computerSearch: true,
                computerOutput: false,
                evaluationDisplay: false,
                serverAnalysis: false,
            },
            practice: { available: true },
        });
    });

    test('practice Analysis override restores contributor authoring preferences without mutating them', () => {
        expectSavedPreferencesUntouched('practice', 'analysis', { recording: true, synchronization: true });
        const result = policy('practice', { override: 'analysis' });

        expect(result).toMatchObject({
            session: 'practice-analysis',
            override: 'analysis',
            training: false,
            startPath: 'current',
            canPersistEdits: true,
            tools: {
                fullTree: true,
                computerSearch: true,
                computerOutput: true,
                evaluationDisplay: true,
                serverAnalysis: true,
            },
        });
    });

    test('practice Analysis override is dropped after write permission is revoked', () => {
        const result = policy('practice', { canWrite: false, override: 'analysis' });

        expect(result).toMatchObject({
            session: 'practice-play',
            override: null,
            recording: false,
            synchronization: false,
            canPersistEdits: false,
        });
    });

    test('gamebook authoring falls back to reader playback after write permission is revoked', () => {
        const before = policy('gamebook');
        const after = policy('gamebook', { canWrite: false });

        expect(before.session).toBe('gamebook-author');
        expect(after).toMatchObject({
            session: 'gamebook-play',
            recording: false,
            synchronization: false,
            canPersistEdits: false,
        });
    });

    test('normal and conceal read-only sessions fail closed for recording without erasing saved REC', () => {
        for (const mode of ['normal', 'conceal'] as const) {
            const input: StudySessionPolicyInput = {
                mode,
                canWrite: false,
                computerAllowed: true,
                savedRecording: true,
                savedSynchronization: true,
                activeGame: false,
            };
            const result = studySessionPolicy(input);

            expect(result.recording).toBe(false);
            expect(input.savedRecording).toBe(true);
        }
    });

    test('computer permission denial blocks practice and ordinary computer tools with an explicit reason', () => {
        expect(policy('practice', { computerAllowed: false }).practice).toEqual({
            available: false,
            unavailableReason: 'computer-disabled',
        });
        const normal = policy('normal', { computerAllowed: false });
        expect(normal.tools.computerSearch).toBe(false);
        expect(normal.tools.computerOutput).toBe(false);
        expect(normal.tools.evaluationDisplay).toBe(false);
    });

    test('an active eligible game blocks all engine/evaluation surfaces and practice startup', () => {
        const practice = policy('practice', { activeGame: true });
        expect(practice.practice).toEqual({ available: false, unavailableReason: 'active-game' });
        expect(practice.tools.computerSearch).toBe(false);

        const normal = policy('normal', { activeGame: true });
        expect(normal.tools).toMatchObject({
            computerSearch: false,
            computerOutput: false,
            evaluationDisplay: false,
            serverAnalysis: false,
        });
    });

    test('saved disabled REC/SYNC remain disabled in authoring sessions', () => {
        for (const mode of ['normal', 'conceal', 'gamebook'] as const) {
            const result = policy(mode, { savedRecording: false, savedSynchronization: false });
            expect(result.recording).toBe(false);
            expect(result.synchronization).toBe(false);
            expect(result.canPublishSharedPosition).toBe(false);
            expect(result.canFollowSharedPosition).toBe(false);
        }
    });
});
