import { h, VNode } from 'snabbdom';

import * as idb from 'idb-keyval';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { DrawShape } from 'chessgroundx/draw';

import { newWebsocket } from './socket';
import { _ } from './i18n';
import { sound } from './sound';
import { uci2LastMove, uci2cg, cg2uci } from './chess';
import { crosstableView } from './crosstable';
import { chatView } from './chat';
import { createMovelistButtons, updateMovelist, selectMove, activatePlyVari } from './movelist';
import { povChances } from './winningChances';
import { copyTextToClipboard } from './clipboard';
import { analysisChart } from './analysisChart';
import { movetimeChart } from './movetimeChart';
import { renderClocks } from './analysisClock';
import { copyBoardToPNG } from './png';
import { boardSettings } from './boardSettings';
import { patch, downloadPgnText } from './document';
import { variantsIni } from './variantsIni';
import { Chart } from "highcharts";
import { PyChessModel } from "./types";
import { Ceval, MsgBoard, MsgUserConnected, Step, CrossTable } from "./messages";
import { MsgAnalysis, MsgAnalysisBoard } from './analysisType';
import { GameController } from './gameCtrl';

const EVAL_REGEX = new RegExp(''
  + /^info depth (\d+) seldepth \d+ multipv (\d+) /.source
  + /score (cp|mate) ([-\d]+) /.source
  + /(?:(upper|lower)bound )?nodes (\d+) nps \S+ /.source
  + /(?:hashfull \d+ )?(?:tbhits \d+ )?time (\S+) /.source
  + /pv (.+)/.source);

const maxDepth = 18;
const maxThreads = Math.max((navigator.hardwareConcurrency || 1) - 1, 1);

const emptySan = '\xa0';

function titleCase (words: string) {return words.split(' ').map(w =>  w.substring(0,1).toUpperCase() + w.substring(1).toLowerCase()).join(' ');}


