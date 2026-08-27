import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { DrawShape } from 'chessgroundx/draw';

import ffishModule from 'ffish-es6';

import { _ } from '../../i18n';
import { patch } from '../../document';
import { uci2cg } from '../../chess';
import { variantConfigIni } from '../../variants';
import { variantsIni } from '../../variantsIni';
import { povChances } from '../../analysis/winningChances';
import { alertDialog } from '../../alertDialog';
import { Ceval } from '../../messages';
import { MsgAnalysis } from '../../analysis/analysisType';
import type { GameControllerBughouse } from '../common/gameCtrl';
import type AnalysisControllerBughouse from './analysisCtrl';

// Engine evaluation for the bughouse analysis page: Fairy-Stockfish process
// wiring, UCI parsing, engine start/stop per board and PV/score/gauge/arrow
// rendering. Owned by the analysis controller as `ctrl.engine`; the controller
// type is imported type-only, so there is no runtime edge back into it.

const EVAL_REGEX = new RegExp(
    '' +
        /^info depth (\d+) seldepth \d+ multipv (\d+) /.source +
        /score (cp|mate) ([-\d]+) /.source +
        /(?:(upper|lower)bound )?nodes (\d+) nps \S+ /.source +
        /(?:hashfull \d+ )?(?:tbhits \d+ )?time (\S+) /.source +
        /pv (.+)/.source,
);

const maxDepth = 18;
const maxThreads = Math.max((navigator.hardwareConcurrency || 1) - 1, 1);

const emptySan = '\xa0';

export interface UciInfoEval {
    depth: number;
    multiPv: number;
    isMate: boolean;
    povEv: number;
    evalType: string;
    nodes: number;
    elapsedMs: number;
    moves: string;
}

export function parseUciInfoLine(line: string): UciInfoEval | undefined {
    const matches = line.match(EVAL_REGEX);
    if (!matches) return undefined;
    return {
        depth: parseInt(matches[1]),
        multiPv: parseInt(matches[2]),
        isMate: matches[3] === 'mate',
        povEv: parseInt(matches[4]),
        evalType: matches[5],
        nodes: parseInt(matches[6]),
        elapsedMs: parseInt(matches[7]),
        moves: matches[8],
    };
}

export function buildScoreStr(color: string, analysis: Ceval): string {
    const score = analysis['s'];
    let scoreStr = '';
    let ceval: number;
    if (score['mate'] !== undefined) {
        ceval = score['mate'];
        const sign = (color === 'b' && Number(ceval) > 0) || (color === 'w' && Number(ceval) < 0) ? '-' : '';
        scoreStr = '#' + sign + Math.abs(Number(ceval));
    } else if (score['cp'] !== undefined) {
        ceval = score['cp'];
        let nscore = Number(ceval) / 100.0;
        if (color === 'b') nscore = -nscore;
        scoreStr = nscore.toFixed(1);
    }
    return scoreStr;
}

export class EngineController {
    private ctrl!: AnalysisControllerBughouse;

    private vinput: VNode | HTMLElement;
    private vinputPartner: VNode | HTMLElement;
    vscore: VNode | HTMLElement;
    vscorePartner: VNode | HTMLElement;
    vinfo: VNode | HTMLElement;
    vpvlines: VNode[] | HTMLElement[];

    maxDepth: number;
    isEngineReady: boolean;

    ffish: any;
    notationAsObject: any;

    arrow: boolean;
    multipv: number;

    fsfDebug: boolean;
    fsfError: string[];
    fsfEngineBoard: any; // used to convert pv UCI move list to SAN
    private fsfOriginalPrompt?: typeof window.prompt;
    private fsfInputQueue: string[];

