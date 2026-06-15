import * as cg from 'chessgroundx/types';

import { FairyStockfish, Notation } from 'ffish-es6';

import { resolveFfishNotation } from './ffishNotation';
import { Step } from './messages';
import { FfishNotationName, NotationOption, Variant } from './variants';

export function notationSettingsName(variant: Variant): string {
    return `${variant.name}-notation`;
}

export function notationOptionsForVariant(variant: Variant): readonly NotationOption[] {
    return variant.notationOptions;
}

export function supportsNotationSelection(variant: Variant): boolean {
    return variant.notationOptions.length > 1;
}

function defaultNotationOption(variant: Variant): NotationOption {
    const option = variant.notationOptions.find((candidate) => candidate.id === variant.defaultNotation);
    if (!option) {
        throw new Error(`Variant '${variant.name}' is missing its default notation '${variant.defaultNotation}'`);
    }
    return option;
}

export function selectedNotationOptionId(variant: Variant): string {
    const stored = localStorage[notationSettingsName(variant)];
    if (stored && variant.notationOptions.some((option) => option.id === stored)) return stored;

    return defaultNotationOption(variant).id;
}

export function selectedNotationOption(variant: Variant): NotationOption {
    const selectedId = selectedNotationOptionId(variant);
    const option = variant.notationOptions.find((candidate) => candidate.id === selectedId);
    if (!option) {
        throw new Error(`Variant '${variant.name}' is missing selected notation '${selectedId}'`);
    }
    return option;
}

export function defaultBoardNotationForVariant(variant: Variant): cg.Notation {
    return defaultNotationOption(variant).boardNotation;
}

export function boardNotationForVariant(variant: Variant): cg.Notation {
    return selectedNotationOption(variant).boardNotation;
}

export function ffishNotationNameForVariant(variant: Variant): FfishNotationName {
    return selectedNotationOption(variant).ffishNotation;
}

export function ffishNotationForVariant(ffish: FairyStockfish, variant: Variant): Notation {
    return resolveFfishNotation(ffish, ffishNotationNameForVariant(variant));
}

export function stepDisplaySan(step: Pick<Step, 'displaySan' | 'san'>): string | undefined {
    return step.displaySan ?? step.san;
}

export function rebuildSingleBoardDisplaySans(
    ffish: FairyStockfish,
    variant: Variant,
    chess960: boolean,
    steps: Step[],
    notation: Notation,
): void {
    if (steps.length < 2) return;

    const board = new ffish.Board(variant.name, steps[0].fen, chess960);

    try {
        for (let ply = 1; ply < steps.length; ply++) {
            const step = steps[ply];
            if (step.move === undefined) {
                step.displaySan = step.san;
                continue;
            }

            const lastMoveUci = steps[ply - 1].move ?? '';
            step.displaySan = board.sanMove(step.move, notation, lastMoveUci);
            if (step.fen) board.setFen(step.fen);
        }
    } finally {
        board.delete();
    }
}

export function rebuildBughouseDisplaySans(
    ffish: FairyStockfish,
    variant: Variant,
    chess960: boolean,
    steps: Step[],
    notation: Notation,
): void {
    if (steps.length < 2) return;

    const boardA = new ffish.Board(variant.name, steps[0].fen, chess960);
    const boardB = new ffish.Board(variant.name, steps[0].fenB ?? steps[0].fen, chess960);

    try {
        for (let ply = 1; ply < steps.length; ply++) {
            const step = steps[ply];
            const board = step.boardName === 'b' ? boardB : boardA;
            const move = step.boardName === 'b' ? step.moveB : step.move;

            const lastMoveUci = steps[ply - 1].move ?? '';
            step.displaySan = move === undefined ? step.san : board.sanMove(move, notation, lastMoveUci);

            if (step.fen) boardA.setFen(step.fen);
            if (step.fenB) boardB.setFen(step.fenB);
        }
    } finally {
        boardA.delete();
        boardB.delete();
    }
}
