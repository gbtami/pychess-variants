import { h, VNode, InsertHook } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { read } from 'chessgroundx/fen';

import { _ } from './i18n';

import { Equivalence, MaterialDiff, calculateDiff } from './material'

export const ranksUCI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
export type UCIRank = typeof ranksUCI[number];
export type UCIKey =  'a0' | `${cg.File}${UCIRank}`;
export type UCIOrig = UCIKey | cg.DropOrig;
export type PromotionSuffix = cg.Letter | "+" | "-" | "";

export type UCIMove = `${UCIOrig}${UCIKey}`; // TODO: this is missing suffix for promotion which is also part of the move
export type CGMove = `${cg.Orig}${cg.Key}`; // TODO: this is missing suffix for promotion which is also part of the move

export type ColorName = "White" | "Black" | "Red" | "Blue" | "Gold" | "Pink" | "Green";
export type PromotionType = "regular" | "shogi";
export type TimeControlType = "incremental" | "byoyomi";
export type CountingType = "makruk" | "asean";
export type MaterialPointType = "janggi";
export type BoardMarkType = "campmate";
export type PieceSoundType = "regular" | "atomic" | "shogi";

export interface BoardFamily {
    readonly dimensions: cg.BoardDimensions;
    readonly cg: string;
    readonly boardCSS: string[];
}

export interface PieceFamily {
    readonly pieceCSS: string[];
}

