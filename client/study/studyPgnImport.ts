import { decodePgnUtf8Base64, parsePgnVariantTag } from '../pgn';
import type { StudyChapterMode } from '../types';
import {
    newStudyNodeId,
    parseStudyGamebook,
    type StudyAnnotationsDto,
    type StudyEvalDto,
    type StudyGamebookDto,
    type StudyShapeDto,
    type StudyTreeDto,
} from './studyTree';

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
    mode: StudyChapterMode;
    concealPly?: number;
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

export interface StudyPgnNewStudySettings {
    name: string;
    visibility: string;
    computer: string;
    explorer: string;
    cloneable: string;
    shareable: string;
}

export class StudyPgnImportError extends Error {}

export function studyPgnGameUsesAlice(game: ParsedStudyPgnGame): boolean {
    const exact = game.tags.PyChessVariant?.trim().toLowerCase();
    if (exact) return exact === 'alice';
    return parsePgnVariantTag(game.tags.Variant ?? 'chess').variant === 'alice';
}

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
    'PyChessStudyVersion',
    'PyChessChapterMode',
    'PyChessConcealPly',
    'ChapterMode',
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

interface ParsedPgnComments {
    annotations?: StudyAnnotationsDto;
    gamebook?: StudyGamebookDto;
    whiteEval?: StudyEvalDto;
    clock?: number;
    clocks?: [number, number];
}

// Only interpret opaque lesson comments when their version tag opts into the
// PyChess extension. Without it, [%pygamebook ...] remains an ordinary comment.
const PYCHESS_STUDY_PGN_VERSION = '1';
const STUDY_CHAPTER_MODES = new Set<StudyChapterMode>(['normal', 'practice', 'conceal', 'gamebook']);

function chapterTeaching(
    tags: Record<string, string>,
): { mode: StudyChapterMode; concealPly?: number; lessonExtension: boolean } {
    const version = tags['PyChessStudyVersion'];
    if (version !== undefined && version !== PYCHESS_STUDY_PGN_VERSION) {
        throw new StudyPgnImportError(`Unsupported PyChess Study PGN version: ${version}.`);
    }
    const rawMode = tags['PyChessChapterMode'];
    if (rawMode !== undefined && version !== PYCHESS_STUDY_PGN_VERSION) {
        throw new StudyPgnImportError('PyChessChapterMode requires [PyChessStudyVersion "1"].');
    }
    if (rawMode !== undefined && !STUDY_CHAPTER_MODES.has(rawMode as StudyChapterMode)) {
        throw new StudyPgnImportError(`Invalid PyChess chapter mode: ${rawMode}.`);
    }
    const compatible = tags['ChapterMode'];
    if (compatible !== undefined && compatible !== 'gamebook') {
        throw new StudyPgnImportError(`Unsupported ChapterMode: ${compatible}.`);
    }
    const mode = (rawMode as StudyChapterMode | undefined) ?? (compatible === 'gamebook' ? 'gamebook' : 'normal');
    if (compatible === 'gamebook' && mode !== 'gamebook') {
        throw new StudyPgnImportError('ChapterMode conflicts with PyChessChapterMode.');
    }
    const rawConcealPly = tags['PyChessConcealPly'];
    if (rawConcealPly !== undefined && version !== PYCHESS_STUDY_PGN_VERSION) {
        throw new StudyPgnImportError('PyChessConcealPly requires [PyChessStudyVersion "1"].');
    }
    if (rawConcealPly !== undefined && mode !== 'conceal') {
        throw new StudyPgnImportError('PyChessConcealPly is only valid for concealed chapters.');
    }
    if (rawConcealPly !== undefined && !/^(?:0|[1-9]\d*)$/.test(rawConcealPly.trim())) {
        throw new StudyPgnImportError('Invalid PyChess conceal boundary.');
    }
    const concealPly = rawConcealPly === undefined ? undefined : Number(rawConcealPly);
    if (concealPly !== undefined && !Number.isSafeInteger(concealPly)) {
        throw new StudyPgnImportError('Invalid PyChess conceal boundary.');
    }
    return {
        mode,
        ...(mode === 'conceal' ? { concealPly: concealPly ?? 0 } : {}),
        lessonExtension: version === PYCHESS_STUDY_PGN_VERSION,
    };
}

function parseGamebookDirective(encoded: string): StudyGamebookDto {
    let raw: unknown;
    try {
        raw = JSON.parse(decodePgnUtf8Base64(encoded.trim()));
        return parseStudyGamebook(raw);
    } catch {
        throw new StudyPgnImportError('Invalid PyChess lesson metadata in PGN comment.');
    }
}

function parsePgnClock(value: string): number | undefined {
    const match = /^(\d+):([0-5]?\d):([0-5]?\d(?:\.\d{1,3})?)$/.exec(value.trim());
    if (!match) return undefined;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const milliseconds = Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : undefined;
}

function parseFullClocks(value: string): [number, number] | undefined {
    const parts = value.split(',').map(part => Number(part.trim()));
    if (parts.length !== 2 || parts.some(clock => !Number.isFinite(clock) || clock < 0)) return undefined;
    return [parts[0], parts[1]];
}

