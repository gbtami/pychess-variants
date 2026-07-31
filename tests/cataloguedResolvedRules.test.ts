import { afterEach, expect, test } from '@jest/globals';

import {
    CataloguedVariantClientDocument,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from '../client/variants';
import { validFen } from '../client/chess';
import { fsfPiece, makeFsfVariantInfo } from './fsfVariantInfoFixture';

const name = 'resolved-rules-test';

afterEach(() => unregisterCataloguedVariant(name));

test('registration uses resolved Fairy-Stockfish metadata instead of stale flattened fields or INI text', () => {
    const resolvedStartFen = '5k3/9/9/9/9/9/9/9/3PK4[-] w - - 3+3 0 1';
    const fsfVariantInfo = makeFsfVariantInfo({
        name,
        template: 'shogi',
        board: {
            width: 9,
            height: 9,
            startFen: resolvedStartFen,
            chess960: true,
            twoBoards: true,
        },
        pieces: [
            fsfPiece('king', 'K'),
            fsfPiece('shogiPawn', 'P'),
            fsfPiece('gold', 'G'),
            fsfPiece('custom1', 'Z', { customBetza: 'WAD' }),
        ],
        pieceTypes: ['king', 'shogiPawn', 'gold', 'custom1'],
        movement: {
            enPassantTypes: { white: ['shogiPawn'], black: [] },
            pass: { white: false, black: true },
        },
        promotion: {
            shogiStyle: true,
            pawnTypes: { white: ['shogiPawn'], black: ['shogiPawn'] },
            promotedPieceTypes: { shogiPawn: 'gold' },
        },
        capture: { blast: true },
        drops: { enabled: true, capturesToHand: true },
        gating: { enabled: true, seirawan: true, wallingRule: 'duck' },
        gameEnd: { checkCounting: true },
    });
    const meta: CataloguedVariantClientDocument = {
        name,
        displayName: 'Resolved Rules Test',
        tooltip: 'Catalogued variant',
        ini: `[${name}:chess]\npass = false\npieceDrops = false`,
        baseVariant: 'chess',
        startFen: '8/8/8/8/8/8/8/K6k w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k'],
        kingRoles: ['k'],
        pocketRoles: [],
        captureToHand: false,
        promotionType: 'regular',
        promotionRoles: [],
        promotionOrder: [],
        showPromoted: false,
        rulesGate: false,
        rulesPass: false,
        showCheckCounters: false,
        fsfVariantInfo,
    };

    registerCataloguedVariant(meta);
    const variant = VARIANTS[name];

    expect(variant.startFen).toBe(resolvedStartFen);
    expect(variant.board.dimensions).toEqual({ width: 9, height: 9 });
    expect(variant.chess960).toBe(true);
    expect(variant.twoBoards).toBe(true);
    expect(variant.rules.enPassant).toBe(true);
    expect(variant.rules.pass).toBe(true);
    expect(variant.rules.gate).toBe(true);
    expect(variant.rules.duck).toBe(true);
    expect(variant.pocket?.captureToHand).toBe(true);
    expect(variant.promotion.type).toBe('shogi');
    expect(variant.ui.showPromoted).toBe(true);
    expect(variant.ui.showCheckCounters).toBe(true);
    expect(variant.ui.pieceSound).toBe('atomic');
    expect(variant.fsfVariantInfo).toBe(fsfVariantInfo);
    expect(validFen(variant, '4k4/9/9/9/4Z4/9/9/9/4K4 w - - 0 1')).toBe(true);
});
