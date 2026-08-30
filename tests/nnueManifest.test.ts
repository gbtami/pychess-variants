import { describe, expect, test } from '@jest/globals';

import {
    nnueNetworkIdForEngineVariant,
    officialNnueNetwork,
    OFFICIAL_NNUE_NETWORKS,
    OFFICIAL_NNUE_ARCHIVE_BASE_URL,
} from '../client/nnueManifest';

const trustedVariant = { userDefined: false } as const;

describe('official NNUE manifest', () => {
    test('contains the mirrored network catalogue', () => {
        expect(Object.keys(OFFICIAL_NNUE_NETWORKS).length).toBeGreaterThanOrEqual(48);
        expect(officialNnueNetwork('crazyhouse', trustedVariant)).toEqual({
            id: 'crazyhouse',
            file: 'crazyhouse-8ebf84784ad2.nnue',
            bytes: 58534811,
            sha256Prefix: '8ebf84784ad2',
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
        expect(
            officialNnueNetwork('my-custom-variant', { userDefined: true, fingerprint: 'deadbeef' }),
        ).toBeUndefined();
    });

    test('requires the authoritative fingerprint for automatic UDV NNUE selection', () => {
        const empireFingerprint = 'a1653aa0f9c0cb59fff7de249729d34b5dff41785218806de6f14695bae1a6c8';

        expect(
            officialNnueNetwork('empire', { userDefined: true, fingerprint: empireFingerprint })?.id,
        ).toBe('empire');
        expect(
            officialNnueNetwork('empire', { userDefined: true, fingerprint: '0'.repeat(64) }),
        ).toBeUndefined();
        expect(officialNnueNetwork('empire', { userDefined: true })).toBeUndefined();
    });

    test('does not apply built-in compatibility aliases to user-defined variants', () => {
        expect(officialNnueNetwork('normal', trustedVariant)?.id).toBe('nn');
        expect(
            officialNnueNetwork('normal', {
                userDefined: true,
                fingerprint: '0'.repeat(64),
            }),
        ).toBeUndefined();
    });
});
