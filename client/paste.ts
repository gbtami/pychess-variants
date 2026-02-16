import { h, VNode } from 'snabbdom';

import { FairyStockfish } from 'ffish-es6';

import { _ } from './i18n';
import { variantsIni } from './variantsIni';
import { VARIANTS } from './variants';
import { parseKif, resultString } from '../client/kif';
import { PyChessModel } from "./types";
import { importGameBugH } from "@/bug/paste.bug";

const BRAINKING_SITE = '[Site "BrainKing.com (Prague, Czech Republic)"]';
const EMBASSY_FEN = '[FEN "rnbqkmcbnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKMCBNR w KQkq - 0 1"]';
const BUGHOUSE_VARIANT = '[WhiteA';
const IMPORT_FFISH_ERROR_BUFFER: string[] = [];
const FEN_VALIDATION_ERRORS: Record<number, string> = {
    [-14]: 'Invalid counting rule field',
    [-13]: 'Invalid check count field',
    [-12]: 'Invalid promoted piece marker',
    [-11]: 'Invalid number of FEN fields',
    [-10]: 'Invalid character in board layout',
    [-9]: 'Touching kings are not allowed',
    [-8]: 'Invalid board geometry',
    [-7]: 'Invalid pocket information',
    [-6]: 'Invalid side to move field',
    [-5]: 'Invalid castling information',
    [-4]: 'Invalid en-passant square',
    [-3]: 'Invalid number of kings',
    [-2]: 'Invalid half-move counter',
    [-1]: 'Invalid move counter',
    [0]: 'Empty FEN',
};

export function recordImportFfishError(text: string): void {
    const message = text.trim();
    if (/^Variant '.*' already exists\.$/.test(message)) return;
    console.warn(message);
    IMPORT_FFISH_ERROR_BUFFER.push(message);
    if (IMPORT_FFISH_ERROR_BUFFER.length > 200) IMPORT_FFISH_ERROR_BUFFER.shift();
}


