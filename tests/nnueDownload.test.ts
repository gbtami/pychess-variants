import { afterEach, describe, expect, test } from '@jest/globals';

import {
    downloadNnueBytes,
    formatNnueSize,
    officialNnueDownloadUrl,
    requiresLargeNnueConfirmation,
} from '../client/nnueDownload';
import { officialNnueNetwork } from '../client/nnueManifest';

const originalXHR = global.XMLHttpRequest;

interface FakeResponse {
    status?: number;
    body?: Uint8Array;
    progressLoaded?: number;
    progressTotal?: number;
    lengthComputable?: boolean;
    networkError?: boolean;
}

let nextResponse: FakeResponse = {};
let openedUrl = '';

class FakeXMLHttpRequest {
    status = 0;
    response: ArrayBuffer | null = null;
    responseType: XMLHttpRequestResponseType = '';
    onprogress: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
    onerror: ((this: XMLHttpRequest, ev: Event) => unknown) | null = null;
    onabort: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
    onload: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;

    open(_method: string, url: string, _async?: boolean): void {
        openedUrl = url;
    }

    send(): void {
        if (nextResponse.networkError) {
            this.onerror?.call(this as unknown as XMLHttpRequest, new Event('error'));
            return;
        }

        const body = nextResponse.body ?? new Uint8Array();
        const buffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
        this.status = nextResponse.status ?? 200;
        this.response = buffer;

        if (nextResponse.progressLoaded !== undefined) {
            const event = new ProgressEvent('progress', {
                lengthComputable: nextResponse.lengthComputable ?? true,
                loaded: nextResponse.progressLoaded,
                total: nextResponse.progressTotal ?? body.byteLength,
            });
            this.onprogress?.call(this as unknown as XMLHttpRequest, event);
        }
        this.onload?.call(this as unknown as XMLHttpRequest, new ProgressEvent('load'));
    }
}

afterEach(() => {
    (global as typeof globalThis & { XMLHttpRequest: typeof XMLHttpRequest }).XMLHttpRequest = originalXHR;
    nextResponse = {};
    openedUrl = '';
});

describe('NNUE downloads', () => {
    test('builds download URLs without duplicate slashes', () => {
        const network = officialNnueNetwork('crazyhouse')!;
        expect(officialNnueDownloadUrl('https://nnue.example.test///', network)).toBe(
            'https://nnue.example.test/crazyhouse-8ebf84784ad2.nnue',
        );
        expect(officialNnueDownloadUrl('', network)).toBeUndefined();
    });

    test('marks only networks above 64 MiB as large', () => {
        expect(requiresLargeNnueConfirmation(officialNnueNetwork('crazyhouse')!)).toBe(false);
        expect(requiresLargeNnueConfirmation(officialNnueNetwork('dragon')!)).toBe(true);
        expect(formatNnueSize(officialNnueNetwork('cannonshogi')!.bytes)).toBe('249 MiB');
    });

    test('downloads bytes and reports progress using the expected size as fallback', async () => {
        (global as typeof globalThis & { XMLHttpRequest: typeof XMLHttpRequest }).XMLHttpRequest =
            FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
        nextResponse = {
            body: new Uint8Array([1, 2, 3, 4]),
            progressLoaded: 2,
            lengthComputable: false,
        };
        const progress: Array<[number, number]> = [];

        const data = await downloadNnueBytes('https://nnue.example.test/test.nnue', 4, value => {
            progress.push([value.loaded, value.total]);
        });

        expect(openedUrl).toBe('https://nnue.example.test/test.nnue');
        expect([...data]).toEqual([1, 2, 3, 4]);
        expect(progress).toEqual([
            [2, 4],
            [4, 4],
        ]);
    });

    test('rejects an incomplete network before it can be cached', async () => {
        (global as typeof globalThis & { XMLHttpRequest: typeof XMLHttpRequest }).XMLHttpRequest =
            FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
        nextResponse = { body: new Uint8Array([1, 2, 3]) };

        await expect(downloadNnueBytes('https://nnue.example.test/test.nnue', 4)).rejects.toThrow(
            'NNUE download size mismatch: expected 4, got 3.',
        );
    });
});
