import fs from 'fs';
import path from 'path';

import { beforeAll, describe, expect, test } from '@jest/globals';

import {
    parseStudyChapterExportData,
    renderStudyChapterPgn,
    renderStudyPgn,
    studyPgnFilename,
    type StudyPgnChapterData,
    type StudyPgnContext,
} from '../client/study/studyPgn';

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
    name: 'Opening Lab',
    owner: 'owner',
    home: 'https://www.pychess.org',
};

function chapter(overrides: Partial<StudyPgnChapterData> = {}): StudyPgnChapterData {
    return {
        id: 'chapter1',
        name: 'Main line',
        order: 1,
        variant: 'chess',
        chess960: false,
        initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        orientation: 'white',
        description: 'Plans\nwith detail',
        tags: { Event: 'Custom event', Result: '1-0', Variant: 'wrong', FEN: 'wrong' },
        variantIni: '[myvariant:chess]\nmaxRank = 8',
        createdAt: '2026-09-05T08:00:00+00:00',
        tree: {
            rootAnnotations: {
                shapes: [{ orig: 'e4', brush: 'green' }],
                comments: [{ id: 'Comment001', author: 'owner', text: 'Root note' }],
                nags: [3],
            },
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
                    annotations: {
                        shapes: [{ orig: 'e2', dest: 'e4', brush: 'red' }],
                        comments: [{ id: 'Comment002', author: 'owner', text: 'King pawn' }],
                        nags: [1],
                    },
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
                    annotations: { shapes: [], comments: [], nags: [6] },
                },
            ],
        },
        ...overrides,
    };
}

describe('Study PGN export', () => {
    test('exports full variations, comments, NAGs and Lichess-compatible shapes', () => {
        const pgn = renderStudyChapterPgn(study, chapter());

        expect(pgn).toContain('[Event "Custom event"]');
        expect(pgn).toContain('[Result "*"]');
        expect(pgn).toContain('[Variant "chess"]');
        expect(pgn).toContain('[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]');
        expect(pgn).toContain('[StudyName "Opening Lab"]');
        expect(pgn).toContain('[ChapterName "Main line"]');
        expect(pgn).toContain('[Orientation "white"]');
        expect(pgn).toContain('[PyChessVariant "chess"]');
        expect(pgn).toContain('[PyChessVariantIniEncoding "base64"]');
        expect(pgn).toContain('[PyChessChapterDescriptionEncoding "base64"]');

        expect(pgn).toContain('{Root note} {[%csl Ge4]} {[%pynag 3]}');
        expect(pgn).toContain('1. e4! {King pawn} {[%cal Re2e4]} (1. d4?!) e5 *');
    });

    test.each([
        [1, '!'],
        [2, '?'],
        [3, '!!'],
        [4, '??'],
        [5, '!?'],
        [6, '?!'],
    ])('attaches NAG %s to SAN and keeps other NAGs as numeric tokens', (nag, symbol) => {
        const data = chapter();
        const node = data.tree.nodes[0];
        node.sanSAN = 'e4+';
        node.annotations!.nags = [14, Number(nag), 146, 255];
        const pgn = renderStudyChapterPgn(study, data);
        expect(pgn).toContain(`1. e4+${symbol} $14 $146 $255 {King pawn}`);
        expect(pgn).toContain('(1. d4?!)');
    });

    test('exports 960 identity explicitly', () => {
        const pgn = renderStudyChapterPgn(study, chapter({ chess960: true, variantIni: undefined }));
        expect(pgn).toContain('[Variant "chess960"]');
        expect(pgn).toContain('[PyChessChess960 "1"]');
        expect(pgn).not.toContain('PyChessVariantIni');
    });

    test('sorts chapters for a multi-PGN Study export', () => {
        const second = chapter({ id: 'chapter2', name: 'Second', order: 2, tree: { nodes: [] } });
        const first = chapter({ id: 'chapter1', name: 'First', order: 1, tree: { nodes: [] } });
        const pgn = renderStudyPgn(study, [second, first]);
        expect(pgn.indexOf('[ChapterName "First"]')).toBeLessThan(pgn.indexOf('[ChapterName "Second"]'));
        expect(pgn).toContain('*\n\n\n[Event');
    });

    test('parses the lightweight server export DTO', () => {
        const raw = chapter();
        expect(parseStudyChapterExportData(raw)).toEqual(raw);
        expect(() => parseStudyChapterExportData({ ...raw, tags: { Event: 42 } })).toThrow('Invalid Study export tags');
    });

    test('is accepted by the existing Fairy-Stockfish PGN parser', () => {
        const pgn = renderStudyChapterPgn(study, chapter({ variantIni: undefined, description: '' }));
        const game = ffish.readGamePGN(pgn);
        expect(game.headers('Variant').toLowerCase()).toBe('chess');
        expect(game.headers('StudyName')).toBe('Opening Lab');
        expect(game.mainlineMoves().trim()).toBe('e2e4 e7e5');
        game.delete();
    });

    test('creates filesystem-friendly PGN names', () => {
        expect(studyPgnFilename('My Study: 1/2', 'Main line')).toBe('pychess_study_My_Study_1_2_Main_line.pgn');
        expect(studyPgnFilename('My Study: 1/2')).toBe('pychess_study_My_Study_1_2.pgn');
    });
});