function parseWhiteEval(value: string): StudyEvalDto | undefined {
    const score = value.split(',', 1)[0].trim();
    const mate = /^#([+-]?\d+)$/.exec(score);
    if (mate) {
        const value = Number(mate[1]);
        return Number.isSafeInteger(value) ? { mate: value } : undefined;
    }
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(score)) return undefined;
    const cp = Math.round(Number(score) * 100);
    return Number.isSafeInteger(cp) ? { cp } : undefined;
}

function evalForTurn(whiteEval: StudyEvalDto | undefined, turnColor: 'white' | 'black'): StudyEvalDto | undefined {
    if (!whiteEval) return undefined;
    const factor = turnColor === 'black' ? -1 : 1;
    if (whiteEval.mate !== undefined) return { mate: whiteEval.mate * factor };
    if (whiteEval.cp !== undefined) return { cp: whiteEval.cp * factor };
    return undefined;
}

function commentsFromPgn(
    comments: readonly string[],
    rawNags: readonly number[] = [],
    lessonExtension = false,
): ParsedPgnComments {
    const shapes: StudyShapeDto[] = [];
    const nags: number[] = [];
    for (const raw of rawNags) {
        if (!Number.isInteger(raw) || raw < 1 || raw > 255) throw new StudyPgnImportError(`Invalid PGN NAG: ${raw}.`);
        if (!nags.includes(raw)) nags.push(raw);
    }

    let whiteEval: StudyEvalDto | undefined;
    let clock: number | undefined;
    let clocks: [number, number] | undefined;
    let gamebook: StudyGamebookDto | undefined;
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
        text = text.replace(/\[%eval\s+([^\]]+)\]/gi, (full, body: string) => {
            const parsed = parseWhiteEval(body);
            if (!parsed) return full;
            whiteEval = parsed;
            return '';
        });
        text = text.replace(/\[%clk\s+([^\]]+)\]/gi, (full, body: string) => {
            const parsed = parsePgnClock(body);
            if (parsed === undefined) return full;
            clock = parsed;
            return '';
        });
        text = text.replace(/\[%pyclocks\s+([^\]]+)\]/gi, (full, body: string) => {
            const parsed = parseFullClocks(body);
            if (!parsed) return full;
            clocks = parsed;
            return '';
        });
        if (lessonExtension) {
            text = text.replace(/\[%pygamebook\s+([^\]]+)\]/gi, (_full, body: string) => {
                if (gamebook) throw new StudyPgnImportError('Duplicate PyChess lesson metadata on one position.');
                gamebook = parseGamebookDirective(body);
                return '';
            });
            if (/\[%pygamebook\b/i.test(text)) {
                throw new StudyPgnImportError('Malformed PyChess lesson metadata in PGN comment.');
            }
        }
        const cleaned = text.trim();
        if (cleaned) visibleComments.push(cleaned);
    }

    const annotations: StudyAnnotationsDto = {
        shapes,
        comments: visibleComments.map(text => ({ id: newStudyNodeId(), author: 'import', text })),
        nags,
    };
    return {
        ...(annotations.shapes.length || annotations.comments.length || annotations.nags.length ? { annotations } : {}),
        ...(gamebook ? { gamebook } : {}),
        ...(whiteEval ? { whiteEval } : {}),
        ...(clock !== undefined ? { clock } : {}),
        ...(clocks ? { clocks } : {}),
    };
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

type ClockState = [number | undefined, number | undefined];

function sameShape(a: StudyShapeDto, b: StudyShapeDto): boolean {
    return a.orig === b.orig && a.dest === b.dest && a.brush === b.brush;
}

function mergeAnnotations(
    current: StudyAnnotationsDto | undefined,
    incoming: StudyAnnotationsDto | undefined,
): StudyAnnotationsDto | undefined {
    if (!incoming) return current;
    if (!current) return incoming;

    const shapes = [...current.shapes];
    for (const shape of incoming.shapes) {
        if (!shapes.some(existing => sameShape(existing, shape))) shapes.push(shape);
    }

    const comments = [...current.comments];
    for (const comment of incoming.comments) {
        if (!comments.some(existing => existing.author === comment.author && existing.text === comment.text)) {
            comments.push(comment);
        }
    }

    const nags = [...current.nags];
    for (const nag of incoming.nags) {
        if (!nags.includes(nag)) nags.push(nag);
    }
    return { shapes, comments, nags };
}

