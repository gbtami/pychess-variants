import type { AnalysisPracticeBound, AnalysisPracticeScore } from '../analysis/analysisPracticeEngine';
import { povChances } from '../analysis/winningChances';

export type StudyPracticeColor = 'white' | 'black';
export type StudyPracticeVerdict = 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'unknown';

export interface StudyPracticeEvaluation {
    turnColor: StudyPracticeColor;
    score?: AnalysisPracticeScore;
    bound?: AnalysisPracticeBound;
    bestMove?: string | null;
}

export interface StudyPracticeFeedback {
    verdict: StudyPracticeVerdict;
    playedMove: string;
    bestMove?: string;
    bestSan?: string;
    winningChanceLoss?: number;
    outcome?: 'win' | 'draw' | 'loss';
}

const CASTLING_ALIASES: ReadonlyArray<readonly [string, string]> = [
    ['e1a1', 'e1c1'],
    ['e1h1', 'e1g1'],
    ['e8a8', 'e8c8'],
    ['e8h8', 'e8g8'],
];

/**
 * Lichess/chessops and Fairy-Stockfish can use king-to-rook versus king-to-destination
 * encodings for ordinary castling. Keep the alias deliberately narrow: promotions,
 * drops, gating suffixes and other variant move encodings must still match exactly.
 */
export function studyPracticeMovesEquivalent(a: string, b: string): boolean {
    if (a === b) return true;
    return CASTLING_ALIASES.some(([left, right]) => (a === left && b === right) || (a === right && b === left));
}

function resultOutcome(result: string, learnerColor: StudyPracticeColor): StudyPracticeFeedback['outcome'] | undefined {
    if (result === '1-0') return learnerColor === 'white' ? 'win' : 'loss';
    if (result === '0-1') return learnerColor === 'black' ? 'win' : 'loss';
    if (result === '1/2-1/2' || result === '½-½' || result === '0.5-0.5') return 'draw';
    return undefined;
}

function outcomeWinningChance(outcome: StudyPracticeFeedback['outcome']): number | undefined {
    if (outcome === 'win') return 1;
    if (outcome === 'draw') return 0;
    if (outcome === 'loss') return -1;
    return undefined;
}

/**
 * Fairy-Stockfish UCI scores are from the side-to-move point of view. Passing that
 * side through PyChess's shared povChances helper first converts the score to White's
 * point of view; the final sign change converts it to the fixed learner's point of view.
 */
export function studyPracticeLearnerWinningChances(
    evaluation: StudyPracticeEvaluation,
    learnerColor: StudyPracticeColor,
): number | undefined {
    if (!evaluation.score || evaluation.bound) return undefined;
    const score = evaluation.score;
    if (score.cp === undefined && score.mate === undefined) return undefined;
    const whitePov = povChances(evaluation.turnColor, score);
    return learnerColor === 'white' ? whitePov : -whitePov;
}

export function studyPracticeOutcome(
    result: string,
    learnerColor: StudyPracticeColor,
): StudyPracticeFeedback['outcome'] | undefined {
    return resultOutcome(result, learnerColor);
}

export function studyPracticeOutcomeText(
    result: string | undefined,
    learnerColor: StudyPracticeColor,
): 'learner-win' | 'computer-win' | 'draw' | 'game-over' {
    if (!result) return 'game-over';
    const outcome = resultOutcome(result, learnerColor);
    if (outcome === 'win') return 'learner-win';
    if (outcome === 'loss') return 'computer-win';
    if (outcome === 'draw') return 'draw';
    return 'game-over';
}

export function gradeStudyPracticeMove(input: {
    learnerColor: StudyPracticeColor;
    playedMove: string;
    parent: StudyPracticeEvaluation;
    child?: StudyPracticeEvaluation;
    terminalResult?: string;
    bestSan?: string;
}): StudyPracticeFeedback {
    const bestMove = input.parent.bestMove ?? undefined;
    const outcome = input.terminalResult ? resultOutcome(input.terminalResult, input.learnerColor) : undefined;
    const base = {
        playedMove: input.playedMove,
        ...(bestMove && !studyPracticeMovesEquivalent(bestMove, input.playedMove) ? { bestMove } : {}),
        ...(input.bestSan && bestMove && !studyPracticeMovesEquivalent(bestMove, input.playedMove)
            ? { bestSan: input.bestSan }
            : {}),
        ...(outcome ? { outcome } : {}),
    };

    // A completed engine search identifying this exact move as best is enough to avoid
    // a negative verdict even if its final info line omitted a usable score.
    if (bestMove && studyPracticeMovesEquivalent(bestMove, input.playedMove)) return { verdict: 'good', ...base };

    // A terminal win is exact and cannot be improved upon. Other terminal outcomes
    // still need the parent position to know whether anything better was available.
    if (outcome === 'win') return { verdict: 'good', ...base };

    const parentChance = studyPracticeLearnerWinningChances(input.parent, input.learnerColor);
    const childChance = outcome
        ? outcomeWinningChance(outcome)
        : input.child
          ? studyPracticeLearnerWinningChances(input.child, input.learnerColor)
          : undefined;

    if (parentChance === undefined || childChance === undefined) return { verdict: 'unknown', ...base };

    const winningChanceLoss = parentChance - childChance;
    let verdict: StudyPracticeVerdict;
    if (winningChanceLoss < 0.025) verdict = 'good';
    else if (winningChanceLoss < 0.06) verdict = 'inaccuracy';
    else if (winningChanceLoss < 0.14) verdict = 'mistake';
    else verdict = 'blunder';

    return { verdict, winningChanceLoss, ...base };
}
