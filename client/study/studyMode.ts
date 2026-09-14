import type { StudyChapterMode } from '../types';

export type StudyLocalModeOverride = 'preview' | 'analysis' | null;

export type StudySessionMode =
    | 'normal-analysis'
    | 'conceal-author'
    | 'conceal-reader'
    | 'conceal-preview'
    | 'gamebook-author'
    | 'gamebook-play'
    | 'gamebook-preview'
    | 'gamebook-analysis'
    | 'practice-play'
    | 'practice-analysis';

export type StudyStartPath = 'current' | 'root' | 'shared-or-root';
export type StudyPracticeUnavailableReason = 'computer-disabled' | 'active-game';

export interface StudySessionPolicyInput {
    mode: StudyChapterMode;
    canWrite: boolean;
    computerAllowed: boolean;
    savedRecording: boolean;
    savedSynchronization: boolean;
    activeGame: boolean;
    override?: StudyLocalModeOverride;
}

export interface StudySessionPolicy {
    session: StudySessionMode;
    override: StudyLocalModeOverride;
    training: boolean;
    preview: boolean;
    startPath: StudyStartPath;
    recording: boolean;
    synchronization: boolean;
    canPersistEdits: boolean;
    canPublishSharedPosition: boolean;
    canFollowSharedPosition: boolean;
    tools: {
        fullTree: boolean;
        annotations: boolean;
        computerSearch: boolean;
        computerOutput: boolean;
        evaluationDisplay: boolean;
        serverAnalysis: boolean;
    };
    practice: {
        available: boolean;
        unavailableReason?: StudyPracticeUnavailableReason;
    };
}

type SessionShape = {
    session: StudySessionMode;
    override: StudyLocalModeOverride;
    training: boolean;
    preview: boolean;
    startPath: StudyStartPath;
    authoring: boolean;
    synchronization: boolean;
    fullTree: boolean;
    ordinaryAnalysisTools: boolean;
};

function normalizedSession(input: StudySessionPolicyInput): SessionShape {
    const override = input.override ?? null;

    if (input.mode === 'practice') {
        if (override === 'analysis' && input.canWrite) {
            return {
                session: 'practice-analysis',
                override,
                training: false,
                preview: false,
                startPath: 'current',
                authoring: true,
                synchronization: input.savedSynchronization,
                fullTree: true,
                ordinaryAnalysisTools: true,
            };
        }
        return {
            session: 'practice-play',
            override: null,
            training: true,
            preview: false,
            startPath: 'root',
            authoring: false,
            synchronization: false,
            fullTree: false,
            ordinaryAnalysisTools: false,
        };
    }

    if (input.mode === 'gamebook') {
        if (override === 'analysis') {
            return {
                session: 'gamebook-analysis',
                override,
                training: false,
                preview: false,
                startPath: 'current',
                authoring: input.canWrite,
                synchronization: input.savedSynchronization,
                fullTree: true,
                ordinaryAnalysisTools: true,
            };
        }
        if (input.canWrite && override !== 'preview') {
            return {
                session: 'gamebook-author',
                override: null,
                training: false,
                preview: false,
                startPath: 'current',
                authoring: true,
                synchronization: input.savedSynchronization,
                fullTree: true,
                ordinaryAnalysisTools: true,
            };
        }
        return {
            session: input.canWrite ? 'gamebook-preview' : 'gamebook-play',
            override: input.canWrite ? 'preview' : null,
            training: true,
            preview: input.canWrite,
            startPath: 'root',
            authoring: false,
            synchronization: false,
            fullTree: false,
            ordinaryAnalysisTools: false,
        };
    }

    if (input.mode === 'conceal') {
        if (input.canWrite && override !== 'preview') {
            return {
                session: 'conceal-author',
                override: null,
                training: false,
                preview: false,
                startPath: 'current',
                authoring: true,
                synchronization: input.savedSynchronization,
                fullTree: true,
                ordinaryAnalysisTools: true,
            };
        }
        const preview = input.canWrite && override === 'preview';
        return {
            session: preview ? 'conceal-preview' : 'conceal-reader',
            override: preview ? 'preview' : null,
            training: false,
            preview,
            startPath: preview ? 'root' : input.savedSynchronization ? 'shared-or-root' : 'root',
            authoring: false,
            synchronization: preview ? false : input.savedSynchronization,
            fullTree: false,
            ordinaryAnalysisTools: false,
        };
    }

    return {
        session: 'normal-analysis',
        override: null,
        training: false,
        preview: false,
        startPath: 'current',
        authoring: input.canWrite,
        synchronization: input.savedSynchronization,
        fullTree: true,
        ordinaryAnalysisTools: true,
    };
}

/**
 * Derive the effective Study behavior without mutating the user's saved REC/SYNC
 * preferences. Training/preview sessions may force those behaviors off locally;
 * returning to analysis simply derives the policy again from the saved values.
 */
export function studySessionPolicy(input: StudySessionPolicyInput): StudySessionPolicy {
    const shape = normalizedSession(input);
    const canPersistEdits = shape.authoring && input.canWrite;
    const evaluationAllowed = input.computerAllowed && !input.activeGame;
    const practiceAvailable = input.computerAllowed && !input.activeGame;
    const computerSearch =
        input.mode === 'practice' && shape.training
            ? practiceAvailable
            : shape.ordinaryAnalysisTools && evaluationAllowed;
    const ordinaryComputerOutput = shape.ordinaryAnalysisTools && evaluationAllowed;

    return {
        session: shape.session,
        override: shape.override,
        training: shape.training,
        preview: shape.preview,
        startPath: shape.startPath,
        recording: canPersistEdits && input.savedRecording,
        synchronization: shape.synchronization,
        canPersistEdits,
        canPublishSharedPosition: canPersistEdits && shape.synchronization,
        canFollowSharedPosition: shape.synchronization,
        tools: {
            fullTree: shape.fullTree,
            annotations: canPersistEdits,
            computerSearch,
            computerOutput: ordinaryComputerOutput,
            evaluationDisplay: ordinaryComputerOutput,
            serverAnalysis: canPersistEdits && !shape.training && !input.activeGame,
        },
        practice: {
            available: practiceAvailable,
            ...(!practiceAvailable
                ? {
                      unavailableReason: input.activeGame ? ('active-game' as const) : ('computer-disabled' as const),
                  }
                : {}),
        },
    };
}
