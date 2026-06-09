import { describe, expect, test } from '@jest/globals';

import * as cg from 'chessgroundx/types';

import {
    boardNotationForVariant,
    notationSettingsName,
    selectedNotationOptionId,
    stepDisplaySan,
    supportsNotationSelection,
} from '../client/notation';
import { VARIANTS } from '../client/variants';

describe('regional notation preferences', () => {
    test('uses each variant default when nothing is stored', () => {
        localStorage.clear();

        expect(boardNotationForVariant(VARIANTS.shogi)).toBe(cg.Notation.SHOGI_ARBNUM);
        expect(boardNotationForVariant(VARIANTS.xiangqi)).toBe(cg.Notation.XIANGQI_ARBNUM);
        expect(boardNotationForVariant(VARIANTS.makruk)).toBe(cg.Notation.ALGEBRAIC);
    });

    test('applies stored per-variant notation selections', () => {
        localStorage.clear();
        localStorage[notationSettingsName(VARIANTS.shogi)] = 'shogi-english';
        localStorage[notationSettingsName(VARIANTS.xiangqi)] = 'xiangqi-hanzi';
        localStorage[notationSettingsName(VARIANTS.makruk)] = 'thai-native';

        expect(selectedNotationOptionId(VARIANTS.shogi)).toBe('shogi-english');
        expect(boardNotationForVariant(VARIANTS.shogi)).toBe(cg.Notation.SHOGI_ENGLET);
        expect(boardNotationForVariant(VARIANTS.xiangqi)).toBe(cg.Notation.XIANGQI_HANNUM);
        expect(boardNotationForVariant(VARIANTS.makruk)).toBe(cg.Notation.THAI_ALGEBRAIC);
    });

    test('migrates the old global native toggle to the closest per-variant option', () => {
        localStorage.clear();
        localStorage.nativeNotation = 'true';

        expect(selectedNotationOptionId(VARIANTS.shogi)).toBe('shogi-kanji');
        expect(selectedNotationOptionId(VARIANTS.xiangqi)).toBe('xiangqi-hanzi');
        expect(selectedNotationOptionId(VARIANTS.makruk)).toBe('thai-native');
    });

    test('only exposes the selector where multiple choices exist', () => {
        expect(supportsNotationSelection(VARIANTS.shogi)).toBe(true);
        expect(supportsNotationSelection(VARIANTS.xiangqi)).toBe(true);
        expect(supportsNotationSelection(VARIANTS.makruk)).toBe(true);
        expect(supportsNotationSelection(VARIANTS.janggi)).toBe(false);
    });

    test('prefers display SAN when present', () => {
        expect(stepDisplaySan({ san: 'e4' })).toBe('e4');
        expect(stepDisplaySan({ san: 'e4', displaySan: 'ร-ก๑' })).toBe('ร-ก๑');
    });
});
