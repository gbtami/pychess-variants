import { h, VNode, InsertHook } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { read } from 'chessgroundx/fen';

import { _ } from './i18n';

import { MaterialDiff, calculateMaterialDiff } from './material'

export const ranksUCI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
export type UCIRank = typeof ranksUCI[number];
export type UCIKey =  'a0' | `${cg.File}${UCIRank}`;
export type UCIOrig = UCIKey | cg.DropOrig;
export type PromotionSuffix = cg.Letter | "+" | "-" | "";

export type UCIMove = `${UCIOrig}${UCIKey}`; // TODO: this is missing suffix for promotion which is also part of the move
export type CGMove = `${cg.Orig}${cg.Key}`; // TODO: this is missing suffix for promotion which is also part of the move

export type ColorName = "White" | "Black" | "Red" | "Blue" | "Gold" | "Pink" | "Green";
export type PromotionType = "regular" | "shogi" | "kyoto";
export type TimeControlType = "incremental" | "byoyomi";
export type CountingType = "makruk" | "asean";
export type MaterialPointType = "janggi";
export type BoardMarkType = "campmate" | "none";
export type PieceSoundType = "regular" | "atomic" | "shogi";

export interface BoardFamily {
    dimensions: cg.BoardDimensions;
    cg: string;
    boardCSS: string[];
}

export interface PieceFamily {
    pieceCSS: string[];
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

type MandatoryPromotionPredicate = (role: cg.Role, orig: cg.Orig, dest: cg.Key, color: cg.Color) => boolean;

const alwaysMandatory: MandatoryPromotionPredicate = () => true;

function distanceBased(required: { [ letter: string ]: number }, boardHeight: number) : MandatoryPromotionPredicate {
    return (role: cg.Role, _orig: cg.Key, dest: cg.Key, color: cg.Color) => {
        const letter = util.letterOf(role);
        return (letter in required) ? distFromLastRank(dest, color, boardHeight) < required[letter] : false;
    };
}

function distFromLastRank(dest: cg.Key, color: cg.Color, boardHeight: number) : number {
    const rank = util.key2pos(dest)[1];
    return (color === "white") ? boardHeight - rank - 1 : rank;
}

export class Variant {
    readonly name: string;
    private readonly _displayName: string;
    displayName(chess960 = false) { return _(this._displayName).toUpperCase() + (chess960 ? "960" : ""); }
    private readonly _tooltip: () => string;
    tooltip() { return this._tooltip(); }
    readonly startFen: string;

    readonly board: keyof typeof BOARD_FAMILIES;
    private readonly boardFamily: BoardFamily;
    get boardDimensions() { return this.boardFamily.dimensions; }
    get boardWidth() { return this.boardDimensions.width; }
    get boardHeight() { return this.boardDimensions.height; }
    get cg() { return this.boardFamily.cg; }
    get boardCSS() { return this.boardFamily.boardCSS; }

    readonly piece: keyof typeof PIECE_FAMILIES;
    private readonly pieceFamily: PieceFamily;
    get pieceCSS() { return this.pieceFamily.pieceCSS; }

    readonly firstColor: ColorName;
    readonly secondColor: ColorName;

    readonly pieceRoles: Record<cg.Color, cg.Role[]>;
    readonly pocket: boolean;
    readonly pocketRoles: Record<cg.Color, cg.Role[]> | undefined;
    readonly kingRoles: cg.Role[];

    readonly promotion: PromotionType;
    readonly promotionOrder: PromotionSuffix[];
    readonly promoteableRoles: cg.Role[];
    readonly isMandatoryPromotion: MandatoryPromotionPredicate;
    readonly timeControl: TimeControlType;
    readonly counting?: CountingType;
    readonly materialPoint?: MaterialPointType;
    readonly enPassant: boolean;
    readonly autoPromoteable: boolean;
    readonly captureToHand: boolean;
    readonly gate: boolean;
    readonly duck: boolean;
    readonly pass: boolean;
    readonly setup: boolean;
    readonly boardMark: BoardMarkType;
    readonly showPromoted: boolean;
    readonly showMaterialDiff : boolean;
    readonly initialMaterialImbalance : MaterialDiff;

    readonly alternateStart?: { [ name: string ]: string };

    readonly chess960: boolean;

    private readonly _icon: string;
    private readonly _icon960: string;
    icon(chess960 = false) { return chess960 ? this._icon960 : this._icon; }
    readonly pieceSound: PieceSoundType;