export function pasteView(model: PyChessModel): VNode[] {
    const ffish: FairyStockfish = model.ffish;

    const importGame = (model: PyChessModel, ffish: any) => {
        const e = document.getElementById("pgnpaste") as HTMLInputElement;
        //console.log('PGN:', e.value);
        let pgn = e.value;

        if (pgn.indexOf(BUGHOUSE_VARIANT) !== -1 ) {
            importGameBugH(pgn, model["home"]);
            return;
        }

        // Add missing Variant tag and switch short/long castling notations
        if (pgn.indexOf(BRAINKING_SITE) !== -1 && pgn.indexOf(EMBASSY_FEN) !== -1) {
            const lines = pgn.split(/\n/);

            // fix FEN
            const fenIndex = lines.findIndex((elem) => {return elem.startsWith('[FEN ');});
            lines[fenIndex] = `[FEN "${VARIANTS['embassy'].startFen}"]`;

            const variantIndex = lines.findIndex((elem) => {return elem.startsWith('[Variant ');});
            if (variantIndex < 0) {
                // add missing variant tag
                lines.splice(variantIndex, 0, '[Variant "Capablanca"]');
            } else {
                // change variant to Capa
                lines.splice(variantIndex, 1, '[Variant "Capablanca"]');
            }

            lines.forEach((line, idx) => {if (idx > fenIndex) lines[idx] = line.replace(/(O-O-O|O-O)/g, (match) => { return match === 'O-O' ? 'O-O-O' : 'O-O' });});
            pgn = lines.join('\n');
        }

        if (ffish !== null) {
            ffish.loadVariantConfig(variantsIni);
            const XHR = new XMLHttpRequest();
            const FD  = new FormData();
            const ffishErrorStart = IMPORT_FFISH_ERROR_BUFFER.length;

            let variant: string;
            let initialFen: string;
            let board;
            let mainlineMoves: string[] = [];

            try {
                const firstLine = pgn.slice(0, pgn.indexOf('\n'));

                // Fullwidth Colon(!) is used to separate game tag key-value pairs in Shogi KIF files :
                if (firstLine.includes('：') || firstLine.toUpperCase().includes('KIF')) {
                    const kif = parseKif(pgn);
                    //console.log(kif['moves'].join(', '));
                    const handicap = kif['handicap'];
                    const moves = kif['moves'];
                    let status = kif['status'];
                    let result = kif['result'];
                    const as = VARIANTS['shogi'].alternateStart;
                    const isHandicap = (handicap !== '' && as![handicap] !== undefined);
                    if (isHandicap) {
                        FD.append('FEN', as![handicap]);
                    }

                    const fen = (isHandicap) ? as![handicap] : VARIANTS['shogi'].startFen;
                    board = new ffish.Board('shogi', fen);
                    let move;

                    for (let idx = 0; idx < moves.length; ++idx) {
                        move = moves[idx];
                        const pushed = board.push(move);
                        if (!pushed) {
                            alert('Illegal move ' + move);
                            status = 10;
                            // LOSS for the moving player
                            result = resultString(false, idx + 1, isHandicap);
                            break;
                        }
                        mainlineMoves.push(move);
                    }

                    FD.append('Variant', 'shogi');
                    FD.append('Date', kif['date']);
                    FD.append('White', kif['sente']);
                    FD.append('Black', kif['gote']);
                    FD.append('TimeControl', kif['tc']);
                    FD.append('moves', mainlineMoves.join(' '));
                    FD.append('Result', result);
                    FD.append('Status', ""+status);
                    FD.append('final_fen', board.fen());
                    FD.append('username', model['username']);

                    board.delete();

                } else {

                    const game = ffish.readGamePGN(pgn);
                    const parserError = getLatestFfishError(ffishErrorStart);
                    if (parserError) {
                        throw new Error(parserError);
                    }

                    const variantInfo = parseVariantTag(game.headers("Variant"));
                    variant = variantInfo.variant;

                    if (variant === 'alice') {
                        // TODO
                        const error = _('Importing Alice PGN is not supported');
                        e.setCustomValidity(error);
                        alert(error);
                        return;
                    }
                    if (!(variant in VARIANTS)) {
                        throw new Error(`Unsupported PGN Variant tag: ${variantInfo.raw}`);
                    }

                    initialFen = VARIANTS[variant].startFen;
                    const f = game.headers("FEN");
                    if (f) {
                        const fenValidation = validateFenTag(ffish, f, variantInfo.variant, variantInfo.chess960);
                        if (fenValidation !== null) {
                            throw new Error(fenValidation);
                        }
                        initialFen = f;
                    }

                    const t = game.headers("Termination");
                    //console.log("Termination:", t);
                    if (t) {
                        const status = getStatus(t.toLowerCase());
                        FD.append('Status', ""+status);
                    }

                    board = new ffish.Board(variant, initialFen, variantInfo.chess960);

                    mainlineMoves = game.mainlineMoves().split(/\s+/).filter((move: string) => move.length > 0);
                    for (let idx = 0; idx < mainlineMoves.length; ++idx) {
                        const pushed = board.push(mainlineMoves[idx]);
                        if (!pushed) {
                            throw new Error(`Illegal move at ply ${idx + 1}: ${mainlineMoves[idx]}`);
                        }
                    }

                    const tags = (game.headerKeys() as string).split(' ');
                    tags.forEach((tag) => {
                        FD.append( tag, game.headers(tag) );
                    });
                    FD.append('moves', mainlineMoves.join(' '));
                    FD.append('final_fen', board.fen());
                    FD.append('username', model["username"]);

                    board.delete();
                    game.delete();
                }
            }
            catch(err) {
                const message = buildImportErrorMessage(err, pgn, ffish);
                e.setCustomValidity(message);
                alert(message);
                return;
            }

            XHR.onreadystatechange = function() {
                if (this.readyState !== 4) return;

                let response: Record<string, string> = {};
                if (this.responseText) {
                    try {
                        response = JSON.parse(this.responseText);
                    } catch (_err) {
                        response = {};
                    }
                }

                if (this.status === 200) {
                    if (response['gameId'] !== undefined) {
                        window.location.assign(model["home"] + '/' + response['gameId']);
                        return;
                    }
                    if (response['error'] !== undefined) {
                        alert(response['error']);
                        return;
                    }
                    alert(_('Import failed'));
                    return;
                }

                alert(response['error'] ?? `${_('Import failed')} (${this.status})`);
            };
            XHR.onerror = function() {
                alert(_('Import failed'));
            };
            XHR.open("POST", "/import", true);
            XHR.send(FD);
        }
    }

    return [ h('div.paste', [
        h('div.container', [
            h('strong', _('Paste the PGN text here')),
            h('textarea#pgnpaste', {attrs: {spellcheck: "false"}}),
            h('div.import', [
                h('button#import', {on: { click: () => importGame(model, ffish) }}, [
                    h('i', {class: {"icon": true, "icon-cloud-upload": true} }, _('IMPORT GAME'))
                ])
            ])
        ])
    ])];
}

