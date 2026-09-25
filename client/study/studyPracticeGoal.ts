import type { PracticeGoal } from '../types';
import { studyPracticeOutcome, type StudyPracticeEvaluation, type StudyPracticeVerdict } from './studyPracticeFeedback';

export type StudyPracticeGoalDecision = 'ongoing' | 'success' | 'failure' | 'indeterminate';

export interface StudyPracticeGoalPosition {
    goal: PracticeGoal;
    learnerColor: 'white' | 'black';
    learnerMoves: number;
    terminalResult?: string;
    checkmate: boolean;
    promotion: boolean;
    evaluation?: StudyPracticeEvaluation;
    feedbackVerdict?: StudyPracticeVerdict;
}

export const PRACTICE_GOAL_MIN_DEPTH = 16;
const DRAWISH_CP = 150;
const MATE_SCORE_CP = 99_999;

function learnerPovScore(
    evaluation: StudyPracticeEvaluation | undefined,
    learnerColor: 'white' | 'black',
): { cp: number; mate?: number } | undefined {
    if (!evaluation?.score || evaluation.bound || (evaluation.depth ?? 0) < PRACTICE_GOAL_MIN_DEPTH) return undefined;

    const { cp, mate } = evaluation.score;
    if (cp === undefined && mate === undefined) return undefined;

    const sideToMoveSign = evaluation.turnColor === learnerColor ? 1 : -1;
    if (mate !== undefined) {
        const learnerMate = mate * sideToMoveSign;
        return {
            cp: learnerMate > 0 ? MATE_SCORE_CP : learnerMate < 0 ? -MATE_SCORE_CP : 0,
            mate: learnerMate,
        };
    }
    return { cp: (cp ?? 0) * sideToMoveSign };
}

function goalCpFromLearnerPov(goalCp: number, learnerColor: 'white' | 'black'): number {
    // Lichess Termination centipawn targets are expressed from White's point of view.
    // Convert the target to the fixed learner point of view before comparing it with
    // Fairy-Stockfish's side-to-move score above.
    return learnerColor === 'white' ? goalCp : -goalCp;
}

function reliableScore(input: StudyPracticeGoalPosition): { cp: number; mate?: number } | undefined {
    return learnerPovScore(input.evaluation, input.learnerColor);
}

function drawish(input: StudyPracticeGoalPosition): boolean | undefined {
    const score = reliableScore(input);
    if (!score) return undefined;
    if (score.mate) return false;
    return Math.abs(score.cp) < DRAWISH_CP;
}

function reachesEvalGoal(input: StudyPracticeGoalPosition, cp: number): boolean | undefined {
    const score = reliableScore(input);
    if (!score) return undefined;
    return score.cp >= goalCpFromLearnerPov(cp, input.learnerColor);
}

/**
 * Evaluate one open-ended Practice-with-computer objective.
 *
 * `indeterminate` means the objective needs an engine evaluation but the bounded
 * search did not produce a deep, exact score. Callers must not turn that into either
 * success or failure. Terminal variant results come from the full-history ffish Board,
 * so generic `win` works for region/extinction/racing/connect-N variants as well as chess.
 */
export function evaluateStudyPracticeGoal(input: StudyPracticeGoalPosition): StudyPracticeGoalDecision {
    const terminalOutcome = input.terminalResult
        ? studyPracticeOutcome(input.terminalResult, input.learnerColor)
        : undefined;

    if (terminalOutcome === 'loss') return 'failure';
    if (terminalOutcome === 'win') {
        if (input.goal.result === 'mate') return input.checkmate ? 'success' : 'failure';
        if (input.goal.result === 'mateIn')
            return input.checkmate && input.learnerMoves <= input.goal.moves ? 'success' : 'failure';
        if (input.goal.result === 'winIn') return input.learnerMoves <= input.goal.moves ? 'success' : 'failure';
        return 'success';
    }
    if (terminalOutcome === 'draw') {
        if (input.goal.result !== 'drawIn' && input.goal.result !== 'equalIn') return 'failure';
        return input.learnerMoves <= input.goal.moves ? 'success' : 'failure';
    }

    // Match Lichess Practice: a clearly bad learner move fails an objective even when
    // the position has not become terminal yet. Terminal success above still wins.
    if (input.feedbackVerdict === 'mistake' || input.feedbackVerdict === 'blunder') return 'failure';

    switch (input.goal.result) {
        case 'win':
            return 'ongoing';
        case 'winIn':
            return input.learnerMoves >= input.goal.moves ? 'failure' : 'ongoing';
        case 'mate': {
            const isDrawish = drawish(input);
            if (isDrawish === undefined) return 'indeterminate';
            return isDrawish ? 'failure' : 'ongoing';
        }
        case 'mateIn': {
            if (input.learnerMoves > input.goal.moves) return 'failure';
            const score = reliableScore(input);
            if (!score) return 'indeterminate';
            const mateIn = score.mate;
            if (!mateIn || mateIn <= 0 || mateIn + input.learnerMoves > input.goal.moves) return 'failure';
            return 'ongoing';
        }
        case 'drawIn':
        case 'equalIn': {
            if (input.learnerMoves > input.goal.moves) return 'failure';
            const isDrawish = drawish(input);
            if (isDrawish === undefined) return 'indeterminate';
            if (!isDrawish) return 'failure';
            return input.learnerMoves >= input.goal.moves ? 'success' : 'ongoing';
        }
        case 'evalIn': {
            if (input.learnerMoves < input.goal.moves) return 'ongoing';
            const reached = reachesEvalGoal(input, input.goal.cp);
            if (reached === undefined) return 'indeterminate';
            return reached ? 'success' : 'failure';
        }
        case 'promotion': {
            if (!input.promotion) return 'ongoing';
            const reached = reachesEvalGoal(input, input.goal.cp);
            if (reached === undefined) return 'indeterminate';
            return reached ? 'success' : 'failure';
        }
    }
}

/** Detect promotion from Fairy-Stockfish move/SAN forms without chess-only board assumptions. */
export function studyPracticeMovePromotes(move: string, san?: string): boolean {
    // Chess-family SAN uses `=Q`; shogi-family UCI encodings use a trailing `+`.
    // The SAN test also covers larger boards where coordinate lengths are not fixed.
    return Boolean(san?.includes('=') || move.endsWith('+'));
}
