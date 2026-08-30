import * as idb from 'idb-keyval';

import { bigFileStorage } from './bigFileStorage';
import { verifyOfficialNnueData } from './nnueIntegrity';
import type { OfficialNnueNetwork } from './nnueManifest';

const nnueFileKey = (variant: string) => `${variant}--nnue-file`;
const nnueMetadataKey = (variant: string) => `${variant}--nnue-metadata`;
const legacyNnueDataKey = (variant: string) => `${variant}--nnue-data`;

export type NnueFileSource = 'manual' | 'official';

export interface NnueFileMetadata {
    readonly filename: string;
    readonly source: NnueFileSource;
    readonly bytes: number;
    readonly verifiedSha256Prefix?: string;
}

export function nnueStorageKey(variant: string, filename: string): string {
    return `nnue:${variant}:${filename}`;
}

export async function storedNnueFilename(variant: string): Promise<string | undefined> {
    return idb.get<string>(nnueFileKey(variant));
}

export async function storedNnueMetadata(variant: string): Promise<NnueFileMetadata | undefined> {
    return idb.get<NnueFileMetadata>(nnueMetadataKey(variant));
}

export async function hasNnueFile(variant: string, filename: string): Promise<boolean> {
    if ((await storedNnueFilename(variant)) !== filename) return false;
    if (await bigFileStorage.has(nnueStorageKey(variant, filename))) return true;

    // Legacy NNUE data lived in idb-keyval's default store. Inspect the keys
    // instead of reading the value so checking a 100+ MB network does not pull
    // the whole file into JavaScript memory merely to render settings state.
    const legacyKeys = await idb.keys();
    return legacyKeys.some(key => key === legacyNnueDataKey(variant));
}

export async function storedNnueSize(variant: string, filename: string): Promise<number | undefined> {
    if ((await storedNnueFilename(variant)) !== filename) return undefined;

    const storedSize = await bigFileStorage.size(nnueStorageKey(variant, filename));
    if (storedSize !== undefined) return storedSize;

    const legacy = await idb.get<ArrayBuffer | Uint8Array>(legacyNnueDataKey(variant));
    if (legacy === undefined) return undefined;
    return legacy.byteLength;
}

export async function removeNnueFile(variant: string, selectedFilename?: string): Promise<void> {
    const storedFilename = await storedNnueFilename(variant);
    const filenames = new Set(
        [storedFilename, selectedFilename].filter((name): name is string => name !== undefined && name !== ''),
    );

    for (const filename of filenames) {
        await bigFileStorage.delete(nnueStorageKey(variant, filename));
    }
    await idb.del(nnueFileKey(variant));
    await idb.del(nnueMetadataKey(variant));
    await idb.del(legacyNnueDataKey(variant));
}

export async function saveNnueFile(variant: string, file: File): Promise<void> {
    return saveNnueData(variant, file.name, file, {
        filename: file.name,
        source: 'manual',
        bytes: file.size,
    });
}

export async function saveOfficialNnueData(
    variant: string,
    network: OfficialNnueNetwork,
    data: Uint8Array,
    hashVerified: boolean,
): Promise<void> {
    return saveNnueData(variant, network.file, data, {
        filename: network.file,
        source: 'official',
        bytes: network.bytes,
        verifiedSha256Prefix: hashVerified ? network.sha256Prefix : undefined,
    });
}

async function saveNnueData(
    variant: string,
    filename: string,
    data: Blob | Uint8Array,
    metadata: NnueFileMetadata,
): Promise<void> {
    const previousFilename = await storedNnueFilename(variant);
    await bigFileStorage.write(nnueStorageKey(variant, filename), data);
    await idb.set(nnueFileKey(variant), filename);
    await idb.set(nnueMetadataKey(variant), metadata);

    await idb.del(legacyNnueDataKey(variant)).catch(error => console.warn('Unable to remove legacy NNUE data:', error));
    if (previousFilename && previousFilename !== filename) {
        await bigFileStorage
            .delete(nnueStorageKey(variant, previousFilename))
            .catch(error => console.warn('Unable to remove previous NNUE file:', error));
    }
}

export async function loadNnueFile(variant: string, filename: string): Promise<Uint8Array | undefined> {
    if ((await storedNnueFilename(variant)) !== filename) return undefined;

    const storageKey = nnueStorageKey(variant, filename);
    const stored = await bigFileStorage.read(storageKey);
    if (stored) return stored;

    // Before OPFS support, PyChess stored the full ArrayBuffer in idb-keyval's
    // default store. Migrate it lazily so existing users do not need to select
    // their network again after this change.
    const legacy = await idb.get<ArrayBuffer | Uint8Array>(legacyNnueDataKey(variant));
    if (legacy === undefined) return undefined;

    const data = legacy instanceof Uint8Array ? legacy : new Uint8Array(legacy);
    try {
        await bigFileStorage.write(storageKey, data);
        await idb.del(legacyNnueDataKey(variant));
    } catch (error) {
        // Loading the old data is still useful even if migration cannot be
        // persisted, for example because the browser storage quota is full.
        console.warn('Unable to migrate NNUE file to big-file storage:', error);
    }
    return data;
}

export async function loadOfficialNnueFile(
    variant: string,
    network: OfficialNnueNetwork,
): Promise<Uint8Array | undefined> {
    if ((await storedNnueFilename(variant)) !== network.file) return undefined;

    const metadata = await storedNnueMetadata(variant);
    const size = await storedNnueSize(variant, network.file);
    if (size === undefined) return undefined;

    if (size !== network.bytes) {
        if (metadata?.source !== 'manual') await removeNnueFile(variant, network.file);
        return undefined;
    }

    const data = await loadNnueFile(variant, network.file);
    if (!data) return undefined;

    const alreadyVerified =
        metadata?.verifiedSha256Prefix === network.sha256Prefix && metadata.bytes === network.bytes;
    if (alreadyVerified) return data;

    let hashVerified = false;
    try {
        hashVerified = await verifyOfficialNnueData(data, network);
    } catch (error) {
        if (metadata?.source !== 'manual') await removeNnueFile(variant, network.file);
        console.warn('Discarded invalid official NNUE cache:', error);
        return undefined;
    }

    // Old PyChess versions had no source/integrity metadata. If the selected
    // file exactly matches the current official hash-named network, adopt it as
    // an official cache entry after the available size/hash checks.
    await idb.set(nnueMetadataKey(variant), {
        filename: network.file,
        source: metadata?.source ?? 'official',
        bytes: network.bytes,
        verifiedSha256Prefix: hashVerified ? network.sha256Prefix : undefined,
    });
    return data;
}

export async function removeObsoleteOfficialNnue(
    variant: string,
    currentNetwork?: OfficialNnueNetwork,
): Promise<string | undefined> {
    const metadata = await storedNnueMetadata(variant);
    if (!metadata || metadata.source !== 'official' || metadata.filename === currentNetwork?.file) return undefined;

    const selected = await storedNnueFilename(variant);
    if (selected !== metadata.filename) return undefined;

    await removeNnueFile(variant, metadata.filename);
    return metadata.filename;
}
