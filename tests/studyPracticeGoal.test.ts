import { describe, expect, test } from '@jest/globals';

import type { PracticeGoal } from '../client/types';
import {
    evaluateStudyPracticeGoal,
    studyPracticeGoalText,
    studyPracticeMovePromotes,
    type StudyPracticeGoalPosition,
} from '../client/study/studyPracticeGoal';

function position(goal: PracticeGoal, overrides: Partial<StudyPracticeGoalPosition> = {}): StudyPracticeGoalPosition {
    return {
        goal,
        learnerColor: 'white',
        learnerMoves: 1,
        checkmate: false,
        promotion: false,
        ...overrides,
    };
}

const evalAt = (cp: number, depth = 18) => ({ turnColor: 'black' as const, depth, score: { cp: -cp } });

describe('evaluateStudyPracticeGoal', () => {
    test('accepts orthodox checkmate but not another variant-native terminal win for mate goals', () => {
        expect(
            evaluateStudyPracticeGoal(position({ result: 'mate' }, { terminalResult: '1-0', checkmate: true })),
        ).toBe('success');
        expect(
            evaluateStudyPracticeGoal(position({ result: 'mate' }, { terminalResult: '1-0', checkmate: false })),
        ).toBe('failure');
    });

    test('generic win uses the variant-native terminal result without requiring checkmate', () => {
        expect(
            evaluateStudyPracticeGoal(position({ result: 'win' }, { terminalResult: '1-0', checkmate: false })),
        ).toBe('success');
        expect(
            evaluateStudyPracticeGoal(
                position({ result: 'win' }, { learnerColor: 'black', terminalResult: '1-0', checkmate: false }),
            ),
        ).toBe('failure');
    });

    test('win-in and mate-in enforce learner move limits', () => {
        expect(evaluateStudyPracticeGoal(position({ result: 'winIn', moves: 2 }, { learnerMoves: 1 }))).toBe('ongoing');
        expect(evaluateStudyPracticeGoal(position({ result: 'winIn', moves: 2 }, { learnerMoves: 2 }))).toBe('failure');
        expect(
            evaluateStudyPracticeGoal(
                position(
                    { result: 'mateIn', moves: 4 },
                    { learnerMoves: 2, evaluation: { turnColor: 'black', depth: 18, score: { mate: -2 } } },
                ),
            ),
        ).toBe('ongoing');
        expect(
            evaluateStudyPracticeGoal(
                position(
                    { result: 'mateIn', moves: 3 },
                    { learnerMoves: 2, evaluation: { turnColor: 'black', depth: 18, score: { mate: -2 } } },
                ),
            ),
        ).toBe('failure');
    });

    test('draw/equalize goals require a solid drawish evaluation through the move limit', () => {
        expect(
            evaluateStudyPracticeGoal(
                position({ result: 'drawIn', moves: 3 }, { learnerMoves: 2, evaluation: evalAt(80) }),
            ),
        ).toBe('ongoing');
        expect(
            evaluateStudyPracticeGoal(
                position({ result: 'equalIn', moves: 3 }, { learnerMoves: 3, evaluation: evalAt(80) }),
            ),
        ).toBe('success');
        expect(
            evaluateStudyPracticeGoal(
                position({ result: 'drawIn', moves: 3 }, { learnerMoves: 1, evaluation: evalAt(250) }),
            ),
        ).toBe('failure');
    });

    test('eval goals compare the signed PGN target from the learner point of view', () => {
        expect(
            evaluateStudyPracticeGoal(
                position({ result: 'evalIn', moves: 2, cp: 300 }, { learnerMoves: 2, evaluation: evalAt(350) }),
            ),
        ).toBe('success');
        expect(
            evaluateStudyPracticeGoal(
                position(
                    { result: 'evalIn', moves: 2, cp: -300 },
                    {
                        learnerColor: 'black',
                        learnerMoves: 2,
                        evaluation: { turnColor: 'white', depth: 18, score: { cp: -350 } },
                    },
                ),
            ),
        ).toBe('success');
    });

    test('bounded shallow or bound evaluations stay indeterminate instead of inventing an answer', () => {
        expect(
            evaluateStudyPracticeGoal(
                position({ result: 'evalIn', moves: 1, cp: 200 }, { evaluation: evalAt(500, 12) }),
            ),
        ).toBe('indeterminate');
        expect(
            evaluateStudyPracticeGoal(
                position({ result: 'evalIn', moves: 1, cp: 200 }, { evaluation: { ...evalAt(500), bound: 'lower' } }),
            ),
        ).toBe('indeterminate');
    });

    test('promotion goals wait for a promotion and then require the requested evaluation', () => {
        expect(evaluateStudyPracticeGoal(position({ result: 'promotion', cp: 200 }, { evaluation: evalAt(500) }))).toBe(
            'ongoing',
        );
        expect(
            evaluateStudyPracticeGoal(
                position({ result: 'promotion', cp: 200 }, { promotion: true, evaluation: evalAt(500) }),
            ),
        ).toBe('success');
        expect(studyPracticeMovePromotes('e7e8q', 'e8=Q+')).toBe(true);
        expect(studyPracticeMovePromotes('7g7f+', '7f+')).toBe(true);
        expect(studyPracticeMovePromotes('e2e4', 'e4')).toBe(false);
    });

    test('mistakes and blunders fail non-terminal objectives, matching lichess Practice', () => {
        expect(evaluateStudyPracticeGoal(position({ result: 'win' }, { feedbackVerdict: 'mistake' }))).toBe('failure');
        expect(evaluateStudyPracticeGoal(position({ result: 'win' }, { feedbackVerdict: 'good' }))).toBe('ongoing');
    });

    test('describes computer-practice goals with learner-facing variant-safe wording', () => {
        expect(studyPracticeGoalText({ result: 'mate' }, 'white')).toBe('Checkmate the opponent.');
        expect(studyPracticeGoalText({ result: 'mateIn', moves: 3 }, 'white', 1)).toBe(
            'Checkmate the opponent in 2 moves.',
        );
        expect(studyPracticeGoalText({ result: 'evalIn', moves: 4, cp: 300 }, 'white', 1)).toBe(
            'Get a winning position in 3 moves.',
        );
        expect(studyPracticeGoalText({ result: 'evalIn', moves: 4, cp: 300 }, 'black', 1)).toBe('Defend for 3 moves.');
        expect(studyPracticeGoalText({ result: 'promotion', cp: 200 }, 'white')).toBe('Safely promote a piece.');
        expect(studyPracticeGoalText({ result: 'winIn', moves: 2 }, 'white')).toBe('Win the game in 2 moves.');
    });
});
