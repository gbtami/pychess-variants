import { decodePgnUtf8Base64, parsePgnVariantTag } from '../pgn';
import { newStudyNodeId, type StudyAnnotationsDto, type StudyShapeDto, type StudyTreeDto } from './studyTree';

export interface StudyPgnParserCapabilities {
    recursiveVariations: boolean;
    comments: boolean;
    nags: boolean;
    multipleGames: boolean;
}

export interface ParsedStudyPgnMove {
    /** PGN move token (normally SAN). Kept for diagnostics and SAN-only parsers. */
    san: string;
    /** Variant-native Fairy-Stockfish/pyffish move when the parser can expose it. */
    move?: string;
    comments?: string[];
    nags?: number[];
    /** Child[0] is the PGN continuation; later children are RAV alternatives. */
    children?: ParsedStudyPgnMove[];
}

export interface ParsedStudyPgnGame {
    tags: Record<string, string>;
    /** Comments attached to the initial position before the first move. */
    comments?: string[];
    /** Root children use the same mainline-first ordering as StudyTreeDto. */
    children: ParsedStudyPgnMove[];
}

export interface ParsedStudyPgnDocument {
    capabilities: StudyPgnParserCapabilities;
    games: ParsedStudyPgnGame[];
}

export interface StudyPgnParser {
    parse(pgn: string): ParsedStudyPgnDocument | Promise<ParsedStudyPgnDocument>;
}

interface StudyPgnBoard {
    legalMoves(): string;
    sanMove(move: string): string;
    push(move: string): boolean;
    pop(): void;
    fen(): string;
    isCheck(): boolean;
    delete?(): void;
}

export interface StudyPgnEngine {
    Board: new (variant: string, fen?: string, chess960?: boolean) => StudyPgnBoard;
    loadVariantConfig(config: string): void;
}

export interface StudyPgnImportChapter {
    name: string;
    variant: string;
    chess960: boolean;
    initialFen: string;
    orientation: 'white' | 'black';
    description: string;
    tags: Record<string, string>;
    tree: StudyTreeDto;
    variantIni?: string;
}

export interface StudyPgnImportResponse {
    ok: boolean;
    imported?: number;
    studyId?: string;
    chapterId?: string;
    url?: string;
    error?: string;
}

export class StudyPgnImportError extends Error {}

const BRUSH_BY_CODE: Record<string, StudyShapeDto['brush']> = {
    G: 'green',
    R: 'red',
    B: 'blue',
    Y: 'yellow',
};
const INTERNAL_TAGS = new Set([
    'StudyName',
    'ChapterName',
    'ChapterURL',
    'Orientation',
    'PyChessVariant',
    'PyChessChess960',
    'PyChessVariantIniEncoding',
    'PyChessVariantIni',
    'PyChessChapterDescriptionEncoding',
    'PyChessChapterDescription',
]);
let snapshotAliasCounter = 0;

function requireCompleteParser(capabilities: StudyPgnParserCapabilities): void {
    const missing: string[] = [];
    if (!capabilities.recursiveVariations) missing.push('recursive variations');
    if (!capabilities.comments) missing.push('comments');
    if (!capabilities.nags) missing.push('NAGs');
    if (!capabilities.multipleGames) missing.push('multiple games');
    if (missing.length) {
        throw new StudyPgnImportError(
            `The configured PGN parser is incomplete (${missing.join(', ')}). Study import refuses to flatten or discard PGN data.`,
        );
    }
}

function decodeUtf8Base64(value: string, tagName: string): string {
    try {
        return decodePgnUtf8Base64(value);
    } catch {
        throw new StudyPgnImportError(`Invalid UTF-8/base64 value in [${tagName}] tag.`);
    }
}
function decodeExtension(tags: Record<string, string>, name: string): string | undefined {
    const value = tags[name];
    const encoding = tags[`${name}Encoding`];
    if (value === undefined) {
        if (encoding !== undefined) throw new StudyPgnImportError(`[${name}Encoding] is present without [${name}].`);
        return undefined;
    }
    if (encoding !== 'base64') {
        throw new StudyPgnImportError(`Unsupported [${name}Encoding] value; expected base64.`);
    }
    return decodeUtf8Base64(value, name);
}

