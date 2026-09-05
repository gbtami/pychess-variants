import type { FairyStockfish } from 'ffish-es6';

const FEN_VALIDATION_ERRORS: Record<number, string> = {
    [-14]: 'Invalid counting rule field',
    [-13]: 'Invalid check count field',
    [-12]: 'Invalid promoted piece marker',
    [-11]: 'Invalid number of FEN fields',
    [-10]: 'Invalid character in board layout',
    [-9]: 'Touching kings are not allowed',
    [-8]: 'Invalid board geometry',
    [-7]: 'Invalid pocket information',
    [-6]: 'Invalid side to move field',
    [-5]: 'Invalid castling information',
    [-4]: 'Invalid en-passant square',
    [-3]: 'Invalid number of kings',
    [-2]: 'Invalid half-move counter',
    [-1]: 'Invalid move counter',
    [0]: 'Empty FEN',
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(value: string): number[] {
    const bytes: number[] = [];
    for (let index = 0; index < value.length; index++) {
        const codePoint = value.codePointAt(index)!;
        if (codePoint > 0xffff) index += 1;
        if (codePoint <= 0x7f) bytes.push(codePoint);
        else if (codePoint <= 0x7ff) {
            bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
        } else if (codePoint <= 0xffff) {
            bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
        } else {
            bytes.push(
                0xf0 | (codePoint >> 18),
                0x80 | ((codePoint >> 12) & 0x3f),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f),
            );
        }
    }
    return bytes;
}

export function encodePgnUtf8Base64(value: string): string {
    const bytes = utf8Bytes(value);
    let result = '';
    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index];
        const second = bytes[index + 1];
        const third = bytes[index + 2];
        const triple = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
        result += BASE64_ALPHABET[(triple >> 18) & 63];
        result += BASE64_ALPHABET[(triple >> 12) & 63];
        result += second === undefined ? '=' : BASE64_ALPHABET[(triple >> 6) & 63];
        result += third === undefined ? '=' : BASE64_ALPHABET[triple & 63];
    }
    return result;
}

export function decodePgnUtf8Base64(value: string): string {
    const cleaned = value.replace(/\s+/g, '');
    if (
        !cleaned ||
        cleaned.length % 4 !== 0 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(cleaned)
    ) {
        throw new Error('Invalid base64 data');
    }

    const bytes: number[] = [];
    for (let index = 0; index < cleaned.length; index += 4) {
        const a = BASE64_ALPHABET.indexOf(cleaned[index]);
        const b = BASE64_ALPHABET.indexOf(cleaned[index + 1]);
        const c = cleaned[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(cleaned[index + 2]);
        const d = cleaned[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(cleaned[index + 3]);
        const triple = (a << 18) | (b << 12) | (c << 6) | d;
        bytes.push((triple >> 16) & 0xff);
        if (cleaned[index + 2] !== '=') bytes.push((triple >> 8) & 0xff);
        if (cleaned[index + 3] !== '=') bytes.push(triple & 0xff);
    }

    try {
        let escaped = '';
        for (const byte of bytes) escaped += `%${byte.toString(16).padStart(2, '0')}`;
        return decodeURIComponent(escaped);
    } catch {
        throw new Error('Invalid UTF-8 data');
    }
}

export interface PgnVariantInfo {
    variant: string;
    chess960: boolean;
    raw: string;
}

export function parsePgnVariantTag(rawVariant: string): PgnVariantInfo {
    const raw = rawVariant || 'chess';
    let variant = raw.toLowerCase();
    let chess960 = variant.includes('960') || variant.includes('random');

    variant = variant.endsWith('960') ? variant.slice(0, -3) : variant;
    if (variant === 'caparandom') {
        variant = 'capablanca';
        chess960 = true;
    } else if (variant === 'fischerandom') {
        variant = 'chess';
        chess960 = true;
    }
    return { variant, chess960, raw };
}

export function validatePgnFenTag(
    ffish: FairyStockfish,
    fen: string,
    variant: string,
    chess960: boolean,
): string | null {
    const validationCode = ffish.validateFen(fen, variant, chess960);
    if (validationCode === 1) return null;

    const details = FEN_VALIDATION_ERRORS[validationCode] ?? 'Unknown FEN validation error';
    return `Invalid [FEN] tag (code ${validationCode}): ${details}.`;
}

export function extractPgnTags(pgn: string): Record<string, string> {
    const tags: Record<string, string> = {};
    const regex = /^\s*\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(pgn)) !== null) {
        tags[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return tags;
}

export function replacePgnVariantTag(pgn: string, variant: string): string {
    return pgn.replace(/^(\s*\[Variant\s+")[^"]*("\]\s*)$/im, `$1${variant}$2`);
}
