import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';

import { _ } from '../../i18n';
import { patch } from '../../document';
import { BugBoardName } from '../../types';
import { titleCase } from '@/analysis/analysisCtrl';
import { renderBughouseTreePgnMoveText } from './analysisTreeTwoBoards';
import type AnalysisControllerBughouse from './analysisCtrl';

// PGN generation and FEN/PGN panel rendering for the bughouse analysis page.
// Free functions over the analysis controller (type-only import — no runtime
// edge back into the controller module); the pure tree/line move-text renderers
// live in analysisTreeTwoBoards.ts and are composed here.

function pgnText(ctrl: AnalysisControllerBughouse, moveText: string): string {
    const name = (board: BugBoardName, color: cg.Color) => ctrl.seats.byBoardAndColor(board, color).player.username;
    const today = new Date().toISOString().substring(0, 10).replace(/-/g, '.');

    const event = '[Event "?"]';
    const site = `[Site "${ctrl.boardA.home}/analysis/${ctrl.variant.name}"]`;
    const date = `[Date "${today}"]`;
    const whiteA = `[WhiteA "${name('a', 'white')}"]`;
    const blackA = `[BlackA "${name('a', 'black')}"]`;
    const whiteB = `[WhiteB "${name('b', 'white')}"]`;
    const blackB = `[BlackB "${name('b', 'black')}"]`;
    const result = '[Result "*"]';
    const variant = `[Variant "${titleCase(ctrl.variant.name)}"]`;
    const fen = `[FEN "${ctrl.steps[0].fen}"]`;
    const setup = '[SetUp "1"]';

    return `${event}\n${site}\n${date}\n${whiteA}\n${blackA}\n${whiteB}\n${blackB}\n${result}\n${variant}\n${fen}\n${setup}\n\n${moveText} *\n`;
}

// legacy (non-tree) mainline move text with per-board move counters (1A. 1B. ...)
function mainlineMoveText(ctrl: AnalysisControllerBughouse): string {
    const moves: string[] = [];
    let plyA: number = 0;
    let plyB: number = 0;

    for (let ply = 1; ply <= ctrl.ply; ply++) {
        const step = ctrl.steps[ply];
        if (step.boardName === 'a') plyA++;
        else plyB++;

        const moveCounter =
            Math.floor(step.boardName === 'a' ? (plyA + 1) / 2 : (plyB + 1) / 2) + step.boardName!.toUpperCase() + '.';
        moves.push(moveCounter + (step.sanSAN ?? step.san ?? ''));
    }
    return moves.join(' ');
}

export function getPgn(ctrl: AnalysisControllerBughouse): string {
    if (ctrl.tree.hasAnalysisTree()) {
        return pgnText(
            ctrl,
            renderBughouseTreePgnMoveText(ctrl.tree.analysisTree!, node => node.step.sanSAN ?? node.step.san ?? ''),
        );
    }
    return pgnText(ctrl, mainlineMoveText(ctrl));
}

// Owns the FEN & PGN panel's two retained regions (#copyfen, #pgntext), built
// ctrl-free at construction so analysis.ts can embed them directly; render()
// performs the ctrl-dependent content render, called both for the first render
// (from the controller's constructor) and every subsequent refresh, so both
// share the same retained state instead of a fresh id lookup each time.
export class PgnView {
    private vCopyfen: VNode | HTMLElement;
    private vPgntext: VNode | HTMLElement;

    constructor() {
        this.vCopyfen = h('div#copyfen');
        this.vPgntext = h('div#pgntext');
    }

    // the two regions are always rendered as adjacent siblings in the FEN & PGN
    // panel, so — same as EngineController's renderPanel() — this widget hands
    // analysis.ts one composed unit rather than two separate placeholder calls
    placeholders(): VNode[] {
        return [this.vCopyfen as VNode, this.vPgntext as VNode];
    }

    render(ctrl: AnalysisControllerBughouse, pgn: string): void {
        const buttons = [
            h(
                'a.i-pgn',
                {
                    on: {
                        click: () => console.log('downloadPgnText("pychess-variants_" + this.gameId) not implemented'),
                    },
                },
                [
                    h(
                        'i',
                        {
                            props: { title: _('Download game to PGN file') },
                            class: { icon: true, 'icon-download': true },
                        },
                        _('Download PGN'),
                    ),
                ],
            ),
            h('a.i-pgn', { on: { click: () => console.log('copyTextToClipboard(this.uci_usi) not implemented') } }, [
                h(
                    'i',
                    {
                        props: { title: _('Copy USI/UCI to clipboard') },
                        class: { icon: true, 'icon-clipboard': true },
                    },
                    _('Copy UCI/USI'),
                ),
            ]),
            h('a.i-pgn', { on: { click: () => console.log('copyBoardToPNG not implemented') } }, [
                h(
                    'i',
                    {
                        props: { title: _('Download position to PNG image file') },
                        class: { icon: true, 'icon-download': true },
                    },
                    _('PNG image'),
                ),
            ]),
        ];

        this.vCopyfen = patch(this.vCopyfen, h('div#copyfen', buttons));

        const e = document.getElementById('fullfen') as HTMLInputElement;
        e.value = ctrl.boardA.fullfen + ' | ' + ctrl.boardB.fullfen;

        this.vPgntext = patch(this.vPgntext, h('div#pgntext', pgn));
    }
}

// regenerate the PGN and refresh the FEN & PGN panel (no-op in embed contexts)
export function updateFENAndPGN(ctrl: AnalysisControllerBughouse) {
    if (ctrl.model['embed']) return;
    ctrl.pgnView.render(ctrl, getPgn(ctrl));
}
