import { h } from 'snabbdom/h';

import { Color, dimensions, Geometry, Role } from 'chessgroundx/types';
import { read } from 'chessgroundx/fen';

import { _ } from './i18n';

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
    janggi9x10: { geometry: Geometry.dim9x10, cg: "cg-576-640", boardCSS: ["JanggiBrown.svg", "JanggiPaper.png", "JanggiWood.png", "JanggiDark.svg", "JanggiWoodDark.svg", "JanggiStone.svg"] },
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
    janggi: { pieceCSS: ["janggihb", "janggihg", "janggiib", "janggiig", "janggikak", "janggikaw"], baseURL: ["janggi/hanjablue", "janggi/hanjagreen", "janggi/intlblue", "janggi/intlgreen", "janggi/Ka_kako", "janggi/Ka_wooden"] },
    shako: { pieceCSS: ["shako0", "shako1", "shako2"], baseURL: ["shako", "kaneo", "green"] },
    shogun: { pieceCSS: ["shogunb", "shogunr", "shogunw"], baseURL: ["shogun/blue", "shogun/red", "shogun/white"] },
    orda: { pieceCSS: ["orda0", "orda1"], baseURL: ["orda/merida", "orda/cburnett"] },
    synochess: { pieceCSS: ["synochess0", "synochess1", "synochess2", "synochess3", "synochess4", "synochess5"], baseURL: ["synochess/intl", "synochess/xq", "green", "xiangqi/hnz", "xiangqi/hnzw", "synochess/blackdisc"] },
    hoppel: { pieceCSS: ["hoppel0", "hoppel1"], baseURL: ["merida", "hoppel"] },
};

export interface IVariant {
    readonly name: string;
    readonly displayName: (chess960: boolean) => string;
    readonly tooltip: string;

    readonly startFen: string;

    readonly board: string;
    readonly geometry: Geometry;
    readonly boardWidth: number;
    readonly boardHeight: number;
    readonly cg: string;
    readonly boardCSS: string[];

    readonly piece: string;
    readonly pieceCSS: string[];
    readonly pieceBaseURL: string[];

    readonly firstColor: string;
    readonly secondColor: string;

    readonly pieceRoles: (color: Color) => Role[];
    readonly pocket: boolean;
    readonly pocketRoles: (color: Color) => Role[] | null;

    readonly promotion: string;
    readonly timeControl: string;
    readonly counting?: string;
    readonly materialPoint?: string;
    readonly sideDetermination: string;
    readonly enPassant: boolean;
    readonly autoQueenable: boolean;
    readonly drop: boolean;
    readonly gate: boolean;
    readonly pass: boolean;

    readonly alternateStart?: { [ name: string ]: string };

    readonly chess960: boolean;

    readonly icon: (chess960: boolean) => string;
    readonly pieceSound: string;
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
    get boardWidth() { return dimensions[this.geometry].width; }
    get boardHeight() { return dimensions[this.geometry].height; }
    get cg() { return this.boardFamily.cg; }
    get boardCSS() { return this.boardFamily.boardCSS; }

    readonly piece: string;
    private readonly pieceFamily: PieceFamily;
    get pieceCSS() { return this.pieceFamily.pieceCSS; }
    get pieceBaseURL() { return this.pieceFamily.baseURL; }

    readonly firstColor: string;
    readonly secondColor: string;

    private readonly _pieceRoles: [ Role[], Role[] ];
    pieceRoles(color: Color) { return color === "white" ? this._pieceRoles[0] : this._pieceRoles[1]; }
    readonly pocket: boolean;
    private readonly _pocketRoles: [ Role[] | null, Role[] | null ];
    pocketRoles(color: Color) { return color === "white" ? this._pocketRoles[0] : this._pocketRoles[1]; }

    readonly promotion: string;
    readonly timeControl: string;
    readonly counting?: string;
    readonly materialPoint?: string;
    readonly sideDetermination: string;
    readonly enPassant: boolean;
    readonly autoQueenable: boolean;
    readonly drop: boolean;
    readonly gate: boolean;
    readonly pass: boolean;

    readonly alternateStart?: { [ name: string ]: string };

    readonly chess960: boolean;

