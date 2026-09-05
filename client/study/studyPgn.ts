import type { Step } from '../messages';
import { renderFullTreePgnMoveText, type AnalysisAnnotations, type AnalysisTreeNode } from '../analysis/analysisTree';
import { analysisTreeFromStudy, type StudyTreeDto } from './studyTree';

export interface StudyPgnChapterData {
    id: string;
    name: string;
    order: number;
    variant: string;
    chess960: boolean;
    initialFen: string;
    orientation: 'white' | 'black';
    description: string;
    tags: Record<string, string>;
    tree: StudyTreeDto;
    variantIni?: string;
    createdAt?: string;
}

export interface StudyPgnContext {
    id: string;
    name: string;
    owner: string;
    home: string;
}

const BRUSH_CODE: Record<string, string> = {
    green: 'G',
    red: 'R',
    blue: 'B',
    yellow: 'Y',
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

function utf8Base64(value: string): string {
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

function tagValue(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\r\n]+/g, ' ');
}

function commentValue(value: string): string {
    // PGN has no standard brace escaping. Backslash escaping is widely tolerated and,
    // unlike deleting/replacing the brace, preserves enough information for our later
    // Study importer to recover the original comment text.
    return value.replace(/\\/g, '\\\\').replace(/}/g, '\\}');
}

function pgnDate(createdAt?: string): string {
    const date = createdAt ? new Date(createdAt) : new Date();
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    return date.toISOString().slice(0, 10).replace(/-/g, '.');
}

function rootTurnColor(initialFen: string): Step['turnColor'] {
    const side = initialFen.trim().split(/\s+/)[1]?.toLowerCase();
    return side === 'b' ? 'black' : 'white';
}

function variantTag(chapter: StudyPgnChapterData): string {
    return `${chapter.variant}${chapter.chess960 ? '960' : ''}`;
}

function shapeComment(annotations: AnalysisAnnotations | undefined): string | undefined {
    if (!annotations?.shapes.length) return undefined;
    const circles: string[] = [];
    const arrows: string[] = [];
    for (const shape of annotations.shapes) {
        if (!shape.orig) continue;
        const brush = BRUSH_CODE[shape.brush ?? 'green'] ?? 'G';
        if (shape.dest) arrows.push(`${brush}${shape.orig}${shape.dest}`);
        else circles.push(`${brush}${shape.orig}`);
    }
    const csl = circles.length ? `[%csl ${circles.join(',')}]` : '';
    const cal = arrows.length ? `[%cal ${arrows.join(',')}]` : '';
    return csl || cal ? `${csl}${cal}` : undefined;
}

function annotationComments(annotations: AnalysisAnnotations | undefined, root = false): string[] {
    if (!annotations) return [];
    const result = annotations.comments.map(comment => `{${commentValue(comment.text)}}`);
    const shapes = shapeComment(annotations);
    if (shapes) result.push(`{${shapes}}`);
    // NAGs have a standard location only after a move. Preserve root NAGs in an
    // opaque PGN comment extension so ordinary PGN readers can safely ignore it.
    if (root && annotations.nags.length) result.push(`{[%pynag ${annotations.nags.join(',')}]}`);
    return result;
}

function nodeSuffix(node: AnalysisTreeNode): string {
    const annotations = node.annotations;
    if (!annotations) return '';
    return [...annotations.nags.map(nag => `$${nag}`), ...annotationComments(annotations)].join(' ');
}

