import { h, InsertHook, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

import { BoardMarkType, ColorName, CountingType, MaterialPointType, PieceSoundType, PromotionSuffix, PromotionType, TimeControlType } from './chess';
import { _ } from './i18n';
import { calculateDiff, Equivalence, MaterialDiff } from './material';

export interface BoardFamily {
    readonly dimensions: cg.BoardDimensions;
    readonly cg: string;
    readonly boardCSS: string[];
}

export interface PieceFamily {
    readonly pieceCSS: string[];
}

export const BOARD_FAMILIES: Record<string, BoardFamily> = {
    ataxx7x7: { dimensions: { width: 7, height: 7 }, cg: "cg-448", boardCSS: ["ataxx.svg", "ataxx.png"] },
    standard8x8: { dimensions: { width: 8, height: 8 }, cg: "cg-512", boardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg", "8x8santa.png", "8x8wood2.jpg", "8x8wood4.jpg", "8x8ic.svg", "8x8purple.svg"] },
    standard9x9: { dimensions: { width: 9, height: 9 }, cg: "cg-540", boardCSS: ["9x9mansindam.svg", "9x9brown.svg", "9x9blue.svg", "9x9green.svg", "9x9maple.jpg", "9x9olive.jpg"] },
    standard10x8: { dimensions: { width: 10, height: 8 }, cg: "cg-640", boardCSS: ["10x8brown.svg", "10x8blue.svg", "10x8green.svg", "10x8maple.jpg", "10x8olive.jpg"] },
    standard10x10: { dimensions: { width: 10, height: 10 }, cg: "cg-640-640", boardCSS: ["10x10brown.svg", "10x10blue.svg", "10x10green.svg", "10x10maple.jpg", "10x10olive.jpg"] },
    grand10x10: { dimensions: { width: 10, height: 10}, cg: "cg-640-640", boardCSS: ["Grandboard.svg", "10x10brown.svg", "10x10blue.svg", "10x10green.svg", "10x10maple.jpg", "10x10mapleGrand.png"] },
    makruk8x8: { dimensions: { width: 8, height: 8 }, cg: "cg-512", boardCSS: ["makruk2.svg", "makruk.svg", "makrukWhite.svg", "makruk.jpg", "makrukWood.png"] },
    sittuyin8x8: { dimensions: { width: 8, height: 8 }, cg: "cg-512", boardCSS: ["sittuyin2.svg", "sittuyin.svg", "sittuyin.jpg", "sittuyingreen.svg", "sittuyinGrainBrown.svg", "sittuyinWood.png"] },
    shogi9x9: { dimensions: { width: 9, height: 9 }, cg: "cg-576", boardCSS: ["shogi.svg", "Shogiban1.png", "Shogiban2.png", "shogic.svg", "ShogiMaple.png", 'ShogiGrayTexture.png', "ShogiSpace1.svg", "dobutsu.png", "ShogiOak.png"] },
    shogi7x7: { dimensions: { width: 7, height: 7 }, cg: "cg-448-516", boardCSS: ["ToriPlain.svg", "ToriWood.svg", "ToriDaySky.svg", "ToriNightSky.svg"] },
    shogi5x5: { dimensions: { width: 5, height: 5 }, cg: "cg-260", boardCSS: ["minishogi.svg", "MiniboardWood1.png", "MiniboardWood2.png", "MinishogiDobutsu.svg", "MinishogiDobutsu2.svg"] },
    shogi5x6: { dimensions: { width: 5, height: 6 }, cg: "cg-260-360", boardCSS: ["gorogoro.svg", "gorogoroboard.svg", "gorogoro2.svg", "GorogoroWood.png"] },
    shogi3x4: { dimensions: { width: 3, height: 4 }, cg: "cg-156", boardCSS: ["doubutsuboard.svg", "dobutsu3x4.svg"] },
    xiangqi9x10: { dimensions: { width: 9, height: 10 }, cg: "cg-576-640", boardCSS: ["xiangqi.svg", "xiangqic.svg", "xiangqiCTexture.png", "xiangqiPaper.png", "xiangqiWood.png", "xiangqiDark.svg", "xiangqiWikimedia.svg", "xiangqiLightWood.png", "xiangqiSand.svg"] },
    xiangqi7x7: { dimensions: { width: 7, height: 7 }, cg: "cg-448", boardCSS: ["minixiangqi.svg", "minixiangqiw.png", "minixqlg.svg"] },
    janggi9x10: { dimensions: { width: 9, height: 10 }, cg: "cg-janggi", boardCSS: ["JanggiBrown.svg", "JanggiPaper.png", "JanggiWood.png", "JanggiDark.svg", "JanggiWoodDark.svg", "JanggiStone.svg"] },
    shogun8x8: { dimensions: { width: 8, height: 8 }, cg: "cg-512", boardCSS: ["ShogunPlain.svg", "ShogunMaple.png", "ShogunMaple2.png", "ShogunBlue.svg", "8x8brown.svg", "8x8maple.jpg"] },
    chak9x9:{ dimensions: { width: 9, height: 9 }, cg: "cg-540", boardCSS: ["StandardChakBoard.svg", "ColoredChakBoard.svg", "ChakArt.jpg"] },
    chennis7x7:{ dimensions: { width: 7, height: 7 }, cg: "cg-448", boardCSS: ["WimbledonBoard.svg", "FrenchOpenBoard.svg", "USOpenBoard.svg"] },
};

export const PIECE_FAMILIES: Record<string, PieceFamily> = {
    ataxx: { pieceCSS: ["disguised", "virus", "zombie", "cat-dog"] },
    standard: { pieceCSS: ["standard", "green", "alpha", "chess_kaneo", "santa", "maestro", "dubrovny", "disguised", "atopdown"] },
    capa: { pieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4", "capa5", "disguised"] },
    dragon: { pieceCSS: ["dragon1", "dragon0", "dragon2", "disguised"] },
    seirawan: { pieceCSS: ["seir1", "seir0", "seir2", "seir3", "seir4", "seir5", "disguised"] },
    makruk: { pieceCSS: ["makrukwb", "makrukwr", "makruk", "makruks", "makruki", "makrukc", "disguised"] },
    sittuyin: { pieceCSS: ["sittuyins", "sittuyinkagr", "sittuyinkabr", "sittuyinm", "sittuyini", "sittuyincb", "disguised"] },
    asean: { pieceCSS: ["aseani", "aseanm", "aseanc", "aseans", "aseancb", "disguised"] },
    shogi: { pieceCSS: ["shogik", "shogi", "shogiw", "shogip", "shogim", "shogip3d", "shogikw3d", "shogid", "shogiim", "shogibw", "portk", "porti", "cz", "disguised"] },
    kyoto: { pieceCSS: ["kyoto", "kyotok", "kyotoks", "kyotoi", "kyotod", "disguised"] },
    dobutsu: { pieceCSS: ["dobutsu", "disguised"] },
    tori: { pieceCSS: ["torii", "torik", "torim", "porti", "cz", "disguised"] },
    cannonshogi: { pieceCSS: ["ctp3d", "cz", "czalt", "disguised"] },
    xiangqi: { pieceCSS: ["lishu", "xiangqi2di", "xiangqi", "xiangqict3", "xiangqihnz", "xiangqict2", "lishuw", "xiangqict2w", "xiangqiwikim", "xiangqiKa", "xiangqittxqhnz", "xiangqittxqintl", "xiangqi2d", "xiangqihnzw", 'basic', 'guided', "disguised", "euro"] },
    janggi: { pieceCSS: ["janggihb", "janggihg", "janggiikak", "janggiikaw", "janggikak", "janggikaw", "janggiib", "janggiig", "disguised"] },
    shako: { pieceCSS: ["shako0", "shako1", "shako2", "disguised"] },
    shogun: { pieceCSS: ["shogun0", "shogun1", "shogun2", "shogun3", "shogun4", "shogun5", "disguised"] },
    orda: { pieceCSS: ["orda0", "orda1", "disguised"] },
    khans: { pieceCSS: ["khans0", "disguised"] },
    synochess: { pieceCSS: ["synochess0", "synochess1", "synochess2", "synochess3", "synochess4", "synochess5", "disguised"] },
    hoppel: { pieceCSS: ["hoppel0", "hoppel1", "hoppel2", "disguised"] },
    shinobi: { pieceCSS: ["shinobi0", "shinobi1", "disguised"] },
    empire: { pieceCSS: ["empire0", "empire1", "disguised"] },
    ordamirror: { pieceCSS: ["ordamirror0", "ordamirror1", "disguised"] },
    chak: { pieceCSS: ["chak0", "chak1", "disguised"] },
    chennis: { pieceCSS: ["chennis0", "chennis1", "chennis2", "chennis3", "chennis4", "disguised"] },
    spartan: { pieceCSS: ["spartan0", "disguised"] },
    mansindam: { pieceCSS: ["mansindam2", "mansindam1", "mansindam3", "mansindam4", "disguised"] },
};

export interface Variant {
    readonly name: string;
    readonly _displayName: string;
    readonly displayName: (chess960?: boolean) => string;
    readonly _tooltip: string;
    readonly tooltip: string;
    readonly chess960: boolean;
    readonly _icon: string;
    readonly _icon960: string;
    readonly icon: (chess960?: boolean) => string;
    readonly startFen: string;
    readonly boardFamily: keyof typeof BOARD_FAMILIES;
    readonly board: BoardFamily;
    readonly notation: cg.Notation;
    readonly pieceFamily: keyof typeof PIECE_FAMILIES;
    readonly piece: PieceFamily;
    readonly colors: {
        readonly first: ColorName;
        readonly second: ColorName;
    }
    readonly pieceRow: Record<cg.Color, cg.Role[]>;
    readonly kingRoles: cg.Role[];
    readonly pocket?: {
        readonly roles: Record<cg.Color, cg.Role[]>;
        readonly captureToHand: boolean;
    };
    readonly promotion: {
        readonly type: PromotionType;
        readonly order: PromotionSuffix[];
        readonly roles: cg.Role[];
        readonly strict?: {
            readonly isPromoted: (piece: cg.Piece, pos: cg.Pos) => boolean;
        };
        readonly autoPromoteable: boolean;
    };
    readonly rules: {
        readonly defaultTimeControl: TimeControlType;
        readonly enPassant: boolean;
        readonly gate: boolean;
        readonly duck: boolean;
        readonly pass: boolean;
        readonly setup: boolean;
        readonly noDrawOffer: boolean;
    };
    readonly material: {
        readonly showDiff: boolean;
        readonly initialDiff: MaterialDiff;
        readonly equivalences: Equivalence;
    };
    readonly ui: {
        readonly counting?: CountingType;
        readonly materialPoint?: MaterialPointType;
        readonly showPromoted: boolean;
        readonly pieceSound: PieceSoundType;
        readonly boardMark: BoardMarkType | '';
    };
    readonly alternateStart?: Record<string, string>;
}

function variant(config: VariantConfig): Variant {
    return {
        name: config.name,
        _displayName: config.displayName ?? config.name,
        displayName: function (chess960 = false) { return _(this._displayName).toUpperCase() + (chess960 ? '960' : ''); },
        _tooltip: config.tooltip,
        get tooltip() { return _(this._tooltip) },
        chess960: !!config.chess960,
        _icon: config.icon,
        _icon960: config.icon960 ?? config.icon,
        icon: function (chess960 = false) { return chess960 ? this._icon960 : this._icon; },
        startFen: config.startFen,
        boardFamily: config.boardFamily,
        board: BOARD_FAMILIES[config.boardFamily],
        pieceFamily: config.pieceFamily,
        notation: config.notation ?? cg.Notation.ALGEBRAIC,
        piece: PIECE_FAMILIES[config.pieceFamily],
        colors: config.colors ?? { first: 'White', second: 'Black' },
        pieceRow: Array.isArray(config.pieceRow) ? {
            white: config.pieceRow.map(util.roleOf),
            black: config.pieceRow.map(util.roleOf),
        } : {
            white: config.pieceRow.white.map(util.roleOf),
            black: config.pieceRow.black.map(util.roleOf),
        },
        kingRoles: (config.kingRoles ?? ['k']).map(util.roleOf),
        pocket: config.pocket ? {
            roles: Array.isArray(config.pocket.roles) ? {
                white: config.pocket.roles.map(util.roleOf),
                black: config.pocket.roles.map(util.roleOf),
            } : {
                white: config.pocket.roles.white.map(util.roleOf),
                black: config.pocket.roles.black.map(util.roleOf),
            },
            captureToHand: config.pocket.captureToHand,
        } : undefined,
        promotion: {
            type: config.promotion?.type ?? 'regular',
            order: config.promotion?.order ?? (config.promotion?.type === 'shogi' ? ['+', ''] : ['q', 'c', 'e', 'a', 'h', 'n', 'r', 'b', 'p']),
            roles: (config.promotion?.roles ?? ['p']).map(util.roleOf),
            strict: config.promotion?.strict,
            get autoPromoteable() { return this.order.length > 2 },
        },
        rules: {
            defaultTimeControl: config.rules?.defaultTimeControl ?? 'incremental',
            enPassant: !!config.rules?.enPassant,
            gate: !!config.rules?.gate,
            duck: !!config.rules?.duck,
            pass: !!config.rules?.pass,
            setup: !!config.rules?.setup,
            noDrawOffer: !!config.rules?.noDrawOffer,
        },
        material: {
            showDiff: !config.pocket?.captureToHand,
            initialDiff: calculateDiff(config.startFen, BOARD_FAMILIES[config.boardFamily].dimensions, config.material?.equivalences ?? {}, !!config.pocket?.captureToHand),
            equivalences: config.material?.equivalences ?? {},
        },
        ui: {
            counting: config.ui?.counting,
            materialPoint: config.ui?.materialPoint,
            showPromoted: config.ui?.showPromoted ?? false,
            pieceSound: config.ui?.pieceSound ?? 'regular',
            boardMark: config.ui?.boardMark ?? '',
        },
        alternateStart: config.alternateStart,
    };
}

interface VariantConfig {
    // Name as defined in Fairy-Stockfish
    name: string;
    // Display name for use on the website (default: same as name)
    displayName?: string;
    // Tooltip displayed when variant name is hovered
    tooltip: string;
    // Start FEN for use in some client-side calculations
    startFen: string;
    // Whether it is possible to play a randomized starting position (default: false)
    chess960?: boolean;
    // Icon letter in the site's font
    icon: string;
    // Icon of the 960 version (default: same as icon)
    icon960?: string;
    // Board appearance
    boardFamily: keyof typeof BOARD_FAMILIES;
    // Chessground coord/move notation (default: cg.Notation.ALGEBRAIC)
    notation?: cg.Notation;
    // Piece appearance
    pieceFamily: keyof typeof PIECE_FAMILIES;
    // Color names of each side for accurate color representation
    colors?: {             
        // (default: White)
        first: ColorName;
        // (default: Black)
        second: ColorName;
    }
    // Pieces on the editor's piece row
    // Use the record version if the pieces of each side are different
    pieceRow: cg.Letter[] | Record<cg.Color, cg.Letter[]>;
    // Pieces considered king for check marking (default: ['k'])
    kingRoles?: cg.Letter[];
    pocket?: {
        // Pieces in the pocket
        // Use the record version if the pieces of each side are different
        roles: cg.Letter[] | Record<cg.Color, cg.Letter[]>;
        // Whether captured pieces go to the pocket (Fairy's terminology)
        captureToHand: boolean;
    };
    promotion?: {
        // Promotion style
        // regular: (default) Pawns promote to one or more pieces (like chess)
        // shogi: Multiple pieces promote to another piece corresponding to it (like shogi)
        type: PromotionType;
        // Order of promotion choices to display, top choice will be chosen for auto-promote
        // (default: ["q", "c", "e", "a", "h", "n", "r", "b", "p"] for regular)
        // (default: ["+", ""] for shogi)
        order?: PromotionSuffix[];
        // Pieces that can promote (default: ['p'])
        roles?: cg.Letter[];
        // Whether a piece's promotion state strictly depends on its square (default: undefined)
        strict?: {
            // Returns true if and only if the given piece would be promoted on the given square
            isPromoted: (piece: cg.Piece, pos: cg.Pos) => boolean;
        };
    };
    // Miscellaneous rules useful for client-side processing
    // (default: false)
    rules?: {
        // Default time control (default: incremental)
        defaultTimeControl?: TimeControlType;
        // Chess's en passant
        enPassant?: boolean;
        // S-Chess gating
        gate?: boolean;
        // Duck Chess moving
        duck?: boolean;
        // Passing without moving a piece on board
        pass?: boolean;
        // Setup phase
        setup?: boolean;
        // Draw offer not allowed
        noDrawOffer?: boolean;
    };
    // Material equivalences for material diff calculation
    // ex. { 'pl-piece': 'r-piece' } means the "+L" piece is treated as the "R" piece for material diff
    material?: {
        equivalences?: Equivalence;
    },
    // UI display info
    ui?: {
        // SEA variants' counting (default: undefined)
        counting?: CountingType;
        // Material point (default: undefined)
        materialPoint?: MaterialPointType;
        // Promoted pieces need to be represented in the FEN even if it's not a drop variant (default: false)
        showPromoted?: boolean;
        // Sound of the piece moving (default: regular)
        pieceSound?: PieceSoundType;
        // Board marking for special squares (default: '')
        boardMark?: BoardMarkType;
    };
    // Alternate starting positions, including handicaps
    alternateStart?: Record<string, string>;
}

export const VARIANTS: Record<string, Variant> = {
    ataxx: variant({
        name: "ataxx", tooltip: "Infection game.",
        startFen: "P5p/7/7/7/7/7/p5P w 0 1",
        icon: "☣",
        boardFamily: "ataxx7x7", pieceFamily: "ataxx",
        colors: { first: "Red", second: "Blue" },
        pieceRow: ["p", "*"],
        rules: { pass: true },
        ui: { materialPoint: "ataxx" },
        // Ataxx All 19 boards won https://www.youtube.com/watch?v=3VcAW6EKuvU
        alternateStart: {
            '': "",
            'Board 0': "P5p/7/7/7/7/7/p5P w 0 1",
            'Board 1': "P5p/7/3*3/2*1*2/3*3/7/p5P w 0 1",
            'Board 2': "P5p/7/3*3/2***2/3*3/7/p5P w 0 1",
            'Board 3': "P5p/7/2*1*2/7/2*1*2/7/p5P w 0 1",
            'Board 4': "P5p/1*3*1/2*1*2/7/2*1*2/1*3*1/p5P w 0 1",
            'Board 5': "P5p/7/2*1*2/3*3/2*1*2/7/p5P w 0 1",
            'Board 6': "P2*2p/7/7/*5*/7/7/p2*2P w 0 1",
            'Board 7': "P2*2p/3*3/7/**3**/7/3*3/p2*2P w 0 1",
            'Board 8': "P2*2p/3*3/3*3/***1***/3*3/3*3/p2*2P w 0 1",
            'Board 9': "P5p/2*1*2/1*3*1/7/1*3*1/2*1*2/p5P w 0 1",
            "Board 10": "P2*2p/7/1*3*1/*5*/1*3*1/7/p2*2P w 0 1",
            "Board 11": "P1*1*1p/7/*2*2*/7/*2*2*/7/p1*1*1P w 0 1",
            "Board 12": "P1*1*1p/7/2*1*2/1*3*1/2*1*2/7/p1*1*1P w 0 1",
            "Board 13": "P2*2p/2*1*2/1*3*1/*5*/1*3*1/2*1*2/p2*2P w 0 1",
            "Board 14": "P1*1*1p/1*3*1/*5*/7/*5*/1*3*1/p1*1*1P w 0 1",
            "Board 15": "P1*1*1p/7/*1*1*1*/7/*1*1*1*/7/p1*1*1P w 0 1",
            "Board 16": "P2*2p/7/1**1**1/**3**/1**1**1/7/p2*2P w 0 1",
            "Board 17": "P1*1*1p/2*1*2/*5*/*2*2*/*5*/2*1*2/p1*1*1P w 0 1",
            "Board 18": "P5p/2*1*2/**1*1**/3*3/**1*1**/2*1*2/p5P w 0 1",
            "Board 19": "P1***1p/7/**1*1**/*5*/**1*1**/7/p1***1P w 0 1",
        }
    }),

    chess: variant({
        name: "chess", tooltip: "Chess, unmodified, as it's played by FIDE standards.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        chess960: true, icon: "M", icon960: "V",
        boardFamily: "standard8x8", pieceFamily: "standard",
        pieceRow: ["k", "q", "r", "b", "n", "p"],
        rules: { enPassant: true },
        alternateStart: {
            '': "",
            'PawnsPushed': "rnbqkbnr/8/8/pppppppp/PPPPPPPP/8/8/RNBQKBNR w KQkq - 0 1",
            'PawnsPassed': "rnbqkbnr/8/8/PPPPPPPP/pppppppp/8/8/RNBQKBNR w KQkq - 0 1",
            'UpsideDown': "RNBKQBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbkqbnr w - - 0 1",
            'Theban': "1p6/2p3kn/3p2pp/4pppp/5ppp/8/PPPPPPPP/PPPPPPKN w - - 0 1",
            'No castle': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1'
        },
    }),

    crazyhouse: variant({
        name: "crazyhouse", tooltip: "Take captured pieces and drop them back on to the board as your own.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1",
        chess960: true, icon: "+", icon960: "%",
        boardFamily: "standard8x8", pieceFamily: "standard",
        pieceRow: ["k", "q", "r", "b", "n", "p"],
        pocket: {
            roles: ["p", "n", "b", "r", "q"],
            captureToHand: true,
        },
        rules: { enPassant: true },
        alternateStart: {
            '': "",
            'PawnsPushed': "rnbqkbnr/8/8/pppppppp/PPPPPPPP/8/8/RNBQKBNR w - - 0 1",
            'PawnsPassed': "rnbqkbnr/8/8/PPPPPPPP/pppppppp/8/8/RNBQKBNR w - - 0 1",
            'UpsideDown': "RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr w - - 0 1",
            'Theban': "1p6/2p3kn/3p2pp/4pppp/5ppp/8/PPPPPPPP/PPPPPPKN w - - 0 1",
            'No castle': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1'
        },
    }),

    placement: variant({
        name: "placement", tooltip: "Choose where your pieces start.",
        startFen: "8/pppppppp/8/8/8/8/PPPPPPPP/8[KQRRBBNNkqrrbbnn] w - - 0 1",
        icon: "S",
        boardFamily: "standard8x8", pieceFamily: "standard",
        pieceRow: ["k", "q", "r", "b", "n", "p"],
        pocket: { roles: ["n", "b", "r", "q", "k"], captureToHand: false },
        rules: { enPassant: true },
    }),

    atomic: variant({
        name: "atomic", tooltip: "Pieces explode upon capture.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        chess960: true, icon: "~", icon960: "\\",
        boardFamily: "standard8x8", pieceFamily: "standard",
        pieceRow: ["k", "q", "r", "b", "n", "p"],
        rules: { enPassant: true },
        ui: { pieceSound: "atomic" },
    }),

    kingofthehill: variant({
        name: "kingofthehill", displayName: "king of the hill", tooltip: "Bring your King to the center to win the game.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        chess960: true, icon: "🏴", icon960: "🏁",
        boardFamily: "standard8x8", pieceFamily: "standard",
        pieceRow: ["k", "q", "r", "b", "n", "p"],
        rules: { enPassant: true },
        ui: { boardMark: 'kingofthehill' },
    }),

    '3check': variant({
        name: "3check", displayName: "three-check", tooltip: "Check your opponent 3 times to win the game.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 3+3 0 1",
        chess960: true, icon: "☰", icon960: "☷",
        boardFamily: "standard8x8", pieceFamily: "standard",
        pieceRow: ["k", "q", "r", "b", "n", "p"],
        rules: { enPassant: true },
        alternateStart: {
            '': "",
            '5check': "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5+5 0 1",
        },
    }),

    duck: variant({
        name: "duck", tooltip: "The duck must be moved to a new square after every turn.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        icon: "🦆",
        boardFamily: "standard8x8", pieceFamily: "standard",
        pieceRow: { white: ["k", "q", "r", "b", "n", "p", "*"], black: ["k", "q", "r", "b", "n", "p"] },
        rules: { enPassant: true, duck: true },
    }),

    makruk: variant({
        name: "makruk", tooltip: "Thai Chess. A game closely resembling the original Chaturanga. Similar to Chess but with a different queen and bishop.",
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        icon: "Q",
        boardFamily: "makruk8x8", pieceFamily: "makruk",
        pieceRow: ["k", "s", "m", "n", "r", "p", "m~" as cg.Letter],
        promotion: { type: "regular", order: ["m"] },
        ui: { counting: "makruk", showPromoted: true },
    }),

    makpong: variant({
        name: "makpong", tooltip: "Makruk variant where kings cannot move to escape out of check.",
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        icon: "O",
        boardFamily: "makruk8x8", pieceFamily: "makruk",
        pieceRow: ["k", "s", "m", "n", "r", "p", "m~" as cg.Letter],
        promotion: { type: "regular", order: ["m"] },
        ui: { counting: "makruk", showPromoted: true },
    }),

    cambodian: variant({
        name: "cambodian", displayName: "ouk chaktrang", tooltip: "Cambodian Chess. Makruk with a few additional opening abilities.",
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w DEde - 0 1",
        icon: "!",
        boardFamily: "makruk8x8", pieceFamily: "makruk",
        pieceRow: ["k", "s", "m", "n", "r", "p", "m~" as cg.Letter],
        promotion: { type: "regular", order: ["m"] },
        ui: { counting: "makruk", showPromoted: true },
    }),

    sittuyin: variant({
        name: "sittuyin", tooltip: "Burmese Chess. Similar to Makruk, but pieces are placed at the start of the match.",
        startFen: "8/8/4pppp/pppp4/4PPPP/PPPP4/8/8[KFRRSSNNkfrrssnn] w - - 0 1",
        icon: ":",
        boardFamily: "sittuyin8x8", pieceFamily: "sittuyin",
        colors: { first: "Red", second: "Black" },
        pieceRow: ["k", "f", "s", "n", "r", "p"],
        pocket: { roles: ["r", "n", "s", "f", "k"], captureToHand: false },
        promotion: { type: "regular", order: ["f"] },
    }),

    asean: variant({
        name: "asean", tooltip: "Makruk using the board/pieces from International Chess as well as pawn promotion rules.",
        startFen: "rnbqkbnr/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR w - - 0 1",
        icon: "♻",
        boardFamily: "standard8x8", pieceFamily: "asean",
        pieceRow: ["k", "q", "b", "n", "r", "p"],
        promotion: { type: "regular", order: ["r", "n", "b", "q"] },
        ui: { counting: "asean" },
    }),

    shogi: variant({
        name: "shogi", tooltip: _("Japanese Chess, the standard 9x9 version played today with drops and promotions."),
        startFen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1",
        icon: "K",
        boardFamily: "shogi9x9", pieceFamily: "shogi",
        notation: cg.Notation.SHOGI_ARBNUM,
        colors: { first: "Black", second: "White" },
        pieceRow: ["k", "g", "r", "b", "s", "n", "l", "p"],
        pocket: { roles: ["p", "l", "n", "s", "g", "b", "r"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "l", "n", "s", "r", "b"] },
        rules: { defaultTimeControl: "byoyomi", noDrawOffer: true },
        ui: { pieceSound: "shogi" },
        alternateStart: {
            '': '',
            'Lance HC': 'lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1',
            'Bishop HC': 'lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1',
            'Rook HC': 'lnsgkgsnl/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1',
            'Rook+Lance HC': 'lnsgkgsn1/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1',
            '2-Piece HC': 'lnsgkgsnl/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1',
            '4-Piece HC': '1nsgkgsn1/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1',
            '6-Piece HC': '2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1',
            '8-Piece HC': '3gkg3/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1',
            '9-Piece HC': '3gk4/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1',
            '10-Piece HC': '4k4/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b 0 1'
        },
    }),

    cannonshogi: variant({
        name: "cannonshogi", displayName: "cannon shogi", tooltip: _("Shogi with Chinese and Korean cannons"),
        startFen: "lnsgkgsnl/1rci1uab1/p1p1p1p1p/9/9/9/P1P1P1P1P/1BAU1ICR1/LNSGKGSNL[-] w 0 1",
        icon: "💣",
        boardFamily: "shogi9x9", pieceFamily: "cannonshogi",
        notation: cg.Notation.SHOGI_ARBNUM,
        colors: { first: "Black", second: "White" },
        pieceRow: ["k", "g", "r", "b", "s", "n", "l", "p", "u", "a", "c", "i"],
        pocket: { roles: ["p", "l", "n", "s", "g", "b", "r", "u", "a", "c", "i"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "l", "n", "s", "r", "b", "u", "a", "c", "i"] },
        rules: { defaultTimeControl: "byoyomi" },
        ui: { pieceSound: "shogi" },
    }),

    minishogi: variant({
        name: "minishogi", tooltip: "5x5 Shogi for more compact and faster games. There are no knights or lances.",
        startFen: "rbsgk/4p/5/P4/KGSBR[-] w 0 1",
        icon: "6",
        boardFamily: "shogi5x5", pieceFamily: "shogi",
        notation: cg.Notation.SHOGI_ARBNUM,
        colors: { first: "Black", second: "White" },
        pieceRow: ["k", "g", "r", "b", "s", "p"],
        pocket: { roles: ["p", "s", "g", "b", "r"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "s", "r", "b"] },
        rules: { defaultTimeControl: "byoyomi", noDrawOffer: true },
        ui: { pieceSound: "shogi" },
    }),

    kyotoshogi: variant({
        name: "kyotoshogi", displayName: "kyoto shogi", tooltip: "A wild Shogi variant on a 5x5 board where pieces flip into a different piece after each move.",
        startFen: "p+nks+l/5/5/5/+LSK+NP[-] w 0 1",
        icon: ")",
        boardFamily: "shogi5x5", pieceFamily: "kyoto",
        notation: cg.Notation.SHOGI_ARBNUM,
        colors: { first: "Black", second: "White" },
        pieceRow: ["k", "l", "s", "n", "p"],
        pocket: { roles: ["p", "l", "n", "s"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "l", "n", "s"] },
        rules: { defaultTimeControl: "byoyomi", noDrawOffer: true },
        ui: { pieceSound: "shogi" },
    }),

    dobutsu: variant({
        name: "dobutsu", tooltip: "3x4 game with cute animals, designed to teach children how to play Shogi.",
        startFen: "gle/1c1/1C1/ELG[-] w 0 1",
        icon: "8",
        boardFamily: "shogi3x4", pieceFamily: "dobutsu",
        notation: cg.Notation.SHOGI_ARBNUM,
        colors: { first: "Black", second: "White" },
        pieceRow: ["l", "g", "e", "c"],
        kingRoles: ["l"],
        pocket: { roles: ["e", "g", "c"], captureToHand: true },
        promotion: { type: "shogi", roles: ["c"] },
        rules: { defaultTimeControl: "byoyomi", noDrawOffer: true },
        ui: { pieceSound: "shogi" },
    }),

    gorogoro: variant({
        name: "gorogoro", tooltip: "5x6 Shogi designed to introduce tactics with the generals.",
        startFen: "sgkgs/5/1ppp1/1PPP1/5/SGKGS[-] w 0 1",
        icon: "🐱",
        boardFamily: "shogi5x6", pieceFamily: "shogi",
        notation: cg.Notation.SHOGI_ARBNUM,
        colors: { first: "Black", second: "White" },
        pieceRow: ["k", "g", "s", "p"],
        pocket: { roles: ["p", "s", "g"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "s"] },
        rules: { defaultTimeControl: "byoyomi", noDrawOffer: true },
        ui: { pieceSound: "shogi" },
    }),

    gorogoroplus: variant({
        name: "gorogoroplus", displayName: "gorogoro+", tooltip: "5x6 Shogi designed to introduce tactics with the generals.",
        startFen: "sgkgs/5/1ppp1/1PPP1/5/SGKGS[LNln] w 0 1",
        icon: "🐱",
        boardFamily: "shogi5x6", pieceFamily: "shogi",
        notation: cg.Notation.SHOGI_ARBNUM,
        colors: { first: "Black", second: "White" },
        pieceRow: ["k", "g", "s", "n", "l", "p"],
        pocket: { roles: ["p", "l", "n", "s", "g"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "s", "n", "l"] },
        rules: { defaultTimeControl: "byoyomi", noDrawOffer: true },
        ui: { pieceSound: "shogi" },
        alternateStart: {
            'Gorogoro Plus N+L': '',
            'Original (No N+L)': 'sgkgs/5/1ppp1/1PPP1/5/SGKGS[-] w 0 1'
        },
    }),

    torishogi: variant({
        name: "torishogi", displayName: "tori shogi", tooltip: "A confrontational 7x7 variant with unique pieces each named after different birds.",
        startFen: "rpckcpl/3f3/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[-] w 0 1",
        icon: "🐦",
        boardFamily: "shogi7x7", pieceFamily: "tori",
        notation: cg.Notation.SHOGI_ARBNUM,
        colors: { first: "Black", second: "White" },
        pieceRow: ["k", "c", "p", "l", "r", "f", "s"],
        pocket: { roles: ["s", "p", "l", "r", "c", "f"], captureToHand: true },
        promotion: { type: "shogi", roles: ["s", "f"] },
        rules: { defaultTimeControl: "byoyomi", noDrawOffer: true },
        ui: { pieceSound: "shogi" },
        alternateStart: {
            '': '',
            'Left Quail HC': 'rpckcp1/3f3/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[] b 0 1',
            'Falcon HC': 'rpckcpl/7/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[] b 0 1',
            'Falcon + Left Quail HC': 'rpckcp1/7/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[] b 0 1',
            'Falcon + Both Quails HC': '1pckcp1/7/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[] b 0 1',
        },
    }),

    xiangqi: variant({
        name: "xiangqi", tooltip: "Chinese Chess, one of the oldest and most played board games in the world.",
        startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1",
        icon: "|",
        boardFamily: "xiangqi9x10", pieceFamily: "xiangqi",
        notation: cg.Notation.XIANGQI_ARBNUM,
        colors: { first: "Red", second: "Black" },
        pieceRow: ["k", "a", "c", "r", "b", "n", "p"],
        promotion: { type: "regular", roles: [] },
    }),

    manchu: variant({
        name: "manchu", tooltip: "Xiangqi variant where one side has a chariot that can also move as a cannon or horse.",
        startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/9/9/M1BAKAB2 w - - 0 1",
        icon: "{",
        boardFamily: "xiangqi9x10", pieceFamily: "xiangqi",
        // XIANGQI_WXF can't handle Manchu banner piece!
        // so notation have to remain the default cg.Notation.ALGEBRAIC
        colors: { first: "Red", second: "Black" },
        pieceRow: { white: ["k", "a", "m", "b", "p"], black: ["k", "a", "c", "r", "b", "n", "p"] },
        promotion: { type: "regular", roles: [] },
    }),

    janggi: variant({
        name: "janggi", tooltip: "Korean Chess, similar to Xiangqi but plays much differently. Tournament rules are used.",
        startFen: "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1",
        icon: "=",
        boardFamily: "janggi9x10", pieceFamily: "janggi",
        notation: cg.Notation.JANGGI,
        colors: { first: "Blue", second: "Red" },
        pieceRow: ["k", "a", "c", "r", "b", "n", "p"],
        promotion: { type: "regular", roles: [] },
        rules: { defaultTimeControl: "byoyomi", pass: true, setup: true },
        ui: { materialPoint: "janggi" },
        alternateStart: {
            '': '',
            'Central Chariot Setup': 'bnra1arnb/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/BNRA1ARNB w - - 0 1',
        },
    }),

    minixiangqi: variant({
        name: "minixiangqi", tooltip: "Compact version of Xiangqi played on a 7x7 board without a river.",
        startFen: "rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR w - - 0 1",
        icon: "7",
        boardFamily: "xiangqi7x7", pieceFamily: "xiangqi",
        notation: cg.Notation.XIANGQI_ARBNUM,
        colors: { first: "Red", second: "Black" },
        pieceRow: ["k", "c", "r", "n", "p"],
        promotion: { type: "regular", roles: [] },
    }),

    capablanca: variant({
        name: "capablanca", tooltip: "Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a 10x8 board.",
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
        chess960: true, icon: "P", icon960: ",",
        boardFamily: "standard10x8", pieceFamily: "capa",
        pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"],
        rules: { enPassant: true },
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1',
            'Carrera': 'ranbqkbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RANBQKBNCR w KQkq - 0 1',
            'Conservative': 'arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1',
            'Schoolbook': 'rqnbakbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RQNBAKBNCR w KQkq - 0 1',
        },
    }),

    capahouse: variant({
        name: "capahouse", tooltip: "Capablanca with Crazyhouse drop rules.",
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR[] w KQkq - 0 1",
        chess960: true, icon: "&", icon960: "'",
        boardFamily: "standard10x8", pieceFamily: "capa",
        pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocket: { roles: ["p", "n", "b", "r", "a", "c", "q"], captureToHand: true },
        rules: { enPassant: true },
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR[] w KQkq - 0 1',
            'Carrera': 'ranbqkbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RANBQKBNCR[] w KQkq - 0 1',
            'Conservative': 'arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC[] w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR[] w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1',
            'Schoolbook': 'rqnbakbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RQNBAKBNCR[] w KQkq - 0 1',
        },
    }),

    dragon: variant({
        name: "dragon", displayName: "dragon chess", tooltip: "The dragon can be dropped to the base rank.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[Dd] w KQkq - 0 1",
        icon: "🐉",
        boardFamily: "standard8x8", pieceFamily: "dragon",
        pieceRow: ["k", "q", "d", "r", "b", "n", "p"],
        pocket: { roles: ["d"], captureToHand: false },
        promotion: { type: "regular", order: ["q", "d", "n", "r", "b"] },
        rules: { enPassant: true },
    }),

    seirawan: variant({
        name: "seirawan", displayName: "s-chess", tooltip: "Hybrid pieces, the hawk (B+N) and elephant (R+N), can enter the board after moving a back rank piece.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        icon: "L",  chess960: true, icon960: "}",
        boardFamily: "standard8x8", pieceFamily: "seirawan",
        pieceRow: ["k", "q", "e", "h", "r", "b", "n", "p"],
        pocket: { roles: ["h", "e"], captureToHand: false },
        rules: { enPassant: true, gate: true },
    }),

    shouse: variant({
        name: "shouse", displayName: "s-house", tooltip: "S-Chess with Crazyhouse drop rules.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        icon: "$",
        boardFamily: "standard8x8", pieceFamily: "seirawan",
        pieceRow: ["k", "q", "e", "h", "r", "b", "n", "p"],
        pocket: { roles: ["p", "n", "b", "r", "h", "e", "q"], captureToHand: true },
        rules: { enPassant: true, gate: true },
    }),

    grand: variant({
        name: "grand", tooltip: _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a grand 10x10 board."),
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1",
        icon: "(",
        boardFamily: "grand10x10", pieceFamily: "capa",
        pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"],
        rules: { enPassant: true },
    }),

    grandhouse: variant({
        name: "grandhouse", tooltip: "Grand Chess with Crazyhouse drop rules.",
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R[] w - - 0 1",
        icon: "*",
        boardFamily: "grand10x10", pieceFamily: "capa",
        pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocket: { roles: ["p", "n", "b", "r", "a", "c", "q"], captureToHand: true },
        rules: { enPassant: true },
    }),

    shako: variant({
        name: "shako", tooltip: "Introduces the cannon and elephant from Xiangqi into a 10x10 chess board.",
        startFen: "c8c/ernbqkbnre/pppppppppp/10/10/10/10/PPPPPPPPPP/ERNBQKBNRE/C8C w KQkq - 0 1",
        icon: "9",
        boardFamily: "standard10x10", pieceFamily: "shako",
        pieceRow: ["k", "q", "e", "c", "r", "b", "n", "p"],
        promotion: { type: "regular", order: ["q", "n", "c", "r", "e", "b"] },
        rules: { enPassant: true },
        alternateStart: {
            '': '',
            'Setup similar to Xiangqi': 'rnbeqkebnr/10/1c6c1/p1p1pp1p1p/10/10/P1P1PP1P1P/1C6C1/10/RNBEQKEBNR w - - 0 1',
        },
    }),

    shogun: variant({
        name: "shogun", tooltip: "Pieces promote and can be dropped, similar to Shogi.",
        startFen: "rnb+fkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB+FKBNR w KQkq - 0 1",
        icon: "-",
        boardFamily: "shogun8x8", pieceFamily: "shogun",
        pieceRow: ["k", "f", "r", "b", "n", "p"],
        pocket: { roles: ["p", "n", "b", "r", "f"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "f", "r", "b", "n"] },
        rules: {defaultTimeControl: "byoyomi", enPassant: true },
    }),

    hoppelpoppel: variant({
        name: "hoppelpoppel", displayName: "hoppel-poppel", tooltip: "Knights capture as bishops; bishops  capture as knights.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        icon: "`",
        boardFamily: "standard8x8", pieceFamily: "hoppel",
        pieceRow: ["k", "q", "r", "b", "n", "p"],
        rules: { enPassant: true },
    }),

    orda: variant({
        name: "orda", tooltip: "Asymmetric variant where one army has pieces that move like knights but capture differently.",
        startFen: "lhaykahl/8/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",
        icon: "R",
        boardFamily: "standard8x8", pieceFamily: "orda",
        colors: { first: "White", second: "Gold" },
        pieceRow: { white: ["k", "q", "r", "b", "n", "p", "h"], black: ["k", "y", "l", "a", "h", "p", "q"] },
        promotion: { type: "regular", order: ["q", "h"] },
        rules: { enPassant: true },
        ui: { boardMark: 'campmate' },
    }),

    khans: variant({
        name: "khans", tooltip: "Orda Chess variant. The scout and khatun replaces the pawn and yurt.",
        startFen: "lhatkahl/ssssssss/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",
        icon: "🐎",
        boardFamily: "standard8x8", pieceFamily: "khans",
        colors: { first: "White", second: "Gold" },
        pieceRow: { black: ["k", "t", "l", "a", "h", "s"], white: ["k", "q", "r", "b", "n", "p"] },
        promotion: { type: "regular" },
        rules: { enPassant: true },
        ui: { boardMark: 'campmate' },
    }),

    synochess: variant({
        name: "synochess", tooltip: "Asymmetric East vs. West variant which pits the western Chess army against a Xiangqi and Janggi-styled army.",
        startFen: "rneakenr/8/1c4c1/1ss2ss1/8/8/PPPPPPPP/RNBQKBNR[ss] w KQ - 0 1",
        icon: "_",
        boardFamily: "standard8x8", pieceFamily: "synochess",
        colors: { first: "White", second: "Red" },
        pieceRow: { white: ["k", "q", "r", "b", "n", "p"], black: ["k", "a", "c", "r", "e", "n", "s"] },
        pocket: { roles: { white: [], black: ["s"] }, captureToHand: false },
        ui: { boardMark: 'campmate' },
    }),

    shinobi: variant({
        name: "shinobi", tooltip: "Asymmetric variant which pits the western Chess army against a drop-based, Shogi-styled army.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/LH1CK1HL[LHMMDJ] w kq - 0 1",
        icon: "🐢",
        boardFamily: "standard8x8", pieceFamily: "shinobi",
        colors: { first: "Pink", second: "Black" },
        pieceRow: { white: ["k", "d", "j", "c", "l", "h", "m", "p"], black: ["k", "q", "r", "b", "n", "p"] },
        pocket: { roles: { white: ["l", "h", "m", "d", "j"], black: [] }, captureToHand: false },
        promotion: { type: "shogi", roles: ["p", "l", "h", "m"] },
        rules: { enPassant: true },
        ui: { boardMark: 'campmate' },
        material: {
            equivalences: {
                'pl-piece': 'r-piece',
                'ph-piece': 'n-piece',
                'pm-piece': 'b-piece',
                'pp-piece': 'c-piece',
            },
        },
    }),

    shinobiplus: variant({
        name: "shinobiplus", displayName: "shinobi+", tooltip: "Asymmetric variant which pits the western Chess army against a drop-based, Shogi-styled army.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/4K3[JDFCLHM] w kq - 0 1",
        icon: "🐢",
        boardFamily: "standard8x8", pieceFamily: "shinobi",
        colors: { first: "Pink", second: "Black" },
        pieceRow: { white: ["k", "f", "d", "j", "l", "h", "m", "p"], black: ["k", "q", "r", "b", "n", "p"] },
        pocket: { roles: { white: ["l", "h", "m", "d", "j", "f", "c"], black: [] }, captureToHand: false },
        promotion: { type: "shogi", roles: ["p", "l", "h", "m"] },
        rules: { enPassant: true },
        ui: { boardMark: 'campmate' },
        material: {
            equivalences: {
                'pl-piece': 'r-piece',
                'ph-piece': 'n-piece',
                'pm-piece': 'b-piece',
                'pp-piece': 'c-piece',
            },
        },
        alternateStart: {
            '': '',
            'Original Shinobi': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/LH1CK1HL[LHMMDJ] w kq - 0 1'
        },
    }),

    empire: variant({
        name: "empire", tooltip: "Asymmetric variant where one army has pieces that move like queens but capture as usual.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/PPPSSPPP/8/TECDKCET w kq - 0 1",
        icon: "♚",
        boardFamily: "standard8x8", pieceFamily: "empire",
        colors: { first: "Gold", second: "Black" },
        pieceRow: { white: ["k", "d", "t", "c", "e", "p", "s", "q"], black: ["k", "q", "r", "b", "n", "p"] },
        rules: { enPassant: true },
        ui: { boardMark: 'campmate' },
    }),

    ordamirror: variant({
        name: "ordamirror", displayName: "orda mirror", tooltip: "Orda Chess variant with two Horde armies. The Falcon replaces the Yurt.",
        startFen: "lhafkahl/8/pppppppp/8/8/PPPPPPPP/8/LHAFKAHL w - - 0 1",
        icon: "◩",
        boardFamily: "standard8x8", pieceFamily: "ordamirror",
        colors: { first: "White", second: "Gold" },
        pieceRow: ["k", "f", "l", "a", "h", "p"],
        promotion: { type: "regular", order: ["h", "l", "f", "a"] },
        ui: { boardMark: 'campmate' },
    }),

    chak: variant({
        name: "chak", tooltip: "Mayan chess. Inspired by cultural elements of Mesoamerica.",
        startFen: "rvsqkjsvr/4o4/p1p1p1p1p/9/9/9/P1P1P1P1P/4O4/RVSJKQSVR w - - 0 1",
        icon: "🐬",
        boardFamily: "chak9x9", pieceFamily: "chak",
        colors: { first: "White", second: "Green" },
        pieceRow: ["k", "j", "q", "r", "v", "s", "o", "p"],
        kingRoles: ["k", "+k"],
        promotion: { type: "shogi", roles: ["p", "k"],
            strict: {
                isPromoted: (piece: cg.Piece, pos: cg.Pos) => {
                    switch (piece.role) {
                        case 'p-piece':
                        case 'pp-piece':
                        case 'k-piece':
                        case 'pk-piece':
                            return (piece.color === 'white' && pos[1] >= 4) || (piece.color === 'black' && pos[1] <= 4);
                        default:
                            return false;
                    }
                }
            }
        },
        material: {
            equivalences: {
                'pk-piece': 'k-piece',
            },
        },
    }),

    chennis: variant({
        name: "chennis", tooltip: "Pieces alternate between two forms with each move.",
        startFen: "1fkm3/1p1s3/7/7/7/3S1P1/3MKF1[] w - 0 1",
        icon: "🎾",
        boardFamily: "chennis7x7", pieceFamily: "chennis",
        pieceRow: ["k", "p", "m", "s", "f"],
        pocket: { roles: ["p", "m", "s", "f"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "m", "s", "f"] },
    }),

    spartan: variant({
        name: "spartan", tooltip: "Asymmetric Spartans vs. Persians variant.",
        startFen: "lgkcckwl/hhhhhhhh/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",
        icon: "⍺",
        boardFamily: "standard8x8", pieceFamily: "spartan",
        pieceRow: { white: ["k", "q", "r", "b", "n", "p"], black: ["k", "g", "w", "l", "c", "h"] },
    }),

    mansindam: variant({
        name: "mansindam", tooltip: "A variant that combines the Shogi's drop rule with strong pieces.",
        startFen: "rnbakqcnm/9/ppppppppp/9/9/9/PPPPPPPPP/9/MNCQKABNR[] w - - 0 1",
        icon: "⛵",
        boardFamily: "standard9x9", pieceFamily: "mansindam",
        pieceRow: ["k", "r", "n", "b", "a", "q", "c", "m", "p"],
        pocket: { roles: ["p", "n", "b", "r", "a", "q", "c", "m"], captureToHand: true },
        promotion: { type: "shogi", roles: ["n", "b", "r", "c", "m", "p"] },
    }),

    // We support the functionality to import/store/analyze some variants
    // but don't want to add them to leaderboard page
    embassy: variant({
        name: "embassy", tooltip: "Like Capablanca Chess but with Grand starting setup.",
        startFen: "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1",
        icon: "P",
        boardFamily: "standard10x8", pieceFamily: "capa",
        pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"],
        rules: { enPassant: true },
    }),

    embassyhouse: variant({
        name: "embassyhouse", tooltip: "Embassy with Crazyhouse drop rules.",
        startFen: "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR[] w KQkq - 0 1",
        icon: "&",
        boardFamily: "standard10x8", pieceFamily: "capa",
        pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocket: { roles: ["p", "n", "b", "r", "a", "c", "q"], captureToHand: true },
        rules: { enPassant: true },
    }),

    gothic: variant({
        name: "gothic", tooltip: "Like Capablanca Chess but with a different starting setup.",
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1",
        icon: "P",
        boardFamily: "standard10x8", pieceFamily: "capa",
        pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"],
        rules: { enPassant: true },
    }),

    gothhouse: variant({
        name: "gothhouse", tooltip: "Gothic with Crazyhouse drop rules.",
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1",
        icon: "&",
        boardFamily: "standard10x8", pieceFamily: "capa",
        pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocket: { roles: ["p", "n", "b", "r", "a", "c", "q"], captureToHand: true },
        rules: { enPassant: true },
    }),
};

export const variants = Object.keys(VARIANTS);
const disabledVariants = [ "gothic", "gothhouse", "embassy", "embassyhouse", "gorogoro" ];
export const enabledVariants = variants.filter(v => !disabledVariants.includes(v));

// variants having 0 puzzle so far
export const noPuzzleVariants = [
    "ataxx",
    "3check",
    "placement",
    "minishogi",
    "gorogoroplus",
    "manchu",
    "grandhouse",
    "shinobi",
    "shinobiplus",
    "cannonshogi",
]

export const variantGroups: { [ key: string ]: { variants: string[] } } = {
    standard: { variants: [ "chess", "crazyhouse", "atomic", "kingofthehill", "3check", "placement", "duck" ] },
    sea:      { variants: [ "makruk", "makpong", "cambodian", "sittuyin", "asean" ] },
    shogi:    { variants: [ "shogi", "minishogi", "kyotoshogi", "dobutsu", "gorogoroplus", "torishogi", "cannonshogi" ] },
    xiangqi:  { variants: [ "xiangqi", "manchu", "janggi", "minixiangqi" ] },
    fairy:    { variants: [ "capablanca", "capahouse", "dragon", "seirawan", "shouse", "grand", "grandhouse", "shako", "shogun", "hoppelpoppel", "mansindam" ] },
    army:     { variants: [ "orda", "khans", "synochess", "shinobiplus", "empire", "ordamirror", "chak", "chennis", "spartan" ] },
    other:    { variants: [ "ataxx" ] }
};

function variantGroupLabel(group: string): string {
    const groups: {[index: string]: string} = {
        standard: _("Chess Variants"),
        sea: _("Makruk Variants"),
        shogi: _("Shogi Variants"),
        xiangqi: _("Xiangqi Variants"),
        fairy: _("Fairy Piece Variants"),
        army: _("New Army Variants"),
        other: _("Other"),
    }
    return groups[group];
}

export function selectVariant(id: string, selected: string, onChange: EventListener, hookInsert: InsertHook, disableds: string[] = []): VNode {
    return h('select#' + id, {
        props: { name: id },
        on: { change: onChange },
        hook: { insert: hookInsert },
    },
        Object.keys(variantGroups).map(g => {
            const group = variantGroups[g];
            return h('optgroup', { props: { label: variantGroupLabel(g) } }, group.variants.map(v => {
                const variant = VARIANTS[v];
                return h('option', {
                    props: { value: v, title: variant.tooltip },
                    attrs: { selected: v === selected, disabled: disableds.includes(variant.name) },
                }, variant.displayName(false));
            }));
        }),
    );
}

// Some variants need to be treated differently according to the FEN.
// Refer to server/fairy.py for more information
export function moddedVariant(variantName: string, chess960: boolean, pieces: cg.Pieces, castling: string): string {
    if (!chess960 && ["capablanca", "capahouse"].includes(variantName)) {
        const whiteKing = pieces.get('e1');
        const blackKing = pieces.get('e8');
        if (castling !== '-' &&
            ((!castling.includes('K') && !castling.includes('Q')) || (whiteKing && util.samePiece(whiteKing, { role: 'k-piece', color: 'white' }))) &&
            ((!castling.includes('k') && !castling.includes('q')) || (blackKing && util.samePiece(blackKing, { role: 'k-piece', color: 'black' }))))
            return variantName.includes("house") ? "embassyhouse" : "embassy";
    }
    return variantName;
}