    private readonly _icon: string;
    private readonly _icon960: string;
    icon(chess960: boolean = false) { return chess960 ? this._icon960 : this._icon; }
    readonly pieceSound: string;

    constructor(data: any) {
        this.name = data.name;
        this._displayName = (data.displayName ?? data.name).toUpperCase();
        this.tooltip = data.tooltip;
        this.startFen = data.startFen;

        this.board = data.board;
        this.boardFamily = BOARD_FAMILIES[data.board];

        this.piece = data.piece;
        this.pieceFamily = PIECE_FAMILIES[data.piece];

        this.firstColor = data.firstColor ?? "White";
        this.secondColor = data.secondColor ?? "Black";
        this._pieceRoles = [ data.pieceRoles, data.pieceRoles2 ?? data.pieceRoles ];
        this.pocket = Boolean(data.pocketRoles || data.pocketRoles2);
        this._pocketRoles = [ data.pocketRoles, data.pocketRoles2 ?? data.pocketRoles ];

        this.promotion = data.promotion ?? "regular";
        this.timeControl = data.timeControl ?? "incremental";
        this.counting = data.counting;
        this.materialPoint = data.materialPoint;
        this.sideDetermination = data.sideDetermination ?? "color";
        this.enPassant = data.enPassant ?? false;
        this.autoQueenable = data.autoQueenable ?? false;
        this.drop = data.drop ?? false;
        this.gate = data.gate ?? false;
        this.pass = data.pass ?? false;

        this.alternateStart = data.alternateStart;

        this.chess960 = data.chess960 ?? false;

        this._icon = data.icon;
        this._icon960 = data.icon960 ?? data.icon;
        this.pieceSound = data.pieceSound ?? "regular";
    }

}

