import { FairyStockfish, Notation } from 'ffish-es6';

import { FfishNotationName } from './variants';

export function resolveFfishNotation(ffish: FairyStockfish, notationName: FfishNotationName): Notation {
    const notation = (ffish.Notation as unknown as Record<FfishNotationName, Notation | undefined>)[notationName];
    if (notation === undefined) {
        throw new Error(`ffish-es6 build is missing notation '${notationName}'`);
    }
    return notation;
}