function normalizeChildren(
    board: StudyPgnBoard,
    parsedChildren: readonly ParsedStudyPgnMove[],
    parentId: string | null,
    nodes: StudyTreeDto['nodes'],
    path: string,
    parentClocks: ClockState = [undefined, undefined],
    lessonExtension = false,
): void {
    const normalizedSiblings = nodes.filter(node => node.parentId === parentId);
    for (let sourceOrder = 0; sourceOrder < parsedChildren.length; sourceOrder++) {
        const parsed = parsedChildren[sourceOrder];
        const location = path ? `${path}.${sourceOrder + 1}` : `${sourceOrder + 1}`;
        const resolved = resolveMove(board, parsed, location);
        if (!board.push(resolved.move)) throw new StudyPgnImportError(`Illegal move at ${location}: ${parsed.san}.`);
        try {
            const fen = board.fen();
            const turnColor = turnColorFromFen(fen);
            const parsedComments = commentsFromPgn(parsed.comments ?? [], parsed.nags ?? [], lessonExtension);
            const clockState: ClockState = parsedComments.clocks ? [...parsedComments.clocks] : [...parentClocks];
            if (!parsedComments.clocks && parsedComments.clock !== undefined) {
                const mover = turnColor === 'black' ? 0 : 1;
                clockState[mover] = parsedComments.clock;
            }
            const clocks =
                clockState[0] !== undefined &&
                clockState[1] !== undefined &&
                (parsedComments.clocks !== undefined || parsedComments.clock !== undefined)
                    ? ([clockState[0], clockState[1]] as [number, number])
                    : undefined;
            const evalScore = evalForTurn(parsedComments.whiteEval, turnColor);
            const existing = normalizedSiblings.find(node => node.move === resolved.move);

            if (existing) {
                existing.annotations = mergeAnnotations(existing.annotations, parsedComments.annotations);
                if (!existing.annotations) delete existing.annotations;
                if (parsedComments.gamebook) existing.gamebook = parsedComments.gamebook;
                if (evalScore) existing.eval = evalScore;
                if (clocks) existing.clocks = clocks;
                normalizeChildren(
                    board,
                    parsed.children ?? [],
                    existing.id,
                    nodes,
                    location,
                    clockState,
                    lessonExtension,
                );
                continue;
            }

            const id = newStudyNodeId();
            const node: StudyTreeDto['nodes'][number] = {
                id,
                parentId,
                order: normalizedSiblings.length,
                move: resolved.move,
                fen,
                turnColor,
                check: board.isCheck(),
                san: resolved.san,
                sanSAN: resolved.san,
                ...(parsedComments.annotations ? { annotations: parsedComments.annotations } : {}),
                ...(parsedComments.gamebook ? { gamebook: parsedComments.gamebook } : {}),
                ...(evalScore ? { eval: evalScore } : {}),
                ...(clocks ? { clocks } : {}),
            };
            nodes.push(node);
            normalizedSiblings.push(node);
            normalizeChildren(board, parsed.children ?? [], id, nodes, location, clockState, lessonExtension);
        } finally {
            board.pop();
        }
    }
}

function normalizeGame(engine: StudyPgnEngine, game: ParsedStudyPgnGame, index: number): StudyPgnImportChapter {
    const tags = { ...game.tags };
    const { variant, chess960 } = resolveVariant(tags);
    const teaching = chapterTeaching(tags);
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
        const rootComments = commentsFromPgn(game.comments ?? [], [], teaching.lessonExtension);
        normalizeChildren(
            board,
            game.children,
            null,
            nodes,
            '',
            rootComments.clocks ? [...rootComments.clocks] : [undefined, undefined],
            teaching.lessonExtension,
        );
        return {
            name: chapterName(tags, index),
            variant,
            chess960,
            initialFen,
            orientation: tags['Orientation']?.trim().toLowerCase() === 'black' ? 'black' : 'white',
            mode: teaching.mode,
            ...(teaching.mode === 'conceal' ? { concealPly: teaching.concealPly ?? 0 } : {}),
            description,
            tags: canonicalTags(tags),
            tree: {
                nodes,
                ...(rootComments.annotations ? { rootAnnotations: rootComments.annotations } : {}),
                ...(rootComments.gamebook ? { rootGamebook: rootComments.gamebook } : {}),
                ...(rootComments.clocks ? { rootClocks: rootComments.clocks } : {}),
            },
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

export async function parseStudyPgnForImportWithEngines(
    parser: StudyPgnParser,
    engineForGame: (game: ParsedStudyPgnGame, index: number) => StudyPgnEngine | Promise<StudyPgnEngine>,
    pgn: string,
): Promise<StudyPgnImportChapter[]> {
    if (!pgn.trim()) throw new StudyPgnImportError('PGN text is empty.');
    const parsed = await parser.parse(pgn);
    requireCompleteParser(parsed.capabilities);
    if (!parsed.games.length) throw new StudyPgnImportError('PGN contains no games.');

    const chapters: StudyPgnImportChapter[] = [];
    for (const [index, game] of parsed.games.entries()) {
        chapters.push(normalizeGame(await engineForGame(game, index), game, index));
    }
    return chapters;
}

export async function postStudyPgnImport(
    studyId: string,
    chapters: StudyPgnImportChapter[],
    fetcher: typeof fetch = fetch,
    sync?: boolean,
): Promise<StudyPgnImportResponse> {
    const response = await fetcher(`/study/${studyId}/import-pgn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapters, ...(sync === undefined ? {} : { sync }) }),
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

export async function postNewStudyPgnImport(
    settings: StudyPgnNewStudySettings,
    chapters: StudyPgnImportChapter[],
    fetcher: typeof fetch = fetch,
): Promise<StudyPgnImportResponse> {
    const response = await fetcher('/study/import-pgn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, chapters }),
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