export const BOARD_FAMILIES: { [key: string]: BoardFamily } = {
    standard8x8: { dimensions: { width: 8, height: 8 }, cg: "cg-512", boardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg", "8x8santa.png", "8x8wood2.jpg", "8x8wood4.jpg", "8x8ic.svg", "8x8purple.svg"] },
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
    janggi9x10: { dimensions: { width: 9, height: 10 }, cg: "cg-576-640", boardCSS: ["JanggiBrown.svg", "JanggiPaper.png", "JanggiWood.png", "JanggiDark.svg", "JanggiWoodDark.svg", "JanggiStone.svg"] },
    shogun8x8: { dimensions: { width: 8, height: 8 }, cg: "cg-512", boardCSS: ["ShogunPlain.svg", "ShogunMaple.png", "ShogunMaple2.png", "ShogunBlue.svg", "8x8brown.svg", "8x8maple.jpg"] },
    chak9x9:{ dimensions: { width: 9, height: 9 }, cg: "cg-540", boardCSS: ["StandardChakBoard.svg", "ColoredChakBoard.svg", "ChakArt.jpg"] },
    chennis7x7:{ dimensions: { width: 7, height: 7 }, cg: "cg-448", boardCSS: ["WimbledonBoard.svg", "FrenchOpenBoard.svg", "USOpenBoard.svg"] },
};

export const PIECE_FAMILIES: { [key: string]: PieceFamily } = {
    standard: { pieceCSS: ["standard", "green", "alpha", "chess_kaneo", "santa", "maestro", "dubrovny", "disguised", "atopdown"] },
    capa: { pieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4", "capa5", "disguised"] },
    seirawan: { pieceCSS: ["seir1", "seir0", "seir2", "seir3", "seir4", "seir5", "disguised"] },
    makruk: { pieceCSS: ["makrukwb", "makrukwr", "makruk", "makruks", "makruki", "disguised"] },
    sittuyin: { pieceCSS: ["sittuyins", "sittuyinkagr", "sittuyinkabr", "sittuyinm", "sittuyini", "disguised"] },
    asean: { pieceCSS: ["aseani", "aseanm", "aseanc", "aseans", "disguised"] },
    shogi: { pieceCSS: ["shogik", "shogi", "shogiw", "shogip", "shogim", "shogip3d", "shogikw3d", "shogid", "shogiim", "shogibw", "portk", "porti", "disguised"] },
    kyoto: { pieceCSS: ["kyoto", "kyotok", "kyotoks", "kyotoi", "kyotod", "disguised"] },
    dobutsu: { pieceCSS: ["dobutsu", "disguised"] },
    tori: { pieceCSS: ["torii", "torik", "torim", "porti", "disguised"] },
    xiangqi: { pieceCSS: ["xiangqi2d", "xiangqi2di", "xiangqi", "xiangqict3", "xiangqihnz", "xiangqict2", "xiangqihnzw", "xiangqict2w", "xiangqiwikim", "xiangqiKa", "xiangqittxqhnz", "xiangqittxqintl", "disguised"] },
    janggi: { pieceCSS: ["janggihb", "janggihg", "janggiikak", "janggiikaw", "janggikak", "janggikaw", "janggiib", "janggiig", "disguised"] },
    shako: { pieceCSS: ["shako0", "shako1", "shako2", "disguised"] },
    shogun: { pieceCSS: ["shogun0", "shogun1", "shogun2", "shogun3", "shogun4", "shogun5", "disguised"] },
    orda: { pieceCSS: ["orda0", "orda1", "disguised"] },
    synochess: { pieceCSS: ["synochess0", "synochess1", "synochess2", "synochess3", "synochess4", "synochess5", "disguised"] },
    hoppel: { pieceCSS: ["hoppel0", "hoppel1", "hoppel2", "disguised"] },
    shinobi: { pieceCSS: ["shinobi0", "shinobi1", "disguised"] },
    empire: { pieceCSS: ["empire0", "empire1", "disguised"] },
    ordamirror: { pieceCSS: ["ordamirror0", "ordamirror1", "disguised"] },
    chak: { pieceCSS: ["chak0", "disguised"] },
    chennis: { pieceCSS: ["chennis0", "chennis1", "chennis2", "disguised"] },
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
    readonly pieceFamily: keyof typeof PIECE_FAMILIES;
    readonly piece: PieceFamily;
    readonly colors: {
        readonly first: ColorName;
        readonly second: ColorName;
    }
    readonly roles: {
        readonly pieceRow: Record<cg.Color, cg.Role[]>;
        readonly kings: cg.Role[];
    };
    readonly pocket?: {
        readonly roles: Record<cg.Color, cg.Role[]> | undefined;
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
        piece: PIECE_FAMILIES[config.pieceFamily],
        colors: config.colors ?? { first: 'White', second: 'Black' },
        roles: {
            pieceRow: Array.isArray(config.roles.pieceRow) ? {
                white: config.roles.pieceRow.map(util.roleOf),
                black: config.roles.pieceRow.map(util.roleOf),
            } : {
                white: config.roles.pieceRow.white.map(util.roleOf),
                black: config.roles.pieceRow.black.map(util.roleOf),
            },
            kings: (config.roles.kings ?? ['k']).map(util.roleOf),
        },
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
    // Whether it is possible to play a randomized starting positon (default: false)
    chess960?: boolean;
    // Icon letter in the site's font
    icon: string;
    // Icon of the 960 version (default: same as icon)
    icon960?: string;
    // Board appearance
    boardFamily: keyof typeof BOARD_FAMILIES;
    // Piece appearance
    pieceFamily: keyof typeof PIECE_FAMILIES;
    // Color names of each side for accurate color representation
    colors?: {             
        // (default: White)
        first: ColorName;
        // (default: Black)
        second: ColorName;
    }
    roles: {
        // Pieces on the editor's piece row
        // Use the record version if the pieces of each side are different
        pieceRow: cg.Letter[] | Record<cg.Color, cg.Letter[]>;
        // Pieces considered king for check marking (default: ['k'])
        kings?: cg.Letter[];
    };
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

export const VARIANTS: { [name: string]: Variant } = {
    chess: variant({
        name: "chess", tooltip: "Chess, unmodified, as it's played by FIDE standards.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        chess960: true, icon: "M", icon960: "V",
        boardFamily: "standard8x8", pieceFamily: "standard",
        roles: { pieceRow: ["k", "q", "r", "b", "n", "p"] },
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
        roles: { pieceRow: ["k", "q", "r", "b", "n", "p"] },
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
        roles: { pieceRow: ["k", "q", "r", "b", "n", "p"] },
        pocket: { roles: ["n", "b", "r", "q", "k"], captureToHand: false },
        rules: { enPassant: true },
    }),

    atomic: variant({
        name: "atomic", tooltip: "Pieces explode upon capture.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        chess960: true, icon: "~", icon960: "\\",
        boardFamily: "standard8x8", pieceFamily: "standard",
        roles: { pieceRow: ["k", "q", "r", "b", "n", "p"] },
        rules: { enPassant: true },
        ui: { pieceSound: "atomic" },
    }),

    duck: variant({
        name: "duck", tooltip: "The duck must be moved to a new square after every turn.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        icon: "🦆",
        boardFamily: "standard8x8", pieceFamily: "standard",
        roles: { pieceRow: { white: ["k", "q", "r", "b", "n", "p", "*"], black: ["k", "q", "r", "b", "n", "p"] } },
        rules: { enPassant: true, duck: true },
    }),

    makruk: variant({
        name: "makruk", tooltip: "Thai Chess. A game closely resembling the original Chaturanga. Similar to Chess but with a different queen and bishop.",
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        icon: "Q",
        boardFamily: "makruk8x8", pieceFamily: "makruk",
        roles: { pieceRow: ["k", "s", "m", "n", "r", "p", "m~" as cg.Letter] },
        promotion: { type: "regular", order: ["m"] },
        ui: { counting: "makruk", showPromoted: true },
    }),

    makpong: variant({
        name: "makpong", tooltip: _("Makruk variant where kings cannot move to escape out of check."),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        icon: "O",
        boardFamily: "makruk8x8", pieceFamily: "makruk",
        roles: { pieceRow: ["k", "s", "m", "n", "r", "p", "m~" as cg.Letter] },
        promotion: { type: "regular", order: ["m"] },
        ui: { counting: "makruk", showPromoted: true },
    }),

    cambodian: variant({
        name: "cambodian", displayName: "ouk chaktrang", tooltip: "Cambodian Chess. Makruk with a few additional opening abilities.",
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w DEde - 0 1",
        icon: "!",
        boardFamily: "makruk8x8", pieceFamily: "makruk",
        roles: { pieceRow: ["k", "s", "m", "n", "r", "p", "m~" as cg.Letter] },
        promotion: { type: "regular", order: ["m"] },
        ui: { counting: "makruk", showPromoted: true },
    }),

    sittuyin: variant({
        name: "sittuyin", tooltip: "Burmese Chess. Similar to Makruk, but pieces are placed at the start of the match.",
        startFen: "8/8/4pppp/pppp4/4PPPP/PPPP4/8/8[KFRRSSNNkfrrssnn] w - - 0 1",
        icon: ":",
        boardFamily: "sittuyin8x8", pieceFamily: "sittuyin",
        colors: { first: "Red", second: "Black" },
        roles: { pieceRow: ["k", "f", "s", "n", "r", "p"] },
        pocket: { roles: ["r", "n", "s", "f", "k"], captureToHand: false },
        promotion: { type: "regular", order: ["f"] },
    }),

    asean: variant({
        name: "asean", tooltip: "Makruk using the board/pieces from International Chess as well as pawn promotion rules.",
        startFen: "rnbqkbnr/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR w - - 0 1",
        icon: "♻",
        boardFamily: "standard8x8", pieceFamily: "asean",
        roles: { pieceRow: ["k", "q", "b", "n", "r", "p"] },
        promotion: { type: "regular", order: ["r", "n", "b", "q"] },
        ui: { counting: "asean" },
    }),

    shogi: variant({
        name: "shogi", tooltip: _("Japanese Chess, and the standard 9x9 version played today with drops and promotions. "),
        startFen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1",
        icon: "K",
        boardFamily: "shogi9x9", pieceFamily: "shogi",
        colors: { first: "Black", second: "White" },
        roles: { pieceRow: ["k", "g", "r", "b", "s", "n", "l", "p"] },
        pocket: { roles: ["p", "l", "n", "s", "g", "b", "r"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "l", "n", "s", "r", "b"] },
        rules: { defaultTimeControl: "byoyomi" },
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

    minishogi: variant({
        name: "minishogi", tooltip: "5x5 Shogi for more compact and faster games. There are no knights or lances.",
        startFen: "rbsgk/4p/5/P4/KGSBR[-] w 0 1",
        icon: "6",
        boardFamily: "shogi5x5", pieceFamily: "shogi",
        colors: { first: "Black", second: "White" },
        roles: { pieceRow: ["k", "g", "r", "b", "s", "p"] },
        pocket: { roles: ["p", "s", "g", "b", "r"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "s", "r", "b"] },
        rules: { defaultTimeControl: "byoyomi" },
        ui: { pieceSound: "shogi" },
    }),

    kyotoshogi: variant({
        name: "kyotoshogi", displayName: "kyoto shogi", tooltip: "A wild Shogi variant on a 5x5 board where pieces flip into a different piece after each move.",
        startFen: "p+nks+l/5/5/5/+LSK+NP[-] w 0 1",
        icon: ")",
        boardFamily: "shogi5x5", pieceFamily: "kyoto",
        colors: { first: "Black", second: "White" },
        roles: { pieceRow: ["k", "l", "s", "n", "p"] },
        pocket: { roles: ["p", "l", "n", "s"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "l", "n", "s"] },
        rules: { defaultTimeControl: "byoyomi" },
        ui: { pieceSound: "shogi" },
    }),

    dobutsu: variant({
        name: "dobutsu", tooltip: _("3x4 game with cute animals, designed to teach children how to play Shogi."),
        startFen: "gle/1c1/1C1/ELG[-] w 0 1",
        icon: "8",
        boardFamily: "shogi3x4", pieceFamily: "dobutsu",
        colors: { first: "Black", second: "White" },
        roles: { pieceRow: ["l", "g", "e", "c"], kings: ["l"] },
        pocket: { roles: ["e", "g", "c"], captureToHand: true },
        promotion: { type: "shogi", roles: ["c"] },
        rules: { defaultTimeControl: "byoyomi" },
        ui: { pieceSound: "shogi" },
    }),

    gorogoro: variant({
        name: "gorogoro", tooltip: "5x6 Shogi designed to introduce tactics with the generals.",
        startFen: "sgkgs/5/1ppp1/1PPP1/5/SGKGS[-] w 0 1",
        icon: "🐱",
        boardFamily: "shogi5x6", pieceFamily: "shogi",
        colors: { first: "Black", second: "White" },
        roles: { pieceRow: ["k", "g", "s", "p"] },
        pocket: { roles: ["p", "s", "g"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "s"] },
        rules: { defaultTimeControl: "byoyomi" },
        ui: { pieceSound: "shogi" },
    }),

    gorogoroplus: variant({
        name: "gorogoroplus", displayName: "gorogoro+", tooltip: "5x6 Shogi designed to introduce tactics with the generals.",
        startFen: "sgkgs/5/1ppp1/1PPP1/5/SGKGS[LNln] w 0 1",
        icon: "🐱",
        boardFamily: "shogi5x6", pieceFamily: "shogi",
        colors: { first: "Black", second: "White" },
        roles: { pieceRow: ["k", "g", "s", "n", "l", "p"] },
        pocket: { roles: ["p", "l", "n", "s", "g"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "s", "n", "l"] },
        rules: { defaultTimeControl: "byoyomi" },
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
        colors: { first: "Black", second: "White" },
        roles: { pieceRow: ["k", "c", "p", "l", "r", "f", "s"] },
        pocket: { roles: ["s", "p", "l", "r", "c", "f"], captureToHand: true },
        promotion: { type: "shogi", roles: ["s", "f"] },
        rules: { defaultTimeControl: "byoyomi" },
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
        colors: { first: "Red", second: "Black" },
        roles:{ pieceRow: ["k", "a", "c", "r", "b", "n", "p"] },
        promotion: { type: "regular", roles: [] },
    }),

    manchu: variant({
        name: "manchu", tooltip: "Xiangqi variant where one side has a chariot that can also move as a cannon or horse.",
        startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/9/9/M1BAKAB2 w - - 0 1",
        icon: "{",
        boardFamily: "xiangqi9x10", pieceFamily: "xiangqi",
        colors: { first: "Red", second: "Black" },
        roles: { pieceRow: { white: ["k", "a", "m", "b", "p"], black: ["k", "a", "c", "r", "b", "n", "p"] } },
        promotion: { type: "regular", roles: [] },
    }),

    janggi: variant({
        name: "janggi", tooltip: "Korean Chess, similar to Xiangqi but plays much differently. Tournament rules are used.",
        startFen: "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1",
        icon: "=",
        boardFamily: "janggi9x10", pieceFamily: "janggi",
        colors: { first: "Blue", second: "Red" },
        roles: { pieceRow: ["k", "a", "c", "r", "b", "n", "p"] },
        promotion: { type: "regular", roles: [] },
        rules: { defaultTimeControl: "byoyomi", pass: true, setup: true },
        ui: { materialPoint: "janggi" },
    }),

    minixiangqi: variant({
        name: "minixiangqi", tooltip: "Compact version of Xiangqi played on a 7x7 board without a river.",
        startFen: "rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR w - - 0 1",
        icon: "7",
        boardFamily: "xiangqi7x7", pieceFamily: "xiangqi",
        colors: { first: "Red", second: "Black" },
        roles: { pieceRow: ["k", "c", "r", "n", "p"] },
        promotion: { type: "regular", roles: [] },
    }),

    capablanca: variant({
        name: "capablanca", tooltip: "Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a 10x8 board.",
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
        chess960: true, icon: "P", icon960: ",",
        boardFamily: "standard10x8", pieceFamily: "capa",
        roles: { pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"] },
        rules: { enPassant: true },
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1',
            'Carrera': 'rcnbqkbnar/pppppppppp/10/10/10/10/PPPPPPPPPP/RCNBQKBNAR w KQkq - 0 1',
            'Conservative': 'arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1',
            'Schoolbook': 'rqnbakbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RQNBAKBNCR w KQkq - 0 1',
        },
    }),

    capahouse: variant({
        name: "capahouse", tooltip: _("Capablanca with Crazyhouse drop rules."),
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR[] w KQkq - 0 1",
        chess960: true, icon: "&", icon960: "'",
        boardFamily: "standard10x8", pieceFamily: "capa",
        roles: { pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"] },
        pocket: { roles: ["p", "n", "b", "r", "a", "c", "q"], captureToHand: true },
        rules: { enPassant: true },
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR[] w KQkq - 0 1',
            'Carrera': 'rcnbqkbnar/pppppppppp/10/10/10/10/PPPPPPPPPP/RCNBQKBNAR[] w KQkq - 0 1',
            'Conservative': 'arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC[] w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR[] w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1',
            'Schoolbook': 'rqnbakbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RQNBAKBNCR[] w KQkq - 0 1',
        },
    }),

    seirawan: variant({
        name: "seirawan", displayName: "s-chess", tooltip: "Hybrid pieces, the hawk (B+N) and elephant (R+N), can enter the board after moving a back rank piece.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        icon: "L",  chess960: true, icon960: "}",
        boardFamily: "standard8x8", pieceFamily: "seirawan",
        roles: { pieceRow: ["k", "q", "e", "h", "r", "b", "n", "p"] },
        pocket: { roles: ["h", "e"], captureToHand: false },
        rules: { enPassant: true, gate: true },
    }),

    shouse: variant({
        name: "shouse", displayName: "s-house", tooltip: "S-Chess with Crazyhouse drop rules.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        icon: "$",
        boardFamily: "standard8x8", pieceFamily: "seirawan",
        roles: { pieceRow: ["k", "q", "e", "h", "r", "b", "n", "p"] },
        pocket: { roles: ["p", "n", "b", "r", "h", "e", "q"], captureToHand: true },
        rules: { enPassant: true, gate: true },
    }),

    grand: variant({
        name: "grand", tooltip: _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a grand 10x10 board."),
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1",
        icon: "(",
        boardFamily: "grand10x10", pieceFamily: "capa",
        roles: { pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"] },
        rules: { enPassant: true },
    }),

    grandhouse: variant({
        name: "grandhouse", tooltip: "Grand Chess with Crazyhouse drop rules.",
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R[] w - - 0 1",
        icon: "*",
        boardFamily: "grand10x10", pieceFamily: "capa",
        roles: { pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"] },
        pocket: { roles: ["p", "n", "b", "r", "a", "c", "q"], captureToHand: true },
        rules: { enPassant: true },
    }),

    shako: variant({
        name: "shako", tooltip: "Introduces the cannon and elephant from Xiangqi into a 10x10 chess board.",
        startFen: "c8c/ernbqkbnre/pppppppppp/10/10/10/10/PPPPPPPPPP/ERNBQKBNRE/C8C w KQkq - 0 1",
        icon: "9",
        boardFamily: "standard10x10", pieceFamily: "shako",
        roles: { pieceRow: ["k", "q", "e", "c", "r", "b", "n", "p"] },
        promotion: { type: "regular", order: ["q", "n", "c", "r", "e", "b"] },
        rules: { enPassant: true },
    }),

    shogun: variant({
        name: "shogun", tooltip: "Pieces promote and can be dropped, similar to Shogi.",
        startFen: "rnb+fkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB+FKBNR w KQkq - 0 1",
        icon: "-",
        boardFamily: "shogun8x8", pieceFamily: "shogun",
        roles: { pieceRow: ["k", "f", "r", "b", "n", "p"] },
        pocket: { roles: ["p", "n", "b", "r", "f"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "f", "r", "b", "n"] },
        rules: {defaultTimeControl: "byoyomi", enPassant: true },
    }),

    hoppelpoppel: variant({
        name: "hoppelpoppel", displayName: "hoppel-poppel", tooltip: "Knights capture as bishops; bishops  capture as knights.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        icon: "`",
        boardFamily: "standard8x8", pieceFamily: "hoppel",
        roles: { pieceRow: ["k", "q", "r", "b", "n", "p"] },
        rules: { enPassant: true },
    }),

    orda: variant({
        name: "orda", tooltip: "Asymmetric variant where one army has pieces that move like knights but capture differently.",
        startFen: "lhaykahl/8/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",
        icon: "R",
        boardFamily: "standard8x8", pieceFamily: "orda",
        colors: { first: "White", second: "Gold" },
        roles: { pieceRow: { white: ["k", "q", "r", "b", "n", "p", "h"], black: ["k", "y", "l", "a", "h", "p", "q"] } },
        promotion: { type: "regular", order: ["q", "h"] },
        rules: { enPassant: true },
        ui: { boardMark: 'campmate' },
    }),

    synochess: variant({
        name: "synochess", tooltip: _("Asymmetric East vs. West variant which pits the western Chess army against a Xiangqi and Janggi-styled army."),
        startFen: "rneakenr/8/1c4c1/1ss2ss1/8/8/PPPPPPPP/RNBQKBNR[ss] w KQ - 0 1",
        icon: "_",
        boardFamily: "standard8x8", pieceFamily: "synochess",
        colors: { first: "White", second: "Red" },
        roles: { pieceRow: { white: ["k", "q", "r", "b", "n", "p"], black: ["k", "a", "c", "r", "e", "n", "s"] } },
        pocket: { roles: { white: [], black: ["s"] }, captureToHand: false },
        ui: { boardMark: 'campmate' },
    }),

    shinobi: variant({
        name: "shinobi", tooltip: "Asymmetric variant which pits the western Chess army against a drop-based, Shogi-styled army.",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/LH1CK1HL[LHMMDJ] w kq - 0 1",
        icon: "🐢",
        boardFamily: "standard8x8", pieceFamily: "shinobi",
        colors: { first: "Pink", second: "Black" },
        roles: { pieceRow: { white: ["k", "d", "j", "c", "l", "h", "m", "p"], black: ["k", "q", "r", "b", "n", "p"] } },
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

    empire: variant({
        name: "empire", tooltip: _("Asymmetric variant where one army has pieces that move like queens but capture as usual."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/PPPSSPPP/8/TECDKCET w kq - 0 1",
        icon: "♚",
        boardFamily: "standard8x8", pieceFamily: "empire",
        colors: { first: "Gold", second: "Black" },
        roles: { pieceRow: { white: ["k", "d", "t", "c", "e", "p", "s", "q"], black: ["k", "q", "r", "b", "n", "p"] } },
        rules: { enPassant: true },
        ui: { boardMark: 'campmate' },
    }),

    ordamirror: variant({
        name: "ordamirror", displayName: "orda mirror", tooltip: _("Orda Chess variant with two Horde armies. The Falcon replaces the Yurt."),
        startFen: "lhafkahl/8/pppppppp/8/8/PPPPPPPP/8/LHAFKAHL w - - 0 1",
        icon: "◩",
        boardFamily: "standard8x8", pieceFamily: "ordamirror",
        colors: { first: "White", second: "Gold" },
        roles: { pieceRow: ["k", "f", "l", "a", "h", "p"] },
        promotion: { type: "regular", order: ["h", "l", "f", "a"] },
        ui: { boardMark: 'campmate' },
    }),

    chak: variant({
        name: "chak", tooltip: "Mayan chess. Inspired by cultural elements of Mesoamerica.",
        startFen: "rvsqkjsvr/4o4/p1p1p1p1p/9/9/9/P1P1P1P1P/4O4/RVSJKQSVR w - - 0 1",
        icon: "🐬",
        boardFamily: "chak9x9", pieceFamily: "chak",
        colors: { first: "White", second: "Green" },
        roles: { pieceRow: ["r", "v", "s", "q", "k", "j", "o", "p"], kings: ["k", "+k"] },
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
        startFen: "p1m1s1f/1k5/7/7/7/5K1/F1S1M1P[] w - 0 1",
        icon: "🎾",
        boardFamily: "chennis7x7", pieceFamily: "chennis",
        roles: { pieceRow: ["k", "p", "m", "s", "f"] },
        pocket: { roles: ["p", "m", "s", "f"], captureToHand: true },
        promotion: { type: "shogi", roles: ["p", "m", "s", "f"] },
    }),

    // We support the functionality to import/store/analyze some variants
    // but don't want to add them to leaderboard page
    embassy: variant({
        name: "embassy", tooltip: "Like Capablanca Chess but with Grand starting setup.",
        startFen: "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1",
        icon: "P",
        boardFamily: "standard10x8", pieceFamily: "capa",
        roles: { pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"] },
        rules: { enPassant: true },
    }),

    embassyhouse: variant({
        name: "embassyhouse", tooltip: "Embassy with Crazyhouse drop rules.",
        startFen: "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR[] w KQkq - 0 1",
        icon: "&",
        boardFamily: "standard10x8", pieceFamily: "capa",
        roles: { pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"] },
        pocket: { roles: ["p", "n", "b", "r", "a", "c", "q"], captureToHand: true },
        rules: { enPassant: true },
    }),

    gothic: variant({
        name: "gothic", tooltip: "Like Capablanca Chess but with a different starting setup.",
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1",
        icon: "P",
        boardFamily: "standard10x8", pieceFamily: "capa",
        roles: { pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"] },
        rules: { enPassant: true },
    }),

    gothhouse: variant({
        name: "gothhouse", tooltip: _("Gothic with Crazyhouse drop rules."),
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1",
        icon: "&",
        boardFamily: "standard10x8", pieceFamily: "capa",
        roles: { pieceRow: ["k", "q", "c", "a", "r", "b", "n", "p"] },
        pocket: { roles: ["p", "n", "b", "r", "a", "c", "q"], captureToHand: true },
        rules: { enPassant: true },
    }),
};

export const variants = Object.keys(VARIANTS);
const disabledVariants = [ "gothic", "gothhouse", "embassy", "embassyhouse", "gorogoro" ];
export const enabledVariants = variants.filter(v => !disabledVariants.includes(v));

const variantGroups: { [ key: string ]: { variants: string[] } } = {
    standard: { variants: [ "chess", "crazyhouse", "placement", "atomic", "duck" ] },
    sea:      { variants: [ "makruk", "makpong", "cambodian", "sittuyin", "asean" ] },
    shogi:    { variants: [ "shogi", "minishogi", "kyotoshogi", "dobutsu", "gorogoroplus", "torishogi" ] },
    xiangqi:  { variants: [ "xiangqi", "manchu", "janggi", "minixiangqi" ] },
    fairy:    { variants: [ "capablanca", "capahouse", "seirawan", "shouse", "grand", "grandhouse", "shako", "shogun", "hoppelpoppel" ] },
    army:     { variants: [ "orda", "synochess", "shinobi", "empire", "ordamirror", "chak", "chennis" ] },
};

function variantGroupLabel(group: string): string {
    const groups: {[index: string]: string} = {
        standard: _("Chess Variants"),
        sea: _("Makruk Variants"),
        shogi: _("Shogi Variants"),
        xiangqi: _("Xiangqi Variants"),
        fairy: _("Fairy Piece Variants"),
        army: _("New Army Variants"),
    }
    return groups[group];
}

export function selectVariant(id: string, selected: string, onChange: EventListener, hookInsert: InsertHook): VNode {
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
                    attrs: { selected: v === selected },
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

const handicapKeywords = [ "HC", "Handicap", "Odds" ];
export function isHandicap(name: string): boolean {
    return handicapKeywords.some(keyword => name.endsWith(keyword));
}

export function hasCastling(variant: Variant, color: cg.Color): boolean {
    if (variant.name === 'placement') return true;
    const castl = variant.startFen.split(' ')[2];
    if (color === 'white') {
        return castl.includes('KQ');
    } else {
        return castl.includes('kq');
    }
}

export function uci2cg(move: string): string {
    return move.replace(/10/g, ":");
}

export function uci2LastMove(move: string | undefined): cg.Move | undefined {
    if (!move) return undefined;
    let moveStr = uci2cg(move);
    if (moveStr.startsWith('+')) moveStr = moveStr.slice(1);
    return [ moveStr.slice(0, 2) as cg.Orig, moveStr.slice(2) as cg.Key ];
}

export function cg2uci(move: string): string {
    return move.replace(/:/g, "10");
}

// TODO Will be deprecated after WASM Fairy integration
export function validFen(variant: Variant, fen: string): boolean {
    const as = variant.alternateStart;
    if (as !== undefined) {
        if (Object.keys(as).some((key) => {return as[key].includes(fen);})) return true;
    }
    const variantName = variant.name;
    const startfen = variant.startFen;
    const start = startfen.split(' ');
    const parts = fen.split(' ');

    // Need starting color
    if (parts.length < 2) return false;

    // Allowed characters in placement part
    const placement = parts[0];
    const startPlacement = start[0];
    let good = startPlacement + 
        ((variantName === "orda") ? "Hq" : "") +
        ((variantName === "dobutsu") ? "Hh" : "") +
        ((variantName === "duck") ? "*" : "") +
        "~+0123456789[]-";
    const alien = (element: string) => !good.includes(element);
    if (placement.split('').some(alien)) return false;

    if (variantName === "duck" && lc(placement, "*", false) > 1) return false;

    // Brackets paired
    if (lc(placement, '[', false) !== lc(placement, ']', false)) return false;


    // Check with chessgroundx's parsing
    const dimensions = variant.board.dimensions;
    const width = dimensions.width;
    const height = dimensions.height;
    const boardState = read(placement, dimensions);

    // Correct board size
    if (lc(placement, '/', false) < height - 1) return false;
    for (const [k, _] of boardState.pieces) {
        const pos = util.key2pos(k);
        if (pos[0] > width - 1 || pos[1] > height - 1)
            return false;
    }

    // Touching kings
    if (variantName !== 'atomic' && touchingKings(boardState.pieces)) return false;

    // Starting colors
    if (parts[1] !== 'b' && parts[1] !== 'w') return false;

    // Castling rights (piece virginity)
    good = (variantName === 'seirawan' || variantName === 'shouse') ? 'KQABCDEFGHkqabcdefgh-' : start[2] + "-";
    const wrong = (element: string) => !good.includes(element);
    const rookStart: { [right: string]: cg.Pos } = {
        K: (variantName === 'shako') ? [width - 2, 1] : [width - 1, 0],
        Q: (variantName === 'shako') ? [1, 1] : [0, 0],
        k: (variantName === 'shako') ? [width - 2, height - 2] : [width - 1, height - 1],
        q: (variantName === 'shako') ? [1, height - 2] : [0, height - 1],
    };
    if (parts.length > 2 && variantName !== 'dobutsu') {
        if (parts[2].split('').some(wrong)) return false;

        // TODO: Checking S-chess960 FEN is tricky
        // Editor and Analysis board needs chess960 checkbox similar to new game dialog first

        // It is better to enable castling right validation for seirawan and shouse as well to be safe
        //if (variantName !== 'seirawan' && variantName !== 'shouse') {
            // Castling right need rooks and king placed in starting square
            // capablanca: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
            // shako: "c8c/ernbqkbnre/pppppppppp/10/10/10/10/PPPPPPPPPP/ERNBQKBNRE/C8C w KQkq - 0 1",
            for (const c of parts[2]) {
                const piece = rookStart[c] ? boardState.pieces.get(util.pos2key(rookStart[c])) : undefined;
                const color = c === c.toUpperCase() ? 'white' : 'black';
                switch (c) {
                    case 'K':
                    case 'Q':
                    case 'k':
                    case 'q':
                        if (!piece || !util.samePiece(piece, { role: 'r-piece', color: color }))
                            return false;
                        // TODO check king position
                        break;
                    // TODO Gating right
                }
            }
        //}
    }

    // Number of kings
    const king = util.letterOf(variant.roles.kings[0]);
    if (lc(placement, king, false) !== 1 || lc(placement, king, true) !== 1) return false;

    return true;
}

function diff(a: number, b:number): number {
    return Math.abs(a - b);
}

function touchingKings(pieces: cg.Pieces): boolean {
    let wk = 'xx', bk = 'zz';
    for (const [k, p] of pieces) {
        if (p.role === "k-piece") {
            if (p.color === 'white') wk = k;
            if (p.color === 'black') bk = k;
        }
    }
    const touching = diff(wk.charCodeAt(0), bk.charCodeAt(0)) <= 1 && diff(wk.charCodeAt(1), bk.charCodeAt(1)) <= 1;
    return touching;
}

// pocket part of the FEN (including brackets)
export function getPockets(fen: string): string {
    const placement = fen.split(" ")[0];
    let pockets = "";
    const bracketPos = placement.indexOf("[");
    if (bracketPos !== -1)
        pockets = placement.slice(bracketPos);
    return pockets;
}

// Get counting information for makruk et al
export function getCounting(fen: string): [number, number, string, string] {
    const parts = fen.split(" ");

    let countingPly = Number(parts[4]);
    if (isNaN(countingPly)) countingPly = 0;

    let countingLimit = Number(parts[3]);
    if (isNaN(countingLimit)) countingLimit = 0;

    const board = parts[0];
    const whitePieces = (board.match(/[A-Z]/g) || []).length;
    const blackPieces = (board.match(/[a-z]/g) || []).length;
    const pawns = (board.match(/[Pp]/g) || []).length;
    const countingType = (countingLimit === 0) ? 'none' : (pawns === 0 && (whitePieces <= 1 || blackPieces <= 1) ? 'piece' : 'board');

    const sideToMove = parts[1];
    const opponent = (sideToMove === 'w') ? 'b' : 'w';
    const countingSide = (countingType === 'none' || countingPly === 0) ? '' : ((countingPly % 2 === 0) ? sideToMove : opponent);

    return [countingPly, countingLimit, countingSide, countingType];
}

// Get janggi material points
export function getJanggiPoints(board: string): number[] {
    let choPoint = 0;
    let hanPoint = 1.5;
    for (const c of board) {
        switch (c) {
            case 'P': choPoint += 2; break;
            case 'A':
            case 'B': choPoint += 3; break;
            case 'N': choPoint += 5; break;
            case 'C': choPoint += 7; break;
            case 'R': choPoint += 13; break;

            case 'p': hanPoint += 2; break;
            case 'a':
            case 'b': hanPoint += 3; break;
            case 'n': hanPoint += 5; break;
            case 'c': hanPoint += 7; break;
            case 'r': hanPoint += 13; break;
        }
    }
    return [choPoint, hanPoint];
}

export function unpromotedRole(variant: Variant, piece: cg.Piece): cg.Role {
    if (piece.promoted) {
        switch (variant.promotion.type) {
            case 'shogi':
                return piece.role.slice(1) as cg.Role;
            default:
                return 'p-piece';
        }
    } else {
        return piece.role;
    }
}

export function promotedRole(variant: Variant, piece: cg.Piece): cg.Role {
    if (!piece.promoted && variant.promotion.roles.includes(piece.role)) {
        switch (variant.promotion.type) {
            case 'shogi':
                return 'p' + piece.role as cg.Role;
            default:
                return util.roleOf(variant.promotion.order[0] as cg.Letter);
        }
    } else {
        return piece.role;
    }
}

// Convert a list of moves to chessground destination
export function moveDests(legalMoves: UCIMove[]): cg.Dests {
    const dests: cg.Dests = new Map();
    legalMoves.map(uci2cg).forEach(move => {
        const orig = move.slice(0, 2) as cg.Key;
        const dest = move.slice(2, 4) as cg.Key;
        if (dests.has(orig))
            dests.get(orig)!.push(dest);
        else
            dests.set(orig, [ dest ]);
    });
    return dests;
}

export function promotionSuffix(move: UCIMove): PromotionSuffix {
    if (move.startsWith('+')) {
        return '+';
    } else {
        const comma = move.indexOf(',');
        if (comma > -1) move = move.substring(0, comma) as UCIMove;
        const last = move.slice(-1);
        if (last.match(/[a-z+-]/))
            return last as PromotionSuffix;
        else
            return '';
    }
}

// Create duck move dests from valid moves filtered by first leg move
// Fairy-Stockfish always uses first leg 'to' square as second leg 'from' square, but
// chessground dests should use real duck from square (except the very first white duck placement)
// f.e. move list after e2e4 (fromSquare is e4 because there is no duck on the board still)
// e2e4,e4e2 e2e4,e4a3 e2e4,e4b3 e2e4,e4c3 ...
// after 1.e2e4,e4e7 d7d5 (fromSquare of the duck is e7 now)
// d7d5,d5d7 d7d5,d5e2 d7d5,d5a3 d7d5,d5b3 ...
export function duckMoveDests(legalMoves: UCIMove[], fromSquare: cg.Key): cg.Dests {
    const dests: cg.Dests = new Map();
    const toSqares = legalMoves.map(move => move.slice(-2) as cg.Key);
    dests.set(fromSquare, toSqares);
    return dests;
}

// Count given letter occurences in a string
export function lc(str: string, letter: string, uppercase: boolean): number {
    if (uppercase)
        letter = letter.toUpperCase();
    else
        letter = letter.toLowerCase();
    let letterCount = 0;
    for (let position = 0; position < str.length; position++)
        if (str.charAt(position) === letter)
            letterCount += 1;
    return letterCount;
}

// Convert the string to uppercase if color is white,
// or convert it to lowercase if color is black
export function colorCase(color: cg.Color, str: string): string {
    if (color === 'white')
        return str.toUpperCase();
    else
        return str.toLowerCase();
}

export function notation(variant: Variant): cg.Notation {
    let cgNotation = cg.Notation.ALGEBRAIC;

    switch (variant.name) {
        case 'janggi':
            cgNotation = cg.Notation.JANGGI;
            break;
        case 'shogi':
        case 'minishogi':
        case 'kyotoshogi':
        case 'dobutsu':
        case 'gorogoro':
        case 'gorogoroplus':
        case 'torishogi':
            cgNotation = cg.Notation.SHOGI_ARBNUM;
            break;
        case 'xiangqi':
        case 'minixiangqi':
        // XIANGQI_WXF can't handle Mmanchu banner piece!
            cgNotation = cg.Notation.XIANGQI_ARBNUM;
            break;
    }
    return cgNotation;
}

export function colorIcon(variant: string, color: string) {
    if (variantGroups.shogi.variants.includes(variant)) {
        return (color === 'Black') ? 'icon-sente' : 'icon-gote';
    } else {
        return `icon-${color.toLowerCase()}`;
    }
}
