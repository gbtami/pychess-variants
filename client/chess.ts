import { h, VNode, InsertHook } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { read } from 'chessgroundx/fen';

import { _ } from './i18n';

import { MaterialImbalance, calculateInitialImbalance } from './material'

export const ranksUCI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
export type UCIRank = typeof ranksUCI[number];
export type UCIKey =  'a0' | `${cg.File}${UCIRank}`;
export type UCIOrig = UCIKey | cg.DropOrig;
export type PromotionSuffix = cg.PieceLetter | "+" | "-" | "";

export type UCIMove = `${UCIOrig}${UCIKey}`; // TODO: this is missing suffix for promotion which is also part of the move
export type CGMove = `${cg.Orig}${cg.Key}`; // TODO: this is missing suffix for promotion which is also part of the move

export type ColorName = "White" | "Black" | "Red" | "Blue" | "Gold" | "Pink";
export type PromotionType = "regular" | "shogi" | "kyoto";

export interface BoardFamily {
    geometry: cg.Geometry;
    cg: string;
    boardCSS: string[];
}

export interface PieceFamily {
    pieceCSS: string[];
}

export const BOARD_FAMILIES: { [key: string]: BoardFamily } = {
    standard8x8: { geometry: cg.Geometry.dim8x8, cg: "cg-512", boardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg", "8x8santa.png", "8x8wood2.jpg", "8x8wood4.jpg"] },
    standard10x8: { geometry: cg.Geometry.dim10x8, cg: "cg-640", boardCSS: ["10x8brown.svg", "10x8blue.svg", "10x8green.svg", "10x8maple.jpg", "10x8olive.jpg"] },
    standard10x10: { geometry: cg.Geometry.dim10x10, cg: "cg-640-640", boardCSS: ["10x10brown.svg", "10x10blue.svg", "10x10green.svg", "10x10maple.jpg", "10x10olive.jpg"] },
    grand10x10: { geometry: cg.Geometry.dim10x10, cg: "cg-640-640", boardCSS: ["Grandboard.svg", "10x10brown.svg", "10x10blue.svg", "10x10green.svg", "10x10maple.jpg", "10x10mapleGrand.png"] },
    makruk8x8: { geometry: cg.Geometry.dim8x8, cg: "cg-512", boardCSS: ["makruk2.svg", "makruk.svg", "makruk.jpg", "makrukWood.png"] },
    sittuyin8x8: { geometry: cg.Geometry.dim8x8, cg: "cg-512", boardCSS: ["sittuyin2.svg", "sittuyin.svg", "sittuyin.jpg", "sittuyingreen.svg", "sittuyinGrainBrown.svg", "sittuyinWood.png"] },
    shogi9x9: { geometry: cg.Geometry.dim9x9, cg: "cg-576", boardCSS: ["shogi.svg", "Shogiban1.png", "Shogiban2.png", "shogic.svg", "ShogiMaple.png", 'ShogiGrayTexture.png', "ShogiSpace1.png", "doubutsu.svg", "ShogiOak.png"] },
    shogi7x7: { geometry: cg.Geometry.dim7x7, cg: "cg-448-516", boardCSS: ["ToriPlain.svg", "ToriWood.svg", "ToriDaySky.svg", "ToriNightSky.svg"] },
    shogi5x5: { geometry: cg.Geometry.dim5x5, cg: "cg-260", boardCSS: ["minishogi.svg", "MiniboardWood1.png", "MiniboardWood2.png", "MinishogiDobutsu.svg", "MinishogiDobutsu2.svg"] },
    shogi5x6: { geometry: cg.Geometry.dim5x6, cg: "cg-260-360", boardCSS: ["gorogoro.svg", "gorogoroboard.svg", "gorogoro2.svg", "GorogoroWood.png"] },
    shogi3x4: { geometry: cg.Geometry.dim3x4, cg: "cg-156", boardCSS: ["doubutsuboard.svg", "dobutsu3x4.svg"] },
    xiangqi9x10: { geometry: cg.Geometry.dim9x10, cg: "cg-576-640", boardCSS: ["xiangqi.svg", "xiangqic.svg", "xiangqiCTexture.png", "xiangqiPaper.png", "xiangqiWood.png", "xiangqiDark.svg", "xiangqiWikimedia.svg", "xiangqiLightWood.png"] },
    xiangqi7x7: { geometry: cg.Geometry.dim7x7, cg: "cg-448", boardCSS: ["minixiangqi.svg", "minixiangqiw.png", "minixqlg.svg"] },
    janggi9x10: { geometry: cg.Geometry.dim9x10, cg: "cg-576-640", boardCSS: ["JanggiBrown.svg", "JanggiPaper.png", "JanggiWood.png", "JanggiDark.svg", "JanggiWoodDark.svg", "JanggiStone.svg"] },
    shogun8x8: { geometry: cg.Geometry.dim8x8, cg: "cg-512", boardCSS: ["ShogunPlain.svg", "ShogunMaple.png", "ShogunMaple2.png", "ShogunBlue.svg", "8x8brown.svg", "8x8maple.jpg"] },
    chak9x9:{ geometry: cg.Geometry.dim9x9, cg: "cg-540", boardCSS: ["StandardChakBoard.svg", "ColoredChakBoard.svg", "ChakArt.jpg"] },
};

export const PIECE_FAMILIES: { [key: string]: PieceFamily } = {
    standard: { pieceCSS: ["standard", "green", "alpha", "chess_kaneo", "santa"] },
    capa: { pieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4"] },
    seirawan: { pieceCSS: ["seir1", "seir0", "seir2", "seir3", "seir4"] },
    makruk: { pieceCSS: ["makrukwb", "makrukwr", "makruk", "makruks", "makruki"] },
    sittuyin: { pieceCSS: ["sittuyins", "sittuyinkagr", "sittuyinkabr", "sittuyinm", "sittuyini"] },
    asean: { pieceCSS: ["aseani", "aseanm", "aseanc", "aseans"] },
    shogi: { pieceCSS: ["shogik", "shogi", "shogiw", "shogip", "shogim", "shogip3d", "shogikw3d", "shogid", "shogiim", "shogibw"] },
    kyoto: { pieceCSS: ["kyoto", "kyotok", "kyotoks", "kyotoi", "kyotod"] },
    dobutsu: { pieceCSS: ["dobutsu"] },
    tori: { pieceCSS: ["torii", "torik", "torim"] },
    xiangqi: { pieceCSS: ["xiangqi2d", "xiangqi2di", "xiangqi", "xiangqict3", "xiangqihnz", "xiangqict2", "xiangqihnzw", "xiangqict2w", "xiangqiwikim", "xiangqiKa"] },
    janggi: { pieceCSS: ["janggihb", "janggihg", "janggiikak", "janggiikaw", "janggikak", "janggikaw"] },
    shako: { pieceCSS: ["shako0", "shako1", "shako2"] },
    shogun: { pieceCSS: ["shogun0", "shogun1", "shogun2", "shogun3", "shogun4", "shogun5"] },
    orda: { pieceCSS: ["orda0", "orda1"] },
    synochess: { pieceCSS: ["synochess0", "synochess1", "synochess2", "synochess3", "synochess4", "synochess5"] },
    hoppel: { pieceCSS: ["hoppel0", "hoppel1", "hoppel2"] },
    shinobi: { pieceCSS: ["shinobi0", "shinobi1"] },
    empire: { pieceCSS: ["empire0", "empire1"] },
    ordamirror: { pieceCSS: ["ordamirror0", "ordamirror1"] },
    chak: { pieceCSS: ["chak0"] },
};

type MandatoryPromotionPredicate = (role: cg.Role, orig: cg.Key, dest: cg.Key, color: cg.Color) => boolean;

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
    get geometry() { return this.boardFamily.geometry; }
    get boardDimensions() { return cg.dimensions[this.geometry]; }
    get boardWidth() { return this.boardDimensions.width; }
    get boardHeight() { return this.boardDimensions.height; }
    get cg() { return this.boardFamily.cg; }
    get boardCSS() { return this.boardFamily.boardCSS; }

    readonly piece: keyof typeof PIECE_FAMILIES;
    private readonly pieceFamily: PieceFamily;
    get pieceCSS() { return this.pieceFamily.pieceCSS; }

    readonly firstColor: ColorName;
    readonly secondColor: ColorName;

    private readonly _pieceRoles: [ cg.PieceLetter[], cg.PieceLetter[] ];
    pieceRoles(color: cg.Color) { return color === "white" ? this._pieceRoles[0] : this._pieceRoles[1]; }
    readonly pocket: boolean;
    private readonly _pocketRoles: [ cg.PieceLetter[] | undefined, cg.PieceLetter[] | undefined ];
    pocketRoles(color: cg.Color) { return color === "white" ? this._pocketRoles[0] : this._pocketRoles[1]; }

    readonly promotion: PromotionType;
    readonly promotionOrder: PromotionSuffix[];
    readonly promoteablePieces: cg.PieceLetter[];
    readonly isMandatoryPromotion: MandatoryPromotionPredicate;
    readonly timeControl: string;
    readonly counting?: string;
    readonly materialPoint?: string;
    readonly enPassant: boolean;
    readonly autoPromoteable: boolean;
    readonly drop: boolean;
    readonly gate: boolean;
    readonly pass: boolean;
    readonly showPromoted: boolean;
    readonly materialDifference : boolean;
    readonly initialMaterialImbalance : MaterialImbalance;

    readonly alternateStart?: { [ name: string ]: string };

    readonly chess960: boolean;

    private readonly _icon: string;
    private readonly _icon960: string;
    icon(chess960 = false) { return chess960 ? this._icon960 : this._icon; }
    readonly pieceSound: string;

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
        this._pieceRoles = [ data.pieceRoles, data.pieceRoles2 ?? data.pieceRoles ];
        this.pocket = !!(data.pocketRoles || data.pocketRoles2);
        this._pocketRoles = [ data.pocketRoles, data.pocketRoles2 ?? data.pocketRoles ];

        this.promotion = data.promotion ?? "regular";
        this.promotionOrder = data.promotionOrder ?? (this.promotion === "shogi" || this.promotion === "kyoto" ? ["+", ""] : ["q", "c", "e", "a", "h", "n", "r", "b", "p"]);
        this.promoteablePieces = data.promoteablePieces ?? ["p"];
        this.isMandatoryPromotion = data.isMandatoryPromotion ?? alwaysMandatory;
        this.timeControl = data.timeControl ?? "incremental";
        this.counting = data.counting;
        this.materialPoint = data.materialPoint;
        this.enPassant = data.enPassant ?? false;
        this.autoPromoteable = this.promotionOrder.length > 2;
        this.drop = data.drop ?? false;
        this.gate = data.gate ?? false;
        this.pass = data.pass ?? false;
        this.showPromoted = data.showPromoted ?? false;
        this.materialDifference = data.materialDifference ?? !this.drop;
        this.initialMaterialImbalance = this.materialDifference ? calculateInitialImbalance(this) : {};

        this.alternateStart = data.alternateStart;

        this.chess960 = data.chess960 ?? false;

        this._icon = data.icon;
        this._icon960 = data.icon960 ?? data.icon;
        this.pieceSound = data.pieceSound ?? "regular";
    }

}

