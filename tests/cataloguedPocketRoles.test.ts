import { afterEach, expect, test } from '@jest/globals';
import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

import {
    CataloguedVariantClientDocument,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from '../client/variants';
import { fsfPiece, makeFsfVariantInfo } from './fsfVariantInfoFixture';

const variantNames = [
    'kogata-dai-shogi-test',
    'small-shogi-pocket-test',
    'asymmetric-pocket-test',
    'asymmetric-capture-pocket-test',
    'promoted-pocket-test',
];

function register(meta: CataloguedVariantClientDocument) {
    registerCataloguedVariant(meta);
    return VARIANTS[meta.name];
}

function letters(roles: readonly cg.Role[] | undefined): string[] {
    return roles?.map(role => util.letterOf(role)) ?? [];
}

afterEach(() => {
    variantNames.forEach(unregisterCataloguedVariant);
});

test('resolved capture-to-hand pockets contain reachable source pieces, not promoted-only targets', () => {
    const name = variantNames[0];
    const pieces = [
        fsfPiece('king', 'K'),
        fsfPiece('queen', 'Q'),
        fsfPiece('rook', 'R'),
        fsfPiece('bers', 'Z'),
        fsfPiece('bishop', 'B'),
        fsfPiece('dragonHorse', 'Y'),
        fsfPiece('custom1', 'V', { customBetza: 'vRsW' }),
        fsfPiece('custom2', 'U', { customBetza: 'vRsWF' }),
        fsfPiece('custom3', 'N', { customBetza: 'N' }),
        fsfPiece('custom4', 'M', { customBetza: 'ND' }),
        fsfPiece('custom5', 'L', { customBetza: 'FvW' }),
        fsfPiece('custom6', 'J', { customBetza: 'B' }),
        fsfPiece('gold', 'G'),
        fsfPiece('custom7', 'H', { customBetza: 'R' }),
        fsfPiece('shogiPawn', 'P'),
        fsfPiece('custom8', 'O', { customBetza: 'WfF' }),
    ];
    const startFen = 'vnlgkqglnv/1r6b1/pppppppppp/10/10/10/PPPPPPPPPP/1B6R1/VNLGQKGLNV[-] w 0 1';
    const fsfVariantInfo = makeFsfVariantInfo({
        name,
        template: 'shogi',
        board: { width: 10, height: 9, startFen },
        pieces,
        pieceTypes: pieces.map(piece => piece.type),
        drops: { enabled: true, capturesToHand: true },
        promotion: {
            shogiStyle: true,
            pawnTypes: { white: ['shogiPawn'], black: ['shogiPawn'] },
            promotedPieceTypes: {
                custom1: 'custom2',
                custom3: 'custom4',
                custom5: 'custom6',
                gold: 'custom7',
                shogiPawn: 'custom8',
                rook: 'bers',
                bishop: 'dragonHorse',
            },
        },
    });

    const variant = register({
        name,
        displayName: 'Kogata Dai Shogi Test',
        tooltip: 'Catalogued variant',
        // Deliberately contradictory: the browser must not reinterpret this INI.
        ini: `[${name}:chess]\npieceDrops = false\ncapturesToHand = false`,
        baseVariant: 'shogi',
        startFen,
        width: 10,
        height: 9,
        pieces: ['k', 'q', 'r', 'b', 'n', 'p', 'v', 'l', 'g'],
        kingRoles: ['k'],
        pocketRoles: ['q', 'r', 'b', 'n', 'p', 'v', 'l', 'g'],
        fsfVariantInfo,
    });

    expect(variant.pocket?.captureToHand).toBe(true);
    expect(letters(variant.pocket?.roles.white)).toEqual(['q', 'r', 'b', 'n', 'p', 'v', 'l', 'g']);
    expect(letters(variant.pocket?.roles.white)).not.toEqual(
        expect.arrayContaining(['u', 'm', 'j', 'h', 'o', 'z', 'y']),
    );
});

test('resolved inherited piece types do not become pocket roles when they are unreachable', () => {
    const name = variantNames[1];
    const pieces = [
        fsfPiece('king', 'K'),
        fsfPiece('shogiPawn', 'P'),
        fsfPiece('lance', 'L'),
        fsfPiece('shogiKnight', 'N'),
        fsfPiece('silver', 'S'),
        fsfPiece('gold', 'G'),
        fsfPiece('bishop', 'B'),
        fsfPiece('rook', 'R'),
        fsfPiece('dragonHorse', 'H'),
        fsfPiece('bers', 'D'),
    ];
    const startFen = '4k4/9/9/9/9/9/9/9/4K3P[-] w 0 1';
    const fsfVariantInfo = makeFsfVariantInfo({
        name,
        template: 'shogi',
        board: { width: 9, height: 9, startFen },
        pieces,
        pieceTypes: pieces.map(piece => piece.type),
        drops: { enabled: true, capturesToHand: true },
        promotion: {
            shogiStyle: true,
            pawnTypes: { white: ['shogiPawn'], black: ['shogiPawn'] },
            promotedPieceTypes: { shogiPawn: 'gold' },
        },
    });

    const variant = register({
        name,
        displayName: 'Small Shogi Pocket Test',
        tooltip: 'Catalogued variant',
        ini: `[${name}:shogi]\npocketSize = 7`,
        baseVariant: 'shogi',
        startFen,
        width: 9,
        height: 9,
        pieces: ['k', 'p', 'l', 'n', 's', 'g', 'b', 'r', 'h', 'd'],
        kingRoles: ['k'],
        pocketRoles: ['p'],
        fsfVariantInfo,
    });

    expect(variant.pocket?.captureToHand).toBe(true);
    expect(letters(variant.pocket?.roles.white)).toEqual(['p']);
});

test('resolved asymmetric FEN letters produce side-specific piece rows and pockets', () => {
    const name = variantNames[2];
    const startFen = '7k/8/8/8/8/8/8/KQ5c[Qn] w - - 0 1';
    const fsfVariantInfo = makeFsfVariantInfo({
        name,
        board: { startFen },
        pieces: [fsfPiece('king', 'K'), fsfPiece('queen', 'Q', { black: 'c' }), fsfPiece('knight', 'N')],
        pieceTypes: ['king', 'queen', 'knight'],
        drops: { enabled: true, capturesToHand: false },
    });

    const variant = register({
        name,
        displayName: 'Asymmetric Pocket Test',
        tooltip: 'Catalogued variant',
        ini: '',
        startFen,
        width: 8,
        height: 8,
        pieces: ['k', 'q', 'c', 'n'],
        kingRoles: ['k'],
        pocketRoles: ['q', 'n'],
        fsfVariantInfo,
    });

    expect(letters(variant.pieceRow.white)).toEqual(expect.arrayContaining(['k', 'q', 'n']));
    expect(letters(variant.pieceRow.black)).toEqual(expect.arrayContaining(['k', 'c', 'n']));
    expect(letters(variant.pocket?.roles.white)).toEqual(['q']);
    expect(letters(variant.pocket?.roles.black)).toEqual(['n']);
});

test('capture-to-hand maps asymmetric source roles through piece identities', () => {
    const name = variantNames[3];
    const startFen = '7k/8/8/8/8/8/6c1/KN6[-] w - - 0 1';
    const fsfVariantInfo = makeFsfVariantInfo({
        name,
        board: { startFen },
        pieces: [
            fsfPiece('king', 'K'),
            fsfPiece('queen', 'Q', { black: 'c' }),
            fsfPiece('knight', 'N', { black: 'h' }),
        ],
        pieceTypes: ['king', 'queen', 'knight'],
        drops: { enabled: true, capturesToHand: true },
    });

    const variant = register({
        name,
        displayName: 'Asymmetric Capture Pocket Test',
        tooltip: 'Catalogued variant',
        ini: '',
        startFen,
        width: 8,
        height: 8,
        pieces: ['k', 'q', 'c', 'n', 'h'],
        kingRoles: ['k'],
        pocketRoles: ['q', 'c', 'n', 'h'],
        fsfVariantInfo,
    });

    expect(letters(variant.pocket?.roles.white)).toEqual(['q', 'n']);
    expect(letters(variant.pocket?.roles.black)).toEqual(['c', 'h']);
});

test('resolved promoted pocket pieces retain their plus role', () => {
    const name = variantNames[4];
    const startFen = '7k/8/8/8/8/8/8/K7[+P+p] w - - 0 1';
    const fsfVariantInfo = makeFsfVariantInfo({
        name,
        board: { startFen },
        pieces: [fsfPiece('king', 'K'), fsfPiece('shogiPawn', 'P'), fsfPiece('gold', 'G')],
        pieceTypes: ['king', 'shogiPawn', 'gold'],
        promotion: {
            shogiStyle: true,
            pawnTypes: { white: ['shogiPawn'], black: ['shogiPawn'] },
            promotedPieceTypes: { shogiPawn: 'gold' },
        },
        drops: { enabled: true, capturesToHand: false, promoted: true },
    });

    const variant = register({
        name,
        displayName: 'Promoted Pocket Test',
        tooltip: 'Catalogued variant',
        ini: '',
        startFen,
        width: 8,
        height: 8,
        pieces: ['k', 'p', 'g'],
        kingRoles: ['k'],
        pocketRoles: ['+p'],
        fsfVariantInfo,
    });

    expect(letters(variant.pocket?.roles.white)).toEqual(['+p']);
    expect(letters(variant.pocket?.roles.black)).toEqual(['+p']);
});
