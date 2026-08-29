import * as idb from 'idb-keyval';

import { bigFileStorage } from './bigFileStorage';

const nnueFileKey = (variant: string) => `${variant}--nnue-file`;
const legacyNnueDataKey = (variant: string) => `${variant}--nnue-data`;

export function nnueStorageKey(variant: string, filename: string): string {
    return `nnue:${variant}:${filename}`;
}

export async function storedNnueFilename(variant: string): Promise<string | undefined> {
    return idb.get<string>(nnueFileKey(variant));
}

export async function saveNnueFile(variant: string, file: File): Promise<void> {
    const previousFilename = await storedNnueFilename(variant);
    await bigFileStorage.write(nnueStorageKey(variant, file.name), file);
    await idb.set(nnueFileKey(variant), file.name);

    await idb.del(legacyNnueDataKey(variant)).catch(error => console.warn('Unable to remove legacy NNUE data:', error));
    if (previousFilename && previousFilename !== file.name) {
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