interface VariantConfig { // TODO explain what each parameter of the variant config means
    name: string;

    displayName?: string;

    tooltip: () => string;
    startFen: string;
    board: keyof typeof BOARD_FAMILIES;
    piece: keyof typeof PIECE_FAMILIES;

    firstColor?: ColorName;
    secondColor?: ColorName;
    pieceRoles: cg.PieceLetter[];
    pieceRoles2?: cg.PieceLetter[];
    pocketRoles?: cg.PieceLetter[];
    pocketRoles2?: cg.PieceLetter[];

    promotion?: PromotionType;
    promotionOrder?: PromotionSuffix[];
    promoteablePieces?: cg.PieceLetter[];
    isMandatoryPromotion?: MandatoryPromotionPredicate;
    timeControl?: string;
    counting?: string;
    materialPoint?: string;
    drop?: boolean;
    gate?: boolean;
    pass?: boolean;
    materialDifference?: boolean;
    pieceSound?: string;
    showPromoted?: boolean;

    enPassant?: boolean;
    alternateStart?: {[key:string]: string};
    chess960?: boolean;
    icon: string;
    icon960?: string;
}

export const VARIANTS: { [name: string]: Variant } = {
    chess: new Variant({
        name: "chess", tooltip: () => _("Chess, unmodified, as it's played by FIDE standards."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        board: "standard8x8", piece: "standard",
        pieceRoles: ["k", "q", "r", "b", "n", "p"],
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
        pieceRoles: ["k", "q", "r", "b", "n", "p"],
        pocketRoles: ["p", "n", "b", "r", "q"],
        enPassant: true, drop: true,
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
        pieceRoles: ["k", "q", "r", "b", "n", "p"],
        pocketRoles: ["n", "b", "r", "q", "k"],
        enPassant: true,
        icon: "S",
    }),

    atomic: new Variant({
        name: "atomic", tooltip: () => _("Pieces explode upon capture."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        board: "standard8x8", piece: "standard",
        pieceRoles: ["k", "q", "r", "b", "n", "p"],
        enPassant: true,
        pieceSound: "atomic",
        chess960: true, icon: "~", icon960: "\\",
    }),

    makruk: new Variant({
        name: "makruk", tooltip: () => _("Thai Chess. A game closely resembling the original Chaturanga. Similar to Chess but with a different queen and bishop."),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        board: "makruk8x8", piece: "makruk",
        pieceRoles: ["k", "s", "m", "n", "r", "p", "m~" as cg.PieceLetter],
        promotionOrder: ["m"],
        counting: "makruk",
        showPromoted: true,
        icon: "Q",
    }),

    makpong: new Variant({
        name: "makpong", tooltip: () => _("Makruk variant where kings cannot move to escape out of check."),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        board: "makruk8x8", piece: "makruk",
        pieceRoles: ["k", "s", "m", "n", "r", "p", "m~" as cg.PieceLetter],
        promotionOrder: ["m"],
        counting: "makruk",
        showPromoted: true,
        icon: "O",
    }),

    cambodian: new Variant({
        name: "cambodian", displayName: "ouk chatrang", tooltip: () => _("Cambodian Chess. Makruk with a few additional opening abilities."),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w DEde - 0 1",
        board: "makruk8x8", piece: "makruk",
        pieceRoles: ["k", "s", "m", "n", "r", "p", "m~" as cg.PieceLetter],
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
        pieceRoles: ["k", "f", "s", "n", "r", "p"],
        pocketRoles: ["r", "n", "s", "f", "k"],
        promotionOrder: ["f"],
        counting: "asean",
        icon: ":",
    }),

    asean: new Variant({
        name: "asean", tooltip: () => _("Makruk using the board/pieces from International Chess as well as pawn promotion rules."),
        startFen: "rnbqkbnr/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR w - - 0 1",
        board: "standard8x8", piece: "asean",
        pieceRoles: ["k", "q", "b", "n", "r", "p"],
        promotionOrder: ["r", "n", "b", "q"],
        counting: "asean",
        icon: "♻",
    }),

    shogi: new Variant({
        name: "shogi", tooltip: () => _("Japanese Chess, and the standard 9x9 version played today with drops and promotions. "),
        startFen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1",
        board: "shogi9x9", piece: "shogi",
        firstColor: "Black", secondColor: "White",
        pieceRoles: ["k", "g", "r", "b", "s", "n", "l", "p"],
        pocketRoles: ["p", "l", "n", "s", "g", "b", "r"],
        promotion: "shogi",
        promoteablePieces: ["p", "l", "n", "s", "r", "b"],
        isMandatoryPromotion: distanceBased({ p: 1, l: 1, n: 2 }, 9),
        timeControl: "byoyomi",
        pieceSound: "shogi",
        drop: true,
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
        pieceRoles: ["k", "g", "r", "b", "s", "p"],
        pocketRoles: ["p", "s", "g", "b", "r"],
        promotion: "shogi",
        promoteablePieces: ["p", "s", "r", "b"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 5),
        timeControl: "byoyomi",
        pieceSound: "shogi",
        drop: true,
        icon: "6",
    }),

    kyotoshogi: new Variant({
        name: "kyotoshogi", displayName: "kyoto shogi", tooltip: () => _("A wild Shogi variant on a 5x5 board where pieces flip into a different piece after each move."),
        startFen: "p+nks+l/5/5/5/+LSK+NP[-] w 0 1",
        board: "shogi5x5", piece: "kyoto",
        firstColor: "Black", secondColor: "White",
        pieceRoles: ["k", "l", "s", "n", "p"],
        pocketRoles: ["p", "l", "n", "s"],
        promotion: "kyoto",
        promoteablePieces: ["p", "l", "n", "s"],
        isMandatoryPromotion: (_role: cg.Role, orig: cg.Key, _dest: cg.Key, _color: cg.Color) => orig !== 'a0',
        timeControl: "byoyomi",
        pieceSound: "shogi",
        drop: true,
        icon: ")",
    }),

    dobutsu: new Variant({
        name: "dobutsu", tooltip: () => _("3x4 game with cute animals, designed to teach children how to play Shogi."),
        startFen: "gle/1c1/1C1/ELG[-] w 0 1",
        board: "shogi3x4", piece: "dobutsu",
        firstColor: "Black", secondColor: "White",
        pieceRoles: ["l", "g", "e", "c"],
        pocketRoles: ["e", "g", "c"],
        promotion: "shogi",
        promoteablePieces: ["c"],
        timeControl: "byoyomi",
        pieceSound: "shogi",
        drop: true,
        icon: "8",
    }),

    gorogoro: new Variant({
        name: "gorogoro", tooltip: () => _("5x6 Shogi designed to introduce tactics with the generals."),
        startFen: "sgkgs/5/1ppp1/1PPP1/5/SGKGS[-] w 0 1",
        board: "shogi5x6", piece: "shogi",
        firstColor: "Black", secondColor: "White",
        pieceRoles: ["k", "g", "s", "p"],
        pocketRoles: ["p", "s", "g"],
        promotion: "shogi",
        promoteablePieces: ["p", "s"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 6),
        timeControl: "byoyomi",
        pieceSound: "shogi",
        drop: true,
        icon: "🐱",
    }),

    torishogi: new Variant({
        name: "torishogi", displayName: "tori shogi", tooltip: () => _("A confrontational 7x7 variant with unique pieces each named after different birds."),
        startFen: "rpckcpl/3f3/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR[-] w 0 1",
        board: "shogi7x7", piece: "tori",
        firstColor: "Black", secondColor: "White",
        pieceRoles: ["k", "c", "p", "l", "r", "f", "s"],
        pocketRoles: ["s", "p", "l", "r", "c", "f"],
        promotion: "shogi",
        promoteablePieces: ["s", "f"],
        timeControl: "byoyomi",
        pieceSound: "shogi",
        drop: true,
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
        pieceRoles: ["k", "a", "c", "r", "b", "n", "p"],
        promoteablePieces: [],
        icon: "|",
    }),

    manchu: new Variant({
        name: "manchu", tooltip: () => _("Xiangqi variant where one side has a chariot that can also move as a cannon or horse."),
        startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/9/9/M1BAKAB2 w - - 0 1",
        board: "xiangqi9x10", piece: "xiangqi",
        firstColor: "Red", secondColor: "Black",
        pieceRoles: ["k", "a", "m", "b", "p"],
        pieceRoles2: ["k", "a", "c", "r", "b", "n", "p"],
        promoteablePieces: [],
        icon: "{",
    }),

    janggi: new Variant({
        name: "janggi", tooltip: () => _("Korean Chess, similar to Xiangqi but plays much differently. Tournament rules are used."),
        startFen: "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1",
        board: "janggi9x10", piece: "janggi",
        firstColor: "Blue", secondColor: "Red",
        pieceRoles: ["k", "a", "c", "r", "b", "n", "p"],
        promoteablePieces: [],
        timeControl: "byoyomi",
        materialPoint: "janggi",
        pass: true,
        icon: "=",
    }),

    minixiangqi: new Variant({
        name: "minixiangqi", tooltip: () => _("Compact version of Xiangqi played on a 7x7 board without a river."),
        startFen: "rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR w - - 0 1",
        board: "xiangqi7x7", piece: "xiangqi",
        firstColor: "Red", secondColor: "Black",
        pieceRoles: ["k", "c", "r", "n", "p"],
        promoteablePieces: [],
        icon: "7",
    }),

    capablanca: new Variant({
        name: "capablanca", tooltip: () => _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a 10x8 board."),
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceRoles: ["k", "q", "c", "a", "r", "b", "n", "p"],
        enPassant: true,
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1',
            'Carrera': 'rcnbqkbnar/pppppppppp/10/10/10/10/PPPPPPPPPP/RCNBQKBNAR w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1',
            'Conservative': 'arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC w KQkq - 0 1'
        },
        chess960: true, icon: "P", icon960: ",",
    }),

    capahouse: new Variant({
        name: "capahouse", tooltip: () => _("Capablanca with Crazyhouse drop rules."),
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR[] w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceRoles: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketRoles: ["p", "n", "b", "r", "a", "c", "q"],
        enPassant: true, drop: true,
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1',
            'Carrera': 'rcnbqkbnar/pppppppppp/10/10/10/10/PPPPPPPPPP/RCNBQKBNAR w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1'
        },
        chess960: true, icon: "&", icon960: "'",
    }),

    seirawan: new Variant({
        name: "seirawan", displayName: "s-chess", tooltip: () => _("Hybrid pieces, the hawk (B+N) and elephant (R+N), can enter the board after moving a back rank piece."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        board: "standard8x8", piece: "seirawan",
        pieceRoles: ["k", "q", "e", "h", "r", "b", "n", "p"],
        pocketRoles: ["h", "e"],
        enPassant: true, gate: true,
        icon: "L",  chess960: true, icon960: "}",
    }),

    shouse: new Variant({
        name: "shouse", displayName: "s-house", tooltip: () => _("S-Chess with Crazyhouse drop rules."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        board: "standard8x8", piece: "seirawan",
        pieceRoles: ["k", "q", "e", "h", "r", "b", "n", "p"],
        pocketRoles: ["p", "n", "b", "r", "h", "e", "q"],
        enPassant: true, drop: true, gate: true,
        icon: "$",
    }),

    grand: new Variant({
        name: "grand", tooltip: () => _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a grand 10x10 board."),
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1",
        board: "grand10x10", piece: "capa",
        pieceRoles: ["k", "q", "c", "a", "r", "b", "n", "p"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 10),
        enPassant: true,
        icon: "(",
    }),

    grandhouse: new Variant({
        name: "grandhouse", tooltip: () => _("Grand Chess with Crazyhouse drop rules."),
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R[] w - - 0 1",
        board: "grand10x10", piece: "capa",
        pieceRoles: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketRoles: ["p", "n", "b", "r", "a", "c", "q"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 10),
        enPassant: true, drop: true,
        icon: "*",
    }),

    shako: new Variant({
        name: "shako", tooltip: () => _("Introduces the cannon and elephant from Xiangqi into a 10x10 chess board."),
        startFen: "c8c/ernbqkbnre/pppppppppp/10/10/10/10/PPPPPPPPPP/ERNBQKBNRE/C8C w KQkq - 0 1",
        board: "standard10x10", piece: "shako",
        pieceRoles: ["k", "q", "e", "c", "r", "b", "n", "p"],
        promotionOrder: ["q", "n", "c", "r", "e", "b"],
        enPassant: true,
        icon: "9",
    }),

    shogun: new Variant({
        name: "shogun", tooltip: () => _("Pieces promote and can be dropped, similar to Shogi."),
        startFen: "rnb+fkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB+FKBNR w KQkq - 0 1",
        board: "shogun8x8", piece: "shogun",
        pieceRoles: ["k", "f", "r", "b", "n", "p"],
        pocketRoles: ["p", "n", "b", "r", "f"],
        promotion: "shogi",
        promoteablePieces: ["p", "f", "r", "b", "n"],
        isMandatoryPromotion: distanceBased({ p: 1 }, 8),
        timeControl: "byoyomi",
        enPassant: true, drop: true,
        icon: "-",
    }),

    hoppelpoppel: new Variant({
        name: "hoppelpoppel", displayName: "hoppel-poppel", tooltip: () => _("Knights capture as bishops; bishops  capture as knights."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        board: "standard8x8", piece: "hoppel",
        pieceRoles: ["k", "q", "r", "b", "n", "p"],
        enPassant: true,
        icon: "`",
    }),

    orda: new Variant({
        name: "orda", tooltip: () => _("Asymmetric variant where one army has pieces that move like knights but capture differently."),
        startFen: "lhaykahl/8/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",
        board: "standard8x8", piece: "orda",
        firstColor: "White", secondColor: "Gold",
        pieceRoles: ["k", "q", "r", "b", "n", "p", "h"],
        pieceRoles2: ["k", "y", "l", "a", "h", "p", "q"],
        promotionOrder: ["q", "h"],
        enPassant: true,
        //materialDifference: false,
        icon: "R",
    }),

    synochess: new Variant({
        name: "synochess", tooltip: () => _("Asymmetric East vs. West variant which pits the western Chess army against a Xiangqi and Janggi-styled army."),
        startFen: "rneakenr/8/1c4c1/1ss2ss1/8/8/PPPPPPPP/RNBQKBNR[ss] w KQ - 0 1",
        board: "standard8x8", piece: "synochess",
        firstColor: "White", secondColor: "Red",
        pieceRoles: ["k", "q", "r", "b", "n", "p"],
        pieceRoles2: ["k", "a", "c", "r", "e", "n", "s"],
        pocketRoles: [], pocketRoles2: ["s"],
        materialDifference: false,
        icon: "_",
    }),

    shinobi: new Variant({
        name: "shinobi", tooltip: () => _("Asymmetric variant which pits the western Chess army against a drop-based, Shogi-styled army."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/LH1CK1HL[LHMMDJ] w kq - 0 1",
        board: "standard8x8", piece: "shinobi",
        firstColor: "Pink", secondColor: "Black",
        pieceRoles: ["k", "d", "j", "c", "l", "h", "m", "p"],
        pieceRoles2: ["k", "q", "r", "b", "n", "p"],
        pocketRoles: ["l", "h", "m", "d", "j"],
        pocketRoles2: [],
        promotion: "shogi",
        promoteablePieces: ["p", "l", "h", "m"],
        enPassant: true,
        //materialDifference: false,
        icon: "🐢",
    }),

    empire: new Variant({
        name: "empire", tooltip: () => _("Asymmetric variant where one army has pieces that move like queens but capture as usual."),
        startFen: "rnbqkbnr/pppppppp/8/8/8/PPPSSPPP/8/TECDKCET w kq - 0 1",
        board: "standard8x8", piece: "empire",
        firstColor: "Gold", secondColor: "Black",
        pieceRoles: ["k", "d", "t", "c", "e", "p", "s", "q"],
        pieceRoles2: ["k", "q", "r", "b", "n", "p"],
        enPassant: true,
        //materialDifference: false,
        icon: "♚",
    }),

    ordamirror: new Variant({
        name: "ordamirror", displayName: "orda mirror", tooltip: () => _("Orda Chess variant with two Horde armies. The Falcon replaces the Yurt."),
        startFen: "lhafkahl/8/pppppppp/8/8/PPPPPPPP/8/LHAFKAHL w - - 0 1",
        board: "standard8x8", piece: "ordamirror",
        firstColor: "White", secondColor: "Gold",
        pieceRoles: ["k", "f", "l", "a", "h", "p"],
        promotionOrder: ["h", "l", "f", "a"],
        icon: "◩",
    }),

    chak: new Variant({
        name: "chak", tooltip: () => _("https://www.chessvariants.com/rules/chak"),
        startFen: "rvbqkjbvr/4o4/p1p1p1p1p/9/9/9/P1P1P1P1P/4O4/RVBJKQBVR w - - 0 1",
        board: "chak9x9", piece: "chak",
        firstColor: "White", secondColor: "Black",
        pieceRoles: ["r", "v", "b", "q", "k", "j", "o", "p"],
        promotion: "shogi",
        promoteablePieces: ["p", "k"],
        icon: "🐬",
    }),

    // We support to import/store/analyze some variants
    // but don't want to add them to leaderboard page
    embassy: new Variant({
        name: "embassy", tooltip: () => _("Like Capablanca Chess but with Grand starting setup."),
        startFen: "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceRoles: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketRoles: ["p", "n", "b", "r", "a", "c", "q"],
        enPassant: true,
        icon: "P",
    }),

    gothic: new Variant({
        name: "gothic", tooltip: () => _("Like Capablanca Chess but with a different starting setup."),
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceRoles: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketRoles: ["p", "n", "b", "r", "a", "c", "q"],
        enPassant: true,
        icon: "P",
    }),

    gothhouse: new Variant({
        name: "gothhouse", tooltip: () => _("Gothic with Crazyhouse drop rules."),
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceRoles: ["k", "q", "c", "a", "r", "b", "n", "p"],
        pocketRoles: ["p", "n", "b", "r", "a", "c", "q"],
        enPassant: true, drop: true,
        icon: "P",
    }),
};

export const variants = Object.keys(VARIANTS);
const disabledVariants = [ "gothic", "gothhouse", "embassy" ];
export const enabledVariants = variants.filter(v => !disabledVariants.includes(v));

const variantGroups: { [ key: string ]: { variants: string[] } } = {
    standard: { variants: [ "chess", "crazyhouse", "placement", "atomic" ] },
    sea:      { variants: [ "makruk", "makpong", "cambodian", "sittuyin", "asean" ] },
    shogi:    { variants: [ "shogi", "minishogi", "kyotoshogi", "dobutsu", "gorogoro", "torishogi" ] },
    xiangqi:  { variants: [ "xiangqi", "manchu", "janggi", "minixiangqi" ] },
    fairy:    { variants: [ "capablanca", "capahouse", "seirawan", "shouse", "grand", "grandhouse", "shako", "shogun", "hoppelpoppel" ] },
    army:     { variants: [ "orda", "synochess", "shinobi", "empire", "ordamirror" ] },
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
    let good = startPlacement + ((variantName === "orda") ? "Hq" : "") + ((variantName === "dobutsu") ? "Hh" : "") + "~+0123456789[]";
    const alien = (element: string) => !good.includes(element);
    if (placement.split('').some(alien)) return false;

    // Brackets paired
    if (lc(placement, '[', false) !== lc(placement, ']', false)) return false;

    // Split board part and pocket part
    const leftBracketPos = placement.indexOf('[');
    const board = (leftBracketPos === -1) ? placement : placement.slice(0, leftBracketPos);
    //const pocket = placement.slice(leftBracketPos);
    //const startLeftBracketPos = start.indexOf('[');
    //const startBoard = startPlacement.slice(0, startLeftBracketPos);
    //const startPocket = startPlacement.slice(startLeftBracketPos);

    // Convert FEN board to board array
    const toBoardArray = (board: string) => {
        const toRowArray = (row: string) => {
            const stuffedRow = row.replace('10', '_'.repeat(10)).replace(/\d/g, (x: string) => '_'.repeat(parseInt(x)) );
            const rowArray : string[] = [];
            let promoted = false;
            for (const c of stuffedRow) {
                switch (c) {
                    case '+':
                        promoted = true;
                        break;
                    case '~':
                        rowArray[rowArray.length - 1] = rowArray[rowArray.length - 1] + '~';
                        break;
                    default:
                        if (promoted) {
                            rowArray.push('+' + c);
                            promoted = false;
                        }
                        else
                            rowArray.push(c);
                }
            }
            return rowArray;
        };
        return board.split('/').map(toRowArray);
    };

    const boardArray = toBoardArray(board);
    //const startBoardArray = toBoardArray(startBoard);

    // Correct board size
    const boardHeight = cg.dimensions[variant.geometry].height;
    const boardWidth = cg.dimensions[variant.geometry].width;

    if (boardArray.length !== boardHeight) return false;
    if (boardArray.some((row: string[]) => row.length !== boardWidth)) return false;

    // Starting colors
    if (parts[1] !== 'b' && parts[1] !== 'w') return false;

    // Castling rights (piece virginity)
    good = (variantName === 'seirawan' || variantName === 'shouse') ? 'KQABCDEFGHkqabcdefgh-' : start[2] + "-";
    const wrong = (element: string) => {good.indexOf(element) === -1;};
    if (parts.length > 2 && variantName !== 'dobutsu') {
        if (parts[2].split('').some(wrong)) return false;

        // TODO: Checking S-chess960 FEN is tricky
        // Editor and Analysis board needs chess960 checkbox similar to new game dialog first

        // It is better to enable castling right validation for seirawan and shouse as well to be safe
        //if (variantName !== 'seirawan' && variantName !== 'shouse') {
            // Castling right need rooks and king placed in starting square
            // capablanca: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
            // shako: "c8c/ernbqkbnre/pppppppppp/10/10/10/10/PPPPPPPPPP/ERNBQKBNRE/C8C w KQkq - 0 1",
            const rookPos = {
                K: (variantName === 'shako') ? boardArray[boardHeight - 2][boardWidth - 2] : boardArray[boardHeight - 1][boardWidth - 1],
                Q: (variantName === 'shako') ? boardArray[boardHeight - 2][1] : boardArray[boardHeight - 1][0],
                k: (variantName === 'shako') ? boardArray[1][boardWidth - 2] : boardArray[0][boardWidth - 1],
                q: (variantName === 'shako') ? boardArray[1][1] : boardArray[0][0],
            };

            for (const c of parts[2]) {
                switch (c) {
                    case 'K':
                    case 'Q':
                        if (rookPos[c] !== 'R') return false;
                        // TODO check king position
                        break;
                    case 'k':
                    case 'q':
                        if (rookPos[c] !== 'r') return false;
                        // TODO check king position
                        break;
                        // TODO Column-based right
                }
            }
        //}
    }

    // Number of kings
    const king = (variantName === "dobutsu") ? "l" : "k";
    if (lc(placement, king, false) !== 1 || lc(placement, king, true) !== 1) return false;

    // Touching kings
    const pieces = read(parts[0]);
    if (variantName !== 'atomic' && touchingKings(pieces)) return false;

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
    const countingType = (countingLimit === 0) ? 'none' : ((whitePieces > 1 && blackPieces > 1) ? 'board' : 'piece');

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
    if (!piece.promoted && variant.promoteablePieces.includes(util.letterOf(piece.role))) {
        switch (variant.promotion) {
            case 'shogi':
            case 'kyoto':
                return 'p' + piece.role as cg.Role;
            default:
                return util.roleOf(variant.promotionOrder[0] as cg.PieceLetter);
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
