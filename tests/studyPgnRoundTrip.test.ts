import fs from 'fs';
import path from 'path';

import { beforeAll, describe, expect, test } from '@jest/globals';

import { renderStudyPgn, type StudyPgnChapterData, type StudyPgnContext } from '../client/study/studyPgn';
import { normalizeStudyPgnDocument, parseStudyPgnForImport } from '../client/study/studyPgnImport';
import { studyPgnParser } from '../client/study/studyPgnParser';
import type { StudyAnnotationsDto, StudyTreeDto, StudyTreeNodeDto } from '../client/study/studyTree';

let ffish: any;

beforeAll(async () => {
    const moduleNs: any = await import('ffish-es6');
    const initFfish = moduleNs.default?.default ?? moduleNs.default ?? moduleNs;
    ffish = await initFfish({
        wasmBinary: fs.readFileSync(path.resolve(process.cwd(), 'node_modules/ffish-es6/ffish.wasm')),
        printErr: () => {},
    });
});

const study: StudyPgnContext = {
    id: 'study001',
    name: 'Round trip lab',
    owner: 'owner',
    home: 'https://www.pychess.org',
};

function annotations(value: StudyAnnotationsDto | undefined) {
    if (!value) return undefined;
    return {
        shapes: value.shapes,
        comments: value.comments.map(comment => comment.text),
        nags: value.nags,
    };
}

function semanticTree(tree: StudyTreeDto) {
    const children = (parentId: string | null): unknown[] =>
        tree.nodes
            .filter(node => node.parentId === parentId)
            .sort((a, b) => a.order - b.order)
            .map((node: StudyTreeNodeDto) => ({
                move: node.move,
                fen: node.fen,
                turnColor: node.turnColor,
                check: node.check,
                san: node.san,
                sanSAN: node.sanSAN,
                annotations: annotations(node.annotations),
                gamebook: node.gamebook,
                eval: node.eval,
                clocks: node.clocks,
                children: children(node.id),
            }));
    return {
        rootAnnotations: annotations(tree.rootAnnotations),
        rootGamebook: tree.rootGamebook,
        rootClocks: tree.rootClocks,
        children: children(null),
    };
}

function annotatedChapter(): StudyPgnChapterData {
    return {
        id: 'chapter1',
        name: 'Annotated line',
        order: 1,
        variant: 'chess',
        chess960: false,
        initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        orientation: 'black',
        mode: 'gamebook',
        description: 'Plans ✓\nsecond line',
        tags: { Event: 'Round-trip event', Result: '1-0', Round: '7' },
        createdAt: '2026-09-23T10:00:00+00:00',
        tree: {
            rootAnnotations: {
                shapes: [{ orig: 'e4', brush: 'green' }],
                comments: [{ id: 'Comment001', author: 'owner', text: 'Root } note \\ preserved' }],
                nags: [3, 14],
            },
            rootGamebook: { hint: 'Find the central idea' },
            rootClocks: [300000, 300000],
            nodes: [
                {
                    id: 'Node000001',
                    parentId: null,
                    order: 0,
                    move: 'e2e4',
                    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
                    turnColor: 'black',
                    check: false,
                    san: 'e4',
                    sanSAN: 'e4',
                    forceVariation: true,
                    annotations: {
                        shapes: [{ orig: 'e2', dest: 'e4', brush: 'red' }],
                        comments: [{ id: 'Comment002', author: 'owner', text: 'King pawn' }],
                        nags: [1, 16],
                    },
                    gamebook: { deviation: 'Try the main move instead' },
                    eval: { cp: -42 },
                    clocks: [298765, 300000],
                },
                {
                    id: 'Node000002',
                    parentId: 'Node000001',
                    order: 0,
                    move: 'e7e5',
                    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
                    turnColor: 'white',
                    check: false,
                    san: 'e5',
                    sanSAN: 'e5',
                    eval: { mate: 3 },
                    clocks: [298765, 297234],
                },
                {
                    id: 'Node000003',
                    parentId: null,
                    order: 1,
                    move: 'd2d4',
                    fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
                    turnColor: 'black',
                    check: false,
                    san: 'd4',
                    sanSAN: 'd4',
                    annotations: {
                        shapes: [],
                        comments: [{ id: 'Comment003', author: 'owner', text: 'Queen pawn sideline' }],
                        nags: [6],
                    },
                },
            ],
        },
    };
}

