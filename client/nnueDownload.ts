import type { OfficialNnueNetwork } from './nnueManifest';
import { loadNnueFile, saveNnueData } from './nnueStorage';

export const LARGE_NNUE_DOWNLOAD_BYTES = 64 * 1024 * 1024;

export interface NnueDownloadProgress {
    readonly loaded: number;
    readonly total: number;
}

export function officialNnueDownloadUrl(downloadRoot: string, network: OfficialNnueNetwork): string | undefined {
    const root = downloadRoot.trim().replace(/\/+$/, '');
    if (!root) return undefined;
    return `${root}/${encodeURIComponent(network.file)}`;
}

export function formatNnueSize(bytes: number): string {
    const mib = bytes / (1024 * 1024);
    return `${mib.toFixed(mib < 10 ? 1 : 0)} MiB`;
}

export function requiresLargeNnueConfirmation(network: OfficialNnueNetwork): boolean {
    return network.bytes > LARGE_NNUE_DOWNLOAD_BYTES;
}

export async function downloadOfficialNnue(
    variant: string,
    network: OfficialNnueNetwork,
    downloadRoot: string,
    onProgress?: (progress: NnueDownloadProgress) => void,
): Promise<Uint8Array> {
    const cached = await loadNnueFile(variant, network.file);
    if (cached?.byteLength === network.bytes) {
        onProgress?.({ loaded: network.bytes, total: network.bytes });
        return cached;
    }

    const url = officialNnueDownloadUrl(downloadRoot, network);
    if (!url) throw new Error('Official NNUE download server is not configured.');

    const data = await downloadNnueBytes(url, network.bytes, onProgress);
    await saveNnueData(variant, network.file, data);
    return data;
}

export function downloadNnueBytes(
    url: string,
    expectedBytes: number,
    onProgress?: (progress: NnueDownloadProgress) => void,
): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';

        xhr.onprogress = event => {
            const total = event.lengthComputable && event.total > 0 ? event.total : expectedBytes;
            onProgress?.({ loaded: event.loaded, total });
        };
        xhr.onerror = () => reject(new Error(`NNUE download failed (${xhr.status || 'network error'}).`));
        xhr.onabort = () => reject(new Error('NNUE download was cancelled.'));
        xhr.onload = () => {
            if (Math.floor(xhr.status / 100) !== 2) {
                reject(new Error(`NNUE download failed (HTTP ${xhr.status}).`));
                return;
            }
            if (!(xhr.response instanceof ArrayBuffer)) {
                reject(new Error('NNUE download returned invalid data.'));
                return;
            }

            const data = new Uint8Array(xhr.response);
            if (data.byteLength !== expectedBytes) {
                reject(new Error(`NNUE download size mismatch: expected ${expectedBytes}, got ${data.byteLength}.`));
                return;
            }

            onProgress?.({ loaded: expectedBytes, total: expectedBytes });
            resolve(data);
        };
        xhr.send();
    });
}