    constructor(private readonly chess960: boolean) {
        this.fsfDebug = true;
        this.fsfError = [];
        this.fsfInputQueue = [];

        // UCI isready/readyok
        this.isEngineReady = false;

        this.maxDepth = maxDepth;

        this.arrow = localStorage.arrow === undefined ? true : localStorage.arrow === 'true';
        this.multipv =
            localStorage.multipv === undefined ? 1 : Math.max(1, Math.min(5, parseInt(localStorage.multipv)));

        this.vinput = h('input#input', { props: { name: 'engine', type: 'checkbox' } });
        this.vinputPartner = h('input#inputPartner', { props: { name: 'engine', type: 'checkbox' } });
        this.vscore = h('score#score', '');
        this.vscorePartner = h('score#scorePartner', '');
        this.vinfo = h('info#info', _('in local browser'));
        this.vpvlines = [h('div#pv1'), h('div#pv2'), h('div#pv3'), h('div#pv4'), h('div#pv5')];
    }

    // the whole engine panel is a single unit of this widget's own view — engine.ts
    // is part view, part controller (unlike the top-level analysisCtrl.ts/analysis.ts
    // split), so it owns this composed markup directly rather than exposing one
    // placeholder method per leaf element for analysis.ts to reassemble
    renderPanel(): VNode {
        return h('div.engine', [
            h('label.switch', [this.vinput as VNode, h('span#slider.sw-slider')]),
            this.vscore as VNode,
            h('div.infoBug', ['Fairy-Stockfish 11+', h('br'), this.vinfo as VNode]),
            this.vscorePartner as VNode,
            h('label.switch', [this.vinputPartner as VNode, h('span#sliderPartner.sw-slider')]),
        ]);
    }

    pvPanel(): VNode {
        return h('div.pvbox', this.vpvlines as VNode[]);
    }

    // called once by the real controller, immediately after its own construction —
    // performs this widget's one ctrl-dependent initial render (the engine-toggle
    // checkboxes need ctrl.boardA/ctrl.boardB) and makes `ctrl` available to every
    // other method on this class from this point on
    attachCtrl(ctrl: AnalysisControllerBughouse): void {
        this.ctrl = ctrl;

        ffishModule().then((loadedModule: any) => {
            this.ffish = loadedModule;
            this.ffish.loadVariantConfig(
                variantConfigIni(variantsIni, this.ctrl.boardA.variant.name),
            );
            this.notationAsObject = this.notation2ffishjs(this.ctrl.boardA.variant.notation);
        });

        this.vinput = patch(this.vinput, h('input#input', this.renderInput(ctrl.boardA)));
        this.vinputPartner = patch(this.vinputPartner, h('input#inputPartner', this.renderInput(ctrl.boardB)));
    }

    notation2ffishjs = (n: cg.Notation) => {
        switch (n) {
            case cg.Notation.ALGEBRAIC:
                return this.ffish.Notation.SAN;
            case cg.Notation.SHOGI_ARBNUM:
                return this.ffish.Notation.SHOGI_HODGES_NUMBER;
            case cg.Notation.JANGGI:
                return this.ffish.Notation.JANGGI;
            case cg.Notation.XIANGQI_ARBNUM:
                return this.ffish.Notation.XIANGQI_WXF;
            default:
                return this.ffish.Notation.SAN;
        }
    };

    // info line reset shown while the engine is off or (re)starting
    clearInfo = () => {
        this.vinfo = patch(this.vinfo, h('info#info', '-'));
    };

    pvboxIni() {
        if (this.ctrl.boardA.localAnalysis || this.ctrl.boardB.localAnalysis) this.engineStop();
        this.clearPvlines();
        if (this.ctrl.boardA.localAnalysis) {
            this.engineGo(this.ctrl.boardA);
        } else if (this.ctrl.boardB.localAnalysis) {
            this.engineGo(this.ctrl.boardB);
        }
    }

