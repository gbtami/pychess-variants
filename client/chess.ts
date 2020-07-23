import { Color, dimensions, Geometry, Role } from 'chessgroundx/types';

import { read } from 'chessgroundx/fen';

import { _ } from './i18n';

export const variants = ["makruk", "makpong", "cambodian", "sittuyin", "placement", "crazyhouse", "chess", "shogi", "minishogi", "kyotoshogi", "janggi", "xiangqi", "minixiangqi", "capablanca", "seirawan", "capahouse", "shouse", "grand", "grandhouse", "gothic", "gothhouse", "shako", "shogun", "orda", "synochess"];
export const variants960 = ["crazyhouse", "chess", "capablanca", "capahouse"];

export const enabled_variants = ["makruk", "makpong", "cambodian", "sittuyin", "placement", "crazyhouse", "chess", "shogi", "minishogi", "kyotoshogi", "janggi", "xiangqi", "minixiangqi", "capablanca", "seirawan", "capahouse", "shouse", "grand", "grandhouse", "gothic", "shako", "shogun", "orda", "synochess"];

export interface BoardFamily {
    geometry: Geometry;
    cg: string;
    boardCSS: string[];
}

export interface PieceFamily {
    pieceCSS: string[];
    baseURL: string[];
}

export const BOARD_FAMILIES: { [key: string]: BoardFamily } = {
    standard8x8: { geometry: Geometry.dim8x8, cg: "cg-512", boardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg"] },
    standard10x8: { geometry: Geometry.dim10x8, cg: "cg-640", boardCSS: ["10x8brown.svg", "10x8blue.svg", "10x8green.svg", "10x8maple.jpg", "10x8olive.jpg"] },
    standard10x10: { geometry: Geometry.dim10x10, cg: "cg-640-640", boardCSS: ["10x10brown.svg", "10x10blue.svg", "10x10green.svg", "10x10maple.jpg", "10x10olive.jpg"] },
    grand10x10: { geometry: Geometry.dim10x10, cg: "cg-640-640", boardCSS: ["Grandboard.svg", "10x10brown.svg", "10x10blue.svg", "10x10green.svg", "10x10maple.jpg", "10x10mapleGrand.png"] },
    makruk8x8: { geometry: Geometry.dim8x8, cg: "cg-512", boardCSS: ["makruk2.svg", "makruk.svg", "makruk.jpg"] },
    sittuyin8x8: { geometry: Geometry.dim8x8, cg: "cg-512", boardCSS: ["sittuyin.svg", "sittuyin.jpg", "sittuyingreen.svg", "sittuyinGrainBrown.svg"] },
    shogi9x9: { geometry: Geometry.dim9x9, cg: "cg-576", boardCSS: ["shogi.svg", "Shogiban1.png", "Shogiban2.png", "shogic.svg", "ShogiMaple.png", "doubutsu.svg"] },
    shogi5x5: { geometry: Geometry.dim5x5, cg: "cg-260", boardCSS: ["minishogi.svg", "MiniboardWood1.png", "MiniboardWood2.png"] },
    xiangqi9x10: { geometry: Geometry.dim9x10, cg: "cg-576-640", boardCSS: ["xiangqi.svg", "xiangqic.svg", "xiangqiCTexture.png", "xiangqiPaper.png", "xiangqiWood.png", "xiangqiDark.svg"] },
    xiangqi7x7: { geometry: Geometry.dim7x7, cg: "cg-448", boardCSS: ["minixiangqi.svg", "minixiangqiw.png", "minixqlg.svg"] },
    janggi9x10: { geometry: Geometry.dim9x10, cg: "cg-576-640", boardCSS: ["Janggi.svg", "JanggiPaper.png", "JanggiWood.png", "JanggiDark.svg", "JanggiBrown.svg"] },
    shogun8x8: { geometry: Geometry.dim8x8, cg: "cg-512", boardCSS: ["ShogunPlain.svg", "ShogunMaple.png", "ShogunMaple2.png", "ShogunBlue.svg", "8x8brown.svg", "8x8maple.jpg"] },
};

export const PIECE_FAMILIES: { [key: string]: PieceFamily } = {
    standard: { pieceCSS: ["standard", "green", "alpha", "chess_kaneo"], baseURL: ["merida", "green", "alpha", "kaneo"] },
    capa: { pieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4"], baseURL: ["capa", "seir", "green", "musk", "kaneo"] },
    seirawan: { pieceCSS: ["seir1", "seir0", "seir2", "seir3", "seir4"], baseURL: ["seir", "capa", "green", "musk", "kaneo"] },
    makruk: { pieceCSS: ["makrukwb", "makrukwr", "makruk", "makruks", "makruki"], baseURL: ["makruk/ada/wb", "makruk/ada/wr", "makruk/cambodian", "sittuyin/original", "makruk/intl"] },
    sittuyin: { pieceCSS: ["sittuyins", "sittuyinkagr", "sittuyinkabr", "sittuyinm", "sittuyini"], baseURL: ["sittuyin/original", "sittuyin/Ka_blackred", "sittuyin/Ka_greenred", "makruk/ada", "makruk/intl"] },
    shogi: { pieceCSS: ["shogi0k", "shogi0", "shogi0w", "shogi0p", "shogi0m", "shogi0d"], baseURL: ["shogi/ctk", "shogi/2kanji", "shogi/ctw", "shogi/ctp", "shogi/ctm", "shogi/Ka"] },
    kyoto: { pieceCSS: ["kyoto0", "kyoto0k", "kyoto0i"], baseURL: ["shogi", "kyoto/Kanji", "kyoto/Intl"] },
    xiangqi: { pieceCSS: ["xiangqi", "xiangqict3", "xiangqict2", "xiangqihnz", "xiangqict2w", "xiangqihnzw"], baseURL: ["xiangqi/playok", "xiangqi/ct3", "xiangqi/ct2", "xiangqi/hnz", "xiangqi/ct2w", "xiangqi/hnzw"] },
    janggi: { pieceCSS: ["janggihb", "janggihg", "janggiib", "janggiig"], baseURL: ["janggi/hanjablue", "janggi/hanjagreen", "janggi/intlblue", "janggi/intlgreen"] },
    shako: { pieceCSS: ["shako0", "shako1"], baseURL: ["shako", "kaneo"] },
    shogun: { pieceCSS: ["shogunb", "shogunr", "shogunw"], baseURL: ["shogun/blue", "shogun/red", "shogun/white"] },
    orda: { pieceCSS: ["orda0"], baseURL: ["orda"] },
    synochess: { pieceCSS: ["synochess0", "synochess1", "synochess2", "synochess3", "synochess4", "synochess5"], baseURL: ["synochess/intl", "synochess/xq", "xiangqi/playok", "xiangqi/hnz", "xiangqi/hnzw", "synochess/blackdisc"] },
};

export interface IVariant {
    readonly name: string;
    readonly displayName: (chess960: boolean) => string;
    readonly tooltip: string;

    readonly startFen: string;

    readonly board: string;
    readonly geometry: Geometry;
    readonly cg: string;
    readonly boardCSS: string[];

    readonly piece: string;
    readonly pieceCSS: string[];
    readonly pieceBaseURL: string[];

    readonly firstColor: string;
    readonly secondColor: string;

    readonly pieceRoles: (color: Color) => Role[];
    readonly hasPocket: boolean;
    readonly pocketRoles: (color: Color) => Role[] | null;

    readonly has960: boolean;

    readonly icon: (chess960: boolean) => string;
}

class Variant implements IVariant {
    readonly name: string;
    private readonly _displayName: string;
    displayName(chess960: boolean = false) { return this._displayName + (chess960 ? "960" : ""); }
    readonly tooltip: string;
    readonly startFen: string;

    readonly board: string;
    private readonly boardFamily: BoardFamily;
    get geometry() { return this.boardFamily.geometry; }
    get cg() { return this.boardFamily.cg; }
    get boardCSS() { return this.boardFamily.boardCSS; }

    readonly piece: string;
    private readonly pieceFamily: PieceFamily;
    get pieceCSS() { return this.pieceFamily.pieceCSS; }
    get pieceBaseURL() { return this.pieceFamily.baseURL; }

    private readonly _colors: [ string, string ];
    get firstColor() { return this._colors[0]; }
    get secondColor() { return this._colors[1]; }

    private readonly _pieceRoles: [ Role[], Role[] ];
    pieceRoles(color: Color) { return color === "white" ? this._pieceRoles[0] : this._pieceRoles[1]; }
    readonly hasPocket: boolean;
    private readonly _pocketRoles: [ Role[] | null, Role[] | null ];
    pocketRoles(color: Color) { return color === "white" ? this._pocketRoles[0] : this._pocketRoles[1]; }

    readonly has960: boolean;
    private readonly _icon: string;
    private readonly _icon960: string;
    icon(chess960: boolean = false) { return chess960 ? this._icon960 : this._icon; }

    constructor(
        name: string, displayName: string | null, tooltip: string,
        startFen: string,
        board: string, piece: string,
        color1: string, color2: string,
        pieceRoles1: Role[], pieceRoles2: Role[] | null,
        hasPocket: boolean, pocketRoles1: Role[] | null, pocketRoles2: Role[] | null,
        has960: boolean, icon: string, icon960: string | null,
    ) {
        this.name = name;
        this._displayName = displayName ?? name;
        this.tooltip = tooltip;
        this.startFen = startFen;

        this.board = board;
        this.boardFamily = BOARD_FAMILIES[board];

        this.piece = piece;
        this.pieceFamily = PIECE_FAMILIES[piece];

        this._colors = [ color1, color2 ];
        this._pieceRoles = [ pieceRoles1, pieceRoles2 ?? pieceRoles1 ];
        this.hasPocket = hasPocket;
        this._pocketRoles = [ pocketRoles1, pocketRoles2 ?? pocketRoles1 ];

        this.has960 = has960;

        this._icon = icon;
        this._icon960 = icon960 ?? icon;
    }

}

export const VARIANTS: { [name: string]: IVariant } = {
    chess: new Variant(
        "chess", null, _("Chess, unmodified, as it's played by FIDE standards"),
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "standard8x8", "standard",
        "White", "Black",
        ["king", "queen", "rook", "bishop", "knight", "pawn"], null,
        false, null, null,
        true, "M", "V",
    ),

    crazyhouse: new Variant(
        "crazyhouse", null, _("Take captured pieces and drop them back on to the board as your own"),
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1",
        "standard8x8", "standard",
        "White", "Black",
        ["king", "queen", "rook", "bishop", "knight", "pawn"], null,
        true, ["pawn", "knight", "bishop", "rook", "queen"], null,
        true, "+", "%",
    ),

    placement: new Variant(
        "placement", null, _("Choose where your pieces start"),
        "8/pppppppp/8/8/8/8/PPPPPPPP/8[KQRRBBNNkqrrbbnn] w - - 0 1",
        "standard8x8", "standard",
        "White", "Black",
        ["king", "queen", "rook", "bishop", "knight", "pawn"], null,
        true, ["knight", "bishop", "rook", "queen", "king"], null,
        false, "S", null,
    ),

    
    makruk: new Variant(
        "makruk", null, _("A game closely resembling the original Chaturanga"),
        "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        "makruk8x8", "makruk",
        "White", "Black",
        ["king", "silver", "met", "knight", "rook", "pawn", "ferz"], null,
        false, null, null,
        false, "Q", null,
    ),

    makpong: new Variant(
        "makpong", null, _("Makruk variant where kings cannot move to escape out of check"),
        "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        "makruk8x8", "makruk",
        "White", "Black",
        ["king", "silver", "met", "knight", "rook", "pawn", "ferz"], null,
        false, null, null,
        false, "O", null,
    ),

    cambodian: new Variant(
        "cambodian", "ouk chatrang", _("Makruk with a few additional opening abilities"),
        "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w DEde - 0 1",
        "makruk8x8", "makruk",
        "White", "Black",
        ["king", "silver", "met", "knight", "rook", "pawn", "ferz"], null,
        false, null, null,
        false, "!", null,
    ),

    sittuyin: new Variant(
        "sittuyin", null, _("Similar to Makruk, but pieces are placed at the start of the match"),
        "8/8/4pppp/pppp4/4PPPP/PPPP4/8/8[KFRRSSNNkfrrssnn] w - - 0 1",
        "sittuyin8x8", "sittuyin",
        "Red", "Black",
        ["king", "ferz", "silver", "knight", "rook", "pawn"], null,
        true, ["rook", "knight", "silver", "ferz", "king"], null,
        false, ":", null,
    ),

    shogi: new Variant(
        "shogi", null, _("Pieces promote and can be dropped"),
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1",
        "shogi9x9", "shogi",
        "Black", "White",
        ["king", "rook", "bishop", "gold", "silver", "knight", "lance", "pawn"], null,
        true, ["pawn", "lance", "knight", "silver", "gold", "bishop", "rook"], null,
        false, "K", null,
    ),

    minishogi: new Variant(
        "minishogi", null, _("Shogi on a 5x5 board"),
        "rbsgk/4p/5/P4/KGSBR[-] w 0 1",
        "shogi5x5", "shogi",
        "Black", "White",
        ["king", "rook", "bishop", "gold", "silver", "pawn"], null,
        true, ["pawn", "silver", "gold", "bishop", "rook"], null,
        false, "6", null,
    ),

    kyotoshogi: new Variant(
        "kyotoshogi", null, _("5x5 Shogi where pieces flip to a different piece each move"),
        "p+nks+l/5/5/5/+LSK+NP[-] w 0 1",
        "shogi5x5", "kyoto",
        "Black", "White",
        ["king", "pknight", "silver", "plance", "pawn"], null,
        true, ["pawn", "lance", "knight", "silver"], null,
        false, ")", null,
    ),

    xiangqi: new Variant(
        "xiangqi", null, _("Open fire on your opponent in this highly aggressive ancient game"),
        "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1",
        "xiangqi9x10", "xiangqi",
        "Red", "Black",
        ["king", "advisor", "cannon", "rook", "bishop", "knight", "pawn"], null,
        false, null, null,
        false, "8", null,
    ),

    janggi: new Variant(
        "janggi", null, _("Similar to Xiangqi, but plays very differently. Tournament rules are used"),
        "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1",
        "janggi9x10", "janggi",
        "Blue", "Red",
        ["king", "advisor", "cannon", "rook", "bishop", "knight", "pawn"], null,
        false, null, null,
        false, "=", null,
    ),

    minixiangqi: new Variant(
        "minixiangqi", null, _("Xiangqi on a 7x7 board"),
        "rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR w - - 0 1",
        "xiangqi7x7", "xiangqi",
        "Red", "Black",
        ["king", "cannon", "rook", "knight", "pawn"], null,
        false, null, null,
        false, "7", null,
    ),

    capablanca: new Variant(
        "capablanca", null, _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a 10x8 board"),
        "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
        "standard10x8", "capa",
        "White", "Black",
        ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"], null,
        false, null, null,
        true, "P", ",",
    ),

    capahouse: new Variant(
        "capahouse", null, _("Capablanca with Crazyhouse drop rules"),
        "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR[] w KQkq - 0 1",
        "standard10x8", "capa",
        "White", "Black",
        ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"], null,
        true, ["pawn", "knight", "bishop", "rook", "archbishop", "cancellor", "queen"], null,
        true, "&", "'",
    ),

    seirawan: new Variant(
        "seirawan", "s-chess", _("Hybrid pieces, the hawk (B+N) and elephant (R+N) can enter the board after moving a back rank piece"),
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        "standard8x8", "seirawan",
        "White", "Black",
        ["king", "queen", "elephant", "hawk", "rook", "bishop", "knight", "pawn"], null,
        true, ["hawk", "elephant"], null,
        false, "L", null,
    ),

    shouse: new Variant(
        "shouse", "s-house", _("S-Chess with Crazyhouse drop rules"),
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        "standard8x8", "seirawan",
        "White", "Black",
        ["king", "queen", "elephant", "hawk", "rook", "bishop", "knight", "pawn"], null,
        true, ["pawn", "knight", "bishop", "rook", "hawk", "elephant", "queen"], null,
        false, "$", null,
    ),

    grand: new Variant(
        "grand", null, _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a *grand* 10x10 board"),
        "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1",
        "grand10x10", "capa",
        "White", "Black",
        ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"], null,
        false, null, null,
        false, "(", null,
    ),

    grandhouse: new Variant(
        "grandhouse", null, _("Grand Chess with Crazyhouse drop rules"),
        "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R[] w - - 0 1",
        "grand10x10", "capa",
        "White", "Black",
        ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"], null,
        true, ["pawn", "knight", "bishop", "rook", "archbishop", "cancellor", "queen"], null,
        false, "(", null,
    ),

    gothic: new Variant(
        "gothic", null, _("Like Capablanca Chess but with a different starting setup"),
        "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1",
        "standard10x8", "capa",
        "White", "Black",
        ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"], null,
        false, null, null,
        false, "P", null,
    ),

    gothhouse: new Variant(
        "gothhouse", null, _("Gothic with Crazyhouse drop rules"),
        "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1",
        "standard10x8", "capa",
        "White", "Black",
        ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"], null,
        true, ["pawn", "knight", "bishop", "rook", "archbishop", "cancellor", "queen"], null,
        false, "P", null,
    ),

    shako: new Variant(
        "shako", null, _("Introduces the cannon and elephant from Xiangqi into a 10x10 chess board"),
        "c8c/ernbqkbnre/pppppppppp/10/10/10/10/PPPPPPPPPP/ERNBQKBNRE/C8C w KQkq - 0 1",
        "standard10x10", "shako",
        "White", "Black",
        ["king", "queen", "elephant", "cancellor", "rook", "bishop", "knight", "pawn"], null,
        false, null, null,
        false, "9", null,
    ),

    shogun: new Variant(
        "shogun", null, _("Pieces promote and can be dropped, similar to Shogi"),
        "rnb+fkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB+FKBNR w KQkq - 0 1",
        "shogun8x8", "shogun",
        "White", "Black",
        ["king", "pferz", "rook", "bishop", "knight", "pawn"], null,
        true, ["pawn", "knight", "bishop", "rook", "ferz"], null,
        false, "-", null,
    ),

    orda: new Variant(
        "orda", null, _("Asymmetric variant where one army has pieces that move like knights but capture differently"),
        "lhaykahl/8/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",
        "standard8x8", "orda",
        "White", "Gold",
        ["king", "queen", "rook", "bishop", "knight", "pawn", "hawk"], ["king", "yurt", "lancer", "archbishop", "hawk", "pawn", "queen"],
        false, null, null,
        false, "R", null,
    ),

    synochess: new Variant(
        "synochess", null,
        _("Asymmetric East vs. West variant which pits the western chess army against a xiangqi and janggi-styled army"),
        "rneakenr/8/1c4c1/1ss2ss1/8/8/PPPPPPPP/RNBQKBNR[ss] w KQ - 0 1",
        "standard8x8", "synochess",
        "White", "Black",
        ["king", "queen", "rook", "bishop", "knight", "pawn"], ["king", "archbishop", "cancellor", "rook", "elephant", "knight", "silver"],
        true, [], ["silver"],
        false, "_", null,
    ),
};

/**
 * Variant classes
 * Use these classes to check for characteristics of variants
 ** byoyomi: This variant uses byoyomi time control
 ** showCount: This variant displays the number of moves until the game is drawn to reflect verbally counting over the board
 ** manualCount: This variant lets player manually start counting moves to find draws
 ** showMaterialPoint: This variant displays material points for each player
 ** drop: This variant allows dropping captured pieces back to the board
 ** gate: This variant allows S-Chess style gating
 ** pocket: This variant needs to display the pieces in hand in round, analysis, and editor screen
 ** enPassant: This variant has en passant capture
 ** pass: This variant allows passing
 ** pieceDir: This variant uses piece direction, rather than color, to denote piece side
 ** shogiSound: This variant uses shogi piece move sound
 ** tenRanks: This variant has ten ranks and need to use the grand2zero function to fix its notation
 ** autoQueen: This variant utilises "Promote to queen automatically"
 **/
const variant_classes = {
    makruk: new Set(['showCount', 'manualCount']),
    makpong: new Set(['showCount', 'manualCount']),
    cambodian: new Set(['showCount', 'manualCount']),
    sittuyin: new Set(['showCount', 'pocket']),
    placement: new Set(['pocket', 'enPassant', 'autoQueen']),
    crazyhouse: new Set(['drop', 'pocket', 'enPassant', 'autoQueen']),
    chess: new Set(['enPassant', 'autoQueen']),
    shogi: new Set(['byoyomi', 'drop', 'pocket', 'pieceDir', 'shogiSound']),
    minishogi: new Set(['byoyomi', 'drop', 'pocket', 'pieceDir', 'shogiSound']),
    kyotoshogi: new Set(['byoyomi', 'drop', 'pocket', 'pieceDir', 'shogiSound']),
    janggi: new Set(['byoyomi', 'showMaterialPoint', 'pass', 'tenRanks']),
    xiangqi: new Set(['tenRanks']),
    minixiangqi: new Set([]),
    capablanca: new Set(['enPassant', 'autoQueen']),
    seirawan: new Set(['gate', 'pocket', 'enPassant', 'autoQueen']),
    capahouse: new Set(['drop', 'pocket', 'enPassant', 'autoQueen']),
    shouse: new Set(['gate', 'drop', 'pocket', 'enPassant', 'autoQueen']),
    grand: new Set(['enPassant', 'tenRanks', 'autoQueen']),
    grandhouse: new Set(['drop', 'pocket', 'enPassant', 'tenRanks', 'autoQueen']),
    gothic: new Set(['enPassant', 'autoQueen']),
    shako: new Set(['enPassant', 'tenRanks', 'autoQueen']),
    shogun: new Set(['byoyomi', 'drop', 'pocket', 'enPassant']),
    orda: new Set(['enPassant']),
    synochess: new Set(['pocket', 'enPassant']),
}

export function isVariantClass(variant: string, variantClass: string) {
    // variant can be upper case when called from lobby!
    return variant_classes[variant.toLowerCase()].has(variantClass);
}

export function needPockets(variant: string) {
    return isVariantClass(variant, 'pocket');
}

export function hasEp(variant: string) {
    return isVariantClass(variant, 'enPassant');
}

export function zero2grand(move) {
    const parts = move.split("");
    if (parts[1] !== "@")
        parts[1] = (Number(parts[1]) + 1).toString();
    parts[3] = (Number(parts[3]) + 1).toString();
    return parts.join("");
}

export function grand2zero(move) {
    // cut off promotion piece letter
    let promo = '';
    if (!'0123456789'.includes(move.slice(-1))) {
        promo = move.slice(-1);
        move = move.slice(0, -1);
    }
    const parts = move.split("");

    if (parts[1] === '@') {
        return parts[0] + parts[1] + parts[2] + (Number(move.slice(3)) - 1).toString();
    }
    if ('0123456789'.indexOf(parts[2]) !== -1) {
        parts[1] = (Number(parts[1] + parts[2]) -1).toString();
        parts[4] = (Number(move.slice(4)) - 1).toString();
        return parts[0] + parts[1] + parts[3] + parts[4] + promo;
    } else {
        parts[1] = (Number(parts[1]) -1).toString();
        parts[3] = (Number(move.slice(3)) - 1).toString();
        return parts[0] + parts[1] + parts[2] + parts[3] + promo;
    }
}

export function validFen(variantName: string, fen: string) {
    const variant = VARIANTS[variantName];
    const startfen = variant.startFen;
    const start = startfen.split(' ');
    const parts = fen.split(' ');

    // Need starting color
    if (parts.length < 2) return false;

    // Allowed characters in placement part
    const placement = parts[0];
    const startPlacement = start[0];
    let good = startPlacement + ((variantName === "orda") ? "Hq" : "") + "~+0123456789[]";
    const alien = element => !good.includes(element);
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
    const toBoardArray = board => {
        const toRowArray = row => {
            const stuffedRow = row.replace('10', '_'.repeat(10)).replace(/\d/g, x => '_'.repeat(parseInt(x)) );
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
    const boardHeight = dimensions[variant.geometry].height;
    const boardWidth = dimensions[variant.geometry].width;

    if (boardArray.length !== boardHeight) return false;
    if (boardArray.some(row => row.length !== boardWidth)) return false;

    // Starting colors
    if (parts[1] !== 'b' && parts[1] !== 'w') return false;

    // Castling rights (piece virginity)
    good = (variantName === 'seirawan' || variantName === 'shouse') ? 'KQABCDEFGHkqabcdefgh-' : start[2] + "-";
    const wrong = (element) => {good.indexOf(element) === -1;};
    if (parts.length > 2) {
        if (parts[2].split('').some(wrong)) return false;

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
    }

    // Number of kings
    if (lc(placement, 'k', false) !== 1 || lc(placement, 'k', true) !== 1) return false;

    // Touching kings
    const pieces = read(parts[0], variant.geometry);
    if (touchingKings(pieces)) return false;

    return true;
}

function diff(a: number, b:number):number {
    return Math.abs(a - b);
}

function touchingKings(pieces) {
    let wk = 'xx', bk = 'zz';
    Object.keys(pieces).filter(key => pieces[key].role === "king").forEach(key => {
        if (pieces[key].color === 'white') wk = key;
        if (pieces[key].color === 'black') bk = key;
    });
    const touching = diff(wk.charCodeAt(0), bk.charCodeAt(0)) <= 1 && diff(wk.charCodeAt(1), bk.charCodeAt(1)) <= 1;
    return touching;
}

// pocket part of the FEN (including brackets)
export function getPockets(fen: string) {
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
export function getJanggiPoints(board: string) {
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

export const roleToSan = {
    pawn: 'P',
    knight: 'N',
    bishop: 'B',
    rook: 'R',
    queen: 'Q',
    king: 'K',
    archbishop: 'A',
    cancellor: 'C',
    elephant: "E",
    hawk: "H",
    ferz: 'F',
    met: 'M',
    gold: 'G',
    silver: 'S',
    lance: 'L',
};

// Use cases
// 1. determine piece role from analysis suggested (SAN) drop moves
// 2. determine promotion piece roles from possible (UCI) promotion moves in grand, grandhouse, shako
export const sanToRole = {
    P: 'pawn',
    N: 'knight',
    B: 'bishop',
    R: 'rook',
    Q: 'queen',
    K: 'king',
    A: 'archbishop',
    C: 'cancellor',
    E: 'elephant',
    H: 'hawk',
    F: 'ferz',
    M: 'met',
    G: 'gold',
    S: 'silver',
    L: 'lance',
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
    a: 'archbishop',
    c: 'cancellor',
    e: 'elephant',
    h: 'hawk',
    f: 'ferz',
    m: 'met',
    g: 'gold',
    s: 'silver',
    l: 'lance',
    '+L': 'plance',
    '+N': 'gold',
    '+P': 'rook',
    '+S': 'bishop'
};

// Count given letter occurences in a string
export function lc(str: string, letter: string, uppercase: boolean) {
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

export const SHOGI_HANDICAP_NAME = ['', 'Lance HC', 'Bishop HC', 'Rook HC', 'Rook+Lance HC', '2-Piece HC', '4-Piece HC', '6-Piece HC', '8-Piece HC', '9-Piece HC', '10-Piece HC'];
export const SHOGI_HANDICAP_FEN = {
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
};

export const CAPA_SUB_NAME = ['', 'Bird', 'Carrera', 'Gothic', 'Embassy'];
export const CAPA_SUB_FEN = {
    '': '',
    'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1',
    'Carrera': 'rcnbqkbnar/pppppppppp/10/10/10/10/PPPPPPPPPP/RCNBQKBNAR w KQkq - 0 1',
    'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1',
    'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1'
};

export const WILD_SUB_NAME = ['', 'PawnsPushed', 'PawnsPassed', 'UpsideDown', 'Theban', 'No castle'];
export const WILD_SUB_FEN = {
    '': '',
    'PawnsPushed': "rnbqkbnr/8/8/pppppppp/PPPPPPPP/8/8/RNBQKBNR w - - 0 1",
    'PawnsPassed': "rnbqkbnr/8/8/PPPPPPPP/pppppppp/8/8/RNBQKBNR w - - 0 1",
    'UpsideDown': "RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr w - - 0 1",
    'Theban': "1p6/2p3kn/3p2pp/4pppp/5ppp/8/PPPPPPPP/PPPPPPKN w - - 0 1",
    'No castle': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1'
};