export const VARIANTS: { [name: string]: IVariant } = {
    chess: new Variant({
        name: "chess", tooltip: _("Chess, unmodified, as it's played by FIDE standards"),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        board: "standard8x8", piece: "standard",
        pieceRoles: ["king", "queen", "rook", "bishop", "knight", "pawn"],
        enPassant: true, autoQueenable: true,
        alternateStart: {
            '': '',
            'PawnsPushed': "rnbqkbnr/8/8/pppppppp/PPPPPPPP/8/8/RNBQKBNR w - - 0 1",
            'PawnsPassed': "rnbqkbnr/8/8/PPPPPPPP/pppppppp/8/8/RNBQKBNR w - - 0 1",
            'UpsideDown': "RNBKQBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbkqbnr w - - 0 1",
            'Theban': "1p6/2p3kn/3p2pp/4pppp/5ppp/8/PPPPPPPP/PPPPPPKN w - - 0 1",
            'No castle': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1'
        },
        chess960: true, icon: "M", icon960: "V",
    }),

    crazyhouse: new Variant({
        name: "crazyhouse", tooltip: _("Take captured pieces and drop them back on to the board as your own"),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1",
        board: "standard8x8", piece: "standard",
        pieceRoles: ["king", "queen", "rook", "bishop", "knight", "pawn"],
        pocketRoles: ["pawn", "knight", "bishop", "rook", "queen"],
        enPassant: true, autoQueenable: true, drop: true,
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
        name: "placement", tooltip: _("Choose where your pieces start"),
        startFen: "8/pppppppp/8/8/8/8/PPPPPPPP/8[KQRRBBNNkqrrbbnn] w - - 0 1",
        board: "standard8x8", piece: "standard",
        pieceRoles: ["king", "queen", "rook", "bishop", "knight", "pawn"],
        pocketRoles: ["knight", "bishop", "rook", "queen", "king"],
        enPassant: true, autoQueenable: true,
        icon: "S",
    }),
    
    makruk: new Variant({
        name: "makruk", tooltip: _("A game closely resembling the original Chaturanga"),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        board: "makruk8x8", piece: "makruk",
        pieceRoles: ["king", "silver", "met", "knight", "rook", "pawn", "ferz"],
        counting: "makruk",
        icon: "Q",
    }),

    makpong: new Variant({
        name: "makpong", tooltip: _("Makruk variant where kings cannot move to escape out of check"),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
        board: "makruk8x8", piece: "makruk",
        pieceRoles: ["king", "silver", "met", "knight", "rook", "pawn", "ferz"],
        counting: "makruk",
        icon: "O",
    }),

    cambodian: new Variant({
        name: "cambodian", displayName: "ouk chatrang", tooltip: _("Makruk with a few additional opening abilities"),
        startFen: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w DEde - 0 1",
        board: "makruk8x8", piece: "makruk",
        pieceRoles: ["king", "silver", "met", "knight", "rook", "pawn", "ferz"],
        counting: "makruk",
        icon: "!",
    }),

    sittuyin: new Variant({
        name: "sittuyin", tooltip: _("Similar to Makruk, but pieces are placed at the start of the match"),
        startFen: "8/8/4pppp/pppp4/4PPPP/PPPP4/8/8[KFRRSSNNkfrrssnn] w - - 0 1",
        board: "sittuyin8x8", piece: "sittuyin",
        firstColor: "Red", secondColor: "Black",
        pieceRoles: ["king", "ferz", "silver", "knight", "rook", "pawn"],
        pocketRoles: ["rook", "knight", "silver", "ferz", "king"],
        counting: "asean",
        icon: ":",
    }),

    shogi: new Variant({
        name: "shogi", tooltip: _("Pieces promote and can be dropped"),
        startFen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1",
        board: "shogi9x9", piece: "shogi",
        firstColor: "Black", secondColor: "White",
        pieceRoles: ["king", "rook", "bishop", "gold", "silver", "knight", "lance", "pawn"],
        pocketRoles: ["pawn", "lance", "knight", "silver", "gold", "bishop", "rook"],
        promotion: "shogi",
        timeControl: "byoyomi",
        sideDetermination: "direction",
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
        name: "minishogi", tooltip: _("Shogi on a 5x5 board"),
        startFen: "rbsgk/4p/5/P4/KGSBR[-] w 0 1",
        board: "shogi5x5", piece: "shogi",
        firstColor: "Black", secondColor: "White",
        pieceRoles: ["king", "rook", "bishop", "gold", "silver", "pawn"],
        pocketRoles: ["pawn", "silver", "gold", "bishop", "rook"],
        promotion: "shogi",
        timeControl: "byoyomi",
        sideDetermination: "direction",
        pieceSound: "shogi",
        drop: true,
        icon: "6",
    }),

    kyotoshogi: new Variant({
        name: "kyotoshogi", tooltip: _("5x5 Shogi where pieces flip to a different piece each move"),
        startFen: "p+nks+l/5/5/5/+LSK+NP[-] w 0 1",
        board: "shogi5x5", piece: "kyoto",
        firstColor: "Black", secondColor: "White",
        pieceRoles: ["king", "pknight", "silver", "plance", "pawn"],
        pocketRoles: ["pawn", "lance", "knight", "silver"],
        promotion: "kyoto",
        timeControl: "byoyomi",
        sideDetermination: "direction",
        pieceSound: "shogi",
        drop: true,
        icon: ")",
    }),

    xiangqi: new Variant({
        name: "xiangqi", tooltip: _("Open fire on your opponent in this highly aggressive ancient game"),
        startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1",
        board: "xiangqi9x10", piece: "xiangqi",
        firstColor: "Red", secondColor: "Black",
        pieceRoles: ["king", "advisor", "cannon", "rook", "bishop", "knight", "pawn"],
        icon: "8",
    }),

    janggi: new Variant({
        name: "janggi", tooltip: _("Similar to Xiangqi, but plays very differently. Tournament rules are used"),
        startFen: "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1",
        board: "janggi9x10", piece: "janggi",
        firstColor: "Blue", secondColor: "Red",
        pieceRoles: ["king", "advisor", "cannon", "rook", "bishop", "knight", "pawn"],
        timeControl: "byoyomi",
        materialPoint: "janggi",
        pass: true,
        icon: "=",
    }),

    minixiangqi: new Variant({
        name: "minixiangqi", tooltip: _("Xiangqi on a 7x7 board"),
        startFen: "rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR w - - 0 1",
        board: "xiangqi7x7", piece: "xiangqi",
        firstColor: "Red", secondColor: "Black",
        pieceRoles: ["king", "cannon", "rook", "knight", "pawn"],
        icon: "7",
    }),

    capablanca: new Variant({
        name: "capablanca", tooltip: _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a 10x8 board"),
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceRoles: ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"],
        enPassant: true, autoQueenable: true,
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1',
            'Carrera': 'rcnbqkbnar/pppppppppp/10/10/10/10/PPPPPPPPPP/RCNBQKBNAR w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1'
        },
        chess960: true, icon: "P", icon960: ",",
    }),

    capahouse: new Variant({
        name: "capahouse", tooltip: _("Capablanca with Crazyhouse drop rules"),
        startFen: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR[] w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceRoles: ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"],
        pocketRoles: ["pawn", "knight", "bishop", "rook", "archbishop", "cancellor", "queen"],
        enPassant: true, autoQueenable: true, drop: true,
        alternateStart: {
            '': '',
            'Bird': 'rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1',
            'Carrera': 'rcnbqkbnar/pppppppppp/10/10/10/10/PPPPPPPPPP/RCNBQKBNAR w KQkq - 0 1',
            'Gothic': 'rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1',
            'Embassy': 'rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1'
        },
        chess960: true, icon: "&", icon960: "'",
    }),

    gothic: new Variant({
        name: "gothic", tooltip: _("Like Capablanca Chess but with a different starting setup"),
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceRoles: ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"],
        enPassant: true, autoQueenable: true,
        icon: "P",
    }),

    gothhouse: new Variant({
        name: "gothhouse", tooltip: _("Gothic with Crazyhouse drop rules"),
        startFen: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1",
        board: "standard10x8", piece: "capa",
        pieceRoles: ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"],
        pocketRoles: ["pawn", "knight", "bishop", "rook", "archbishop", "cancellor", "queen"],
        enPassant: true, autoQueenable: true, drop: true,
        icon: "P",
    }),

    seirawan: new Variant({
        name: "seirawan", displayName: "s-chess", tooltip: _("Hybrid pieces, the hawk (B+N) and elephant (R+N) can enter the board after moving a back rank piece"),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        board: "standard8x8", piece: "seirawan",
        pieceRoles: ["king", "queen", "elephant", "hawk", "rook", "bishop", "knight", "pawn"],
        pocketRoles: ["hawk", "elephant"],
        enPassant: true, autoQueenable: true, gate: true,
        icon: "L",
    }),

    shouse: new Variant({
        name: "shouse", displayName: "s-house", tooltip: _("S-Chess with Crazyhouse drop rules"),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
        board: "standard8x8", piece: "seirawan",
        pieceRoles: ["king", "queen", "elephant", "hawk", "rook", "bishop", "knight", "pawn"],
        pocketRoles: ["pawn", "knight", "bishop", "rook", "hawk", "elephant", "queen"],
        enPassant: true, autoQueenable: true, drop: true, gate: true,
        icon: "$",
    }),

    grand: new Variant({
        name: "grand", tooltip: _("Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a *grand* 10x10 board"),
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1",
        board: "grand10x10", piece: "capa",
        pieceRoles: ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"],
        enPassant: true, autoQueenable: true,
        icon: "(",
    }),

    grandhouse: new Variant({
        name: "grandhouse", tooltip: _("Grand Chess with Crazyhouse drop rules"),
        startFen: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R[] w - - 0 1",
        board: "grand10x10", piece: "capa",
        pieceRoles: ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"],
        pocketRoles: ["pawn", "knight", "bishop", "rook", "archbishop", "cancellor", "queen"],
        enPassant: true, autoQueenable: true, drop: true,
        icon: "*",
    }),

    shako: new Variant({
        name: "shako", tooltip: _("Introduces the cannon and elephant from Xiangqi into a 10x10 chess board"),
        startFen: "c8c/ernbqkbnre/pppppppppp/10/10/10/10/PPPPPPPPPP/ERNBQKBNRE/C8C w KQkq - 0 1",
        board: "standard10x10", piece: "shako",
        pieceRoles: ["king", "queen", "elephant", "cancellor", "rook", "bishop", "knight", "pawn"],
        enPassant: true, autoQueenable: true,
        icon: "9",
    }),

    shogun: new Variant({
        name: "shogun", tooltip: _("Pieces promote and can be dropped, similar to Shogi"),
        startFen: "rnb+fkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB+FKBNR w KQkq - 0 1",
        board: "shogun8x8", piece: "shogun",
        pieceRoles: ["king", "pferz", "rook", "bishop", "knight", "pawn"],
        pocketRoles: ["pawn", "knight", "bishop", "rook", "ferz"],
        promotion: "shogi",
        timeControl: "byoyomi",
        enPassant: true, drop: true,
        icon: "-",
    }),

    orda: new Variant({
        name: "orda", tooltip: _("Asymmetric variant where one army has pieces that move like knights but capture differently"),
        startFen: "lhaykahl/8/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",
        board: "standard8x8", piece: "orda",
        firstColor: "White", secondColor: "Gold",
        pieceRoles: ["king", "queen", "rook", "bishop", "knight", "pawn", "hawk"],
        pieceRoles2: ["king", "yurt", "lancer", "archbishop", "hawk", "pawn", "queen"],
        enPassant: true,
        icon: "R",
    }),

    synochess: new Variant({
        name: "synochess", tooltip: _("Asymmetric East vs. West variant which pits the western chess army against a xiangqi and janggi-styled army"),
        startFen: "rneakenr/8/1c4c1/1ss2ss1/8/8/PPPPPPPP/RNBQKBNR[ss] w KQ - 0 1",
        board: "standard8x8", piece: "synochess",
        pieceRoles: ["king", "queen", "rook", "bishop", "knight", "pawn"],
        pieceRoles2: ["king", "archbishop", "cancellor", "rook", "elephant", "knight", "silver"],
        pocketRoles: [], pocketRoles2: ["silver"],
        autoQueenable: true,
        icon: "_",
    }),

    hoppelpoppel: new Variant({
        name: "hoppelpoppel", displayName: "hoppel-poppel", tooltip: _("Knights are capturing as bishops, bishops are capturing as knights"),
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        board: "standard8x8", piece: "hoppel",
        pieceRoles: ["king", "queen", "rook", "bishop", "knight", "pawn"],
        enPassant: true, autoQueenable: true,
        icon: "`",
    }),

};