    constructor(data: VariantConfig) {
        this.name = data.name;
        this._displayName = data.displayName ?? data.name;
        this._tooltip = data.tooltip;
        this.startFen = data.startFen;

        this.board = data.board;
        this.boardFamily = BOARD_FAMILIES[data.board];

        this.piece = data.piece;
        this.pieceFamily = PIECE_FAMILIES[data.piece];

        this.firstColor = data.firstColor ?? "White";
        this.secondColor = data.secondColor ?? "Black";
        this.pieceRoles = {
            white: data.pieceLetters.map(util.roleOf),
            black: (data.pieceLetters2 ?? data.pieceLetters).map(util.roleOf)
        };
        this.pocket = !!(data.pocketLetters || data.pocketLetters2);
        this.pocketRoles = data.pocketLetters ? {
            white: data.pocketLetters.map(util.roleOf),
            black: (data.pocketLetters2 ?? data.pocketLetters).map(util.roleOf),
        } :
            undefined;
        this.kingRoles = data.kingLetters?.map(util.roleOf) ?? ["k-piece"];

        this.promotion = data.promotion ?? "regular";
        this.promotionOrder = data.promotionOrder ?? (this.promotion === "shogi" || this.promotion === "kyoto" ? ["+", ""] : ["q", "c", "e", "a", "h", "n", "r", "b", "p"]);
        this.promoteableRoles = data.promoteableLetters?.map(util.roleOf) ?? ["p-piece"];
        this.isMandatoryPromotion = data.isMandatoryPromotion ?? alwaysMandatory;
        this.timeControl = data.timeControl ?? "incremental";
        this.counting = data.counting;
        this.materialPoint = data.materialPoint;
        this.enPassant = data.enPassant ?? false;
        this.autoPromoteable = this.promotionOrder.length > 2;
        this.captureToHand = data.captureToHand ?? false;
        this.gate = data.gate ?? false;
        this.duck = data.duck ?? false;
        this.pass = data.pass ?? false;
        this.setup = data.setup ?? false;
        this.boardMark = data.boardMark ?? 'none';
        this.showPromoted = data.showPromoted ?? false;
        this.showMaterialDiff = !this.captureToHand;
        this.initialMaterialImbalance = this.showMaterialDiff ? calculateMaterialDiff(this) : new Map();

        this.alternateStart = data.alternateStart;

        this.chess960 = data.chess960 ?? false;

        this._icon = data.icon;
        this._icon960 = data.icon960 ?? data.icon;
        this.pieceSound = data.pieceSound ?? "regular";
    }
}

interface VariantConfig {
    name: string; // The name of this variant as defined in Fairy-Stockfish

    displayName?: string; // The display name of this variant for use on the website

    tooltip: () => string; // The tooltip of this variant when its name is hovered
    startFen: string; // The FEN string that represents the starting position
    board: keyof typeof BOARD_FAMILIES; // The board style family
    piece: keyof typeof PIECE_FAMILIES; // The piece style family

    firstColor?: ColorName; // The name of the first-mover's color
    secondColor?: ColorName; // The name of the second-mover's color
    pieceLetters: cg.Letter[]; // The letters of pieces available for the first-mover
    pieceLetters2?: cg.Letter[]; // The letters of pieces available for the second-mover IF it is different from the first-mover
    pocketLetters?: cg.Letter[]; // The letters of pieces in the pocket of the first-mover
    pocketLetters2?: cg.Letter[]; // The letters of pieces in the pocket of the second-mover IF it is different from the first-mover
    kingLetters?: cg.Letter[]; // The letters of the piece(s) that will be marked for check