function snapshotRuntimeVariant(engine: StudyPgnEngine, variant: string, ini: string): string {
    const match = /^\s*\[([^\]:]+)(:[^\]]+)?\]/m.exec(ini);
    if (!match) throw new StudyPgnImportError('PyChessVariantIni has no readable variant section.');
    if (match[1].trim() !== variant) {
        throw new StudyPgnImportError('PyChessVariantIni section name does not match the PGN variant.');
    }
    snapshotAliasCounter += 1;
    const alias = `studyimport_${snapshotAliasCounter.toString(36)}`;
    const aliased =
        ini.slice(0, match.index) + match[0].replace(match[1], alias) + ini.slice(match.index + match[0].length);
    try {
        engine.loadVariantConfig(aliased);
    } catch (error) {
        throw new StudyPgnImportError(
            `Fairy-Stockfish rejected the embedded variant snapshot: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    return alias;
}

function parseShapeToken(raw: string): StudyShapeDto | undefined {
    const token = raw.trim();
    if (token.length !== 3 && token.length !== 5) return undefined;
    const brush = BRUSH_BY_CODE[token[0].toUpperCase()];
    if (!brush) return undefined;
    const orig = token.slice(1, 3);
    if (!/^[a-p][1-9:;<=>?@]$/i.test(orig)) return undefined;
    if (token.length === 3) return { orig: orig.toLowerCase(), brush };
    const dest = token.slice(3, 5);
    if (!/^[a-p][1-9:;<=>?@]$/i.test(dest)) return undefined;
    return { orig: orig.toLowerCase(), dest: dest.toLowerCase(), brush };
}

function addUniqueShape(shapes: StudyShapeDto[], shape: StudyShapeDto): void {
    if (!shapes.some(item => item.orig === shape.orig && item.dest === shape.dest && item.brush === shape.brush)) {
        shapes.push(shape);
    }
}

function annotationsFromPgn(
    comments: readonly string[],
    rawNags: readonly number[] = [],
): StudyAnnotationsDto | undefined {
    const shapes: StudyShapeDto[] = [];
    const nags: number[] = [];
    for (const raw of rawNags) {
        if (!Number.isInteger(raw) || raw < 1 || raw > 255) throw new StudyPgnImportError(`Invalid PGN NAG: ${raw}.`);
        if (!nags.includes(raw)) nags.push(raw);
    }

    const visibleComments: string[] = [];
    for (const original of comments) {
        let text = original;
        text = text.replace(/\[%csl\s+([^\]]+)\]/gi, (full, body: string) => {
            const parsed = body.split(',').map(parseShapeToken);
            if (parsed.some(shape => shape === undefined)) return full;
            parsed.forEach(shape => addUniqueShape(shapes, shape!));
            return '';
        });
        text = text.replace(/\[%cal\s+([^\]]+)\]/gi, (full, body: string) => {
            const parsed = body.split(',').map(parseShapeToken);
            if (parsed.some(shape => !shape?.dest)) return full;
            parsed.forEach(shape => addUniqueShape(shapes, shape!));
            return '';
        });
        text = text.replace(/\[%pynag\s+([^\]]+)\]/gi, (full, body: string) => {
            const parsed = body.split(',').map(value => Number(value.trim()));
            if (parsed.some(nag => !Number.isInteger(nag) || nag < 1 || nag > 255)) return full;
            parsed.forEach(nag => {
                if (!nags.includes(nag)) nags.push(nag);
            });
            return '';
        });
        const cleaned = text.trim();
        if (cleaned) visibleComments.push(cleaned);
    }

    const result: StudyAnnotationsDto = {
        shapes,
        comments: visibleComments.map(text => ({ id: newStudyNodeId(), author: 'import', text })),
        nags,
    };
    return result.shapes.length || result.comments.length || result.nags.length ? result : undefined;
}

function canonicalTags(rawTags: Record<string, string>): Record<string, string> {
    const tags: Record<string, string> = {};
    for (const [name, value] of Object.entries(rawTags)) {
        if (INTERNAL_TAGS.has(name)) continue;
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) {
            throw new StudyPgnImportError(`Invalid PGN tag name: ${name}.`);
        }
        if (typeof value !== 'string') throw new StudyPgnImportError(`Invalid value for PGN tag ${name}.`);
        const cleaned = value.replace(/[\r\n]+/g, ' ').trim();
        if (cleaned) tags[name] = cleaned;
    }
    return tags;
}

function chapterName(tags: Record<string, string>, index: number): string {
    const explicit = tags['ChapterName']?.trim();
    if (explicit) return explicit;
    const white = tags['White']?.trim();
    const black = tags['Black']?.trim();
    if (white && black) return `${white} - ${black}`;
    if (white) return white;
    if (black) return black;
    const event = tags['Event']?.trim();
    return event || `Imported chapter ${index + 1}`;
}

function resolveVariant(tags: Record<string, string>): { variant: string; chess960: boolean } {
    const fromVariant = parsePgnVariantTag(tags['Variant'] ?? tags['PyChessVariant'] ?? 'chess');
    const exact = tags['PyChessVariant']?.trim().toLowerCase();
    if (exact && tags['Variant']) {
        const normalizedExact = parsePgnVariantTag(exact);
        if (normalizedExact.variant !== fromVariant.variant) {
            throw new StudyPgnImportError(
                `Ambiguous PGN variant: [Variant "${tags['Variant']}"] conflicts with [PyChessVariant "${tags['PyChessVariant']}"].`,
            );
        }
    }
    const raw960 = tags['PyChessChess960'];
    if (raw960 !== undefined && raw960 !== '0' && raw960 !== '1') {
        throw new StudyPgnImportError('PyChessChess960 must be 0 or 1.');
    }
    return {
        variant: exact || fromVariant.variant,
        chess960: raw960 === undefined ? fromVariant.chess960 : raw960 === '1',
    };
}

function normalizedSan(value: string): string {
    return value
        .trim()
        .replace(/0/g, 'O')
        .replace(/[!?]+$/g, '');
}

function resolveMove(board: StudyPgnBoard, node: ParsedStudyPgnMove, location: string): { move: string; san: string } {
    const suppliedMove = node.move?.trim();
    if (suppliedMove) {
        const san = board.sanMove(suppliedMove);
        if (!san) throw new StudyPgnImportError(`Illegal move at ${location}: ${node.san || suppliedMove}.`);
        return { move: suppliedMove, san };
    }

    const targetSan = normalizedSan(node.san);
    if (!targetSan) throw new StudyPgnImportError(`Missing move token at ${location}.`);
    const matching = board
        .legalMoves()
        .split(/\s+/)
        .filter(Boolean)
        .map(move => ({ move, san: board.sanMove(move) }))
        .filter(candidate => normalizedSan(candidate.san) === targetSan);
    if (matching.length !== 1) {
        const detail = matching.length ? 'ambiguous' : 'illegal or unsupported';
        throw new StudyPgnImportError(`PGN move is ${detail} at ${location}: ${node.san}.`);
    }
    return matching[0];
}

function turnColorFromFen(fen: string): 'white' | 'black' {
    const turn = fen.trim().split(/\s+/)[1];
    if (turn === 'w') return 'white';
    if (turn === 'b') return 'black';
    throw new StudyPgnImportError('Fairy-Stockfish returned a FEN without a valid side to move.');
}

function normalizeChildren(
    board: StudyPgnBoard,
    parsedChildren: readonly ParsedStudyPgnMove[],
    parentId: string | null,
    nodes: StudyTreeDto['nodes'],
    path: string,
): void {
    for (let order = 0; order < parsedChildren.length; order++) {
        const parsed = parsedChildren[order];
        const location = path ? `${path}.${order + 1}` : `${order + 1}`;
        const resolved = resolveMove(board, parsed, location);
        if (!board.push(resolved.move)) throw new StudyPgnImportError(`Illegal move at ${location}: ${parsed.san}.`);
        try {
            const id = newStudyNodeId();
            const fen = board.fen();
            const annotations = annotationsFromPgn(parsed.comments ?? [], parsed.nags ?? []);
            nodes.push({
                id,
                parentId,
                order,
                move: resolved.move,
                fen,
                turnColor: turnColorFromFen(fen),
                check: board.isCheck(),
                san: resolved.san,
                sanSAN: resolved.san,
                ...(annotations ? { annotations } : {}),
            });
            normalizeChildren(board, parsed.children ?? [], id, nodes, location);
        } finally {
            board.pop();
        }
    }
}

function normalizeGame(engine: StudyPgnEngine, game: ParsedStudyPgnGame, index: number): StudyPgnImportChapter {
    const tags = { ...game.tags };
    const { variant, chess960 } = resolveVariant(tags);
    const variantIni = decodeExtension(tags, 'PyChessVariantIni');
    const description = decodeExtension(tags, 'PyChessChapterDescription') ?? '';
    const runtimeVariant = variantIni ? snapshotRuntimeVariant(engine, variant, variantIni) : variant;
    if (chess960 && !tags['FEN']) throw new StudyPgnImportError('Chess960 PGN import requires an explicit [FEN] tag.');

    let board: StudyPgnBoard | undefined;
    try {
        board = new engine.Board(runtimeVariant, tags['FEN']?.trim() || '', chess960);
        const initialFen = board.fen();
        if (!initialFen) throw new StudyPgnImportError(`Unable to initialize PGN variant ${variant}.`);
        const nodes: StudyTreeDto['nodes'] = [];
        normalizeChildren(board, game.children, null, nodes, '');
        const rootAnnotations = annotationsFromPgn(game.comments ?? []);
        return {
            name: chapterName(tags, index),
            variant,
            chess960,
            initialFen,
            orientation: tags['Orientation']?.trim().toLowerCase() === 'black' ? 'black' : 'white',
            description,
            tags: canonicalTags(tags),
            tree: { nodes, ...(rootAnnotations ? { rootAnnotations } : {}) },
            ...(variantIni ? { variantIni } : {}),
        };
    } catch (error) {
        if (error instanceof StudyPgnImportError) throw error;
        throw new StudyPgnImportError(
            `Could not replay imported PGN chapter ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
        board?.delete?.();
    }
}