export const variants = Object.keys(VARIANTS);
const disabledVariants = [ "gothic", "gothhouse" ];
export const enabledVariants = variants.filter(v => !disabledVariants.includes(v));

const variantGroups: { [ key: string ]: { label: string, variants: string[] } } = {
    standard: { label: "Standard piece variants",  variants: [ "chess", "crazyhouse", "placement" ] },
    sea:      { label: "Southeast Asian variants", variants: [ "makruk", "makpong", "cambodian", "sittuyin" ] },
    shogi:    { label: "Shogi variants",           variants: [ "shogi", "minishogi", "kyotoshogi" ] },
    xiangqi:  { label: "Xiangqi variants",         variants: [ "xiangqi", "janggi", "minixiangqi" ] },
    fairy:    { label: "Fairy piece variants",     variants: [ "capablanca", "capahouse", "seirawan", "shouse", "grand", "grandhouse", "shako", "shogun", "orda", "synochess", "hoppelpoppel" ] },
};

export function selectVariant(id, selected, onChange, hookInsert) {
    return h('select#' + id, {
        props: { name: id },
        on: { change: onChange },
        hook: { insert: hookInsert },
    },
        Object.keys(variantGroups).map(g => {
            const group = variantGroups[g];
            return h('optgroup', { props: { label: group.label } }, group.variants.map(v => {
                const variant = VARIANTS[v];
                return h('option', {
                    props: { value: v, title: variant.tooltip },
                    attrs: { selected: v === selected },
                }, variant.displayName(false));
            }));
        }),
    );
}

const handicapKeywords = [ "HC", "Handicap", "Odds" ];
export function isHandicap(name: string) {
    return handicapKeywords.some(keyword => name.endsWith(keyword));
}

/** TODO DEPRECATED
 * Variant classes
 * Use these classes to check for characteristics of variants
 ** shogiSound: This variant uses shogi piece move sound
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
    hoppelpoppel: new Set(['enPassant', 'autoQueen']),
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

// TODO Will be deprecated after WASM Fairy integration
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
