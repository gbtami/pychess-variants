import * as cg from 'chessgroundx/types';

import { FairyStockfish, Notation } from 'ffish-es6';

import { Step } from './messages';
import { Variant } from './variants';

export interface NotationOption {
    id: string;
    boardNotation: cg.Notation;
    label: string;
}

const LEGACY_NATIVE_NOTATION_SETTINGS_KEY = 'nativeNotation';
const SHOGI_NOTATION_OPTIONS: NotationOption[] = [
    { id: 'shogi-arabic', boardNotation: cg.Notation.SHOGI_ARBNUM, label: 'Arabic / Arabic' },
    { id: 'shogi-kanji', boardNotation: cg.Notation.SHOGI_HANNUM, label: 'Arabic / Kanji' },
    { id: 'shogi-english', boardNotation: cg.Notation.SHOGI_ENGLET, label: 'Arabic / English' },
];
const XIANGQI_NOTATION_OPTIONS: NotationOption[] = [
    { id: 'xiangqi-arabic', boardNotation: cg.Notation.XIANGQI_ARBNUM, label: 'Arabic / Arabic' },
    { id: 'xiangqi-hanzi', boardNotation: cg.Notation.XIANGQI_HANNUM, label: 'Arabic / Hanzi' },
];
const THAI_NOTATION_OPTIONS: NotationOption[] = [
    { id: 'thai-international', boardNotation: cg.Notation.ALGEBRAIC, label: 'International algebraic' },
    { id: 'thai-native', boardNotation: cg.Notation.THAI_ALGEBRAIC, label: 'Thai algebraic' },
];

const THAI_VARIANTS = new Set(['makruk', 'makpong', 'cambodian', 'makrukhouse', 'makbug']);

export function notationSettingsName(variant: Variant): string {
    return `${variant.name}-notation`;
}

export function notationOptionsForVariant(variant: Variant): NotationOption[] {
    if (THAI_VARIANTS.has(variant.name)) return THAI_NOTATION_OPTIONS;

    switch (variant.notation) {
        case cg.Notation.SHOGI_ARBNUM:
            return SHOGI_NOTATION_OPTIONS;
        case cg.Notation.XIANGQI_ARBNUM:
            return XIANGQI_NOTATION_OPTIONS;
        default:
            return [{ id: 'default', boardNotation: variant.notation, label: 'Default' }];
    }
}

export function supportsNotationSelection(variant: Variant): boolean {
    return notationOptionsForVariant(variant).length > 1;
}

function optionIdForBoardNotation(variant: Variant, notation: cg.Notation): string | undefined {
    return notationOptionsForVariant(variant).find((option) => option.boardNotation === notation)?.id;
}

function defaultNotationOptionId(variant: Variant): string {
    return optionIdForBoardNotation(variant, variant.notation) ?? notationOptionsForVariant(variant)[0].id;
}

function migratedLegacyNotationOptionId(variant: Variant): string | undefined {
    if (localStorage[LEGACY_NATIVE_NOTATION_SETTINGS_KEY] !== 'true') return undefined;

    if (THAI_VARIANTS.has(variant.name)) return optionIdForBoardNotation(variant, cg.Notation.THAI_ALGEBRAIC);

    switch (variant.notation) {
        case cg.Notation.SHOGI_ARBNUM:
            return optionIdForBoardNotation(variant, cg.Notation.SHOGI_HANNUM);
        case cg.Notation.XIANGQI_ARBNUM:
            return optionIdForBoardNotation(variant, cg.Notation.XIANGQI_HANNUM);
        default:
            return undefined;
    }
}

export function selectedNotationOptionId(variant: Variant): string {
    const options = notationOptionsForVariant(variant);
    const stored = localStorage[notationSettingsName(variant)];
    if (stored && options.some((option) => option.id === stored)) return stored;

    return migratedLegacyNotationOptionId(variant) ?? defaultNotationOptionId(variant);
}

export function boardNotationForVariant(variant: Variant): cg.Notation {
    const selectedId = selectedNotationOptionId(variant);
    return notationOptionsForVariant(variant).find((option) => option.id === selectedId)?.boardNotation ?? variant.notation;
}

export function ffishNotationForBoardNotation(
    ffish: FairyStockfish,
    notation: cg.Notation,
): Notation {
    switch (notation) {
        case cg.Notation.SHOGI_ENGLET:
            return ffish.Notation.SHOGI_HODGES;
        case cg.Notation.SHOGI_ARBNUM:
        case cg.Notation.SHOGI_HANNUM:
            return ffish.Notation.SHOGI_HODGES_NUMBER;
        case cg.Notation.JANGGI:
            return ffish.Notation.JANGGI;
        case cg.Notation.XIANGQI_ARBNUM:
        case cg.Notation.XIANGQI_HANNUM:
            return ffish.Notation.XIANGQI_WXF;
        case cg.Notation.THAI_ALGEBRAIC:
            return ffish.Notation.THAI_SAN;
        default:
            return ffish.Notation.SAN;
    }
}

export function stepDisplaySan(step: Pick<Step, 'displaySan' | 'san'>): string | undefined {
    return step.displaySan ?? step.san;
}

export function rebuildSingleBoardDisplaySans(
    ffish: FairyStockfish,
    variant: Variant,
    chess960: boolean,
    steps: Step[],
    notation: cg.Notation,
): void {
    if (steps.length < 2) return;

    const notationObject = ffishNotationForBoardNotation(ffish, notation);
    const board = new ffish.Board(variant.name, steps[0].fen, chess960);

    try {
        for (let ply = 1; ply < steps.length; ply++) {
            const step = steps[ply];
            if (step.move === undefined) {
                step.displaySan = step.san;
                continue;
            }

            step.displaySan = board.sanMove(step.move, notationObject);
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
    notation: cg.Notation,
): void {
    if (steps.length < 2) return;

    const notationObject = ffishNotationForBoardNotation(ffish, notation);
    const boardA = new ffish.Board(variant.name, steps[0].fen, chess960);
    const boardB = new ffish.Board(variant.name, steps[0].fenB ?? steps[0].fen, chess960);

    try {
        for (let ply = 1; ply < steps.length; ply++) {
            const step = steps[ply];
            const board = step.boardName === 'b' ? boardB : boardA;
            const move = step.boardName === 'b' ? step.moveB : step.move;

            step.displaySan = move === undefined ? step.san : board.sanMove(move, notationObject);

            if (step.fen) boardA.setFen(step.fen);
            if (step.fenB) boardB.setFen(step.fenB);
        }
    } finally {
        boardA.delete();
        boardB.delete();
    }
}