function emptyChapter(): StudyPgnChapterData {
    return {
        id: 'chapter2',
        name: 'Empty notes',
        order: 2,
        variant: 'chess',
        chess960: false,
        initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        orientation: 'white',
        mode: 'practice',
        description: '',
        tags: { Result: '*' },
        createdAt: '2026-09-23T10:05:00+00:00',
        tree: {
            rootAnnotations: {
                shapes: [],
                comments: [{ id: 'Comment004', author: 'owner', text: 'A chapter can contain notes without moves' }],
                nags: [],
            },
            nodes: [],
        },
    };
}

describe('Study PGN round trips and Lichess compatibility corpus', () => {
    test('round-trips PyChess Study exports through the raw parser and Fairy-Stockfish normalizer', () => {
        const source = [annotatedChapter(), emptyChapter()];
        const pgn = renderStudyPgn(study, source);
        const imported = normalizeStudyPgnDocument(ffish, studyPgnParser.parse(pgn));

        expect(imported).toHaveLength(2);
        for (let index = 0; index < source.length; index++) {
            expect(imported[index]).toMatchObject({
                name: source[index].name,
                variant: source[index].variant,
                chess960: source[index].chess960,
                initialFen: source[index].initialFen,
                orientation: source[index].orientation,
                mode: source[index].mode,
                description: source[index].description,
            });
            expect(semanticTree(imported[index].tree)).toEqual(semanticTree(source[index].tree));
        }
        expect(imported[0].tags).toMatchObject({ Event: 'Round-trip event', Result: '1-0', Round: '7' });
        expect(imported[1].tags.Result).toBe('*');
    });

    test('imports Lichess-style root variations, comments and broad NAG values', async () => {
        const [chapter] = await parseStudyPgnForImport(
            studyPgnParser,
            ffish,
            `{ Root comment }
1. e4! $16 $40 $32 (1. d4?? d5 $146 { d5 is a good move })
(1. c4 { and }) (1. f4 { best }) 1... e6?! { e6 is a naughty move }`,
        );

        const roots = chapter.tree.nodes.filter(node => node.parentId === null).sort((a, b) => a.order - b.order);
        expect(roots.map(node => node.move)).toEqual(['e2e4', 'd2d4', 'c2c4', 'f2f4']);
        expect(roots[0].annotations?.nags).toEqual([1, 16, 40, 32]);
        expect(roots[1].annotations?.nags).toEqual([4]);
        expect(chapter.tree.rootAnnotations?.comments.map(comment => comment.text)).toEqual(['Root comment']);
    });

    test('imports Lichess-style shapes, nested variations and a black-to-move FEN', async () => {
        const [shapes] = await parseStudyPgnForImport(
            studyPgnParser,
            ffish,
            `[Variant "Standard"]

1. d4 c6 (1... f6 2. c3?? $15 $138 $36 { note }
{ [%csl Gd7,Re7,Bf6,Yh7,Yb7][%cal Gh4f4,Gf2e4] } (2. h4)) 2. f4 h5`,
        );
        const c3 = shapes.tree.nodes.find(node => node.move === 'c2c3')!;
        expect(c3.annotations?.nags).toEqual([4, 15, 138, 36]);
        expect(c3.annotations?.shapes).toHaveLength(7);

        const [blackStart] = await parseStudyPgnForImport(
            studyPgnParser,
            ffish,
            `[Variant "Standard"]
[FEN "rnbqkbnr/pp1ppppp/2p5/8/3P1P2/8/PPP1P1PP/RNBQKBNR b KQkq - 0 2"]
[SetUp "1"]

{ custom position with Black to move } 2... h5 3. b4`,
        );
        expect(blackStart.tree.nodes.map(node => node.move)).toEqual(['h7h5', 'b2b4']);
        expect(blackStart.tree.rootAnnotations?.comments[0].text).toBe('custom position with Black to move');
    });

    test('preserves Lichess Annotator and per-comment %anno attribution as import provenance', async () => {
        const [chapter] = await parseStudyPgnForImport(
            studyPgnParser,
            ffish,
            `[Annotator "https://lichess.org/@/bobby"]

1. e4 { written by the owner } 1... e5 { [%anno "Mary", mary] written by the contributor }`,
        );

        expect(chapter.tree.nodes[0].annotations?.comments).toMatchObject([
            { text: 'written by the owner', sourceAuthor: 'https://lichess.org/@/bobby' },
        ]);
        expect(chapter.tree.nodes[1].annotations?.comments).toMatchObject([
            { text: 'written by the contributor', sourceAuthor: 'Mary', sourceAuthorId: 'mary' },
        ]);
        expect(chapter.tree.nodes[1].annotations?.comments[0].text).not.toContain('[%anno');
    });

    test('does not collapse duplicate-branch comments that have different PGN authors', async () => {
        const [chapter] = await parseStudyPgnForImport(
            studyPgnParser,
            ffish,
            `1. e4 { [%anno "Alice", alice] same text } (1. e4 { [%anno "Bob", bob] same text })`,
        );

        const comments = chapter.tree.nodes[0].annotations?.comments ?? [];
        expect(comments).toHaveLength(2);
        expect(comments.map(comment => comment.sourceAuthor)).toEqual(['Alice', 'Bob']);
    });

    test('imports a Lichess-style Crazyhouse drop without teaching the parser variant notation', async () => {
        const [chapter] = await parseStudyPgnForImport(
            studyPgnParser,
            ffish,
            `[Variant "Crazyhouse"]

1. e4 d5 2. exd5 Qxd5 3. Nc3 Qd8 4. Bc4 e6 5. Qf3 Nf6 6. Nge2 Be7
7. d4 Bd7 8. Qxb7 Bc6 9. Bb5 O-O 10. Bxc6 Nxc6 11. Qxc6 P@b4 *`,
        );
        expect(chapter.variant).toBe('crazyhouse');
        expect(chapter.tree.nodes.at(-1)?.move).toBe('P@b4');
    });

    test('normalizes Lichess-style elapsed move times to full Study clocks', async () => {
        const [chapter] = await parseStudyPgnForImport(
            studyPgnParser,
            ffish,
            `[TimeControl "300+3"]

1. e4 {[%emt 0:00:07.250]} e5 {[%emt 0:00:05.500]} *`,
        );

        expect(chapter.tree.rootClocks).toEqual([300000, 300000]);
        expect(chapter.tree.nodes[0].clocks).toEqual([295750, 300000]);
        expect(chapter.tree.nodes[1].clocks).toEqual([295750, 297500]);
    });

    test.each([
        ['three-field clock', '0:04:59.125', 299125],
        ['Lichess H:MM clock', '2:10', 7800000],
        ['Lichess H:MM.SS clock', '2:10.33', 7833000],
        ['comma fractional seconds', '0:00:01,25', 1250],
    ])('imports %s', async (_name, clock, expected) => {
        const [chapter] = await parseStudyPgnForImport(
            studyPgnParser,
            ffish,
            `{[%pyclocks 300000,300000]} 1. e4 {[%clk ${clock}]}`,
        );
        expect(chapter.tree.nodes[0].clocks?.[0]).toBe(expected);
        expect(chapter.tree.nodes[0].annotations?.comments).toBeUndefined();
    });
});