    promotion?: PromotionType; // The type of promotion of this variant
        // (default) "regular" = Chess-style, pawns promote to one or more other pieces
        // "shogi" = Shogi-style, multiple pieces can promote, each piece has a specific piece type it promotes to
        // "kyoto" = Kyoto Shogi, like shogi, but pieces can also demote and can be dropped in promoted state
    promotionOrder?: PromotionSuffix[]; // The order of pieces to be shown in promotion choice
    promoteableLetters?: cg.Letter[]; // The letters of pieces that can promote
    isMandatoryPromotion?: MandatoryPromotionPredicate; // Specific condition to determine if a piece promotion is mandatory
    timeControl?: TimeControlType; // Default time control type
        // (default) "incremental" = Fischer increment. An amount of time is added to the clock after each move
        // "byoyomi" = Overtime. An amount of time is given for each move after the main time runs out
    counting?: CountingType; // Counting type.
        // Specifically used for SEA variants
    materialPoint?: MaterialPointType; // Material point display.
        // Specifically used for Janggi but other variants can possibly use this too
    captureToHand?: boolean; // Whether captured pieces are added to the pocket
    gate?: boolean; // Whether this variant has piece gating.
        // Specifically used for S-Chess
    duck?: boolean; // Whether this variant has duck move.
        // Specifically used for Duck chess
    pass?: boolean; // Whether this variant allows players to pass their turn without moving any pieces
    setup?: boolean; // Whether this variant has a pre-game setup phase issued by the server
    boardMark?: BoardMarkType; // Board mark type
        // "campmate" = Mark the last row of each side to indicate that moving the king to these squares wins the game
        // (default) "none" = Mark nothing
    pieceSound?: PieceSoundType; // Piece sound type
        // (default) "regular" = Regular chess piece sound
        // "atomic" = Atomic piece sound, with explosion on capture
        // "shogi" = Shogi piece sound, indicating relatively flat pieces instead of miniature-type pieces

    showPromoted?: boolean; // Whether promoted pieces should be marked in the FEN.
        // Specifically used for Makruk's promoted pawns to display them differently from a regular met

