import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { read } from 'chessgroundx/fen';

import { _ } from './i18n';

import { Variant, variantGroups } from './variants';

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

export function uci2LastMove(move: string | undefined): cg.Orig[] | undefined {
    if (!move) return undefined;
    let moveStr = uci2cg(move);
    if (moveStr.startsWith('+')) moveStr = moveStr.slice(1);
    const comma = moveStr.indexOf(',');
    const lastMove = [ moveStr.slice(0, 2) as cg.Orig, moveStr.slice(2, 4) as cg.Key ];
    if (comma > -1) lastMove.push(moveStr.slice(-2) as cg.Key);
    return lastMove;
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
    const king = util.letterOf(variant.kingRoles[0]);
    const bK = lc(placement, king, false);
    const wK = lc(placement, king, true);
    if (variantName === 'spartan') {
        if (bK === 0 || bK > 2 || wK !== 1) return false;
    } else {
        if (bK !== 1 || wK !== 1) return false;
    }

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
        if (variant.promotion.type === 'shogi')
            return piece.role.slice(1) as cg.Role;
        else
            return 'p-piece';
    } else {
        return piece.role;
    }
}

export function promotedRole(variant: Variant, piece: cg.Piece): cg.Role {
    if (!piece.promoted && variant.promotion.roles.includes(piece.role)) {
        if (variant.promotion.type === 'shogi')
            return 'p' + piece.role as cg.Role;
        else
            return util.roleOf(variant.promotion.order[0] as cg.Letter);
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

export function promotionSuffix(move: UCIMove | CGMove): PromotionSuffix {
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

export function colorIcon(variant: string, color: string) {
    if (variantGroups.shogi.variants.includes(variant)) {
        return (color === 'Black') ? 'icon-sente' : 'icon-gote';
    } else {
        return `icon-${color.toLowerCase()}`;
    }
}
