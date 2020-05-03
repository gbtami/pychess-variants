import { key2pos } from 'chessgroundx/util';
import { Color, dimensions, Geometry, Key, Role } from 'chessgroundx/types';

import { read } from 'chessgroundx/fen';

export const variants = ["makruk", "makpong", "cambodian", "sittuyin", "placement", "crazyhouse", "chess", "shogi", "minishogi", "kyotoshogi", "janggi", "xiangqi", "minixiangqi", "capablanca", "seirawan", "capahouse", "shouse", "grand", "grandhouse", "gothic", "gothhouse", "shako", "shogun", "orda"];
export const variants960 = ["crazyhouse", "chess", "capablanca", "capahouse"];

export const enabled_variants = ["makruk", "makpong", "cambodian", "sittuyin", "placement", "crazyhouse", "chess", "shogi", "minishogi", "kyotoshogi", "janggi", "xiangqi", "minixiangqi", "capablanca", "seirawan", "capahouse", "shouse", "grand", "grandhouse", "gothic", "shako", "shogun", "orda"];

export const start_fen = {
    makruk: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
    makpong: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1",
    cambodian: "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w DEde - 0 1",
    sittuyin: "8/8/4pppp/pppp4/4PPPP/PPPP4/8/8[KFRRSSNNkfrrssnn] w - - 0 1",
    placement: "8/pppppppp/8/8/8/8/PPPPPPPP/8[KQRRBBNNkqrrbbnn] w - - 0 1",
    crazyhouse: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1",
    chess: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    shogi: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1",
    minishogi: "rbsgk/4p/5/P4/KGSBR[-] w 0 1",
    kyotoshogi: "p+nks+l/5/5/5/+LSK+NP[-] w 0 1",
    janggi: "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1",
    xiangqi: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1",
    minixiangqi: "rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR w - - 0 1",
    capablanca: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
    seirawan: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
    capahouse: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR[] w KQkq - 0 1",
    shouse: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1",
    grand: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1",
    grandhouse: "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R[] w - - 0 1",
    gothic: "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1",
    shako: "c8c/ernbqkbnre/pppppppppp/10/10/10/10/PPPPPPPPPP/ERNBQKBNRE/C8C w KQkq - 0 1",
    shogun: "rnb+fkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB+FKBNR w KQkq - 0 1",
    orda: "lhaykahl/8/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1"
}

export const variantTooltip = {
    makruk: "A game closely resembling the original Chaturanga",
    makpong: "Makruk variant where kings cannot move to escape out of check",
    cambodian: "Makruk with a few additional opening abilities",
    sittuyin: "Similar to Makruk, but pieces are placed at the start of the match",
    placement: "Choose where your pieces start",
    crazyhouse: "Take captured pieces and drop them back on to the board as your own",
    chess: "Chess, unmodified, as it's played by FIDE standards",
    shogi: "Pieces promote and can be dropped",
    minishogi: "Shogi on a 5x5 board",
    kyotoshogi: "5x5 Shogi where pieces flip to a different piece each move",
    janggi: "Similar to Xiangqi, but plays very differently. Tournament rules are used",
    xiangqi: "Open fire on your opponent in this highly aggressive ancient game",
    minixiangqi: "Xiangqi on a 7x7 board",
    capablanca: "Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a 10x8 board",
    seirawan: "Hybrid pieces, the hawk (B+N) and elephant (R+N) can enter the board after moving a back rank piece",
    capahouse: "Capablanca with Crazyhouse drop rules",
    shouse: "S-Chess with Crazyhouse drop rules",
    grand: "Play with the hybrid pieces, archbishop (B+N) and chancellor (R+N), on a *grand* 10x10 board",
    grandhouse: "Grand Chess with Crazyhouse drop rules",
    gothic: "Like Capablanca Chess but with a different starting setup",
    shako: "Introduces the cannon and elephant from Xiangqi into a 10x10 chess board",
    shogun: "Pieces promote and can be dropped, similar to Shogi",
    orda: "Asymmetric variant where one army has pieces that move like knights but capture differently"
}

