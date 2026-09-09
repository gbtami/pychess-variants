import fs from 'fs';
import path from 'path';

import { beforeAll, describe, expect, test } from '@jest/globals';

import {
    normalizeStudyPgnDocument,
    parseStudyPgnForImport,
    postStudyPgnImport,
    StudyPgnImportError,
    type ParsedStudyPgnDocument,
} from '../client/study/studyPgnImport';

let ffish: any;

beforeAll(async () => {
    const moduleNs: any = await import('ffish-es6');
    const initFfish = moduleNs.default?.default ?? moduleNs.default ?? moduleNs;
    ffish = await initFfish({
        wasmBinary: fs.readFileSync(path.resolve(process.cwd(), 'node_modules/ffish-es6/ffish.wasm')),
        printErr: () => {},
    });
});

const complete = {
    recursiveVariations: true,
    comments: true,
    nags: true,
    multipleGames: true,
};

function parsedDocument(): ParsedStudyPgnDocument {
    return {
        capabilities: complete,
        games: [
            {
                tags: {
                    Event: 'Opening Lab',
                    Variant: 'chess',
                    ChapterName: 'Sicilian ideas',
                    Orientation: 'black',
                },
                comments: ['Root note [%csl Ge4] [%pynag 3]'],
                children: [
                    {
                        san: 'e4',
                        comments: ['King pawn [%cal Re2e4]'],
                        nags: [1],
                        children: [
                            { san: 'e5', move: 'e7e5' },
                            { san: 'c5', move: 'c7c5', nags: [5] },
                        ],
                    },
                    { san: 'd4', move: 'd2d4', nags: [6] },
                ],
            },
        ],
    };
}

