import type { OfficialNnueNetwork } from './nnueManifest';

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function nnueSha256(data: Uint8Array): Promise<string | undefined> {
    if (!globalThis.crypto?.subtle) return undefined;

    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(digest));
}

export async function verifyOfficialNnueData(data: Uint8Array, network: OfficialNnueNetwork): Promise<boolean> {
    if (data.byteLength !== network.bytes) {
        throw new Error(`NNUE size mismatch: expected ${network.bytes}, got ${data.byteLength}.`);
    }

    let digest: string | undefined;
    try {
        digest = await nnueSha256(data);
    } catch (error) {
        console.warn('Unable to verify NNUE SHA-256:', error);
        return false;
    }
    if (digest === undefined) return false;
    if (!digest.startsWith(network.sha256Prefix)) {
        throw new Error(`NNUE SHA-256 mismatch for ${network.file}.`);
    }
    return true;
}