export const VARIANTS = {
    makruk: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["makruk2.svg", "makruk.svg", "makruk.jpg"], pieces: "makruk", PieceCSS: ["makrukwb", "makrukwr", "makruk", "makruks", "makruki"], icon: "Q"},
    makpong: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["makruk2.svg", "makruk.svg", "makruk.jpg"], pieces: "makruk", PieceCSS: ["makrukwb", "makrukwr", "makruk", "makruks", "makruki"], icon: "O"},
    cambodian: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["makruk2.svg", "makruk.svg", "makruk.jpg"], pieces: "makruk", PieceCSS: ["makrukwb", "makrukwr", "makruk", "makruks", "makruki"], icon: "!"},
    sittuyin: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["sittuyin.svg", "sittuyin.jpg", "sittuyingreen.svg", "sittuyinGrainBrown.svg"], pieces: "sittuyin", PieceCSS: ["sittuyins", "sittuyinkagr", "sittuyinkabr", "sittuyinm", "sittuyini"], icon: ":", baseURL: ["sittuyin/original", "sittuyin/Ka_blackred", "sittuyin/Ka_greenred", "makruk/ada", "makruk/intl"] },
    shogi: { geom: Geometry.dim9x9, cg: "cg-576", BoardCSS: ["shogi.svg", "Shogiban1.png", "Shogiban2.png", "shogic.svg", "ShogiMaple.png", "doubutsu.svg"], pieces: "shogi", PieceCSS: ["shogi0k", "shogi0", "shogi0w", "shogi0p", "shogi0m", "shogi0d"], icon: "K", baseURL: ["shogi/ctk", "shogi/2kanji", "shogi/ctw", "shogi/ctp", "shogi/ctm", "shogi/Ka"] },
    minishogi: { geom: Geometry.dim5x5, cg: "cg-260", BoardCSS: ["minishogi.svg", "MiniboardWood1.png", "MiniboardWood2.png"], pieces: "shogi", PieceCSS: ["shogi0k", "shogi0", "shogi0w", "shogi0p", "shogi0m"], icon: "6", baseURL: ["shogi/ctk", "shogi/2kanji", "shogi/ctw", "shogi/ctp", "shogi/ctm"] },
    kyotoshogi: { geom: Geometry.dim5x5, cg: "cg-260", BoardCSS: ["minishogi.svg", "MiniboardWood1.png", "MiniboardWood2.png"], pieces: "kyoto", PieceCSS: ["kyoto0", "kyoto0k", "kyoto0i"], icon: ")", baseURL: ["shogi", "kyoto/Kanji", "kyoto/Intl"] },
    janggi: { geom: Geometry.dim9x10, cg: "cg-576-640", BoardCSS: ["Janggi.svg", "JanggiPaper.png", "JanggiWood.png", "JanggiDark.svg", "JanggiBrown.svg"], pieces: "janggi", PieceCSS: ["janggihb", "janggihg", "janggiib", "janggiig"], icon: "=" },
    xiangqi: { geom: Geometry.dim9x10, cg: "cg-576-640", BoardCSS: ["xiangqi.svg", "xiangqic.svg", "xiangqiCTexture.png", "xiangqiPaper.png", "xiangqiWood.png", "xiangqiDark.svg"], pieces: "xiangqi", PieceCSS: ["xiangqi", "xiangqict3", "xiangqict2", "xiangqihnz", "xiangqict2w", "xiangqihnzw"], icon: "8" },
    minixiangqi: { geom: Geometry.dim7x7, cg: "cg-448", BoardCSS: ["minixiangqi.svg", "minixiangqiw.png", "minixqlg.svg"], pieces: "xiangqi", PieceCSS: ["xiangqi", "xiangqict3", "xiangqict2", "xiangqihnz", "xiangqict2w", "xiangqihnzw"], icon: "7" },
    placement: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg"], pieces: "standard", PieceCSS: ["standard", "green", "alpha", "chess_kaneo"], icon: "S", baseURL: ["merida", "green", "alpha", "kaneo"] },
    crazyhouse: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg"], pieces: "standard", PieceCSS: ["standard", "green", "alpha", "chess_kaneo"], icon: "+", baseURL: ["merida", "green", "alpha", "kaneo"] },
    capablanca: { geom: Geometry.dim10x8, cg: "cg-640", BoardCSS: ["10x8brown.svg", "10x8blue.svg", "10x8green.svg", "10x8maple.jpg", "10x8olive.jpg"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4"], icon: "P" },
    capahouse: { geom: Geometry.dim10x8, cg: "cg-640", BoardCSS: ["10x8brown.svg", "10x8blue.svg", "10x8green.svg", "10x8maple.jpg", "10x8olive.jpg"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4"], icon: "&", baseURL: ["capa", "seir", "green", "musk", "kaneo"] },
    gothic: { geom: Geometry.dim10x8, cg: "cg-640", BoardCSS: ["10x8brown.svg", "10x8blue.svg", "10x8green.svg", "10x8maple.jpg", "10x8olive.jpg"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4"], icon: "P" },
    gothhouse: { geom: Geometry.dim10x8, cg: "cg-640", BoardCSS: ["10x8brown.svg", "10x8blue.svg", "10x8green.svg", "10x8maple.jpg", "10x8olive.jpg"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4"], icon: "&", baseURL: ["capa", "seir", "green", "musk", "kaneo"] },
    grand: { geom: Geometry.dim10x10, cg: "cg-640-640", BoardCSS: ["Grandboard.svg", "10x10brown.svg", "10x10blue.svg", "10x10green.svg", "10x10maple.jpg", "10x10mapleGrand.png"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4"], icon: "(" },
    grandhouse: { geom: Geometry.dim10x10, cg: "cg-640-640", BoardCSS: ["Grandboard.svg", "10x10brown.svg", "10x10blue.svg", "10x10green.svg", "10x10maple.jpg", "10x10mapleGrand.png"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3", "capa4"], icon: "*", baseURL: ["capa", "seir", "green", "musk", "kaneo"] },
    seirawan: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg"], pieces: "seirawan", PieceCSS: ["seir1", "seir0", "seir2", "seir3", "seir4"], icon: "L", baseURL: ["seir", "capa", "green", "musk", "kaneo"] },
    shouse: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg"], pieces: "seirawan", PieceCSS: ["seir1", "seir0", "seir2", "seir3", "seir4"], icon: "$", baseURL: ["seir", "capa", "green", "musk", "kaneo"] },
    chess: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg"], pieces: "standard", PieceCSS: ["standard", "green", "alpha", "chess_kaneo"], icon: "M" },
    shako: { geom: Geometry.dim10x10, cg: "cg-640-640", BoardCSS: ["10x10brown.svg", "10x10blue.svg", "10x10green.svg", "10x10maple.jpg", "10x10olive.jpg"], pieces: "shako", PieceCSS: ["shako0", "shako1"], icon: "9" },
    shogun: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["ShogunPlain.svg", "ShogunMaple.png", "ShogunMaple2.png", "ShogunBlue.svg", "8x8brown.svg", "8x8maple.jpg"], pieces: "shogun", PieceCSS: ["shogunb", "shogunr", "shogunw"], icon: "-" , baseURL: ["shogun/blue", "shogun/red", "shogun/white"] },
    orda: { geom: Geometry.dim8x8, cg: "cg-512", BoardCSS: ["8x8brown.svg", "8x8blue.svg", "8x8green.svg", "8x8maple.jpg", "8x8olive.jpg"], pieces: "orda", PieceCSS: ["orda0"], icon: "R" , baseURL: ["orda"]}
}

export function variantIcon(variant, chess960) {
    if (chess960 === "True" || chess960 === 1 || chess960 === true) {
        switch (variant) {
        case "crazyhouse":
            return "%";
        case "capablanca":
            return ",";
        case "capahouse":
            return "'";
        case "chess":
            return "V";
        }
    } else {
        return VARIANTS[variant].icon;
    }
}

export function variantName(variant, chess960) {
    if (chess960 === "True" || chess960 === 1 || chess960 === true) {
        return variant.toUpperCase(variant) + "960";
    } else {
        switch (variant) {
        case "seirawan":
            return "S-CHESS";
        case "shouse":
            return "S-HOUSE";
        default:
            return variant.toUpperCase(variant);
        }
    }
}

export function firstColor(variant) {
    switch (variant) {
    case 'shogi':
    case 'minishogi':
    case 'kyotoshogi':
        return 'Black';
    case 'xiangqi':
    case 'minixiangqi':
    case 'sittuyin':
        return 'Red';
    case 'janggi':
        return 'Blue';
    default:
        return 'White';
    }
}

export function secondColor(variant) {
    switch (variant) {
    case 'shogi':
    case 'minishogi':
    case 'kyotoshogi':
        return 'White';
    case 'janggi':
        return 'Red';
    case 'orda':
        return 'Gold';
    default:
        return 'Black';
    }
}

// pocket part of the FEN (including brackets)
export function getPockets(fen: string) {
    const fen_placement = fen.split(" ")[0];
    var pockets = "";
    const bracketPos = fen_placement.indexOf("[");
    if (bracketPos !== -1) {
        pockets = fen_placement.slice(bracketPos);
    }
    return pockets;
}


export function pieceRoles(variant: string, color: Color) {
    switch (variant) {
    case "grandhouse":
    case "grand":
    case "gothic":
    case "gothhouse":
    case "capahouse":
    case "capablanca":
        return ["king", "queen", "cancellor", "archbishop", "rook", "bishop", "knight", "pawn"];
    case "shouse":
    case "seirawan":
        return ["king", "queen", "elephant", "hawk", "rook", "bishop", "knight", "pawn"];
    case "kyotoshogi":
        return ["king", "pknight", "silver", "plance", "pawn"];
    case "minishogi":
        return ["king", "rook", "bishop", "gold", "silver", "pawn"];
    case "shogi":
        return ["king", "rook", "bishop", "gold", "silver", "knight", "lance", "pawn"];
    case "shako":
        return ["king", "queen", "elephant", "cancellor", "rook", "bishop", "knight", "pawn"];
    case "shogun":
        return ["king", "pferz", "rook", "bishop", "knight", "pawn"];
    case "janggi":
    case "xiangqi":
        return ["king", "advisor", "cannon", "rook", "bishop", "knight", "pawn"];
    case "minixiangqi":
        return ["king", "cannon", "rook", "knight", "pawn"];
    case "makruk":
    case "makpong":
    case "cambodian":
        return ["king", "silver", "met", "knight", "rook", "pawn", "ferz"];
    case "sittuyin":
        return ["king", "ferz", "silver", "knight", "rook", "pawn"];
    case "orda":
        return (color === 'black') ? ["king", "yurt", "lancer", "archbishop", "hawk", "pawn", "queen"] : ["king", "queen", "rook", "bishop", "knight", "pawn", "hawk"];
    default:
        return ["king", "queen", "rook", "bishop", "knight", "pawn"];
    }
}


export function pocketRoles(variant: string) {
    switch (variant) {
    case "sittuyin":
        return ["rook", "knight", "silver", "ferz", "king"];
    case "shogun":
        return ["pawn", "knight", "bishop", "rook", "ferz"];
    case "crazyhouse":
        return ["pawn", "knight", "bishop", "rook", "queen"];
    case "grandhouse":
    case "gothhouse":
    case "capahouse":
        return ["pawn", "knight", "bishop", "rook", "archbishop", "cancellor", "queen"];
    case "shogi":
        return ["pawn", "lance", "knight", "silver", "gold", "bishop", "rook"];
    case "kyotoshogi":
        return ["pawn", "lance", "knight", "silver"];
    case "minishogi":
        return ["pawn", "silver", "gold", "bishop", "rook"];
    case "shouse":
        return ["pawn", "knight", "bishop", "rook", "hawk", "elephant", "queen"];
    case "seirawan":
        return ["hawk", "elephant"];
    default:
        return ["knight", "bishop", "rook", "queen", "king"];
    }
}

function promotionZone(variant: string, color: string) {
    switch (variant) {
    case 'shogi':
        return color === 'white' ? 'a9b9c9d9e9f9g9h9i9a8b8c8d8e8f8g8h8i8a7b7c7d7e7f7g7h7i7' : 'a1b1c1d1e1f1g1h1i1a2b2c2d2e2f2g2h2i2a3b3c3d3e3f3g3h3i3';
    case 'kyotoshogi':
        return '';
    case 'minishogi':
        return color === 'white' ? 'a5b5c5d5e5' : 'a1b1c1d1e1';
    case 'shogun':
        return color === 'white' ? 'a6b6c6d6e6f6g6h6a7b7c7d7e7f7g7h7a8b8c8d8e8f8g8h8' : 'a1b1c1d1e1f1g1h1a2b2c2d2e2f2g2h2a3b3c3d3e3f3g3h3';
    case 'cambodian':
    case 'makruk':
    case 'makpong':
        return color === 'white' ? 'a6b6c6d6e6f6g6h6' : 'a3b3c3d3e3f3g3h3';
    case 'sittuyin':
        return color === 'white' ? 'a8b7c6d5e5f6g7h8' : 'a1b2c3d4e4f3g2h1';
    default:
        return color === 'white' ? 'a8b8c8d8e8f8g8h8i8j8' : 'a1b1c1d1e1f1g1h1i1j1';
    }
}

export const autoqueenable = ["placement", "crazyhouse", "chess", "capablanca", "seirawan", "capahouse", "shouse", "grand", "grandhouse", "gothic", "gothhouse", "shako"];

export function promotionRoles(variant: string, role: Role, orig: Key, dest: Key, promotions) {
    switch (variant) {
    case "gothic":
    case "gothhouse":
    case "capahouse":
    case "capablanca":
        return ["queen", "knight", "rook", "bishop", "archbishop", "cancellor"];
    case "shouse":
    case "seirawan":
        return ["queen", "knight", "rook", "bishop", "elephant", "hawk"];
    case "kyotoshogi":
    case "minishogi":
    case "shogi":
        return ["p" + role, role];
    case "grandhouse":
    case "grand":
    case "shako":
        var roles: Role[] = [];
        const moves = promotions.map((move) => move.slice(0, -1));
        promotions.forEach((move) => {
            const prole = sanToRole[move.slice(-1)];
            if (moves.indexOf(orig + dest) !== -1 && roles.indexOf(prole) === -1) {
                roles.push(prole);
            }
        });
        // promotion is optional except on back ranks
        if ((dest[1] !== "9") && (dest[1] !== "0")) roles.push(role);
        return roles;
    case "shogun":
        switch (role) {
        case "pawn": return ["ppawn", "pawn"];
        case "knight": return ["pknight", "knight"];
        case "bishop": return ["pbishop", "bishop"];
        case "rook": return ["prook", "rook"];
        case "ferz": return ["pferz", "ferz"];
        }
    case "orda":
        return ["queen", "hawk"];
default:
        return ["queen", "knight", "rook", "bishop"];
    }
}

export function mandatoryPromotion(variant, role: Role, orig: Key, dest: Key, color: Color) {
    // Promotion is mandatory in Kyoto Shogi for all pieces in every move.
    // Except the King. King cannot promote.
    if (variant === "kyotoshogi") return role !== "king" && orig !== 'z0';

    if (variant === "minishogi" && role === "pawn") {
        if (color === "white") {
            return dest[1] === "5";
        } else {
            return dest[1] === "1";
        }
    }

    if (variant === "shogun") {
        if (role === "pawn") {
            if (color === "white") {
                return dest[1] === "8";
            } else {
                return dest[1] === "1";
            }
        } else {
            return false;
        }
    }

    switch (role) {
    case "pawn":
    case "lance":
        if (color === "white") {
            return dest[1] === "9";
        } else {
            return dest[1] === "1";
        }
    case "knight":
        if (color === "white") {
            return dest[1] === "9" || dest[1] === "8";
        } else {
            return dest[1] === "1" || dest[1] === "2";
        }
    default:
        return false;
    }
}

export function needPockets(variant: string) {
    return variant === 'shogun' || variant === 'placement' || variant === 'crazyhouse' || variant === 'sittuyin' || variant.endsWith('shogi') || variant === 'seirawan' || variant === 'capahouse' || variant === 'shouse' || variant === 'grandhouse' || variant === "gothhouse";
}

export function hasEp(variant: string) {
    return variant === 'shogun' || variant === 'chess' || variant === 'placement' || variant === 'crazyhouse' || variant === 'capablanca' || variant === 'seirawan' || variant === 'capahouse' || variant === 'shouse' || variant === 'grand' || variant === 'grandhouse' || variant === "gothic" || variant === "gothhouse" || variant === 'shako' || variant === 'orda';
}

function diff(a: number, b:number):number {
  return Math.abs(a - b);
}

function diagonalMove(pos1, pos2) {
    const xd = diff(pos1[0], pos2[0]);
    const yd = diff(pos1[1], pos2[1]);
    return xd === yd && xd === 1;
}

export function canGate(fen, piece, orig) {
    // console.log("   isGating()", fen, piece, orig);
    const no_gate = [false, false, false, false, false, false]
    if ((piece.color === "white" && orig.slice(1) !== "1") ||
        (piece.color === "black" && orig.slice(1) !== "8") ||
        (piece.role === "hawk") ||
        (piece.role === "elephant")) return no_gate;

    // In starting position king and(!) rook virginity is encoded in KQkq
    // "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1"

    // but after kings moved rook virginity is encoded in AHah
    // rnbq1bnr/ppppkppp/8/4p3/4P3/8/PPPPKPPP/RNBQ1BNR[HEhe] w ABCDFGHabcdfgh - 2 3

    // king virginity is encoded in Ee after any Rook moved but King not

    const parts = fen.split(" ");
    const placement = parts[0];
    const color = parts[1];
    const castl = parts[2];
    // console.log("isGating()", orig, placement, color, castl);
    switch (orig) {
    case "a1":
        if (castl.indexOf("A") === -1 && castl.indexOf("Q") === -1) return no_gate;
        break;
    case "b1":
        if (castl.indexOf("B") === -1) return no_gate;
        break;
    case "c1":
        if (castl.indexOf("C") === -1) return no_gate;
        break;
    case "d1":
        if (castl.indexOf("D") === -1) return no_gate;
        break;
    case "e1":
        if (piece.role !== "king") {
            return no_gate;
        } else if ((castl.indexOf("K") === -1) && (castl.indexOf("Q") === -1) && (castl.indexOf("E") === -1)) {
            return no_gate;
        };
        break;
    case "f1":
        if (castl.indexOf("F") === -1) return no_gate;
        break;
    case "g1":
        if (castl.indexOf("G") === -1) return no_gate;
        break;
    case "h1":
        if (castl.indexOf("H") === -1 && castl.indexOf("K") === -1) return no_gate;
        break;
    case "a8":
        if (castl.indexOf("a") === -1 && castl.indexOf("q") === -1) return no_gate;
        break;
    case "b8":
        if (castl.indexOf("b") === -1) return no_gate;
        break;
    case "c8":
        if (castl.indexOf("c") === -1) return no_gate;
        break;
    case "d8":
        if (castl.indexOf("d") === -1) return no_gate;
        break;
    case "e8":
        if (piece.role !== "king") {
            return no_gate;
        } else if ((castl.indexOf("k") === -1) && (castl.indexOf("q") === -1) && (castl.indexOf("e") === -1)) {
            return no_gate;
        };
        break;
    case "f8":
        if (castl.indexOf("f") === -1) return no_gate;
        break;
    case "g8":
        if (castl.indexOf("g") === -1) return no_gate;
        break;
    case "h8":
        if (castl.indexOf("h") === -1 && castl.indexOf("k") === -1) return no_gate;
        break;
    };
    const bracketPos = placement.indexOf("[");
    const pockets = placement.slice(bracketPos);
    const ph = lc(pockets, "h", color==='w') !== 0;
    const pe = lc(pockets, "e", color==='w') !== 0;
    const pq = lc(pockets, "q", color==='w') !== 0;
    const pr = lc(pockets, "r", color==='w') !== 0;
    const pb = lc(pockets, "b", color==='w') !== 0;
    const pn = lc(pockets, "n", color==='w') !== 0;

    return [ph, pe, pq, pr, pb, pn];
}

export function isPromotion(variant, piece, orig, dest, meta, promotions) {
    if (variant === 'xiangqi' || variant === 'minixiangqi' || variant === 'janggi') return false;
    const pz = promotionZone(variant, piece.color)
    switch (variant) {
    case 'shogi':
        return ['king', 'gold', 'ppawn', 'pknight', 'pbishop', 'prook', 'psilver', 'plance'].indexOf(piece.role) === -1
            && (pz.indexOf(orig) !== -1 || pz.indexOf(dest) !== -1);
    case 'kyotoshogi':
        console.log('isPromotion()', variant, piece, orig, dest, meta, promotions);
        return piece.role !== 'king' || orig === 'z0';
    case 'minishogi':
        return ['king', 'gold', 'ppawn', 'pbishop', 'prook', 'psilver'].indexOf(piece.role) === -1
            && (pz.indexOf(orig) !== -1 || pz.indexOf(dest) !== -1);
    case 'sittuyin':
        // See https://vdocuments.net/how-to-play-myanmar-traditional-chess-eng-book-1.html
        const firstRankIs0 = false;
        const dm = diagonalMove(key2pos(orig, firstRankIs0), key2pos(dest, firstRankIs0));
        return piece.role === "pawn" && ( orig === dest || (!meta.captured && dm));
    case 'grandhouse':
    case 'grand':
    case 'shogun':
    case 'shako':
        // TODO: we can use this for other variants also
        return promotions.map((move) => move.slice(0, -1)).indexOf(orig + dest) !== -1;
    default:
        return piece.role === "pawn" && pz.indexOf(dest) !== -1;
    }
}

export function zero2grand(move) {
    const parts = move.split("");
    if (parts[1] !== "@") {
        parts[1] = String(Number(parts[1]) + 1);
    }
    parts[3] = String(Number(parts[3]) + 1);
    return parts.join("");
}

export function grand2zero(move) {
    // cut off promotion piece letter
    var promo = '';
    if ('0123456789'.indexOf(move.slice(-1)) === -1) {
        promo = move.slice(-1);
        move = move.slice(0, -1);
    }
    const parts = move.split("");

    if (parts[1] === '@') {
        return parts[0] + parts[1] + parts[2] + String(Number(move.slice(3)) - 1);
    }
    if ('0123456789'.indexOf(parts[2]) !== -1) {
        parts[1] = String(Number(parts[1] + parts[2]) -1);
        parts[4] = String(Number(move.slice(4)) - 1);
        return parts[0] + parts[1] + parts[3] + parts[4] + promo;
    } else {
        parts[1] = String(Number(parts[1]) -1);
        parts[3] = String(Number(move.slice(3)) - 1);
        return parts[0] + parts[1] + parts[2] + parts[3] + promo;
    }
}

export function validFen(variant, fen) {
    const startfen = start_fen[variant];
    const start = startfen.split(' ');
    const parts = fen.split(' ');

    // Need starting color
    if (parts.length < 2) return false;

    // Allowed characters in placement part
    const placement = parts[0];
    var good = start[0] + ((variant === "orda") ? "Hq" : "") + "~+0123456789[]";
    const alien = (element) => {return good.indexOf(element) === -1;}
    if (parts[0].split('').some(alien)) return false;

    // Number of rows
    if (lc(start[0], '/', false) !== lc(parts[0], '/', false)) return false;

    // Starting colors
    if (parts[1] !== 'b' && parts[1] !== 'w') return false;

    // Rows filled with empty sqares correctly
    var rows = parts[0].split('/');
    const leftBracketPos = rows[rows.length-1].indexOf('[');
    if (leftBracketPos !== -1) rows[rows.length-1] = rows[rows.length-1].slice(0, leftBracketPos);

    const boardWidth = dimensions[VARIANTS[variant].geom].width;
    const notFilled = (row) => {
        var stuffedRow = row.replace('10', '_'.repeat(10));
        stuffedRow = stuffedRow.replace(/[+~]/g, '');
        stuffedRow = stuffedRow.replace(/\d/g, function stuff (x) {return '_'.repeat(parseInt(x));});
        return stuffedRow.length !== boardWidth;
    };
    if (rows.some(notFilled)) return false;

    // Castling rights (piece virginity)
    good = (variant === 'seirawan' || variant === 'shouse') ? 'KQABCDEFGHkqabcdefgh-' : start[2] + "-";
    const wrong = (element) => {good.indexOf(element) === -1;};
    if (parts.length > 2)
        if (parts[2].split('').some(wrong)) return false;

        // Castling right need rooks and king placed in starting square
        if (parts[2].indexOf('q') !== -1 && rows[0].charAt(0) !== 'r') return false;
        if (parts[2].indexOf('k') !== -1 && rows[0].charAt(rows[0].length-1) !== 'r') return false;
        if (parts[2].indexOf('Q') !== -1 && rows[rows.length-1].charAt(0) !== 'R') return false;
        if (parts[2].indexOf('K') !== -1 && rows[rows.length-1].charAt(rows[rows.length-1].length-1) !== 'R') return false;

    // Number of kings
    if (lc(placement, 'k', false) !== 1 || lc(placement, 'k', true) !== 1) return false;

    // Touching kings
    const pieces = read(parts[0], VARIANTS[variant].geom);
    if (touchingKings(pieces)) return false;

    // Brackets paired
    if (lc(placement, '[', false) !== lc(placement, ']', false)) return false;

    return true;
}

function touchingKings(pieces) {
    var wk = 'xx', bk = 'zz';
    for (var key of Object.keys(pieces)) {
        if (pieces[key].role === 'king' && pieces[key].color === 'white') wk = key;
        if (pieces[key].role === 'king' && pieces[key].color === 'black') bk = key;
    }
    const touching = diff(wk.charCodeAt(0), bk.charCodeAt(0)) < 2 && diff(wk.charCodeAt(1), bk.charCodeAt(1)) < 2;
    return touching;
}

// Get counting information for makruk etc
export function getCounting(fen) {
    const parts = fen.split(" ");

    var countingLimit = parseInt(parts[3]);
    if (isNaN(countingLimit)) countingLimit = 0;

    var countingPly = parseInt(parts[4]);
    if (isNaN(countingPly)) countingPly = 0;

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
export function getJanggiPoints(board) {
    var choPoint = 0;
    var hanPoint = 1.5;
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
export function lc(str, letter, uppercase) {
    var letterCount = 0;
    if (uppercase) letter = letter.toUpperCase();
    for (var position = 0; position < str.length; position++) {
        if (str.charAt(position) === letter) letterCount += 1;
    }
    return letterCount;
}

export const kyotoPromotion = {
    'plance': 'lance',
    'lance': 'plance',
    'silver': 'psilver',
    'psilver': 'silver',
    'pknight': 'knight',
    'knight': 'pknight',
    'pawn': 'ppawn',
    'ppawn': 'pawn'
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

