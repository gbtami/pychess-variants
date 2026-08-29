import { describe, expect, test } from '@jest/globals';

import {
    nnueNetworkIdForEngineVariant,
    officialNnueNetwork,
    OFFICIAL_NNUE_NETWORKS,
    OFFICIAL_NNUE_ARCHIVE_BASE_URL,
} from '../client/nnueManifest';

describe('official NNUE manifest', () => {
    test('contains the mirrored network catalogue', () => {
        expect(Object.keys(OFFICIAL_NNUE_NETWORKS)).toHaveLength(48);
        expect(officialNnueNetwork('crazyhouse')).toEqual({
            id: 'crazyhouse',
            file: 'crazyhouse-8ebf84784ad2.nnue',
            bytes: 58534811,
            archiveUrl: `${OFFICIAL_NNUE_ARCHIVE_BASE_URL}/crazyhouse-8ebf84784ad2.nnue`,
        });
    });

    test.each([
        ['chess', 'nn'],
        ['placement', 'nn'],
        ['cambodian', 'makruk'],
        ['5check', '3check'],
        ['caparandom', 'capablanca'],
        ['embassy', 'capablanca'],
        ['gothic', 'capablanca'],
        ['chessgi', 'crazyhouse'],
        ['loop', 'crazyhouse'],
        ['janggimodern', 'janggi'],
        ['nocheckatomic', 'atomic'],
        ['suicide', 'antichess'],
    ] as const)('maps Fairy-Stockfish compatibility alias %s to %s', (engineVariant, networkId) => {
        expect(nnueNetworkIdForEngineVariant(engineVariant)).toBe(networkId);
    });

    test('returns no official network for an unknown/user-defined engine variant', () => {
        expect(nnueNetworkIdForEngineVariant('my-custom-variant')).toBeUndefined();
        expect(officialNnueNetwork('my-custom-variant')).toBeUndefined();
    });
});