export function normalizeStudyPgnDocument(
    engine: StudyPgnEngine,
    parsed: ParsedStudyPgnDocument,
): StudyPgnImportChapter[] {
    requireCompleteParser(parsed.capabilities);
    if (!parsed.games.length) throw new StudyPgnImportError('PGN contains no games.');
    return parsed.games.map((game, index) => normalizeGame(engine, game, index));
}

export async function parseStudyPgnForImport(
    parser: StudyPgnParser,
    engine: StudyPgnEngine,
    pgn: string,
): Promise<StudyPgnImportChapter[]> {
    if (!pgn.trim()) throw new StudyPgnImportError('PGN text is empty.');
    return normalizeStudyPgnDocument(engine, await parser.parse(pgn));
}

export async function postStudyPgnImport(
    studyId: string,
    chapters: StudyPgnImportChapter[],
    fetcher: typeof fetch = fetch,
): Promise<StudyPgnImportResponse> {
    const response = await fetcher(`/study/${studyId}/import-pgn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapters }),
    });
    let payload: StudyPgnImportResponse;
    try {
        payload = (await response.json()) as StudyPgnImportResponse;
    } catch {
        payload = { ok: false, error: `Study PGN import failed (${response.status})` };
    }
    if (!response.ok || !payload.ok) {
        throw new StudyPgnImportError(payload.error || `Study PGN import failed (${response.status})`);
    }
    return payload;
}
