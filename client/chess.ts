import { key2pos } from 'chessgroundx/util';
import { Color, Geometry, Key, Role } from 'chessgroundx/types';

export const variants = ["makruk", "cambodian", "sittuyin", "placement", "crazyhouse", "chess", "shogi", "minishogi", "xiangqi", "minixiangqi", "capablanca", "seirawan", "capahouse", "shouse", "grand", "grandhouse", "gothic", "gothhouse", "shako"];
export const variants960 = ["crazyhouse", "chess", "capablanca", "capahouse"];

export const VARIANTS = {
    makruk: { geom: Geometry.dim8x8, cg: "cg-512", board: "grid", BoardCSS: ["makrb1", "makrb2"], pieces: "makruk", PieceCSS: ["makruk"], icon: "Q"},
    cambodian: { geom: Geometry.dim8x8, cg: "cg-512", board: "grid", BoardCSS: ["makrb1", "makrb2"], pieces: "makruk", PieceCSS: ["makruk"], icon: "Q"},
    sittuyin: { geom: Geometry.dim8x8, cg: "cg-512", board: "gridx", BoardCSS: ["sittb1", "sittb2"], pieces: "sittuyin", PieceCSS: ["sittuyinm", "sittuyins"], icon: "R", baseURL: ["makruk", "sittuyin"] },
    shogi: { geom: Geometry.dim9x9, cg: "cg-576", board: "grid9x9", BoardCSS: ["9x9a", "9x9b", "9x9c", "9x9d", "9x9e", "9x9f"], pieces: "shogi", PieceCSS: ["shogi0k", "shogi0", "shogi0w", "shogi0p"], icon: "K", baseURL: ["shogi/ctk", "shogi", "shogi/ctw", "shogi/ctp"] },
    minishogi: { geom: Geometry.dim5x5, cg: "cg-260", board: "grid5x5", BoardCSS: ["5x5a", "5x5b", "5x5c"], pieces: "shogi", PieceCSS: ["shogi0k", "shogi0", "shogi0w", "shogi0p"], icon: "6", baseURL: ["shogi/ctk", "shogi", "shogi/ctw", "shogi/ctp"] },
    xiangqi: { geom: Geometry.dim9x10, cg: "cg-576-640", board: "river", BoardCSS: ["9x10a", "9x10b", "9x10c", "9x10d", "9x10e"], pieces: "xiangqi", PieceCSS: ["xiangqi", "xiangqie", "xiangqict2", "xiangqihnz"], icon: "O" },
    minixiangqi: { geom: Geometry.dim7x7, cg: "cg-448", board: "minixq", BoardCSS: ["7x7a", "7x7b"], pieces: "xiangqi", PieceCSS: ["xiangqi", "xiangqie", "xiangqict2", "xiangqihnz"], icon: "O" },
    placement: { geom: Geometry.dim8x8, cg: "cg-512", board: "board8x8", BoardCSS: ["8x8brown", "8x8blue", "8x8green", "8x8maple", "8x8olive"], pieces: "standard", PieceCSS: ["standard", "green", "alpha"], icon: "S", baseURL: ["merida", "green", "alpha"] },
    crazyhouse: { geom: Geometry.dim8x8, cg: "cg-512", board: "board8x8", BoardCSS: ["8x8brown", "8x8blue", "8x8green", "8x8maple", "8x8olive"], pieces: "standard", PieceCSS: ["standard", "green", "alpha"], icon: "H", baseURL: ["merida", "green", "alpha"] },
    capablanca: { geom: Geometry.dim10x8, cg: "cg-640", board: "board10x8", BoardCSS: ["10x8brown", "10x8blue", "10x8green", "10x8maple", "10x8olive"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3"], icon: "P" },
    capahouse: { geom: Geometry.dim10x8, cg: "cg-640", board: "board10x8", BoardCSS: ["10x8brown", "10x8blue", "10x8green", "10x8maple", "10x8olive"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3"], icon: "P", baseURL: ["capa", "seir", "green", "musk"] },
    gothic: { geom: Geometry.dim10x8, cg: "cg-640", board: "board10x8", BoardCSS: ["10x8brown", "10x8blue", "10x8green", "10x8maple", "10x8olive"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3"], icon: "P" },
    gothhouse: { geom: Geometry.dim10x8, cg: "cg-640", board: "board10x8", BoardCSS: ["10x8brown", "10x8blue", "10x8green", "10x8maple", "10x8olive"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3"], icon: "P", baseURL: ["capa", "seir", "green", "musk"] },
    grand: { geom: Geometry.dim10x10, cg: "cg-640-640", board: "board10x10", BoardCSS: ["10x10brown", "10x10blue", "10x10green", "10x10maple", "10x10olive"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3"], icon: "G" },
    grandhouse: { geom: Geometry.dim10x10, cg: "cg-640-640", board: "board10x10", BoardCSS: ["10x10brown", "10x10blue", "10x10green", "10x10maple", "10x10olive"], pieces: "capa", PieceCSS: ["capa0", "capa1", "capa2", "capa3"], icon: "G", baseURL: ["capa", "seir", "green", "musk"] },
    seirawan: { geom: Geometry.dim8x8, cg: "cg-512", board: "board8x8", BoardCSS: ["8x8brown", "8x8blue", "8x8green", "8x8maple", "8x8olive"], pieces: "seirawan", PieceCSS: ["seir1", "seir0", "seir2", "seir3"], icon: "L", baseURL: ["seir", "capa", "green", "musk"] },
    shouse: { geom: Geometry.dim8x8, cg: "cg-512", board: "board8x8", BoardCSS: ["8x8brown", "8x8blue", "8x8green", "8x8maple", "8x8olive"], pieces: "seirawan", PieceCSS: ["seir1", "seir0", "seir2", "seir3"], icon: "L", baseURL: ["seir", "capa", "green", "musk"] },
    chess: { geom: Geometry.dim8x8, cg: "cg-512", board: "board8x8", BoardCSS: ["8x8brown", "8x8blue", "8x8green", "8x8maple", "8x8olive"], pieces: "standard", PieceCSS: ["standard", "green", "alpha"], icon: "M" },
    shako: { geom: Geometry.dim10x10, cg: "cg-640-640", board: "board10x10", BoardCSS: ["10x10brown", "10x10blue", "10x10green", "10x10maple", "10x10olive"], pieces: "shako", PieceCSS: ["shako0"], icon: "G" },
}

export function pocketRoles(variant: string) {
    switch (variant) {
    case "sittuyin":
        return ["rook", "knight", "silver", "ferz", "king"];
    case "crazyhouse":
        return ["pawn", "knight", "bishop", "rook", "queen"];
    case "grandhouse":
    case "gothhouse":
    case "capahouse":
        return ["pawn", "knight", "bishop", "rook", "archbishop", "cancellor", "queen"];
    case "shogi":
        return ["pawn", "lance", "knight", "silver", "gold", "bishop", "rook"];
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
    case 'minishogi':
        return color === 'white' ? 'a5b5c5d5e5' : 'a1b1c1d1e1';
    case 'cambodian':
    case 'makruk':
        return color === 'white' ? 'a6b6c6d6e6f6g6h6' : 'a3b3c3d3e3f3g3h3';
    case 'sittuyin':
        return color === 'white' ? 'a8b7c6d5e5f6g7h8' : 'a1b2c3d4e4f3g2h1';
    default:
        return color === 'white' ? 'a8b8c8d8e8f8g8h8i8j8' : 'a1b1c1d1e1f1g1h1i1j1';
    }
}

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
    default:
        return ["queen", "knight", "rook", "bishop"];
    }
}

export function mandatoryPromotion(variant, role: Role, dest: Key, color: Color) {
    if (variant === "minishogi" && role === "pawn") {
        if (color === "white") {
            return dest[1] === "5";
        } else {
            return dest[1] === "1";
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
    return variant === 'placement' || variant === 'crazyhouse' || variant === 'sittuyin' || variant.endsWith('shogi') || variant === 'seirawan' || variant === 'capahouse' || variant === 'shouse' || variant === 'grandhouse' || variant === "gothhouse";
}

export function hasEp(variant: string) {
    return variant === 'chess' || variant === 'placement' || variant === 'crazyhouse' || variant === 'capablanca' || variant === 'seirawan' || variant === 'capahouse' || variant === 'shouse' || variant === 'grand' || variant === 'grandhouse' || variant === "gothic" || variant === "gothhouse" || variant === 'shako';
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
    if (variant === 'xiangqi' || variant === 'minixiangqi') return false;
    const pz = promotionZone(variant, piece.color)
    switch (variant) {
    case 'shogi':
        return ['king', 'gold', 'ppawn', 'pknight', 'pbishop', 'prook', 'psilver', 'plance'].indexOf(piece.role) === -1
            && (pz.indexOf(orig) !== -1 || pz.indexOf(dest) !== -1);
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
    case 'shako':
        // TODO: we can use this for other variants also
        return promotions.map((move) => move.slice(0, -1)).indexOf(orig + dest) !== -1;
    default:
        return piece.role === "pawn" && pz.indexOf(dest) !== -1;
    }
}

export function uci2usi(move) {
    const parts = move.split("");
    if (parts[1] === "@") {
        parts[1] = "*";
        parts[2] = String.fromCharCode(parts[2].charCodeAt() - 48)
        parts[3] = String.fromCharCode(parts[3].charCodeAt() + 48)
    } else {
        parts[0] = String.fromCharCode(parts[0].charCodeAt() - 48)
        parts[1] = String.fromCharCode(parts[1].charCodeAt() + 48)
        parts[2] = String.fromCharCode(parts[2].charCodeAt() - 48)
        parts[3] = String.fromCharCode(parts[3].charCodeAt() + 48)
    }
    return parts.join("");
}

export function usi2uci(move) {
    // console.log("usi2uci()", move);
    const parts = move.split("");
    if (parts[1] === "*") {
        parts[1] = "@";
        parts[2] = String.fromCharCode(parts[2].charCodeAt() + 48)
        parts[3] = String.fromCharCode(parts[3].charCodeAt() - 48)
    } else {
        parts[0] = String.fromCharCode(parts[0].charCodeAt() + 48)
        parts[1] = String.fromCharCode(parts[1].charCodeAt() - 48)
        parts[2] = String.fromCharCode(parts[2].charCodeAt() + 48)
        parts[3] = String.fromCharCode(parts[3].charCodeAt() - 48)
    }
    return parts.join("");
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