    pvView(i: number, pv: VNode | undefined) {
        if (this.vpvlines === undefined) this.pvboxIni();
        this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}.pv`, pv));
    }

    clearPvlines() {
        for (let i = 4; i >= 0; i--) {
            if (i + 1 <= this.multipv && (this.ctrl.boardA.localAnalysis || this.ctrl.boardB.localAnalysis)) {
                this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}.pv`, [h('pvline', h('pvline', '-'))]));
            } else {
                this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}`));
            }
        }
    }

    private renderInput = (cc: GameControllerBughouse) => {
        return {
            attrs: {
                disabled: false,
            },
            on: {
                change: () => {
                    cc.localAnalysis = !cc.localAnalysis;
                    if (cc.localAnalysis) {
                        cc.partnerCC.localAnalysis = false;
                        const partnerCheckboxId = cc.partnerCC.boardName == 'a' ? 'input' : 'inputPartner';
                        (document.getElementById(partnerCheckboxId) as HTMLInputElement).checked = false;

                        this.clearInfo();
                        this.pvboxIni();
                    } else {
                        this.engineStop();
                        this.pvboxIni();
                    }
                },
            },
        };
    };

    fsfPostMessage(msg: string) {
        if (this.fsfDebug) console.debug('<---', msg);
        window.fsf.postMessage(msg);
    }

    loadVariantsIntoFsfEngine() {
        const marker = 'PYCHESS_VARIANTS_INI_EOF_' + Date.now();
        const lines = variantConfigIni(variantsIni, this.ctrl.boardA.variant.name)
            .replace(/\r\n/g, '\n')
            .split('\n');
        this.installFsfPromptQueue([...lines, marker]);
        if (this.fsfDebug) console.debug('<---', '... variants.ini content queued for prompt stdin ...');
        this.fsfPostMessage('load <<' + marker);
        this.fsfPostMessage('uci');
    }

    installFsfPromptQueue(lines: string[]) {
        if (this.fsfOriginalPrompt === undefined) this.fsfOriginalPrompt = window.prompt;
        this.fsfInputQueue = lines;
        window.prompt = ((message?: string, defaultValue?: string): string => {
            const line = this.fsfInputQueue.shift();
            if (line !== undefined) return line;
            if (this.fsfDebug) {
                console.warn('Fairy-Stockfish requested unexpected stdin input:', message, defaultValue);
            }
            return '';
        }) as typeof window.prompt;
    }

    restoreFsfPrompt() {
        if (this.fsfOriginalPrompt !== undefined) {
            window.prompt = this.fsfOriginalPrompt;
            this.fsfOriginalPrompt = undefined;
        }
        this.fsfInputQueue = [];
    }

    onFSFline = (line: string) => {
        if (this.fsfDebug) console.debug('--->', line);

        if (line.startsWith('info')) {
            const error = 'info string ERROR: ';
            if (line.startsWith(error)) {
                this.fsfError.push(line.slice(error.length));
                if (line.includes('terminated')) {
                    const suggestion = _('Try browser page reload.');
                    this.fsfError.push('');
                    this.fsfError.push(suggestion);
                    const errorMsg = this.fsfError.join('\n');
                    void alertDialog({ text: errorMsg });
                    return;
                }
            }
        }

        if (line.includes('uciok')) this.restoreFsfPrompt();

        if (line.includes('readyok')) this.isEngineReady = true;

        if (line.startsWith('Fairy-Stockfish')) {
            this.loadVariantsIntoFsfEngine();
        }

        // reuse renderInput (not a bare { attrs: { disabled: false } }) so the change
        // listener's `on` data is always present — patching a data-less vnode against
        // a retained old vnode that does carry `on` makes snabbdom's eventlisteners
        // module treat the listener as removed, not merely left unspecified
        this.vinput = patch(this.vinput, h('input#input', this.renderInput(this.ctrl.boardA)));
        this.vinputPartner = patch(this.vinputPartner, h('input#inputPartner', this.renderInput(this.ctrl.boardB)));

        this.fsfEngineBoard = new this.ffish.Board(this.ctrl.variant.name, this.ctrl.boardA.fullfen, false);
        window.addEventListener('beforeunload', () => this.fsfEngineBoard.delete());

        if (!(this.ctrl.boardA.localAnalysis || this.ctrl.boardB.localAnalysis) || !this.isEngineReady) return;

        const info = parseUciInfoLine(line);
        if (!info) {
            if (line.includes('mate 0')) this.clearPvlines();
            return;
        }
        const { depth, multiPv, isMate, povEv, evalType, nodes, elapsedMs, moves } = info;
        //console.log("---", depth, multiPv, isMate, povEv, evalType, nodes, elapsedMs, moves);

        // Sometimes we get #0. Let's just skip it.
        if (isMate && !povEv) return;

        // For now, ignore most upperbound/lowerbound messages.
        // The exception is for multiPV, sometimes non-primary PVs
        // only have an upperbound.
        // See: https://github.com/ddugovic/Stockfish/issues/228
        if (evalType && multiPv === 1) return;

        let score;
        if (isMate) {
            score = { mate: povEv };
        } else {
            score = { cp: povEv };
        }
        const knps = nodes / elapsedMs;
        const boardInAnalysis = this.ctrl.boardA.localAnalysis ? this.ctrl.boardA : this.ctrl.boardB;
        const msg: MsgAnalysis = {
            type: 'local-analysis',
            ply: this.ctrl.ply,
            color: boardInAnalysis.turnColor.slice(0, 1),
            ceval: { d: depth, multipv: multiPv, p: moves, s: score, k: knps },
        };
        this.onMsgAnalysis(msg, boardInAnalysis);
    };

    engineStop = () => {
        this.isEngineReady = false;
        this.fsfPostMessage('stop');
        this.fsfPostMessage('isready');
    };

    engineGo = (cc: GameControllerBughouse) => {
        if (this.chess960) {
            this.fsfPostMessage('setoption name UCI_Chess960 value true');
        }
        if (this.ctrl.variant.name !== 'chess') {
            this.fsfPostMessage('setoption name UCI_Variant value ' + /*'crazyhouse'*/ this.ctrl.variant.name);
        }
        this.fsfPostMessage('setoption name Use NNUE value false');

        //console.log('setoption name Threads value ' + maxThreads);
        this.fsfPostMessage('setoption name Threads value ' + maxThreads);

        this.fsfPostMessage('setoption name MultiPV value ' + this.multipv);

        //console.log('position fen ', this.fullfen);
        this.fsfPostMessage('position fen ' + cc.fullfen);

        if (this.maxDepth >= 99) {
            this.fsfPostMessage('go depth 99');
        } else {
            this.fsfPostMessage('go movetime 90000 depth ' + this.maxDepth);
        }
    };

    onMoreDepth = () => {
        this.maxDepth = 99;
        this.engineStop();
        this.engineGo(this.ctrl.boardA);
    };

    makePvMove(pv_line: string, cc: GameControllerBughouse) {
        const move = uci2cg(pv_line.split(' ')[0]);
        this.ctrl.sendMove(cc, move /*move.slice(0, 2) as cg.Orig, move.slice(2, 4) as cg.Key, move.slice(4, 5)*/);
    }

    // Updates PV, score, gauge and the best move arrow
    drawEval = (
        ceval: Ceval | undefined,
        scoreStr: string | undefined,
        turnColor: cg.Color,
        boardInAnalysis: GameControllerBughouse,
    ) => {
        const pvlineIdx = ceval && ceval.multipv ? ceval.multipv - 1 : 0;

        // Render PV line
        if (ceval?.p !== undefined) {
            let pvSan: string | VNode = ceval.p;
            if (this.fsfEngineBoard) {
                try {
                    this.fsfEngineBoard.setFen(boardInAnalysis.fullfen);
                    pvSan = this.fsfEngineBoard.variationSan(ceval.p, this.notationAsObject);
                    if (pvSan === '') pvSan = emptySan;
                } catch {
                    pvSan = emptySan;
                }
            }
            if (pvSan !== emptySan) {
                pvSan = h(
                    'pv-san',
                    { on: { click: () => this.makePvMove(ceval.p as string, boardInAnalysis) } },
                    pvSan,
                );
                this.pvView(
                    pvlineIdx,
                    h('pvline', [
                        this.multipv > 1 && boardInAnalysis.localAnalysis ? h('strong', scoreStr) : '',
                        pvSan,
                    ]),
                );
            }
        } else {
            this.pvView(pvlineIdx, h('pvline', boardInAnalysis.localAnalysis ? h('pvline', '-') : ''));
        }

        // Render gauge, arrow and main score value for first PV line only
        if (pvlineIdx > 0) return;

        let shapes0: DrawShape[] = [];
        boardInAnalysis.chessground.setAutoShapes(shapes0);

        const gaugeEl = document.getElementById(
            boardInAnalysis.boardName == 'a' ? 'gauge' : 'gaugePartner',
        ) as HTMLElement;
        if (gaugeEl && pvlineIdx === 0) {
            const fillEl = gaugeEl.querySelector('div.fill') as HTMLElement | undefined;
            if (fillEl && ceval !== undefined) {
                const score = ceval['s'];
                const color = turnColor;
                if (score !== undefined) {
                    const ev = povChances(color, score);
                    fillEl.style.height = String(100 - (ev + 1) * 50) + '%';
                } else {
                    fillEl.style.height = '50%';
                }
            }
        }

        if (ceval?.p !== undefined) {
            const pv_move = uci2cg(ceval.p.split(' ')[0]);
            // console.log("ARROW", this.arrow);
            if (this.arrow && pvlineIdx === 0) {
                const atPos = pv_move.indexOf('@');
                if (atPos > -1) {
                    const d = pv_move.slice(atPos + 1, atPos + 3) as cg.Key;
                    let color = turnColor;
                    const dropPieceRole = util.roleOf(pv_move.slice(0, atPos) as cg.Letter);

                    shapes0 = [
                        {
                            orig: d,
                            brush: 'paleGreen',
                            piece: {
                                color: color,
                                role: dropPieceRole,
                            },
                        },
                        { orig: d, brush: 'paleGreen' },
                    ];
                } else {
                    const o = pv_move.slice(0, 2) as cg.Key;
                    const d = pv_move.slice(2, 4) as cg.Key;
                    shapes0 = [{ orig: o, dest: d, brush: 'paleGreen', piece: undefined }];
                }
            }

            if (boardInAnalysis.boardName == 'a') {
                this.vscore = patch(this.vscore, h('score#score', scoreStr));
            } else {
                this.vscorePartner = patch(this.vscorePartner, h('score#scorePartner', scoreStr));
            }

            const info = [h('span', _('Depth') + ' ' + String(ceval.d) + '/' + this.maxDepth)];
            if (ceval.k) {
                if (ceval.d === this.maxDepth && this.maxDepth !== 99) {
                    info.push(
                        h('a.icon.icon-plus-square', {
                            props: { type: 'button', title: _('Go deeper') },
                            on: { click: () => this.onMoreDepth() },
                        }),
                    );
                } else if (ceval.d !== 99) {
                    info.push(h('span', ', ' + Math.round(ceval.k) + ' knodes/s'));
                }
            }
            this.vinfo = patch(this.vinfo, h('info#info', info));
        } else {
            if (boardInAnalysis.boardName == 'a') {
                this.vscore = patch(this.vscore, h('score#score', ''));
            } else {
                this.vscorePartner = patch(this.vscorePartner, h('score#scorePartner', ''));
            }
            this.vinfo = patch(this.vinfo, h('info#info', _('in local browser')));
        }

        // console.log(shapes0);
        boardInAnalysis.chessground.set({
            drawable: { autoShapes: shapes0 },
        });
    };

    private onMsgAnalysis = (msg: MsgAnalysis, boardInAnalysis: GameControllerBughouse) => {
        // console.log(msg);
        if (msg['ceval']['s'] === undefined) return;
        const scoreStr = buildScoreStr(msg.color, msg.ceval);
        const turnColor = msg.color === 'w' ? 'white' : 'black';
        this.drawEval(msg.ceval, scoreStr, turnColor, boardInAnalysis);
    };
}
