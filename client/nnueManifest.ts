import {
    OFFICIAL_NNUE_CUSTOM_FINGERPRINTS,
    OFFICIAL_NNUE_ENGINE_ALIASES,
    OFFICIAL_NNUE_NETWORKS,
} from './nnueCatalog.generated';

export { OFFICIAL_NNUE_NETWORKS } from './nnueCatalog.generated';

export const OFFICIAL_NNUE_ARCHIVE_REPOSITORY = 'https://github.com/gbtami/Fairy-Stockfish-NNUE';
export const OFFICIAL_NNUE_ARCHIVE_RELEASE_TAG = 'networks';
export const OFFICIAL_NNUE_ARCHIVE_BASE_URL =
    `${OFFICIAL_NNUE_ARCHIVE_REPOSITORY}/releases/download/${OFFICIAL_NNUE_ARCHIVE_RELEASE_TAG}`;

export type NnueNetworkId = keyof typeof OFFICIAL_NNUE_NETWORKS;

export interface OfficialNnueNetwork {
    readonly id: NnueNetworkId;
    readonly file: string;
    readonly bytes: number;
    readonly sha256Prefix: string;
    readonly archiveUrl: string;
}

export interface OfficialNnueLookupContext {
    readonly userDefined: boolean;
    readonly fingerprint?: string;
}

export function nnueLookupContextForVariant(variant: {
    readonly cataloguedSource?: 'user' | 'fairy-stockfish-builtin';
    readonly nnueFingerprint?: string;
}): OfficialNnueLookupContext {
    return {
        userDefined: variant.cataloguedSource === 'user',
        fingerprint: variant.nnueFingerprint,
    };
}

// These PyChess mappings are not present as rows in Fairy-Stockfish's NNUE
// catalogue, but are known site/engine compatibility paths.
const PYCHESS_NNUE_ENGINE_VARIANT_ALIASES: Readonly<Partial<Record<string, NnueNetworkId>>> = {
    chess: 'nn',
    embassyhouse: 'capahouse',
    gothhouse: 'capahouse',
};

function exactNetworkId(engineVariant: string): NnueNetworkId | undefined {
    if (Object.prototype.hasOwnProperty.call(OFFICIAL_NNUE_NETWORKS, engineVariant)) {
        return engineVariant as NnueNetworkId;
    }
    return undefined;
}

// Prefix matching is intentionally broader than automatic NNUE selection. It is
// also used by the manual file picker, where users may deliberately experiment
// with a network even when PyChess cannot prove that a UDV matches it.
export function nnueNetworkIdForEngineVariant(engineVariant: string): NnueNetworkId | undefined {
    const exact = exactNetworkId(engineVariant);
    if (exact) return exact;

    const target =
        OFFICIAL_NNUE_ENGINE_ALIASES[engineVariant] ?? PYCHESS_NNUE_ENGINE_VARIANT_ALIASES[engineVariant];
    if (!target || !Object.prototype.hasOwnProperty.call(OFFICIAL_NNUE_NETWORKS, target)) return undefined;
    return target as NnueNetworkId;
}

function automaticNnueNetworkId(
    engineVariant: string,
    context: OfficialNnueLookupContext,
): NnueNetworkId | undefined {
    if (!context.userDefined) return nnueNetworkIdForEngineVariant(engineVariant);

    // A user-defined variant must match one authoritative custom FSF
    // definition exactly enough for fsf-ini-v1. Name-only and alias matching
    // are deliberately forbidden here.
    const exact = exactNetworkId(engineVariant);
    if (!exact) return undefined;
    const expectedFingerprint = OFFICIAL_NNUE_CUSTOM_FINGERPRINTS[engineVariant];
    if (!expectedFingerprint || context.fingerprint !== expectedFingerprint) return undefined;
    return exact;
}

export function officialNnueNetwork(
    engineVariant: string,
    context: OfficialNnueLookupContext,
): OfficialNnueNetwork | undefined {
    const id = automaticNnueNetworkId(engineVariant, context);
    if (!id) return undefined;

    const network = OFFICIAL_NNUE_NETWORKS[id];
    const hashMatch = /-([0-9a-f]{12})\.nnue$/i.exec(network.file);
    if (!hashMatch) throw new Error(`Official NNUE filename has no SHA-256 prefix: ${network.file}`);

    return {
        id,
        file: network.file,
        bytes: network.bytes,
        sha256Prefix: hashMatch[1].toLowerCase(),
        archiveUrl: `${OFFICIAL_NNUE_ARCHIVE_BASE_URL}/${network.file}`,
    };
}