export class AnalysisController extends GameController {
    vpgn: VNode;
    vscore: VNode | HTMLElement;
    vinfo: VNode | HTMLElement;
    vpvlines: VNode[] | HTMLElement[];
    settings: boolean;
    uci_usi: string;
    plyVari: number;
    plyInsideVari: number;
    analysisChart: Chart;
    movetimeChart: Chart;
    chartFunctions: any[];
    localEngine: boolean;
    localAnalysis: boolean;
    maxDepth: number;
    isAnalysisBoard: boolean;
    isEngineReady: boolean;
    notationAsObject: any;
    prevPieces: cg.Pieces;
    arrow: boolean;
    multipv: number;
    evalFile: string;
    nnueOk: boolean;
    importedBy: string;
    embed: boolean;
    fsfDebug: boolean;
    fsfError: string[];
    fsfEngineBoard: any;  // used to convert pv UCI move list to SAN

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model);
        this.fsfDebug = false;
        this.fsfError = [];
        this.embed = this.gameId === undefined;
        this.isAnalysisBoard = this.gameId === "";
        if (!this.embed) {
            this.chartFunctions = [analysisChart, movetimeChart];
        }

        const onOpen = () => {
            if (this.embed) {
                this.doSend({ type: "embed_user_connected", gameId: this.gameId });
            } else if (!this.isAnalysisBoard) {
                this.doSend({ type: "game_user_connected", username: this.username, gameId: this.gameId });
            }
        };

        this.sock = newWebsocket('wsr');
        this.sock.onopen = () => onOpen();
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);

        // is local stockfish.wasm engine supports current variant?
        this.localEngine = false;

        // is local engine analysis enabled? (the switch)
        this.localAnalysis = false;

        // UCI isready/readyok
        this.isEngineReady = false;

        // loaded Fairy-Stockfish ffish.js wasm module
        this.maxDepth = maxDepth;

        // ply where current interactive analysis variation line starts in the main line
        this.plyVari = 0;

        // current move index inside the variation line
        this.plyInsideVari = -1

        this.settings = true;
        this.dblClickPass = true;
        this.arrow = localStorage.arrow === undefined ? true : localStorage.arrow === "true";
        this.multipv = localStorage.multipv === undefined ? 1 : Math.max(1, Math.min(5, parseInt(localStorage.multipv)));
        this.evalFile = localStorage[`${this.variant.name}-nnue`] === undefined ? '' : localStorage[`${this.variant.name}-nnue`];
        this.nnueOk = false;
        this.importedBy = '';

        this.chessground.set({
            orientation: this.mycolor,
            turnColor: this.turnColor,
            movable: {
                free: false,
                color: this.turnColor,
                events: {
                    after: (orig, dest, meta) => this.onUserMove(orig, dest, meta),
                    afterNewPiece: (piece, dest, meta) => this.onUserDrop(piece, dest, meta),
                }
            },
            events: {
                move: this.onMove(),
                dropNewPiece: this.onDrop(),
                select: this.onSelect(),
            },
        });

        if (!this.isAnalysisBoard && !this.embed) {
            this.ctableContainer = document.getElementById('panel-3') as HTMLElement;
            if (model["ct"]) {
                this.ctableContainer = patch(this.ctableContainer, h('panel-3'));
                this.ctableContainer = patch(this.ctableContainer, crosstableView(model["ct"] as CrossTable, this.gameId));
            }
        }

        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        if (!this.isAnalysisBoard && !this.embed) {
            patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));
        }

        if (!this.embed) {
            patch(document.getElementById('input') as HTMLElement, h('input#input', this.renderInput()));

            this.vscore = document.getElementById('score') as HTMLElement;
            this.vinfo = document.getElementById('info') as HTMLElement;
            this.vpvlines = [...Array(5).fill(null).map((_, i) => document.querySelector(`.pvbox :nth-child(${i + 1})`) as HTMLElement)];

            const pgn = (this.isAnalysisBoard) ? this.getPgn() : this.pgn;
            this.renderFENAndPGN(pgn);

            if (this.isAnalysisBoard) {
                (document.querySelector('[role="tablist"]') as HTMLElement).style.display = 'none';
                (document.querySelector('[tabindex="0"]') as HTMLElement).style.display = 'flex';
            }
        }

        if (this.variant.materialPoint) {
            const miscW = document.getElementById('misc-infow') as HTMLElement;
            const miscB = document.getElementById('misc-infob') as HTMLElement;
            miscW.style.textAlign = 'right';
            miscB.style.textAlign = 'left';
            miscW.style.width = '100px';
            miscB.style.width = '100px';
            patch(document.getElementById('misc-info-center') as HTMLElement, h('div#misc-info-center', '-'));
            (document.getElementById('misc-info') as HTMLElement).style.justifyContent = 'space-around';
        }

        if (this.variant.counting) {
            (document.getElementById('misc-infow') as HTMLElement).style.textAlign = 'center';
            (document.getElementById('misc-infob') as HTMLElement).style.textAlign = 'center';
        }

        // Add a click event handler to each tab
        const tabs = document.querySelectorAll('[role="tab"]');
        tabs!.forEach(tab => {
            tab.addEventListener('click', changeTabs);
        });

        function changeTabs(e: Event) {
            const target = e.target as Element;
            const parent = target!.parentNode;
            const grandparent = parent!.parentNode;

            // Remove all current selected tabs
            parent!.querySelectorAll('[aria-selected="true"]').forEach(t => t.setAttribute('aria-selected', 'false'));

            // Set this tab as selected
            target.setAttribute('aria-selected', 'true');

            // Hide all tab panels
            grandparent!.querySelectorAll('[role="tabpanel"]').forEach(p => (p as HTMLElement).style.display = 'none');

            // Show the selected panel
            (grandparent!.parentNode!.querySelector(`#${target.getAttribute('aria-controls')}`)! as HTMLElement).style.display = 'flex';
        }
        (document.querySelector('[tabindex="0"]') as HTMLElement).style.display = 'flex';

        this.onMsgBoard(model["board"] as MsgBoard);
    }

    nnueIni() {
        if (this.localAnalysis && this.nnueOk) {
            this.engineStop();
            this.engineGo();
        }
    }

    pvboxIni() {
        if (this.localAnalysis) this.engineStop();
        this.clearPvlines();
        if (this.localAnalysis) this.engineGo();
    }

    pvView(i: number, pv: VNode | undefined) {
        if (this.vpvlines === undefined) this.pvboxIni();
        this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}.pv`, pv));
    }

    clearPvlines() {
        for (let i = 4; i >= 0; i--) {
            if (i + 1 <= this.multipv && this.localAnalysis) {
                this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}.pv`, [h('pvline', h('pvline', '-'))]));
            } else {
                this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}`));
            }
        }
    }

    toggleOrientation() {
        super.toggleOrientation()
        boardSettings.updateDropSuggestion();
        //TODO: clocks !!!
    }

    private renderInput = () => {
        return {
            attrs: {
                disabled: !this.localEngine || !this.isEngineReady,
            },
            on: {change: () => {
                this.localAnalysis = !this.localAnalysis;
                if (this.localAnalysis) {
                    this.vinfo = patch(this.vinfo, h('info#info', '-'));
                    this.pvboxIni();
                } else {
                    this.engineStop();
                    this.pvboxIni();
                }
            }}
        };
    }

    private drawAnalysisChart = (withRequest: boolean) => {
        if (withRequest) {
            if (this.anon) {
                alert(_('You need an account to do that.'));
                return;
            }
            const element = document.getElementById('request-analysis') as HTMLElement;
            if (element !== null) element.style.display = 'none';

            this.doSend({ type: "analysis", username: this.username, gameId: this.gameId });
            const loaderEl = document.getElementById('loader') as HTMLElement;
            loaderEl.style.display = 'block';
        }
        const chartEl = document.getElementById('chart-analysis') as HTMLElement;
        chartEl.style.display = 'block';
        analysisChart(this);
    }

    private checkStatus = (msg: MsgBoard | MsgAnalysisBoard) => {
        if ((msg.gameId !== this.gameId && !this.isAnalysisBoard) || this.embed) return;
        if (("status" in msg && msg.status >= 0) || this.isAnalysisBoard) {

            // Save finished game full pgn sent by server
            if ("pgn" in msg && msg.pgn !== undefined) this.pgn = msg.pgn;
            // but on analysis page we always present pgn move list leading to current shown position!
            const pgn = (this.isAnalysisBoard) ? this.getPgn() : this.pgn;

            if ("uci_usi" in msg) { this.uci_usi = msg.uci_usi; }

            this.renderFENAndPGN( pgn );

            if (!this.isAnalysisBoard) selectMove(this, this.ply);
        }
    }

    private renderFENAndPGN(pgn: string) {
        let container = document.getElementById('copyfen') as HTMLElement;
        if (container !== null) {
            const buttons = [
                h('a.i-pgn', { on: { click: () => downloadPgnText("pychess-variants_" + this.gameId) } }, [
                    h('i', {props: {title: _('Download game to PGN file')}, class: {"icon": true, "icon-download": true} }, _('Download PGN'))]),
                h('a.i-pgn', { on: { click: () => copyTextToClipboard(this.uci_usi) } }, [
                    h('i', {props: {title: _('Copy USI/UCI to clipboard')}, class: {"icon": true, "icon-clipboard": true} }, _('Copy UCI/USI'))]),
                h('a.i-pgn', { on: { click: () => copyBoardToPNG(this.fullfen) } }, [
                    h('i', {props: {title: _('Download position to PNG image file')}, class: {"icon": true, "icon-download": true} }, _('PNG image'))]),
                h('div#imported'),
                ]
            patch(container, h('div', buttons));
        }

        const e = document.getElementById('fullfen') as HTMLInputElement;
        e.value = this.fullfen;

        container = document.getElementById('pgntext') as HTMLElement;
        this.vpgn = patch(container, h('div#pgntext', pgn));
    }

    private deleteGame() {
        if (confirm(_('Are you sure you want to delete this game?'))) {
            this.doSend({ type: "delete", gameId: this.gameId });
        }
    }

    private onMsgBoard = (msg: MsgBoard) => {
        if (msg.gameId !== this.gameId) return;

        this.importedBy = msg.by;
        // Enable to delete imported games
        if (this.rated === '2' && this.importedBy === this.username) {
            const importedEl = document.getElementById('imported') as HTMLElement;
            patch(importedEl,
                h('a.i-pgn', { on: { click: () => this.deleteGame() } }, [
                    h('i', {props: {title: _('Delete game')}, class: {"icon": true, "icon-trash-o": true} }, _('Delete game'))])
            );
        }

        // console.log("got board msg:", msg);
        this.fullfen = msg.fen;
        this.setDests();
        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.result = msg.result;
        this.status = msg.status;

        if (msg.steps.length > 1) {
            this.steps = [];
            msg.steps.forEach((step, ply) => {
                if (step.analysis !== undefined) {
                    step.ceval = step.analysis;
                    const scoreStr = this.buildScoreStr(ply % 2 === 0 ? "w" : "b", step.analysis);
                    step.scoreStr = scoreStr;
                }
                this.steps.push(step);
                });
            updateMovelist(this);

            if (this.steps[0].analysis === undefined) {
                if (!this.isAnalysisBoard && !this.embed) {
                    const el = document.getElementById('request-analysis') as HTMLElement;
                    el.style.display = 'block';
                    patch(el, h('button#request-analysis', { on: { click: () => this.drawAnalysisChart(true) } }, [
                        h('i', {props: {title: _('Request Computer Analysis')}, class: {"icon": true, "icon-bar-chart": true} }, _('Request Analysis'))])
                    );
                }
            } else {
                this.vinfo = patch(this.vinfo, h('info#info', '-'));
                this.drawAnalysisChart(false);
            }
            const clocktimes = this.steps[1]?.clocks?.white;
            if (clocktimes !== undefined && !this.embed) {
                patch(document.getElementById('anal-clock-top') as HTMLElement, h('div.anal-clock.top'));
                patch(document.getElementById('anal-clock-bottom') as HTMLElement, h('div.anal-clock.bottom'));
                renderClocks(this);

                const cmt = document.getElementById('chart-movetime') as HTMLElement;
                cmt.style.display = 'block';
                movetimeChart(this);
            }

        } else {
            if (msg.ply === this.steps.length) {
                const step: Step = {
                    'fen': msg.fen,
                    'move': msg.lastMove,
                    'check': msg.check,
                    'turnColor': this.turnColor,
                    'san': msg.steps[0].san,
                    };
                this.steps.push(step);
                updateMovelist(this);
            }
        }

        const lastMove = uci2LastMove(msg.lastMove);
        const step = this.steps[this.steps.length - 1];
        const capture = !!lastMove && ((this.chessground.state.boardState.pieces.get(lastMove[1]) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));

        if (lastMove && (this.turnColor === this.mycolor || this.spectator)) {
            sound.moveSound(this.variant, capture);
        }
        this.checkStatus(msg);

        if (this.spectator) {
            this.chessground.set({
                fen: this.fullfen,
                turnColor: this.turnColor,
                check: msg.check,
                lastMove: lastMove,
            });
        }
        if (this.ply > 0) {
            selectMove(this, this.ply);
        }
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
                    alert(errorMsg);
                    return;
                }
            }
        }

        if (line.includes('readyok')) this.isEngineReady = true;

        if (line.startsWith('Fairy-Stockfish')) {
            window.prompt = function() {
                return variantsIni + '\nEOF';
            }
            this.fsfPostMessage('load <<EOF');
        }

        if (!this.localEngine) {
            this.localEngine = true;
            patch(document.getElementById('input') as HTMLElement, h('input#input', {attrs: {disabled: false}}));
            this.fsfEngineBoard = new this.ffish.Board(this.variant.name, this.fullfen, this.chess960);

            if (this.evalFile) {
                idb.get(`${this.variant.name}--nnue-file`).then((nnuefile) => {
                    if (nnuefile === this.evalFile) {
                        idb.get(`${this.variant.name}--nnue-data`).then((data) => {
                            const array = new Uint8Array(data);
                            const filename = "/" + this.evalFile;
                            window.fsf.FS.writeFile(filename, array);
                            console.log('Loaded to fsf.FS:', filename);
                            this.nnueOk = true;
                            const nnueEl = document.querySelector('.nnue') as HTMLElement;
                            const title = _('Multi-threaded WebAssembly (with NNUE evaluation)');
                            patch(nnueEl, h('span.nnue', { props: {title: title } } , 'NNUE'));
                        });
                    }
                });
            }

            window.addEventListener('beforeunload', () => this.fsfEngineBoard.delete());
        }

        if (!this.localAnalysis || !this.isEngineReady) return;

        const matches = line.match(EVAL_REGEX);
        if (!matches) {
            if (line.includes('mate 0')) this.clearPvlines();
            return;
        }

        const depth = parseInt(matches[1]),
            multiPv = parseInt(matches[2]),
            isMate = matches[3] === 'mate',
            povEv = parseInt(matches[4]),
            evalType = matches[5],
            nodes = parseInt(matches[6]),
            elapsedMs: number = parseInt(matches[7]),
            moves = matches[8];
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
            score = {mate: povEv};
        } else {
            score = {cp: povEv};
        }
        const knps = nodes / elapsedMs;
        const msg: MsgAnalysis = {type: 'local-analysis', ply: this.ply, color: this.turnColor.slice(0, 1), ceval: {d: depth, multipv: multiPv, p: moves, s: score, k: knps}};
        this.onMsgAnalysis(msg);
    };

    onMoreDepth = () => {
        this.maxDepth = 99;
        this.engineStop();
        this.engineGo();
    }

    makePvMove (pv_line: string) {
        const move = uci2cg(pv_line.split(" ")[0]);
        this.doSendMove(move.slice(0, 2) as cg.Orig, move.slice(2, 4) as cg.Key, move.slice(4, 5));
    }

    // Updates PV, score, gauge and the best move arrow
    drawEval = (ceval: Ceval | undefined, scoreStr: string | undefined, turnColor: cg.Color) => {

        const pvlineIdx = (ceval && ceval.multipv) ? ceval.multipv - 1 : 0;

        // Render PV line
        if (ceval?.p !== undefined) {
            let pvSan: string | VNode = ceval.p;
            if (this.fsfEngineBoard) {
                try {
                    this.fsfEngineBoard.setFen(this.fullfen);
                    pvSan = this.fsfEngineBoard.variationSan(ceval.p, this.notationAsObject);
                    if (pvSan === '') pvSan = emptySan;
                } catch (error) {
                    pvSan = emptySan;
                }
            }
            if (pvSan !== emptySan) {
                pvSan = h('pv-san', { on: { click: () => this.makePvMove(ceval.p as string) } } , pvSan)
                this.pvView(pvlineIdx, h('pvline', [(this.multipv > 1 && this.localAnalysis) ? h('strong', scoreStr) : '', pvSan]));
            }
        } else {
            this.pvView(pvlineIdx, h('pvline', (this.localAnalysis) ? h('pvline', '-') : ''));
        }

        // Render gauge, arrow and main score value for first PV line only
        if (pvlineIdx > 0) return;

        let shapes0: DrawShape[] = [];
        this.chessground.setAutoShapes(shapes0);

        const gaugeEl = document.getElementById('gauge') as HTMLElement;
        if (gaugeEl && pvlineIdx === 0) {
            const blackEl = gaugeEl.querySelector('div.black') as HTMLElement | undefined;
            if (blackEl && ceval !== undefined) {
                const score = ceval['s'];
                // TODO set gauge colour according to the variant's piece colour
                const color = (this.variant.firstColor === "Black") ? turnColor === 'black' ? 'white' : 'black' : turnColor;
                if (score !== undefined) {
                    const ev = povChances(color, score);
                    blackEl.style.height = String(100 - (ev + 1) * 50) + '%';
                }
                else {
                    blackEl.style.height = '50%';
                }
            }
        }

        if (ceval?.p !== undefined) {
            const pv_move = uci2cg(ceval.p.split(" ")[0]);
            // console.log("ARROW", this.arrow);
            if (this.arrow && pvlineIdx === 0) {
                const atPos = pv_move.indexOf('@');
                if (atPos > -1) {
                    const d = pv_move.slice(atPos + 1, atPos + 3) as cg.Key;
                    let color = turnColor;
                    const dropPieceRole = util.roleOf(pv_move.slice(0, atPos) as cg.Letter);

                    shapes0 = [{
                        orig: d,
                        brush: 'paleGreen',
                        piece: {
                            color: color,
                            role: dropPieceRole
                        }},
                        { orig: d, brush: 'paleGreen' }
                    ];
                } else {
                    const o = pv_move.slice(0, 2) as cg.Key;
                    const d = pv_move.slice(2, 4) as cg.Key;
                    shapes0 = [{ orig: o, dest: d, brush: 'paleGreen', piece: undefined },];
                }
            }

            this.vscore = patch(this.vscore, h('score#score', scoreStr));

            const info = [h('span', _('Depth') + ' ' + String(ceval.d) + '/' + this.maxDepth)];
            if (ceval.k) {
                if (ceval.d === this.maxDepth && this.maxDepth !== 99) {
                    info.push(
                        h('a.icon.icon-plus-square', {
                            props: {type: "button", title: _("Go deeper")},
                            on: { click: () => this.onMoreDepth() }
                        })
                    );
                } else if (ceval.d !== 99) {
                    info.push(h('span', ', ' + Math.round(ceval.k) + ' knodes/s'));
                }
            }
            this.vinfo = patch(this.vinfo, h('info#info', info));
        } else {
            this.vscore = patch(this.vscore, h('score#score', ''));
            this.vinfo = patch(this.vinfo, h('info#info', _('in local browser')));
        }

        // console.log(shapes0);
        this.chessground.set({
            drawable: {autoShapes: shapes0},
        });
    }

    // Updates chart and score in movelist
    drawServerEval = (ply: number, scoreStr?: string) => {
        if (ply > 0) {
            const evalEl = document.getElementById('ply' + String(ply)) as HTMLElement;
            patch(evalEl, h('eval#ply' + String(ply), scoreStr));
        }

        analysisChart(this);
        const hc = this.analysisChart;
        if (hc !== undefined) {
            const hcPt = hc.series[0].data[ply];
            if (hcPt !== undefined) hcPt.select();
        }
    }

    engineStop = () => {
        this.isEngineReady = false;
        this.fsfPostMessage('stop');
        this.fsfPostMessage('isready');
    }

    engineGo = () => {
        if (this.chess960) {
            this.fsfPostMessage('setoption name UCI_Chess960 value true');
        }
        if (this.variant.name !== 'chess') {
            this.fsfPostMessage('setoption name UCI_Variant value ' + this.variant.name);
        }
        if (this.evalFile === '' || !this.nnueOk) {
            this.fsfPostMessage('setoption name Use NNUE value false');
        } else {
            this.fsfPostMessage('setoption name Use NNUE value true');
            this.fsfPostMessage('setoption name EvalFile value ' + this.evalFile);
        }

        //console.log('setoption name Threads value ' + maxThreads);
        this.fsfPostMessage('setoption name Threads value ' + maxThreads);

        this.fsfPostMessage('setoption name MultiPV value ' + this.multipv);

        //console.log('position fen ', this.fullfen);
        this.fsfPostMessage('position fen ' + this.fullfen);

        if (this.maxDepth >= 99) {
            this.fsfPostMessage('go depth 99');
        } else {
            this.fsfPostMessage('go movetime 90000 depth ' + this.maxDepth);
        }
    }

    fsfPostMessage(msg: string) {
        if (this.fsfDebug) console.debug('<---', msg);
        window.fsf.postMessage(msg);
    }
    
    // When we are moving inside a variation move list
    // then plyVari > 0 and ply is the index inside vari movelist
    goPly = (ply: number, plyVari = 0) => {
        super.goPly(ply, plyVari);

        if (this.plyVari > 0) {
            this.plyInsideVari = ply - plyVari;
        }

        if (this.localAnalysis) {
            this.engineStop();
            this.clearPvlines();
            // Go back to the main line
            if (plyVari === 0) {
                const container = document.getElementById('vari') as HTMLElement;
                patch(container, h('div#vari', ''));
            }
        }

        if (this.plyVari > 0 && plyVari === 0) {
            this.steps[this.plyVari]['vari'] = undefined;
            this.plyVari = 0;
            updateMovelist(this);
        }

        if (this.embed) return;

        const vv = this.steps[plyVari]?.vari;
        const step = (plyVari > 0 && vv) ? vv[ply - plyVari] : this.steps[ply];

        const clocktimes = this.steps[1]?.clocks?.white;
        if (clocktimes !== undefined) {
            renderClocks(this);
            const hc = this.movetimeChart;
            if (hc !== undefined) {
                const idx = (step.turnColor === 'white') ? 1 : 0;
                const turn = (ply + 1) >> 1;
                const hcPt = hc.series[idx].data[turn-1];
                if (hcPt !== undefined) hcPt.select();
            }
        }
        if (this.ffishBoard) {
            this.ffishBoard.setFen(this.fullfen);
            this.setDests();
        }

        this.drawEval(step.ceval, step.scoreStr, step.turnColor);
        if (plyVari === 0) this.drawServerEval(ply, step.scoreStr);

        this.maxDepth = maxDepth;
        if (this.localAnalysis) this.engineGo();

        const e = document.getElementById('fullfen') as HTMLInputElement;
        e.value = this.fullfen;

        if (this.isAnalysisBoard) {
            const idxInVari = (plyVari > 0) ? ply - plyVari : 0;
            this.vpgn = patch(this.vpgn, h('div#pgntext', this.getPgn(idxInVari)));
        } else {
            const hist = this.home + '/' + this.gameId + '?ply=' + ply.toString();
            window.history.replaceState({}, '', hist);
        }
    }

    private getPgn = (idxInVari  = 0) => {
        const moves : string[] = [];
        let moveCounter: string = '';
        let whiteMove: boolean = true;
        let blackStarts: boolean = this.steps[0].turnColor === 'black';

        for (let ply = 1; ply <= this.ply; ply++) {
            // we are in a variation line of the game
            if (this.steps[ply] && this.steps[ply].vari && this.plyVari > 0) {
                const variMoves = this.steps[ply].vari;
                if (variMoves) {
                    blackStarts = variMoves[0].turnColor === 'white';
                    for (let idx = 0; idx <= idxInVari; idx++) {
                        if (blackStarts && ply ===1 && idx === 0) {
                            moveCounter = '1...';
                        } else {
                            whiteMove = variMoves[idx].turnColor === 'black';
                            moveCounter = (whiteMove) ? Math.ceil((ply + idx + 1) / 2) + '.' : '';
                        }
                        moves.push(moveCounter + variMoves[idx].sanSAN);
                    };
                    break;
                }
            // we are in the main line
            } else {
                if (blackStarts && ply === 1) {
                    moveCounter = '1...';
                } else {
                    whiteMove = this.steps[ply].turnColor === 'black';
                    moveCounter = (whiteMove) ? Math.ceil((ply + 1) / 2) + '.' : '';
                }
                moves.push(moveCounter + this.steps[ply]['sanSAN']);
            }
        }
        const moveText = moves.join(' ');

        const today = new Date().toISOString().substring(0, 10).replace(/-/g, '.');

        const event = '[Event "?"]';
        const site = `[Site "${this.home}/analysis/${this.variant.name}"]`;
        const date = `[Date "${today}"]`;
        const white = '[White "?"]';
        const black = '[Black "?"]';
        const result = '[Result "*"]';
        const variant = `[Variant "${titleCase(this.variant.name)}"]`;
        const fen = `[FEN "${this.steps[0].fen}"]`;
        const setup = '[SetUp "1"]';

        return `${event}\n${site}\n${date}\n${white}\n${black}\n${result}\n${variant}\n${fen}\n${setup}\n\n${moveText} *\n`;
    }

    doSendMove = (orig: cg.Orig, dest: cg.Key, promo: string) => {
        const move = cg2uci(orig + dest + promo);
        const san = this.ffishBoard.sanMove(move, this.notationAsObject);
        const sanSAN = this.ffishBoard.sanMove(move);
        const vv = this.steps[this.plyVari]['vari'];

        // console.log('sendMove()', move, san);
        // Instead of sending moves to the server we can get new FEN and dests from ffishjs
        this.ffishBoard.push(move);
        this.setDests();

        const newPly = this.ply + 1;

        const msg : MsgAnalysisBoard = {
            gameId: this.gameId,
            fen: this.ffishBoard.fen(this.variant.showPromoted, 0),
            ply: newPly,
            lastMove: move,
            bikjang: this.ffishBoard.isBikjang(),
            check: this.ffishBoard.isCheck(),
        }

        this.onMsgAnalysisBoard(msg);

        const step = {
            'fen': msg.fen,
            'move': msg.lastMove,
            'check': msg.check,
            'turnColor': this.turnColor,
            'san': san,
            'sanSAN': sanSAN,
            };

        const ffishBoardPly = this.ffishBoard.moveStack().split(' ').length;
        const moveIdx = (this.plyVari === 0) ? this.ply : this.plyInsideVari;
        // New main line move
        if (moveIdx === this.steps.length && this.plyVari === 0) {
            this.steps.push(step);
            this.ply = ffishBoardPly
            updateMovelist(this);

            this.checkStatus(msg);
        // variation move
        } else {
            // possible new variation move
            if (ffishBoardPly === 1) {
                if (msg.lastMove === this.steps[this.ply - 1].move) {
                    // existing main line played
                    selectMove(this, this.ply);
                    return;
                }
                // new variation starts
                if (vv === undefined) {
                    this.plyVari = this.ply;
                    this.steps[this.plyVari]['vari'] = [];
                } else {
                    // variation in the variation: drop old moves
                    if ( vv ) {
                        this.steps[this.plyVari]['vari'] = vv.slice(0, ffishBoardPly - this.plyVari);
                    }
                }
            }
            // continuing the variation
            if (this.steps[this.plyVari].vari !== undefined) {
                this.steps[this.plyVari]?.vari?.push(step);
            };

            const full = true;
            const activate = false;
            updateMovelist(this, full, activate);
            if (vv) {
                activatePlyVari(this.plyVari + vv.length - 1);
            } else if (vv === undefined && this.plyVari > 0) {
                activatePlyVari(this.plyVari);
            }
        }

        const e = document.getElementById('fullfen') as HTMLInputElement;
        e.value = this.fullfen;

        if (this.isAnalysisBoard) {
            const idxInVari = (this.plyVari > 0) && vv ? vv.length - 1 : 0;
            this.vpgn = patch(this.vpgn, h('div#pgntext', this.getPgn(idxInVari)));
        }
        // TODO: But sending moves to the server will be useful to implement shared live analysis!
        // this.doSend({ type: "analysis_move", gameId: this.gameId, move: move, fen: this.fullfen, ply: this.ply + 1 });
    }

    private onMsgAnalysisBoard = (msg: MsgAnalysisBoard) => {
        // console.log("got analysis_board msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (this.localAnalysis) this.engineStop();
        this.clearPvlines();

        this.fullfen = msg.fen;
        this.ply = msg.ply

        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.chessground.set({
            fen: this.fullfen,
            turnColor: this.turnColor,
            lastMove: uci2LastMove(msg.lastMove),
            check: msg.check,
            movable: {
                color: this.turnColor,
            },
        });

        if (this.localAnalysis) this.engineGo();
    }

    private buildScoreStr = (color: string, analysis: Ceval) => {
        const score = analysis['s'];
        let scoreStr = '';
        let ceval : number;
        if (score['mate'] !== undefined) {
            ceval = score['mate']
            const sign = ((color === 'b' && Number(ceval) > 0) || (color === 'w' && Number(ceval) < 0)) ? '-': '';
            scoreStr = '#' + sign + Math.abs(Number(ceval));
        } else if (score['cp'] !== undefined) {
            ceval = score['cp']
            let nscore = Number(ceval) / 100.0;
            if (color === 'b') nscore = -nscore;
            scoreStr = nscore.toFixed(1);
        }
        return scoreStr;
    }

    private onMsgAnalysis = (msg: MsgAnalysis) => {
        // console.log(msg);
        if (msg['ceval']['s'] === undefined) return;

        const scoreStr = this.buildScoreStr(msg.color, msg.ceval);

        // Server side analysis message
        if (msg.type === 'analysis') {
            this.steps[msg.ply]['ceval'] = msg.ceval;
            this.steps[msg.ply]['scoreStr'] = scoreStr;

            if (this.steps.every((step) => {return step.scoreStr !== undefined;})) {
                const element = document.getElementById('loader-wrapper') as HTMLElement;
                element.style.display = 'none';
            }
            this.drawServerEval(msg.ply, scoreStr);
        } else {
            const turnColor = msg.color === 'w' ? 'white' : 'black';
            this.drawEval(msg.ceval, scoreStr, turnColor);
        }
    }

    // User running a fishnet worker asked new server side analysis with chat message: !analysis
    private onMsgRequestAnalysis = () => {
        this.steps.forEach((step) => {
            step.analysis = undefined;
            step.ceval = undefined;
            step.scoreStr = undefined;
        });
        this.drawAnalysisChart(true);
    }

    private onMsgUserConnected = (msg: MsgUserConnected) => {
        this.username = msg["username"];
    }

    private onMsgDeleted = () => {
        window.location.assign(this.home + "/@/" + this.username + '/import');
    }

    protected onMessage(evt: MessageEvent) {
        // console.log("<+++ onMessage():", evt.data);
        super.onMessage(evt);

        if (evt.data === '/n') return;
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "board":
                this.onMsgBoard(msg);
                break;
            case "analysis_board":
                this.onMsgAnalysisBoard(msg);
                break
            case "analysis":
                this.onMsgAnalysis(msg);
                break;
            case "embed_user_connected":
            case "game_user_connected":
                this.onMsgUserConnected(msg);
                break;
            case "request_analysis":
                this.onMsgRequestAnalysis()
                break;
            case "deleted":
                this.onMsgDeleted();
                break;
        }
    }
}