describe('Study PGN import core', () => {
    test('refuses parsers that can silently lose PGN structure', () => {
        const parsed = parsedDocument();
        parsed.capabilities = { ...complete, recursiveVariations: false };
        expect(() => normalizeStudyPgnDocument(ffish, parsed)).toThrow(/refuses to flatten or discard/);
    });

    test('replays a recursive parser AST into authoritative Study DTO data', () => {
        const [chapter] = normalizeStudyPgnDocument(ffish, parsedDocument());

        expect(chapter.name).toBe('Sicilian ideas');
        expect(chapter.variant).toBe('chess');
        expect(chapter.orientation).toBe('black');
        expect(chapter.initialFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        expect(chapter.tags.Event).toBe('Opening Lab');
        expect(chapter.tags.ChapterName).toBeUndefined();
        expect(chapter.tags.Orientation).toBeUndefined();

        expect(chapter.tree.nodes).toHaveLength(4);
        const roots = chapter.tree.nodes.filter(node => node.parentId === null).sort((a, b) => a.order - b.order);
        expect(roots.map(node => node.move)).toEqual(['e2e4', 'd2d4']);
        const e4Children = chapter.tree.nodes
            .filter(node => node.parentId === roots[0].id)
            .sort((a, b) => a.order - b.order);
        expect(e4Children.map(node => node.move)).toEqual(['e7e5', 'c7c5']);
        expect(e4Children[1].annotations?.nags).toEqual([5]);

        expect(chapter.tree.rootAnnotations?.nags).toEqual([3]);
        expect(chapter.tree.rootAnnotations?.shapes).toEqual([{ orig: 'e4', brush: 'green' }]);
        expect(chapter.tree.rootAnnotations?.comments[0].text).toBe('Root note');
        expect(roots[0].annotations?.nags).toEqual([1]);
        expect(roots[0].annotations?.shapes).toEqual([{ orig: 'e2', dest: 'e4', brush: 'red' }]);
        expect(roots[0].annotations?.comments[0].text).toBe('King pawn');
    });

    test('imports result, clock and evaluation directives without turning them into visible comments', () => {
        const parsed = parsedDocument();
        parsed.games[0].tags.Result = '1-0';
        parsed.games[0].comments = ['Root note [%csl Ge4] [%pynag 3] [%pyclocks 300000,300000]'];
        const e4 = parsed.games[0].children[0];
        e4.comments = ['King pawn [%cal Re2e4] [%eval 0.42] [%clk 0:04:59] [%pyclocks 298765,300000]'];
        const e5 = e4.children![0];
        e5.comments = ['[%eval #3] [%clk 0:04:57] [%pyclocks 298765,297234]'];

        const [chapter] = normalizeStudyPgnDocument(ffish, parsed);
        const roots = chapter.tree.nodes.filter(node => node.parentId === null).sort((a, b) => a.order - b.order);
        const e4Node = roots[0];
        const e5Node = chapter.tree.nodes.find(node => node.parentId === e4Node.id && node.order === 0)!;

        expect(chapter.tags.Result).toBe('1-0');
        expect(chapter.tree.rootClocks).toEqual([300000, 300000]);
        expect(e4Node.eval).toEqual({ cp: -42 });
        expect(e4Node.clocks).toEqual([298765, 300000]);
        expect(e4Node.annotations?.comments.map(comment => comment.text)).toEqual(['King pawn']);
        expect(e5Node.eval).toEqual({ mate: 3 });
        expect(e5Node.clocks).toEqual([298765, 297234]);
        expect(e5Node.annotations).toBeUndefined();
    });

    test('imports standard clock directives by carrying known clocks down each variation', () => {
        const parsed = parsedDocument();
        parsed.games[0].comments = ['[%pyclocks 300000,300000]'];
        parsed.games[0].children[0].comments = ['[%clk 0:04:58]'];
        parsed.games[0].children[0].children![0].comments = ['[%clk 0:04:57]'];
        parsed.games[0].children[1].comments = ['[%clk 0:04:56]'];

        const [chapter] = normalizeStudyPgnDocument(ffish, parsed);
        const roots = chapter.tree.nodes.filter(node => node.parentId === null).sort((a, b) => a.order - b.order);
        const e4 = roots[0];
        const d4 = roots[1];
        const e5 = chapter.tree.nodes.find(node => node.parentId === e4.id && node.order === 0)!;

        expect(e4.clocks).toEqual([298000, 300000]);
        expect(e5.clocks).toEqual([298000, 297000]);
        expect(d4.clocks).toEqual([296000, 300000]);
    });

    test('round-trips PyChess custom variant and description extension tags', () => {
        const ini = '[pgncustom:chess]\nstartFen = rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\n';
        const description = 'Plans ✓\nsecond line';
        const encodedIni = Buffer.from(ini, 'utf8').toString('base64');
        const encodedDescription = Buffer.from(description, 'utf8').toString('base64');
        const [chapter] = normalizeStudyPgnDocument(ffish, {
            capabilities: complete,
            games: [
                {
                    tags: {
                        Variant: 'pgncustom',
                        PyChessVariant: 'pgncustom',
                        PyChessVariantIniEncoding: 'base64',
                        PyChessVariantIni: encodedIni,
                        PyChessChapterDescriptionEncoding: 'base64',
                        PyChessChapterDescription: encodedDescription,
                    },
                    children: [{ san: 'e4' }],
                },
            ],
        });

        expect(chapter.variant).toBe('pgncustom');
        expect(chapter.variantIni).toBe(ini);
        expect(chapter.description).toBe(description);
        expect(chapter.tree.nodes[0].move).toBe('e2e4');
        expect(chapter.tags.PyChessVariantIni).toBeUndefined();
    });

    test('reports ambiguous variant metadata instead of guessing', () => {
        const parsed = parsedDocument();
        parsed.games[0].tags.PyChessVariant = 'crazyhouse';
        expect(() => normalizeStudyPgnDocument(ffish, parsed)).toThrow(/Ambiguous PGN variant/);
    });

    test('parses through an injected future rich-parser adapter', async () => {
        const parser = { parse: async (_pgn: string) => parsedDocument() };
        const chapters = await parseStudyPgnForImport(parser, ffish, '[Event "ignored by fake parser"]');
        expect(chapters).toHaveLength(1);
        await expect(parseStudyPgnForImport(parser, ffish, '   ')).rejects.toBeInstanceOf(StudyPgnImportError);
    });

    test('posts only normalized chapter data to the Study batch endpoint', async () => {
        const chapters = normalizeStudyPgnDocument(ffish, parsedDocument());
        let requestUrl = '';
        let requestInit: RequestInit | undefined;
        const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
            requestUrl = String(url);
            requestInit = init;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    imported: 1,
                    studyId: 'study001',
                    chapterId: 'chapter2',
                    url: '/study/study001/chapter2',
                }),
            } as Response;
        }) as typeof fetch;

        const result = await postStudyPgnImport('study001', chapters, fetcher);
        expect(result.imported).toBe(1);
        expect(requestUrl).toBe('/study/study001/import-pgn');
        expect(requestInit?.method).toBe('POST');
        const body = JSON.parse(String(requestInit?.body));
        expect(body.chapters[0].tree.nodes).toHaveLength(4);
    });
});