/*
    ABORTED,
    MATE,
    RESIGN,
    STALEMATE,
    TIMEOUT,
    DRAW,
    FLAG,
    ABANDON,
    CHEAT,
    BYEGAME,
    INVALIDMOVE,
    UNKNOWNFINISH,
    VARIANTEND,
    CLAIM,
*/
function getStatus(termination: string) {
    if (termination.includes('checkmate')) return '1';
    if (termination.includes('resign')) return '2';
    if (termination.includes('stalemate')) return '3';
    if (termination.includes('draw')) return '5';
    if (termination.includes('repetition')) return '5';
    if (termination.includes('insufficient')) return '5';
    if (termination.includes('time')) return '6';
    if (termination.includes('abandon')) return '7';
    return '11';  // unknown
}

function parseVariantTag(rawVariant: string): { variant: string; chess960: boolean; raw: string } {
    const raw = rawVariant || 'chess';
    let variant = raw.toLowerCase();
    let chess960 = variant.includes("960") || variant.includes('random');

    variant = variant.endsWith('960') ? variant.slice(0, -3) : variant;
    if (variant === "caparandom") {
        variant = "capablanca";
        chess960 = true;
    } else if (variant === "fischerandom") {
        variant = "chess";
        chess960 = true;
    }
    return { variant, chess960, raw };
}

function validateFenTag(ffish: FairyStockfish, fen: string, variant: string, chess960: boolean): string | null {
    const validationCode = ffish.validateFen(fen, variant, chess960);
    if (validationCode === 1) return null;

    const details = FEN_VALIDATION_ERRORS[validationCode] ?? 'Unknown FEN validation error';
    return `Invalid [FEN] tag (code ${validationCode}): ${details}.`;
}

function getLatestFfishError(fromIndex: number): string | null {
    if (IMPORT_FFISH_ERROR_BUFFER.length <= fromIndex) return null;
    const latest = IMPORT_FFISH_ERROR_BUFFER[IMPORT_FFISH_ERROR_BUFFER.length - 1];
    return latest && latest.trim() ? latest.trim() : null;
}

function extractPgnTags(pgn: string): Record<string, string> {
    const tags: Record<string, string> = {};
    const regex = /^\s*\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(pgn)) !== null) {
        tags[match[1]] = match[2].replace(/\\"/g, '"');
    }
    return tags;
}

function buildImportErrorMessage(err: unknown, pgn: string, ffish: FairyStockfish): string {
    const tags = extractPgnTags(pgn);
    const variantInfo = parseVariantTag(tags["Variant"] ?? "chess");

    if (!(variantInfo.variant in VARIANTS)) {
        return `Unsupported PGN Variant tag: ${variantInfo.raw}.`;
    }

    const fen = tags["FEN"];
    if (fen) {
        const fenValidation = validateFenTag(ffish, fen, variantInfo.variant, variantInfo.chess960);
        if (fenValidation !== null) return fenValidation;
    }

    const errorMessage =
        err instanceof Error
            ? err.message
            : (typeof err === "string" ? err : "");
    if (!errorMessage) return _('Invalid PGN');
    if (errorMessage.includes("memory access out of bounds")) {
        return "Failed to parse PGN. Check [Variant], [FEN], and move text formatting.";
    }
    return errorMessage;
}