function chapterTags(study: StudyPgnContext, chapter: StudyPgnChapterData): Array<[string, string]> {
    const tags = new Map<string, string>(Object.entries(chapter.tags));
    const chapterUrl = `${study.home}/study/${study.id}/${chapter.id}`;

    if (!tags.has('Event')) tags.set('Event', `${study.name}: ${chapter.name}`);
    if (!tags.has('Site')) tags.set('Site', chapterUrl);
    if (!tags.has('Date')) tags.set('Date', pgnDate(chapter.createdAt));
    if (!tags.has('White')) tags.set('White', '?');
    if (!tags.has('Black')) tags.set('Black', '?');

    // Structural tags are authoritative and may not be overridden by free-form tags.
    tags.set('Result', '*');
    tags.set('Variant', variantTag(chapter));
    tags.set('FEN', chapter.initialFen);
    tags.set('SetUp', '1');
    tags.set('StudyName', study.name);
    tags.set('ChapterName', chapter.name);
    tags.set('ChapterURL', chapterUrl);
    tags.set('Annotator', `${study.home}/@/${study.owner}`);
    tags.set('Orientation', chapter.orientation);
    tags.set('PyChessVariant', chapter.variant);
    if (chapter.chess960) tags.set('PyChessChess960', '1');
    else tags.delete('PyChessChess960');

    if (chapter.variantIni) {
        tags.set('PyChessVariantIniEncoding', 'base64');
        tags.set('PyChessVariantIni', utf8Base64(chapter.variantIni));
    } else {
        tags.delete('PyChessVariantIniEncoding');
        tags.delete('PyChessVariantIni');
    }

    if (chapter.description) {
        tags.set('PyChessChapterDescriptionEncoding', 'base64');
        tags.set('PyChessChapterDescription', utf8Base64(chapter.description));
    } else {
        tags.delete('PyChessChapterDescriptionEncoding');
        tags.delete('PyChessChapterDescription');
    }

    const preferred = [
        'Event',
        'Site',
        'Date',
        'White',
        'Black',
        'Result',
        'Variant',
        'FEN',
        'SetUp',
        'StudyName',
        'ChapterName',
        'ChapterURL',
        'Annotator',
        'Orientation',
        'PyChessVariant',
        'PyChessChess960',
        'PyChessVariantIniEncoding',
        'PyChessVariantIni',
        'PyChessChapterDescriptionEncoding',
        'PyChessChapterDescription',
    ];
    const preferredSet = new Set(preferred);
    const result: Array<[string, string]> = [];
    for (const name of preferred) {
        const value = tags.get(name);
        if (value !== undefined) result.push([name, value]);
    }
    for (const [name, value] of [...tags.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (!preferredSet.has(name)) result.push([name, value]);
    }
    return result;
}

export function renderStudyChapterPgn(study: StudyPgnContext, chapter: StudyPgnChapterData): string {
    const rootStep: Step = {
        fen: chapter.initialFen,
        move: undefined,
        check: false,
        turnColor: rootTurnColor(chapter.initialFen),
    };
    const tree = analysisTreeFromStudy(rootStep, chapter.tree);
    const moveText = renderFullTreePgnMoveText(
        tree,
        node => node.step.sanSAN ?? node.step.san ?? node.step.move ?? '',
        nodeSuffix,
    );
    const initialComments = annotationComments(tree.root.annotations, true);
    const body = [...initialComments, moveText, '*'].filter(Boolean).join(' ');
    const headers = chapterTags(study, chapter)
        .map(([name, value]) => `[${name} "${tagValue(value)}"]`)
        .join('\n');
    return `${headers}\n\n${body}\n`;
}

export function renderStudyPgn(study: StudyPgnContext, chapters: StudyPgnChapterData[]): string {
    return (
        [...chapters]
            .sort((a, b) => a.order - b.order)
            .map(chapter => renderStudyChapterPgn(study, chapter).trimEnd())
            .join('\n\n\n') + '\n'
    );
}

function exportDataRecord(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid Study export data');
    return value as Record<string, unknown>;
}

export function parseStudyChapterExportData(value: unknown): StudyPgnChapterData {
    const data = exportDataRecord(value);
    const tree = exportDataRecord(data.tree);
    if (
        typeof data.id !== 'string' ||
        typeof data.name !== 'string' ||
        !Number.isInteger(data.order) ||
        typeof data.variant !== 'string' ||
        typeof data.chess960 !== 'boolean' ||
        typeof data.initialFen !== 'string' ||
        (data.orientation !== 'white' && data.orientation !== 'black') ||
        typeof data.description !== 'string' ||
        data.tags === null ||
        typeof data.tags !== 'object' ||
        Array.isArray(data.tags) ||
        !Array.isArray(tree.nodes)
    ) {
        throw new Error('Invalid Study export data');
    }
    const tags: Record<string, string> = {};
    for (const [name, rawValue] of Object.entries(data.tags as Record<string, unknown>)) {
        if (typeof rawValue !== 'string') throw new Error('Invalid Study export tags');
        tags[name] = rawValue;
    }
    return {
        id: data.id,
        name: data.name,
        order: data.order as number,
        variant: data.variant,
        chess960: data.chess960,
        initialFen: data.initialFen,
        orientation: data.orientation,
        description: data.description,
        tags,
        tree: data.tree as StudyTreeDto,
        ...(typeof data.variantIni === 'string' ? { variantIni: data.variantIni } : {}),
        ...(typeof data.createdAt === 'string' ? { createdAt: data.createdAt } : {}),
    };
}

export async function fetchStudyChapterExportData(studyId: string, chapterId: string): Promise<StudyPgnChapterData> {
    const response = await fetch(`/study/${encodeURIComponent(studyId)}/${encodeURIComponent(chapterId)}/export-data`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Study chapter export failed (${response.status})`);
    return parseStudyChapterExportData(await response.json());
}

export function studyPgnFilename(studyName: string, chapterName?: string): string {
    const slug = (value: string) =>
        value
            .normalize('NFKD')
            .replace(/[^A-Za-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80) || 'study';
    return chapterName
        ? `pychess_study_${slug(studyName)}_${slug(chapterName)}.pgn`
        : `pychess_study_${slug(studyName)}.pgn`;
}
