import ffishModule from 'ffish-es6';

import { h, VNode } from 'snabbdom';

import { _ } from '../i18n';
import { variantsIni } from '../variantsIni';
import { VARIANTS } from '../chess';
import { PyChessModel } from "../types";

const BRAINKING_SITE = '[Site "BrainKing.com (Prague, Czech Republic)"]';
const EMBASSY_FEN = '[FEN "rnbqkmcbnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKMCBNR w KQkq - 0 1"]';
const BUGHOUSE_VARIANT = '[Variant "Bughouse"]';

export function pasteView(model: PyChessModel): VNode[] {
    let ffish: any = null;
    ffishModule().then((loadedModule: any) => {
        ffish = loadedModule;
    });

    const importGameBugH = (pgn: string) => {
        const XHR = new XMLHttpRequest();
        const FD  = new FormData();
        FD.append("pgn", pgn)
        XHR.onreadystatechange = function() {
            if (this.readyState === 4 && this.status === 200) {
                const response = JSON.parse(this.responseText);
                if (response['gameId'] !== undefined) {
                    window.location.assign(model["home"] + '/analysis/' + response['gameId']);
                } else if (response['error'] !== undefined) {
                    alert(response['error']);
                }
            }
        };

        XHR.open("POST", "/import", true);
        XHR.send(FD);
    }

    const importGame = (model: PyChessModel, ffish: any) => {
        const e = document.getElementById("pgnpaste") as HTMLInputElement;
        //console.log('PGN:', e.value);
        let pgn = e.value;

        if (pgn.indexOf(BUGHOUSE_VARIANT) !== -1 ) {
            importGameBugH(pgn);
            return;
        }

        // Add missing Variant tag and switch short/long castling notations
        if (pgn.indexOf(BRAINKING_SITE) !== -1 && pgn.indexOf(EMBASSY_FEN) !== -1) {
            const lines = pgn.split(/\n/);
            const fenIndex = lines.findIndex((elem) => {return elem.startsWith('[FEN ');});
            lines[fenIndex] = `[FEN "${VARIANTS['embassy'].startFen}"]`;
            lines.splice(fenIndex, 0, '[Variant "Embassy"]');
            lines.forEach((line, idx) => {if (idx > fenIndex) lines[idx] = line.replace(/(O-O-O|O-O)/g, (match) => { return match === 'O-O' ? 'O-O-O' : 'O-O' });});
            pgn = lines.join('\n');
        }

        if (ffish !== null) {
            ffish.loadVariantConfig(variantsIni);
            const XHR = new XMLHttpRequest();
            const FD  = new FormData();

            let variant, initialFen, board;
            let mainlineMoves: string[] = [];

            try {

                const game = ffish.readGamePGN(pgn);

                variant = "chess";
                const v = game.headers("Variant");
                //console.log("Variant:", v);
                if (v) variant = v.toLowerCase();

                initialFen = VARIANTS[variant].startFen;
                const f = game.headers("FEN");
                if (f) initialFen = f;

                // TODO: crazyhouse960 but without 960? (export to lichess hack)
                const is960 = variant.includes("960") || variant.includes('random');

                board = new ffish.Board(variant, initialFen, is960);

                mainlineMoves = game.mainlineMoves().split(" ");
                for (let idx = 0; idx < mainlineMoves.length; ++idx) {
                    board.push(mainlineMoves[idx]);
                }

                const tags = (game.headerKeys() as string).split(' ');
                tags.forEach((tag) => {
                    FD.append( tag, game.headers(tag) );
                });
                FD.append('moves', game.mainlineMoves());
                FD.append('final_fen', board.fen());
                FD.append('username', model["username"]);

                board.delete();
                game.delete();

            }
            catch(err) {
                e.setCustomValidity(err.message ? _('Invalid PGN') : '');
                alert(err);
                return;
            }

            XHR.onreadystatechange = function() {
                if (this.readyState === 4 && this.status === 200) {
                    const response = JSON.parse(this.responseText);
                    if (response['gameId'] !== undefined) {
                        window.location.assign(model["home"] + '/' + response['gameId']);
                    } else if (response['error'] !== undefined) {
                        alert(response['error']);
                    }
                }
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
