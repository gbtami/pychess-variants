import { afterEach, expect, test } from '@jest/globals';
import * as util from 'chessgroundx/util';

import {
    CataloguedVariantClientDocument,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from '../client/variants';

const variantName = 'kogata-dai-shogi-test';

function register(meta: CataloguedVariantClientDocument) {
    registerCataloguedVariant(meta);
    return VARIANTS[meta.name];
}

afterEach(() => {
    unregisterCataloguedVariant(variantName);
});

test('catalogued shogi-derived variants derive pocket roles from their own piece set', () => {
    const variant = register({
        name: variantName,
        displayName: 'Kogata Dai Shogi Test',
        tooltip: 'Catalogued variant',
        ini: `[${variantName}:shogi]
maxFile = 10
maxRank = 9
queen = q
rook = r
bers = z
bishop = b
dragonHorse = y
customPiece1 = v:vRsW
customPiece2 = u:vRsWF
customPiece3 = n:N
customPiece4 = m:ND
customPiece5 = l:FvW
customPiece6 = j:B
gold = g
customPiece7 = h:R
shogiPawn = p
customPiece8 = o:WfF
promotedPieceType = v:u n:m l:j g:h p:o r:z b:y
startFen = vnlgkqglnv/1r6b1/pppppppppp/10/10/10/PPPPPPPPPP/1B6R1/VNLGQKGLNV w - - 0 1`,
        baseVariant: 'shogi',
        startFen: 'vnlgkqglnv/1r6b1/pppppppppp/10/10/10/PPPPPPPPPP/1B6R1/VNLGQKGLNV w - - 0 1',
        width: 10,
        height: 9,
        pieces: ['k', 'q', 'r', 'b', 'n', 'p', 'v', 'l', 'g'],
        kingRoles: ['k'],
    });

    expect(variant.pocket?.captureToHand).toBe(true);
    expect(variant.pocket?.roles.white.map(role => util.letterOf(role))).toEqual([
        'q',
        'r',
        'b',
        'n',
        'p',
        'v',
        'l',
        'g',
    ]);
    expect(variant.pocket?.roles.white.map(role => util.letterOf(role))).not.toContain('s');
});

test('catalogued pocketSize alone does not suppress inherited shogi pocket roles', () => {
    const variant = register({
        name: variantName,
        displayName: 'Pocket Size Only Test',
        tooltip: 'Catalogued variant',
        ini: `[${variantName}:shogi]
pocketSize = 7
startFen = 4k4/9/9/9/9/9/9/9/4K3P w - - 0 1`,
        baseVariant: 'shogi',
        startFen: '4k4/9/9/9/9/9/9/9/4K3P w - - 0 1',
        width: 9,
        height: 9,
        pieces: ['k', 'p'],
        kingRoles: ['k'],
    });

    expect(variant.pocket?.captureToHand).toBe(true);
    expect(variant.pocket?.roles.white.map(role => util.letterOf(role))).toEqual(['p']);
});