    enPassant?: boolean; // Whether this variant has en passant
    alternateStart?: {[key:string]: string}; // Alternate starting positions, possibly handicap positions
    chess960?: boolean; // Whether this variant has a random mode
    icon: string; // The icon letter in the site's font
    icon960?: string; // The icon of the 960 version
}

export const VARIANTS: { [name: string]: Variant } = {
    chess: new Variant({
        name: "chess", tooltip: () => _("Chess, unmodified, as it's played by FIDE standards."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        board: "standard8x8", piece: "standard",
        pieceLetters: ["k", "q", "r", "b", "n", "p"],
        enPassant: true,
        alternateStart: {
            '': '',
            'PawnsPushed': "rnbqkbnr/8/8/pppppppp/PPPPPPPP/8/8/RNBQKBNR w KQkq - 0 1",
            'PawnsPassed': "rnbqkbnr/8/8/PPPPPPPP/pppppppp/8/8/RNBQKBNR w KQkq - 0 1",
            'UpsideDown': "RNBKQBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbkqbnr w - - 0 1",
            'Theban': "1p6/2p3kn/3p2pp/4pppp/5ppp/8/PPPPPPPP/PPPPPPKN w - - 0 1",
            'No castle': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1'
        },
        chess960: true, icon: "M", icon960: "V",
    }),

    crazyhouse: new Variant({
        name: "crazyhouse", tooltip: () => _("Take captured pieces and drop them back on to the board as your own."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1",
        board: "standard8x8", piece: "standard",
        pieceLetters: ["k", "q", "r", "b", "n", "p"],
        pocketLetters: ["p", "n", "b", "r", "q"],
        enPassant: true, captureToHand: true,
        alternateStart: {
            '': '',
            'PawnsPushed': "rnbqkbnr/8/8/pppppppp/PPPPPPPP/8/8/RNBQKBNR w - - 0 1",
            'PawnsPassed': "rnbqkbnr/8/8/PPPPPPPP/pppppppp/8/8/RNBQKBNR w - - 0 1",
            'UpsideDown': "RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr w - - 0 1",
            'Theban': "1p6/2p3kn/3p2pp/4pppp/5ppp/8/PPPPPPPP/PPPPPPKN w - - 0 1",
            'No castle': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1'
        },
        chess960: true, icon: "+", icon960: "%",
    }),

    placement: new Variant({
        name: "placement", tooltip: () => _("Choose where your pieces start."),
        startFen: "8/pppppppp/8/8/8/8/PPPPPPPP/8[KQRRBBNNkqrrbbnn] w - - 0 1",
        board: "standard8x8", piece: "standard",
        pieceLetters: ["k", "q", "r", "b", "n", "p"],
        pocketLetters: ["n", "b", "r", "q", "k"],
        enPassant: true,
        icon: "S",
    }),

    atomic: new Variant({
        name: "atomic", tooltip: () => _("Pieces explode upon capture."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        board: "standard8x8", piece: "standard",
        pieceLetters: ["k", "q", "r", "b", "n", "p"],
        enPassant: true,
        pieceSound: "atomic",
        chess960: true, icon: "~", icon960: "\\",
    }),

    duck: new Variant({
        name: "duck", tooltip: () => _("The duck must be moved to a new square after every turn."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        board: "standard8x8", piece: "standard",
        pieceLetters: ["k", "q", "r", "b", "n", "p", "*"],
        pieceLetters2: ["k", "q", "r", "b", "n", "p"],
        enPassant: true, duck: true,
        icon: "🦆",
    }),

    makruk: new Variant({
        name: "makruk", tooltip: () => _("Thai Chess. A game closely resembling the original Chaturanga. Similar to Chess but with a different queen and bishop."),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        board: "makruk8x8", piece: "makruk",
        pieceLetters: ["k", "s", "m", "n", "r", "p", "m~" as cg.Letter],
        promotionOrder: ["m"],
        counting: "makruk",
        showPromoted: true,
        icon: "Q",
    }),

    makpong: new Variant({
        name: "makpong", tooltip: () => _("Makruk variant where kings cannot move to escape out of check."),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        board: "makruk8x8", piece: "makruk",
        pieceLetters: ["k", "s", "m", "n", "r", "p", "m~" as cg.Letter],
        promotionOrder: ["m"],
        counting: "makruk",
        showPromoted: true,
        icon: "O",
    }),

    cambodian: new Variant({
        name: "cambodian", displayName: "ouk chaktrang", tooltip: () => _("Cambodian Chess. Makruk with a few additional opening abilities."),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w DEde - 0 1",
        board: "makruk8x8", piece: "makruk",
        pieceLetters: ["k", "s", "m", "n", "r", "p", "m~" as cg.Letter],
        promotionOrder: ["m"],
        counting: "makruk",
        showPromoted: true,
        icon: "!",
    }),

    sittuyin: new Variant({
        name: "sittuyin", tooltip: () => _("Burmese Chess. Similar to Makruk, but pieces are placed at the start of the match."),
        startFen: "8/8/4pppp/pppp4/4PPPP/PPPP4/8/8[KFRRSSNNkfrrssnn] w - - 0 1",
        board: "sittuyin8x8", piece: "sittuyin",
        firstColor: "Red", secondColor: "Black",
        pieceLetters: ["k", "f", "s", "n", "r", "p"],
        pocketLetters: ["r", "n", "s", "f", "k"],
        promotionOrder: ["f"],
        counting: "asean",
        icon: ":",
    }),

    asean: new Variant({
        name: "asean", tooltip: () => _("Makruk using the board/pieces from International Chess as well as pawn promotion rules."),
        startFen: "rnbqkbnr/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR w - - 0 1",
        board: "standard8x8", piece: "asean",
        pieceLetters: ["k", "q", "b", "n", "r", "p"],
        promotionOrder: ["r", "n", "b", "q"],
        counting: "asean",
        icon: "♻",
    }),

    shogi: new Variant({
        name: "shogi", tooltip: () => _("Japanese Chess, and the standard 9x9 version played today with drops and promotions. "),
        startFen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1",
        board: "shogi9x9", piece: "shogi",
        firstColor: "Black", secondColor: "White",
        pieceLetters: ["k", "g", "r", "b", "s", "n", "l", "p"],
        pocketLetters: ["p", "l", "n", "s", "g", "b", "r"],
        promotion: "shogi",
        promoteableLetters: ["p", "l", "n", "s", "r", "b"],
        isMandatoryPromotion: distanceBased({ p: 1, l: 1, n: 2 }, 9),
        timeControl: "byoyomi",
        pieceSound: "shogi",
        captureToHand: true,
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
        icon: "K",
    }),

    minishogi: new Variant({
        name: "minishogi", tooltip: () => _("5x5 Shogi for more compact and faster games. There are no knights or lances."),
        startFen: "rbsgk/4p/5/P4/KGSBR[-] w 0 1",
        board: "shogi5x5", piece: "shogi",
        firstColor: "Black", secondColor: "White",
        pieceLetters: ["k", "g", "r", "b", "s", "p"],
        pocketLetters: ["p", "s", "g", "b", "r"],
        promotion: "shogi",
        promoteableLetters: ["p", "s", "r", "b"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 5),
        timeControl: "byoyomi",
        pieceSound: "shogi",
        captureToHand: true,
        icon: "6",
    }),

    kyotoshogi: new Variant({
        name: "kyotoshogi", displayName: "kyoto shogi", tooltip: () => _("A wild Shogi variant on a 5x5 board where pieces flip into a different piece after each move."),
        startFen: "p+nks+l/5/5/5/+LSK+NP[-] w 0 1",
        board: "shogi5x5", piece: "kyoto",
        firstColor: "Black", secondColor: "White",
        pieceLetters: ["k", "l", "s", "n", "p"],
        pocketLetters: ["p", "l", "n", "s"],
        promotion: "kyoto",
        promoteableLetters: ["p", "l", "n", "s"],
        isMandatoryPromotion: (_role: cg.Role, orig: cg.Orig, _dest: cg.Key, _color: cg.Color) => util.isKey(orig),
        timeControl: "byoyomi",
        pieceSound: "shogi",
        captureToHand: true,
        icon: ")",
    }),

    dobutsu: new Variant({
        name: "dobutsu", tooltip: () => _("3x4 game with cute animals, designed to teach children how to play Shogi."),
        startFen: "gle/1c1/1C1/ELG[-] w 0 1",
        board: "shogi3x4", piece: "dobutsu",
        firstColor: "Black", secondColor: "White",
        pieceLetters: ["l", "g", "e", "c"],
        pocketLetters: ["e", "g", "c"],
        kingLetters: ["l"],
        promotion: "shogi",
        promoteableLetters: ["c"],
        timeControl: "byoyomi",
        pieceSound: "shogi",
        captureToHand: true,
        icon: "8",
    }),

    gorogoro: new Variant({
        name: "gorogoro", tooltip: () => _("5x6 Shogi designed to introduce tactics with the generals."),
        startFen: "sgkgs/5/1ppp1/1PPP1/5/SGKGS[-] w 0 1",
        board: "shogi5x6", piece: "shogi",
        firstColor: "Black", secondColor: "White",
        pieceLetters: ["k", "g", "s", "p"],
        pocketLetters: ["p", "s", "g"],
        promotion: "shogi",
        promoteableLetters: ["p", "s"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 6),
        timeControl: "byoyomi",
        pieceSound: "shogi",
        captureToHand: true,
        icon: "🐱",
    }),

    gorogoroplus: new Variant({
        name: "gorogoroplus", displayName: "gorogoro+", tooltip: () => _("5x6 Shogi designed to introduce tactics with the generals."),
        startFen: "sgkgs/5/1ppp1/1PPP1/5/SGKGS[LNln] w 0 1",
        board: "shogi5x6", piece: "shogi",
        firstColor: "Black", secondColor: "White",
        pieceLetters: ["k", "g", "s", "n", "l", "p"],
        pocketLetters: ["p", "l", "n", "s", "g"],
        promotion: "shogi",
        promoteableLetters: ["p", "s", "n", "l"],
        isMandatoryPromotion: distanceBased({ p: 1, l: 1, n: 2 }, 6),
        timeControl: "byoyomi",
        pieceSound: "shogi",
        captureToHand: true,
        alternateStart: {
            'Gorogoro Plus N+L': '',
            'Original (No N+L)': 'sgkgs/5/1ppp1/1PPP1/5/SGKGS[-] w 0 1'
        },
        icon: "🐱",
    }),

    torishogi: new Variant({
        name: "torishogi", displayName: "tori shogi", tooltip: () => _("A confrontational 7x7 variant with unique pieces each named after different birds."),
        startFen: "rpckcpl/3f3/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[-] w 0 1",
        board: "shogi7x7", piece: "tori",
        firstColor: "Black", secondColor: "White",
        pieceLetters: ["k", "c", "p", "l", "r", "f", "s"],
        pocketLetters: ["s", "p", "l", "r", "c", "f"],
        promotion: "shogi",
        promoteableLetters: ["s", "f"],
        timeControl: "byoyomi",
        pieceSound: "shogi",
        captureToHand: true,
        alternateStart: {
            '': '',
            'Left Quail HC': 'rpckcp1/3f3/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[] b 0 1',
            'Falcon HC': 'rpckcpl/7/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[] b 0 1',
            'Falcon + Left Quail HC': 'rpckcp1/7/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[] b 0 1',
            'Falcon + Both Quails HC': '1pckcp1/7/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[] b 0 1',
        },
        icon: "🐦",
    }),

    xiangqi: new Variant({
        name: "xiangqi", tooltip: () => _("Chinese Chess, one of the oldest and most played board games in the world."),
        startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1",
        board: "xiangqi9x10", piece: "xiangqi",
        firstColor: "Red", secondColor: "Black",
        pieceLetters: ["k", "a", "c", "r", "b", "n", "p"],
        promoteableLetters: [],
        icon: "|",
    }),

    manchu: new Variant({
        name: "manchu", tooltip: () => _("Xiangqi variant where one side has a chariot that can also move as a cannon or horse."),
        startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/9/9/M1BAKAB2 w - - 0 1",
        board: "xiangqi9x10", piece: "xiangqi",
        firstColor: "Red", secondColor: "Black",
        pieceLetters: ["k", "a", "m", "b", "p"],
        pieceLetters2: ["k", "a", "c", "r", "b", "n", "p"],
        promoteableLetters: [],
        icon: "{",
    }),

    janggi: new Variant({
        name: "janggi", tooltip: () => _("Korean Chess, similar to Xiangqi but plays much differently. Tournament rules are used."),
        startFen: "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1",
        board: "janggi9x10", piece: "janggi",
        firstColor: "Blue", secondColor: "Red",
        pieceLetters: ["k", "a", "c", "r", "b", "n", "p"],
        promoteableLetters: [],
        timeControl: "byoyomi",
        materialPoint: "janggi",
        pass: true, setup: true,
        icon: "=",
    }),

    minixiangqi: new Variant({
        name: "minixiangqi", tooltip: () => _("Compact version of Xiangqi played on a 7x7 board without a river."),
        startFen: "rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR w - - 0 1",
        board: "xiangqi7x7", piece: "xiangqi",
        firstColor: "Red", secondColor: "Black",
        pieceLetters: ["k", "c", "r", "n", "p"],
        promoteableLetters: [],
        icon: "7",
    }),

    capablanca: new Variant({
        name: "capablanca", tooltip: () => _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a 10x8 board."),
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceLetters: ["k", "q", "c", "a", "r", "b", "n", "p"],
        enPassant: true,
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1',
            'Carrera': 'rcnbqkbnar/pppppppppp/10/10/10/10/PPPPPPPPPP/RCNBQKBNAR w KQkq - 0 1',
            'Conservative': 'arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1',
            'Schoolbook': 'rqnbakbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RQNBAKBNCR w KQkq - 0 1',
        },
        chess960: true, icon: "P", icon960: ",",
    }),

    capahouse: new Variant({
        name: "capahouse", tooltip: () => _("Capablanca with Crazyhouse drop rules."),
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR[] w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceLetters: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketLetters: ["p", "n", "b", "r", "a", "c", "q"],
        enPassant: true, captureToHand: true,
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR[] w KQkq - 0 1',
            'Carrera': 'rcnbqkbnar/pppppppppp/10/10/10/10/PPPPPPPPPP/RCNBQKBNAR[] w KQkq - 0 1',
            'Conservative': 'arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC[] w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR[] w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1',
            'Schoolbook': 'rqnbakbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RQNBAKBNCR[] w KQkq - 0 1',
        },
        chess960: true, icon: "&", icon960: "'",
    }),

    seirawan: new Variant({
        name: "seirawan", displayName: "s-chess", tooltip: () => _("Hybrid pieces, the hawk (B+N) and elephant (R+N), can enter the board after moving a back rank piece."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        board: "standard8x8", piece: "seirawan",
        pieceLetters: ["k", "q", "e", "h", "r", "b", "n", "p"],
        pocketLetters: ["h", "e"],
        enPassant: true, gate: true,
        icon: "L",  chess960: true, icon960: "}",
    }),

    shouse: new Variant({
        name: "shouse", displayName: "s-house", tooltip: () => _("S-Chess with Crazyhouse drop rules."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        board: "standard8x8", piece: "seirawan",
        pieceLetters: ["k", "q", "e", "h", "r", "b", "n", "p"],
        pocketLetters: ["p", "n", "b", "r", "h", "e", "q"],
        enPassant: true, captureToHand: true, gate: true,
        icon: "$",
    }),

    grand: new Variant({
        name: "grand", tooltip: () => _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a grand 10x10 board."),
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1",
        board: "grand10x10", piece: "capa",
        pieceLetters: ["k", "q", "c", "a", "r", "b", "n", "p"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 10),
        enPassant: true,
        icon: "(",
    }),

    grandhouse: new Variant({
        name: "grandhouse", tooltip: () => _("Grand Chess with Crazyhouse drop rules."),
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R[] w - - 0 1",
        board: "grand10x10", piece: "capa",
        pieceLetters: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketLetters: ["p", "n", "b", "r", "a", "c", "q"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 10),
        enPassant: true, captureToHand: true,
        icon: "*",
    }),

    shako: new Variant({
        name: "shako", tooltip: () => _("Introduces the cannon and elephant from Xiangqi into a 10x10 chess board."),
        startFen: "c8c/ernbqkbnre/pppppppppp/10/10/10/10/PPPPPPPPPP/ERNBQKBNRE/C8C w KQkq - 0 1",
        board: "standard10x10", piece: "shako",
        pieceLetters: ["k", "q", "e", "c", "r", "b", "n", "p"],
        promotionOrder: ["q", "n", "c", "r", "e", "b"],
        enPassant: true,
        icon: "9",
    }),

    shogun: new Variant({
        name: "shogun", tooltip: () => _("Pieces promote and can be dropped, similar to Shogi."),
        startFen: "rnb+fkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB+FKBNR w KQkq - 0 1",
        board: "shogun8x8", piece: "shogun",
        pieceLetters: ["k", "f", "r", "b", "n", "p"],
        pocketLetters: ["p", "n", "b", "r", "f"],
        promotion: "shogi",
        promoteableLetters: ["p", "f", "r", "b", "n"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 8),
        timeControl: "byoyomi",
        enPassant: true, captureToHand: true,
        icon: "-",
    }),

    hoppelpoppel: new Variant({
        name: "hoppelpoppel", displayName: "hoppel-poppel", tooltip: () => _("Knights capture as bishops; bishops  capture as knights."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        board: "standard8x8", piece: "hoppel",
        pieceLetters: ["k", "q", "r", "b", "n", "p"],
        enPassant: true,
        icon: "`",
    }),

    orda: new Variant({
        name: "orda", tooltip: () => _("Asymmetric variant where one army has pieces that move like knights but capture differently."),
        startFen: "lhaykahl/8/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",
        board: "standard8x8", piece: "orda",
        firstColor: "White", secondColor: "Gold",
        pieceLetters: ["k", "q", "r", "b", "n", "p", "h"],
        pieceLetters2: ["k", "y", "l", "a", "h", "p", "q"],
        promotionOrder: ["q", "h"],
        enPassant: true,
        boardMark: 'campmate',
        icon: "R",
    }),

    synochess: new Variant({
        name: "synochess", tooltip: () => _("Asymmetric East vs. West variant which pits the western Chess army against a Xiangqi and Janggi-styled army."),
        startFen: "rneakenr/8/1c4c1/1ss2ss1/8/8/PPPPPPPP/RNBQKBNR[ss] w KQ - 0 1",
        board: "standard8x8", piece: "synochess",
        firstColor: "White", secondColor: "Red",
        pieceLetters: ["k", "q", "r", "b", "n", "p"],
        pieceLetters2: ["k", "a", "c", "r", "e", "n", "s"],
        pocketLetters: [], pocketLetters2: ["s"],
        boardMark: 'campmate',
        icon: "_",
    }),

    shinobi: new Variant({
        name: "shinobi", tooltip: () => _("Asymmetric variant which pits the western Chess army against a drop-based, Shogi-styled army."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/LH1CK1HL[LHMMDJ] w kq - 0 1",
        board: "standard8x8", piece: "shinobi",
        firstColor: "Pink", secondColor: "Black",
        pieceLetters: ["k", "d", "j", "c", "l", "h", "m", "p"],
        pieceLetters2: ["k", "q", "r", "b", "n", "p"],
        pocketLetters: ["l", "h", "m", "d", "j"],
        pocketLetters2: [],
        promotion: "shogi",
        promoteableLetters: ["p", "l", "h", "m"],
        enPassant: true,
        boardMark: 'campmate',
        icon: "🐢",
    }),

    empire: new Variant({
        name: "empire", tooltip: () => _("Asymmetric variant where one army has pieces that move like queens but capture as usual."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/PPPSSPPP/8/TECDKCET w kq - 0 1",
        board: "standard8x8", piece: "empire",
        firstColor: "Gold", secondColor: "Black",
        pieceLetters: ["k", "d", "t", "c", "e", "p", "s", "q"],
        pieceLetters2: ["k", "q", "r", "b", "n", "p"],
        enPassant: true,
        boardMark: 'campmate',
        icon: "♚",
    }),

    ordamirror: new Variant({
        name: "ordamirror", displayName: "orda mirror", tooltip: () => _("Orda Chess variant with two Horde armies. The Falcon replaces the Yurt."),
        startFen: "lhafkahl/8/pppppppp/8/8/PPPPPPPP/8/LHAFKAHL w - - 0 1",
        board: "standard8x8", piece: "ordamirror",
        firstColor: "White", secondColor: "Gold",
        pieceLetters: ["k", "f", "l", "a", "h", "p"],
        promotionOrder: ["h", "l", "f", "a"],
        boardMark: 'campmate',
        icon: "◩",
    }),

    chak: new Variant({
        name: "chak", tooltip: () => _("Mayan chess. Inspired by cultural elements of Mesoamerica."),
        startFen: "rvsqkjsvr/4o4/p1p1p1p1p/9/9/9/P1P1P1P1P/4O4/RVSJKQSVR w - - 0 1",
        board: "chak9x9", piece: "chak",
        firstColor: "White", secondColor: "Green",
        pieceLetters: ["r", "v", "s", "q", "k", "j", "o", "p"],
        kingLetters: ["k", "+k"],
        promotion: "shogi",
        promoteableLetters: ["p", "k"],
        icon: "🐬",
    }),

    chennis: new Variant({
        name: "chennis", tooltip: () => _("Pieces alternate between two forms with each move."),
        startFen: "p1m1s1f/1k5/7/7/7/5K1/F1S1M1P[] w - 0 1",
        board: "chennis7x7", piece: "chennis",
        pieceLetters: ["k", "p", "m", "s", "f"],
        pocketLetters: ["p", "m", "s", "f"],
        promotion: "kyoto",
        promoteableLetters: ["p", "m", "s", "f"],
        isMandatoryPromotion: (_role: cg.Role, orig: cg.Orig, _dest: cg.Key, _color: cg.Color) => util.isKey(orig),
        captureToHand: true,
        icon: "🎾",
    }),

    // We support to import/store/analyze some variants
    // but don't want to add them to leaderboard page
    embassy: new Variant({
        name: "embassy", tooltip: () => _("Like Capablanca Chess but with Grand starting setup."),
        startFen: "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceLetters: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketLetters: ["p", "n", "b", "r", "a", "c", "q"],
        enPassant: true,
        icon: "P",
    }),

    embassyhouse: new Variant({
        name: "embassyhouse", tooltip: () => _("Embassy with Crazyhouse drop rules."),
        startFen: "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR[] w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceLetters: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketLetters: ["p", "n", "b", "r", "a", "c", "q"],
        enPassant: true, captureToHand: true,
        icon: "&",
    }),

    gothic: new Variant({
        name: "gothic", tooltip: () => _("Like Capablanca Chess but with a different starting setup."),
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceLetters: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketLetters: ["p", "n", "b", "r", "a", "c", "q"],
        enPassant: true,
        icon: "P",
    }),

    gothhouse: new Variant({
        name: "gothhouse", tooltip: () => _("Gothic with Crazyhouse drop rules."),
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceLetters: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketLetters: ["p", "n", "b", "r", "a", "c", "q"],
        enPassant: true, captureToHand: true,
        icon: "&",
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
                    props: { value: v, title: variant.tooltip() },
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
    const boardState = read(placement, variant.boardDimensions);
    const width = variant.boardDimensions.width;
    const height = variant.boardDimensions.height;

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
    const king = util.letterOf(variant.kingRoles[0]);
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
        switch (variant.promotion) {
            case 'shogi':
            case 'kyoto':
                return piece.role.slice(1) as cg.Role;
            default:
                return 'p-piece';
        }
    } else {
        return piece.role;
    }
}

export function promotedRole(variant: Variant, piece: cg.Piece): cg.Role {
    if (!piece.promoted && variant.promoteableRoles.includes(piece.role)) {
        switch (variant.promotion) {
            case 'shogi':
            case 'kyoto':
                return 'p' + piece.role as cg.Role;
            default:
                return util.roleOf(variant.promotionOrder[0] as cg.Letter);
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
