import { describe, expect, test } from '@jest/globals';

import {
    gradeStudyPracticeMove,
    studyPracticeLearnerWinningChances,
    studyPracticeMovesEquivalent,
    studyPracticeOutcomeText,
    type StudyPracticeEvaluation,
} from '../client/study/studyPracticeFeedback';

const evaluation = (turnColor: 'white' | 'black', cp: number, bestMove = 'e2e4'): StudyPracticeEvaluation => ({
    turnColor,
    score: { cp },
    bestMove,
});

describe('Study practice feedback', () => {
    test('converts side-to-move scores to a fixed learner perspective', () => {
        const whiteParent = studyPracticeLearnerWinningChances(evaluation('white', 120), 'white');
        const whiteChild = studyPracticeLearnerWinningChances(evaluation('black', -120), 'white');
        expect(whiteParent).toBeCloseTo(whiteChild!, 10);
        expect(whiteParent).toBeGreaterThan(0);

        const blackParent = studyPracticeLearnerWinningChances(evaluation('black', 120), 'black');
        const blackChild = studyPracticeLearnerWinningChances(evaluation('white', -120), 'black');
        expect(blackParent).toBeCloseTo(blackChild!, 10);
        expect(blackParent).toBeGreaterThan(0);
    });

    test('handles mate scores with the same perspective conversion', () => {
        const winning: StudyPracticeEvaluation = { turnColor: 'black', score: { mate: 3 } };
        const losing: StudyPracticeEvaluation = { turnColor: 'white', score: { mate: -3 } };
        expect(studyPracticeLearnerWinningChances(winning, 'black')).toBeGreaterThan(0.9);
        expect(studyPracticeLearnerWinningChances(losing, 'black')).toBeGreaterThan(0.9);
    });

    test.each([
        [0, 0, 'good'],
        [0, 13, 'inaccuracy'],
        [0, 31, 'mistake'],
        [0, 75, 'blunder'],
    ] as const)('maps winning-chance loss from cp %s -> %s to %s', (parentCp, childCp, verdict) => {
        const feedback = gradeStudyPracticeMove({
            learnerColor: 'white',
            playedMove: 'd2d4',
            parent: evaluation('white', parentCp, 'e2e4'),
            child: evaluation('black', childCp, 'e7e5'),
        });
        expect(feedback.verdict).toBe(verdict);
    });

    test('best-move matches are good even when the exact score is unavailable', () => {
        const feedback = gradeStudyPracticeMove({
            learnerColor: 'white',
            playedMove: 'e2e4',
            parent: { turnColor: 'white', bestMove: 'e2e4' },
            child: { turnColor: 'black' },
        });
        expect(feedback.verdict).toBe('good');
    });

    test('does not invent a verdict from missing or bounded engine information', () => {
        expect(
            gradeStudyPracticeMove({
                learnerColor: 'white',
                playedMove: 'd2d4',
                parent: { turnColor: 'white', score: { cp: 80 }, bound: 'lower', bestMove: 'e2e4' },
                child: evaluation('black', 0),
            }).verdict,
        ).toBe('unknown');
        expect(
            gradeStudyPracticeMove({
                learnerColor: 'white',
                playedMove: 'd2d4',
                parent: evaluation('white', 80, 'e2e4'),
                child: { turnColor: 'black' },
            }).verdict,
        ).toBe('unknown');
    });

    test('recognizes ordinary castling aliases without weakening promotion or drop matching', () => {
        expect(studyPracticeMovesEquivalent('e1h1', 'e1g1')).toBe(true);
        expect(studyPracticeMovesEquivalent('e8a8', 'e8c8')).toBe(true);
        expect(studyPracticeMovesEquivalent('e7e8q', 'e7e8r')).toBe(false);
        expect(studyPracticeMovesEquivalent('P@e4', 'P@e5')).toBe(false);
    });

    test('an immediate variant win is certainly good, while a draw uses the parent evaluation', () => {
        expect(
            gradeStudyPracticeMove({
                learnerColor: 'black',
                playedMove: 'a2a1',
                parent: { turnColor: 'black', bestMove: null },
                terminalResult: '0-1',
            }).verdict,
        ).toBe('good');

        const draw = gradeStudyPracticeMove({
            learnerColor: 'white',
            playedMove: 'a1a2',
            parent: evaluation('white', 700, 'b1b2'),
            terminalResult: '1/2-1/2',
        });
        expect(draw.verdict).toBe('blunder');
        expect(draw.outcome).toBe('draw');
    });

    test('uses generic result semantics instead of calling every terminal variant win checkmate', () => {
        expect(studyPracticeOutcomeText('1-0', 'white')).toBe('learner-win');
        expect(studyPracticeOutcomeText('1-0', 'black')).toBe('computer-win');
        expect(studyPracticeOutcomeText('1/2-1/2', 'black')).toBe('draw');
        expect(studyPracticeOutcomeText('0-0', 'white')).toBe('game-over');
    });
});
