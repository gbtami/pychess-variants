import { createStore, del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';

// OPFS is substantially better suited than IndexedDB for the very large NNUE
// networks used by some PyChess variants. Keep IndexedDB as a compatibility
// fallback for browsers without OPFS support.

export type BigFileData = Blob | ArrayBuffer | Uint8Array;

const BIG_FILE_STORE = createStore('pychess-big-files', 'files');
const OPFS_PROBE_NAME = '_pychess_big_file_probe';

let opfsPromise: Promise<FileSystemDirectoryHandle | undefined> | undefined;

export class BigFileStorage {
    async read(key: string): Promise<Uint8Array | undefined> {
        const opfs = await this.opfs();
        if (opfs) {
            try {
                const handle = await opfs.getFileHandle(this.opfsName(key), { create: false });
                const file = await handle.getFile();
                return new Uint8Array(await file.arrayBuffer());
            } catch (error) {
                if (!this.isNotFoundError(error)) console.warn('Unable to read big file from OPFS:', error);
            }
        }

        return this.readIdb(key);
    }

    async has(key: string): Promise<boolean> {
        const opfs = await this.opfs();
        if (opfs) {
            try {
                await opfs.getFileHandle(this.opfsName(key), { create: false });
                return true;
            } catch (error) {
                if (!this.isNotFoundError(error)) console.warn('Unable to inspect big file in OPFS:', error);
            }
        }

        const keys = await idbKeys(BIG_FILE_STORE);
        return keys.some(storedKey => storedKey === key);
    }

    async size(key: string): Promise<number | undefined> {
        const opfs = await this.opfs();
        if (opfs) {
            try {
                const handle = await opfs.getFileHandle(this.opfsName(key), { create: false });
                const file = await handle.getFile();
                return file.size;
            } catch (error) {
                if (!this.isNotFoundError(error)) console.warn('Unable to inspect big file size in OPFS:', error);
            }
        }

        const stored = await idbGet<BigFileData>(key, BIG_FILE_STORE);
        if (stored === undefined) return undefined;
        if (stored instanceof Blob) return stored.size;
        return stored.byteLength;
    }

    async write(key: string, data: BigFileData): Promise<void> {
        const opfs = await this.opfs();
        if (opfs) {
            const filename = this.opfsName(key);
            const handle = await opfs.getFileHandle(filename, { create: true });
            const writable = await handle.createWritable();
            try {
                const writableData =
                    data instanceof Uint8Array
                        ? data.buffer instanceof ArrayBuffer
                            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
                            : data.slice()
                        : data;
                await writable.write(writableData);
                await writable.close();
                return;
            } catch (error) {
                await writable.abort().catch(() => undefined);
                await opfs.removeEntry(filename).catch(() => undefined);
                throw error;
            }
        }

        await idbSet(key, data, BIG_FILE_STORE);
    }

    async delete(key: string): Promise<void> {
        const opfs = await this.opfs();
        if (opfs) await opfs.removeEntry(this.opfsName(key)).catch(() => undefined);
        await idbDel(key, BIG_FILE_STORE);
    }

    private async readIdb(key: string): Promise<Uint8Array | undefined> {
        const stored = await idbGet<BigFileData>(key, BIG_FILE_STORE);
        if (stored === undefined) return undefined;
        if (stored instanceof Uint8Array) return stored;
        if (stored instanceof Blob) return new Uint8Array(await stored.arrayBuffer());
        return new Uint8Array(stored);
    }

    private opfs(): Promise<FileSystemDirectoryHandle | undefined> {
        opfsPromise ??= directoryHandleIfAvailable();
        return opfsPromise;
    }

    private opfsName(key: string): string {
        return `pychess_${encodeURIComponent(key)}`;
    }

    private isNotFoundError(error: unknown): boolean {
        return error instanceof DOMException && error.name === 'NotFoundError';
    }
}

export const bigFileStorage = new BigFileStorage();

async function directoryHandleIfAvailable(): Promise<FileSystemDirectoryHandle | undefined> {
    if (!navigator.storage?.getDirectory) return undefined;

    try {
        const directory = await navigator.storage.getDirectory();
        const handle = await directory.getFileHandle(OPFS_PROBE_NAME, { create: true });
        const writable = await handle.createWritable();
        await writable.write(new Uint8Array(1));
        await writable.close();
        await directory.removeEntry(OPFS_PROBE_NAME);
        return directory;
    } catch {
        return undefined;
    }
}
