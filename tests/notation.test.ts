import { describe, expect, test } from '@jest/globals';

import * as cg from 'chessgroundx/types';

import {
    boardNotationForVariant,
    ffishNotationNameForVariant,
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
        expect(ffishNotationNameForVariant(VARIANTS.shogi)).toBe('SHOGI_HODGES_NUMBER');
        expect(boardNotationForVariant(VARIANTS.xiangqi)).toBe(cg.Notation.XIANGQI_ARBNUM);
        expect(ffishNotationNameForVariant(VARIANTS.xiangqi)).toBe('XIANGQI_WXF');
        expect(boardNotationForVariant(VARIANTS.makruk)).toBe(cg.Notation.ALGEBRAIC);
        expect(ffishNotationNameForVariant(VARIANTS.makruk)).toBe('SAN');
        expect(boardNotationForVariant(VARIANTS.janggi)).toBe(cg.Notation.JANGGI);
        expect(ffishNotationNameForVariant(VARIANTS.janggi)).toBe('JANGGI');
    });

    test('applies stored per-variant notation selections', () => {
        localStorage.clear();
        localStorage[notationSettingsName(VARIANTS.shogi)] = 'shogi-japanese';
        localStorage[notationSettingsName(VARIANTS.xiangqi)] = 'xiangqi-chinese';
        localStorage[notationSettingsName(VARIANTS.makruk)] = 'thai-lan';
        localStorage[notationSettingsName(VARIANTS.janggi)] = 'janggi-korean';

        expect(selectedNotationOptionId(VARIANTS.shogi)).toBe('shogi-japanese');
        expect(boardNotationForVariant(VARIANTS.shogi)).toBe(cg.Notation.SHOGI_HANNUM);
        expect(ffishNotationNameForVariant(VARIANTS.shogi)).toBe('SHOGI_JAPANESE');
        expect(boardNotationForVariant(VARIANTS.xiangqi)).toBe(cg.Notation.XIANGQI_HANNUM);
        expect(ffishNotationNameForVariant(VARIANTS.xiangqi)).toBe('XIANGQI_CHINESE');
        expect(boardNotationForVariant(VARIANTS.makruk)).toBe(cg.Notation.THAI_ALGEBRAIC);
        expect(ffishNotationNameForVariant(VARIANTS.makruk)).toBe('THAI_LAN');
        expect(boardNotationForVariant(VARIANTS.janggi)).toBe(cg.Notation.JANGGI);
        expect(ffishNotationNameForVariant(VARIANTS.janggi)).toBe('JANGGI_KOREAN');
    });

    test('only exposes the selector where multiple choices exist', () => {
        expect(supportsNotationSelection(VARIANTS.shogi)).toBe(true);
        expect(supportsNotationSelection(VARIANTS.xiangqi)).toBe(true);
        expect(supportsNotationSelection(VARIANTS.makruk)).toBe(true);
        expect(supportsNotationSelection(VARIANTS.janggi)).toBe(true);
        expect(supportsNotationSelection(VARIANTS.chess)).toBe(false);
    });

    test('prefers display SAN when present', () => {
        expect(stepDisplaySan({ san: 'e4' })).toBe('e4');
        expect(stepDisplaySan({ san: 'e4', displaySan: 'ร-ก๑' })).toBe('ร-ก๑');
    });
});
