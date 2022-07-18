// import ffishModule from 'ffish-es6';

import Sockette from 'sockette';

import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { DrawShape } from 'chessgroundx/draw';

import { JSONObject } from '../types';
import { _ } from '../i18n';
import {uci2LastMove, uci2cg, cg2uci, notation} from '../chess';
import { createMovelistButtons, updateMovelist, selectMove, activatePlyVari } from './movelist';
import { povChances } from '../winningChances';
import { boardSettings } from './boardSettings';
import { patch, getPieceImageUrl } from '../document';
// import { variantsIni } from '../variantsIni';
import { Chart } from "highcharts";
import { PyChessModel } from "../types";
import {Ceval, Step} from "../messages";
import {ChessgroundController} from "./ChessgroundCtrl";
import {sound} from "../sound";

// const EVAL_REGEX = new RegExp(''
//   + /^info depth (\d+) seldepth \d+ multipv (\d+) /.source
//   + /score (cp|mate) ([-\d]+) /.source
//   + /(?:(upper|lower)bound )?nodes (\d+) nps \S+ /.source
//   + /(?:hashfull \d+ )?(?:tbhits \d+ )?time (\S+) /.source
//   + /pv (.+)/.source);

const maxDepth = 18;
const maxThreads = Math.max((navigator.hardwareConcurrency || 1) - 1, 1);

// function titleCase (words: string) {return words.split(' ').map(w =>  w.substring(0,1).toUpperCase() + w.substring(1).toLowerCase()).join(' ');}

interface MsgAnalysisBoard {
    gameId: string;
    fen: string;
    fenB?: string;
    ply: number;
    lastMove: string;
    dests: cg.Dests;
    promo: string[];
    bikjang: boolean;
    check: boolean;
}

// interface MsgAnalysis {
//     type: string;
//     ply: number;
//     ceval: Ceval;
//     color: string;
// }

export default class AnalysisController {
    model;
    sock;

    b1: ChessgroundController;
    b2: ChessgroundController;

    fullBFEN: string;//todo:niki - i dont know if needed
    wplayer: string;
    bplayer: string;
    base: number;
    inc: number;
    gameId: string;
    hasPockets: boolean;
    vplayer0: VNode;
    vplayer1: VNode;
    vmaterial0: VNode;
    vmaterial1: VNode;
    vpgn: VNode;
    vscore: VNode | HTMLElement;
    vinfo: VNode | HTMLElement;
    vpv: VNode | HTMLElement;
    vmovelist: VNode | HTMLElement;
    gameControls: VNode;
    moveControls: VNode;
    // promotions: string[];
    lastmove: cg.Key[];
    premove: {orig: cg.Key, dest: cg.Key, metadata?: cg.SetPremoveMetadata} | null;
    predrop: {role: cg.Role, key: cg.Key} | null;
    result: string;
    flip: boolean;
    // spectator: boolean;todo:this is analyis - what specatotrs? maybe delete from the other analysisCtrl as well
    settings: boolean;
    status: number;
    steps: Step[];
    pgn: string;
    uci_usi: string;
    ply: number;
    plyVari: number;
    // players: string[];
    // titles: string[];
    // ratings: string[];
    animation: boolean;
    showDests: boolean;
    analysisChart: Chart;
    ctableContainer: VNode | HTMLElement;
    localEngine: boolean;
    localAnalysis: boolean;

    // ffish1: any;
    // ffish2: any;
    //
    // ffishBoard1: any;
    // ffishBoard2: any;

    maxDepth: number;
    isAnalysisBoard: boolean;
    isEngineReady: boolean;
    notation: cg.Notation;//todo:niki:not sure if i need now long term - short term probably no, what is notation when we talk about bughouse - what if bugshogi?

    notationAsObject: any;

    arrow: boolean;
    importedBy: string;

    constructor(el1: HTMLElement,el1Pocket1: HTMLElement,el1Pocket2: HTMLElement,el2: HTMLElement,el2Pocket1: HTMLElement,el2Pocket2: HTMLElement, model: PyChessModel) {

        this.b1 = new ChessgroundController(el1, el1Pocket1, el1Pocket2, model); //todo:niki:fen maybe should be parsed from bfen. what situation do we start from custom fen?
        this.b2 = new ChessgroundController(el2, el2Pocket1, el2Pocket2, model);
        this.b2.chessground.set({orientation:"black"});
        this.b1.boardName = 'a';
        this.b2.boardName = 'b';
        this.b1.partnerCC = this.b2;
        this.b2.partnerCC = this.b1;
        this.b1.parent = this;
        this.b2.parent = this;

        // this.b1.sendMove = (orig: cg.Orig, dest: cg.Key, promo: string) => {
        //     this.sendMove(this.b1, orig, dest, promo);
        // }
        // this.b2.sendMove = (orig: cg.Orig, dest: cg.Key, promo: string) => {
        //     this.sendMove(this.b2, orig, dest, promo);
        // }

        this.isAnalysisBoard = model["gameId"] === "";

        const onOpen = (evt: Event) => {
            console.log("ctrl.onOpen()", evt);
            if (this.model['embed']) {
                this.doSend({ type: "embed_user_connected", gameId: this.model["gameId"] });
            } else if (!this.isAnalysisBoard) {
                this.doSend({ type: "game_user_connected", username: this.model["username"], gameId: this.model["gameId"] });
            }
        };

        const opts = {
            maxAttempts: 10,
            onopen: (e: Event) => onOpen(e),
            onmessage: (e: MessageEvent) => this.onMessage(e),
            onreconnect: (e: Event) => console.log('Reconnecting in round...', e),
            onmaximum: (e: Event) => console.log('Stop Attempting!', e),
            onclose: (e: Event) => console.log('Closed!', e),
            onerror: (e: Event) => console.log('Error:', e),
            };

        const ws = (location.protocol.indexOf('https') > -1) ? 'wss://' : 'ws://';
        this.sock = new Sockette(ws + location.host + "/wsr", opts);

        // is local stockfish.wasm engine supports current variant?
        this.localEngine = false;

        // is local engine analysis enabled? (the switch)
        this.localAnalysis = false;

        // UCI isready/readyok
        this.isEngineReady = false;

        // loaded Fairy-Stockfish ffish.js wasm module
        // this.ffish1 = null;
        // this.ffish2 = null;
        //
        // this.ffishBoard1 = null;
        // this.ffishBoard2 = null;

        this.maxDepth = maxDepth;

        // current interactive analysis variation ply
        this.plyVari = 0;

        this.model = model;
        this.gameId = model["gameId"] as string;

        this.wplayer = model["wplayer"] as string;
        this.bplayer = model["bplayer"] as string;
        this.base = model["base"];
        this.inc = model["inc"] as number;
        this.status = model["status"] as number;
        this.steps = [];
        this.pgn = "";
        this.ply = model["ply"];

        this.flip = false;
        this.settings = true;
        this.animation = localStorage.animation === undefined ? true : localStorage.animation === "true";
        this.showDests = localStorage.showDests === undefined ? true : localStorage.showDests === "true";
        this.arrow = localStorage.arrow === undefined ? true : localStorage.arrow === "true";
        this.importedBy = '';

        this.hasPockets = true;//todo:niki:check whats the purpose of this? this.variant.pocket;

        this.notation = notation(this.b1.variant);


        this.steps.push({//todo:niki:need new format for bug steps - should i extend or make new class or whatever
            // 'fen': this.fullBFEN,
            'fen': model.fen,
            'fenB': model.fen,
            'move': undefined,
            'check': false,
            'turnColor': this.b1.turnColor,//todo:niki:not relevant/meaningful
            // 'turnColorB': this.b2.turnColor,
            });

        if (!this.isAnalysisBoard && !this.model["embed"]) {
            this.ctableContainer = document.getElementById('ctable-container') as HTMLElement;
        }

        // Hide #chart div (embed view has no #chart)
        if (!this.model["embed"]) {
            const element = document.getElementById('chart') as HTMLElement;
            element.style.display = 'none';
        }


        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        //todo:niki:lets not worry about chat at the moment
        // if (!this.isAnalysisBoard && !this.model["embed"]) {
        //     patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));
        // }

        if (!this.model["embed"]) {
            patch(document.getElementById('input') as HTMLElement, h('input#input', this.renderInput()));

            this.vscore = document.getElementById('score') as HTMLElement;
            this.vinfo = document.getElementById('info') as HTMLElement;
            this.vpv = document.getElementById('pv') as HTMLElement;
        }

        // if (this.variant.materialPoint) {todo:niki:not relevant now, probably ever
        //     const miscW = document.getElementById('misc-infow') as HTMLElement;
        //     const miscB = document.getElementById('misc-infob') as HTMLElement;
        //     miscW.style.textAlign = 'right';
        //     miscB.style.textAlign = 'left';
        //     miscW.style.width = '100px';
        //     miscB.style.width = '100px';
        //     patch(document.getElementById('misc-info-center') as HTMLElement, h('div#misc-info-center', '-'));
        //     (document.getElementById('misc-info') as HTMLElement).style.justifyContent = 'space-around';
        // }

        // if (this.variant.counting) {todo:niki:not relevant now, probably not gonna be relevant ever - unless makpongbug?
        //     (document.getElementById('misc-infow') as HTMLElement).style.textAlign = 'center';
        //     (document.getElementById('misc-infob') as HTMLElement).style.textAlign = 'center';
        // }

        boardSettings.ctrl = this;
        const boardFamily = this.b1.variant.board;//either b1 or b2
        const pieceFamily = this.b1.variant.piece;
        boardSettings.updateBoardStyle(boardFamily);
        boardSettings.updatePieceStyle(pieceFamily);
        boardSettings.updateZoom(boardFamily);
    }

    //todo:niki:not correct implementation for now - pockets are not with brackets according to this: https://bughousedb.com/Lieven_BPGN_Standard.txt
    toBFEN = (fenA: cg.FEN, fenB: cg.FEN): string => {
        return fenA+" | "+fenB;
    }

    toFEN = (bfen: string): cg.FEN[] => {
        return bfen.split(" | ");
    }

    // private pass = () => {
    //     let passKey = 'a0';
    //     const pieces = this.chessground.state.pieces;
    //     const dests = this.chessground.state.movable.dests!;
    //     for (const [k, p] of pieces) {
    //         if (p.role === 'k-piece' && p.color === this.turnColor) {
    //             if ((dests.get(k)?.includes(k))) passKey = k;
    //         }
    //     }
    //     if (passKey !== 'a0') {
    //         // prevent calling pass() again by selectSquare() -> onSelect()
    //         this.chessground.state.movable.dests = undefined;
    //         this.chessground.selectSquare(passKey as cg.Key);
    //         sound.moveSound(this.variant, false);
    //         this.sendMove(passKey as cg.Key, passKey as cg.Key, '');
    //     }
    // }

    private renderInput = () => {
        return {
            attrs: {
                disabled: !this.localEngine,
            },
            on: {change: () => {
                this.localAnalysis = !this.localAnalysis;
                if (this.localAnalysis) {
                    this.vinfo = patch(this.vinfo, h('info#info', '-'));
                    this.engineStop();
                    this.engineGo(this.b1);//todo:niki:for now only 1st board - maybe gonna need 2 engines or some way to do it in sequence
                } else {
                    this.vinfo = patch(this.vinfo, h('info#info', _('in local browser')));
                    this.vpv = patch(this.vpv, h('div#pv'));
                    this.engineStop();
                }
            }}
        };
    }

    // private drawAnalysisChart = (withRequest: boolean) => {
    //     console.log("drawAnalysisChart "+withRequest)
    //     // if (withRequest) {
    //     //     if (this.model["anon"] === 'True') {
    //     //         alert(_('You need an account to do that.'));
    //     //         return;
    //     //     }
    //     //     const element = document.getElementById('request-analysis') as HTMLElement;
    //     //     if (element !== null) element.style.display = 'none';
    //     //
    //     //     this.doSend({ type: "analysis", username: this.model["username"], gameId: this.gameId });
    //     //     const loaderEl = document.getElementById('loader') as HTMLElement;
    //     //     loaderEl.style.display = 'block';
    //     // }
    //     // const chartEl = document.getElementById('chart') as HTMLElement;
    //     // chartEl.style.display = 'block';
    //     // analysisChart(this);
    // }

    private checkStatus = (msg: MsgAnalysisBoard) => {
        if ((msg.gameId !== this.gameId && !this.isAnalysisBoard) || this.model["embed"]) return;

        // but on analysis page we always present pgn move list leading to current shown position!
        // const pgn = (this.isAnalysisBoard) ? this.getPgn() : this.pgn;
        // this.renderFENAndPGN( pgn );todo:niki:good to have eventually

        if (!this.isAnalysisBoard) selectMove(this, this.ply);
    }

    // private renderFENAndPGN(pgn: string) {
    //     let container = document.getElementById('copyfen') as HTMLElement;
    //     if (container !== null) {
    //         const buttons = [
    //             h('a.i-pgn', { on: { click: () => downloadPgnText("pychess-variants_" + this.gameId) } }, [
    //                 h('i', {props: {title: _('Download game to PGN file')}, class: {"icon": true, "icon-download": true} }, _('Download PGN'))]),
    //             h('a.i-pgn', { on: { click: () => copyTextToClipboard(this.uci_usi) } }, [
    //                 h('i', {props: {title: _('Copy USI/UCI to clipboard')}, class: {"icon": true, "icon-clipboard": true} }, _('Copy UCI/USI'))]),
    //             h('a.i-pgn', { on: { click: () => copyBoardToPNG(this.fullfen) } }, [
    //                 h('i', {props: {title: _('Download position to PNG image file')}, class: {"icon": true, "icon-download": true} }, _('PNG image'))]),
    //             ]
    //
    //         // Enable to delete imported games
    //         if (this.model["rated"] === '2' && this.importedBy === this.model["username"]) {
    //             buttons.push(
    //                 h('a.i-pgn', { on: { click: () => this.deleteGame() } }, [
    //                     h('i', {props: {title: _('Delete game')}, class: {"icon": true, "icon-trash-o": true} }, _('Delete game'))])
    //             );
    //         }
    //
    //         if (this.steps[0].analysis === undefined && !this.isAnalysisBoard) {
    //             buttons.push(h('button#request-analysis', { on: { click: () => this.drawAnalysisChart(true) } }, [
    //                 h('i', {props: {title: _('Request Computer Analysis')}, class: {"icon": true, "icon-bar-chart": true} }, _('Request Analysis'))])
    //             );
    //         }
    //         patch(container, h('div', buttons));
    //     }
    //
    //     const e = document.getElementById('fullfen') as HTMLInputElement;
    //     e.value = this.fullfen;
    //
    //     container = document.getElementById('pgntext') as HTMLElement;
    //     this.vpgn = patch(container, h('textarea#pgntext', { attrs: { rows: 13, readonly: true, spellcheck: false} }, pgn));
    // }

    // private deleteGame() {
    //     if (confirm(_('Are you sure you want to delete this game?'))) {
    //         this.doSend({ type: "delete", gameId: this.gameId });
    //     }
    // }

    // private onMsgBoard = (msg: MsgBoard) => {
    //     if (msg.gameId !== this.gameId) return;
    //
    //     this.importedBy = msg.by;
    //
    //     // console.log("got board msg:", msg);
    //     this.ply = msg.ply
    //     this.fullfen = msg.fen;
    //     this.dests = new Map(Object.entries(msg.dests)) as cg.Dests;
    //     // list of legal promotion moves
    //     this.promotions = msg.promo;
    //
    //     const parts = msg.fen.split(" ");
    //     this.turnColor = parts[1] === "w" ? "white" : "black";
    //
    //     this.result = msg.result;
    //     this.status = msg.status;
    //
    //     if (msg.steps.length > 1) {
    //         this.steps = [];
    //
    //         msg.steps.forEach((step, ply) => {
    //             if (step.analysis !== undefined) {
    //                 step.ceval = step.analysis;
    //                 const scoreStr = this.buildScoreStr(ply % 2 === 0 ? "w" : "b", step.analysis);
    //                 step.scoreStr = scoreStr;
    //             }
    //             this.steps.push(step);
    //             });
    //         updateMovelist(this);
    //
    //         if (this.steps[0].analysis !== undefined) {
    //             this.vinfo = patch(this.vinfo, h('info#info', '-'));
    //             this.drawAnalysisChart(false);
    //         }
    //     } else {
    //         if (msg.ply === this.steps.length) {
    //             const step: Step = {
    //                 'fen': msg.fen,
    //                 'move': msg.lastMove,
    //                 'check': msg.check,
    //                 'turnColor': this.turnColor,
    //                 'san': msg.steps[0].san,
    //                 };
    //             this.steps.push(step);
    //             updateMovelist(this);
    //         }
    //     }
    //
    //     const lastMove = uci2LastMove(msg.lastMove);
    //     const step = this.steps[this.steps.length - 1];
    //     const capture = (lastMove.length > 0) && ((this.chessground.state.pieces.get(lastMove[1]) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));
    //
    //     if (lastMove.length > 0 && (this.turnColor === this.mycolor || this.spectator)) {
    //         sound.moveSound(this.variant, capture);
    //     }
    //     this.checkStatus(msg);
    //
    //     if (this.spectator) {
    //         this.chessground.set({
    //             fen: this.fullfen,
    //             turnColor: this.turnColor,
    //             check: msg.check,
    //             lastMove: lastMove,
    //         });
    //     }
    //     if (this.model["ply"] > 0) {
    //         this.ply = this.model["ply"]
    //         selectMove(this, this.ply);
    //     }
    // }

    moveIndex = (ply: number) => {
      return Math.floor((ply - 1) / 2) + 1 + (ply % 2 === 1 ? '.' : '...');
    }

    notation2ffishjs = (n: cg.Notation, ffish: any) => {
        switch (n) {
            case cg.Notation.ALGEBRAIC: return ffish.Notation.SAN;
            case cg.Notation.SHOGI_ARBNUM: return ffish.Notation.SHOGI_HODGES_NUMBER;
            case cg.Notation.JANGGI: return ffish.Notation.JANGGI;
            case cg.Notation.XIANGQI_ARBNUM: return ffish.Notation.XIANGQI_WXF;
            default: return ffish.Notation.SAN;
        }
    }

    // loadFFishModule = (b: ChessgroundController  ) : any => {
    //     ffishModule().then((loadedModule: any) => {
    //
    //         if (loadedModule) {
    //             b.ffish=loadedModule;
    //             b.ffish.loadVariantConfig(variantsIni);
    //
    //             const availableVariants = b.ffish.variants();
    //
    //             if (this.model.variant === 'chess' || availableVariants.includes(this.model.variant)) {
    //                 b.ffishBoard = new b.ffish.Board(b.variant.name, b.fullfen, b.chess960);
    //
    //                 // b.dests = this.getDests(b);
    //                 b.setDests();
    //                 b.chessground.set({ movable: { color: b.turnColor, dests: b.dests } });
    //             } else {
    //                 console.log("Selected variant is not supported by ffish.js");
    //             }
    //             if (!this.notationAsObject) this.notationAsObject = this.notation2ffishjs(this.notation, b.ffish);
    //         }
    //
    //     });
    // }

    // onFSFline = (line: string) => {
    //     //console.log(line);
    //
    //     if (line.includes('readyok')) this.isEngineReady = true;
    //
    //     if (!this.localEngine) {
    //         if (line.includes('UCI_Variant')) {//todo:niki:i dont understand why we wait for this to init ffish
    //
    //             this.loadFFishModule(this.b1);
    //             this.loadFFishModule(this.b2);
    //
    //             window.addEventListener("beforeunload", () => { this.b1.ffishBoard.delete(); this.b2.ffishBoard.delete(); } );
    //
    //             // TODO: enable S-chess960 when stockfish.wasm catches upstream Fairy-Stockfish
    //             if ((this.model.variant === 'chess' || line.includes(this.model.variant)) &&
    //                 !(this.model.variant === 'seirawan' && this.b1.chess960)) {
    //                 this.localEngine = true;
    //                 patch(document.getElementById('input') as HTMLElement, h('input#input', {attrs: {disabled: false}}));
    //             } else {
    //                 const v = this.model.variant + ((this.b1.chess960) ? '960' : '');
    //                 const title = _("Selected variant %1 is not supported by stockfish.wasm", v);
    //                 patch(document.getElementById('slider') as HTMLElement, h('span.sw-slider', {attrs: {title: title}}));
    //             }
    //         }
    //     }
    //
    //     if (!this.localAnalysis || !this.isEngineReady) return;
    //
    //     const matches = line.match(EVAL_REGEX);
    //     if (!matches) {
    //         if (line.includes('mate 0')) {
    //             const msg: MsgAnalysis = {type: 'local-analysis', ply: this.ply, color: this.b1.turnColor.slice(0, 1), ceval: {d: 0, s: {mate: 0}}};//todo;niki;no idea what is happening here - just putting b1 to compile
    //             this.onMsgAnalysis(msg);
    //         }
    //         return;
    //     }
    //
    //     //todo:niki:commenting out below 30 lines - analysis will implement later
    //     // const depth = parseInt(matches[1]),
    //     //     multiPv = parseInt(matches[2]),
    //     //     isMate = matches[3] === 'mate',
    //     //     povEv = parseInt(matches[4]),
    //     //     evalType = matches[5],
    //     //     nodes = parseInt(matches[6]),
    //     //     elapsedMs: number = parseInt(matches[7]),
    //     //     moves = matches[8];
    //     // //console.log("---", depth, multiPv, isMate, povEv, evalType, nodes, elapsedMs, moves);
    //     //
    //     // // Sometimes we get #0. Let's just skip it.
    //     // if (isMate && !povEv) return;
    //     //
    //     // // For now, ignore most upperbound/lowerbound messages.
    //     // // The exception is for multiPV, sometimes non-primary PVs
    //     // // only have an upperbound.
    //     // // See: https://github.com/ddugovic/Stockfish/issues/228
    //     // if (evalType && multiPv === 1) return;
    //
    //     // let score;
    //     // if (isMate) {
    //     //     score = {mate: povEv};
    //     // } else {
    //     //     score = {cp: povEv};
    //     // }
    //     // const knps = nodes / elapsedMs;
    //     // const sanMoves = this.ffishBoard.variationSan(moves, this.notationAsObject);
    //     // const msg: MsgAnalysis = {type: 'local-analysis', ply: this.ply, color: this.b1.turnColor.slice(0, 1), ceval: {d: depth, m: moves, p: sanMoves, s: score, k: knps}};//todo;niki;not idea what this is putting b1 so it compiles
    //     // this.onMsgAnalysis(msg);
    // };

    onMoreDepth = () => {
        this.maxDepth = 99;
        this.engineStop();
        this.engineGo(this.b1);//todo:niki:i guess we really need 2 engines. does this reset analysis from start? or re-uses what is so far evalueated and digs deeper from current depth?
    }

    // Updates PV, score, gauge and the best move arrow
    drawEval = (ceval: Ceval | undefined, scoreStr: string | undefined, turnColor: cg.Color) => {
        let shapes0: DrawShape[] = [];
        this.b1.chessground.setAutoShapes(shapes0);
        this.b2.chessground.setAutoShapes(shapes0);

        const gaugeEl = document.getElementById('gauge') as HTMLElement;
        if (gaugeEl) {
            const blackEl = gaugeEl.querySelector('div.black') as HTMLElement | undefined;
            if (blackEl && ceval !== undefined) {
                const score = ceval['s'];
                // TODO set gauge colour according to the variant's piece colour
                const color = (this.b1.variant.firstColor === "Black") ? turnColor === 'black' ? 'white' : 'black' : turnColor;
                if (score !== undefined) {
                    const ev = povChances(color, score);
                    blackEl.style.height = String(100 - (ev + 1) * 50) + '%';
                }
                else {
                    blackEl.style.height = '50%';
                }
            }
        }

        if (ceval?.p !== undefined && !!ceval.m) {
            const pv_move = uci2cg(ceval.m.split(" ")[0]);
            console.log("ARROW", this.arrow);
            if (this.arrow) {
                const atPos = pv_move.indexOf('@');
                if (atPos > -1) {
                    const d = pv_move.slice(atPos + 1, atPos + 3) as cg.Key;
                    let color = turnColor;

                    const dropPieceRole = util.roleOf(pv_move.slice(0, atPos) as cg.PieceLetter);
                    const orientation = this.flip ? this.b1.oppcolor : this.b1.mycolor;
                    const side = color === orientation ? "ally" : "enemy";
                    const url = getPieceImageUrl("bughouse", dropPieceRole, color, side);
                    this.b1.chessground.set({ drawable: { pieces: { baseUrl: url! } } });//todo:parametrize b1/b2 or do for both or something when decide how

                    shapes0 = [{
                        orig: d,
                        brush: 'paleGreen',
                        piece: {
                            color: color,
                            role: dropPieceRole
                        }},
                        { orig: d, brush: 'paleGreen'}
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
            let pvSan = ceval.p;
            //todo:niki: temporary commenting out until i figure out how to do that
            // if (this.ffishBoard !== null) {
            //     try {
            //         pvSan = this.ffishBoard.variationSan(ceval.p, this.notationAsObject);
            //         if (pvSan === '') pvSan = ceval.p;
            //     } catch (error) {
            //         pvSan = ceval.p
            //     }
            // }
            this.vpv = patch(this.vpv, h('div#pv', [h('pvline', ceval.p !== undefined ? pvSan : ceval.m)]));
        } else {
            this.vscore = patch(this.vscore, h('score#score', ''));
            this.vinfo = patch(this.vinfo, h('info#info', _('in local browser')));
            this.vpv = patch(this.vpv, h('div#pv'));
        }

        console.log(shapes0);
        this.b1.chessground.set({
            drawable: {autoShapes: shapes0},
        });
    }

    // // Updates chart and score in movelist
    drawServerEval = (ply: number, scoreStr?: string) => {
        console.log("drawServerEval "+ply+" "+scoreStr);
    //     if (ply > 0) {
    //         const evalEl = document.getElementById('ply' + String(ply)) as HTMLElement;
    //         patch(evalEl, h('eval#ply' + String(ply), scoreStr));
    //     }
    //
    //     analysisChart(this);
    //     const hc = this.analysisChart;
    //     if (hc !== undefined) {
    //         const hcPt = hc.series[0].data[ply];
    //         if (hcPt !== undefined) hcPt.select();
    //     }
    }

    engineStop = () => {
        this.isEngineReady = false;
        window.fsf.postMessage('stop');
        window.fsf.postMessage('isready');
    }

    engineGo = (cc: ChessgroundController) => {
        if (cc.chess960) {
            window.fsf.postMessage('setoption name UCI_Chess960 value true');
        }
        if (this.model.variant !== 'chess') {
            window.fsf.postMessage('setoption name UCI_Variant value ' + this.model.variant);
        }
        //console.log('setoption name Threads value ' + maxThreads);
        window.fsf.postMessage('setoption name Threads value ' + maxThreads);

        //console.log('position fen ', this.fullfen);
        window.fsf.postMessage('position fen ' + cc.fullfen);

        if (this.maxDepth >= 99) {
            window.fsf.postMessage('go depth 99');
        } else {
            window.fsf.postMessage('go movetime 90000 depth ' + this.maxDepth);
        }
    }

    // getDests = (b: ChessgroundController) => {
    //     if (b.ffishBoard === undefined) {
    //         // At very first time we may have to wait for ffish module to initialize
    //         setTimeout(this.setDests, 100);
    //     } else {
    //         const legalMoves = b.ffishBoard.legalMoves().split(" ");
    //         // console.log(legalMoves);
    //         const dests: cg.Dests = moveDests(legalMoves);
    //         b.promotions = [];
    //         legalMoves.forEach((move: string) => {
    //             const moveStr = uci2cg(move);
    //
    //             const tail = moveStr.slice(-1);
    //             if (tail > '9' || tail === '+' || tail === '-') {
    //                 if (!(b.variant.gate && (moveStr.slice(1, 2) === '1' || moveStr.slice(1, 2) === '8'))) {
    //                     b.promotions.push(moveStr);
    //                 }
    //             }
    //             if (b.variant.promotion === 'kyoto' && moveStr.slice(0, 1) === '+') {
    //                 b.promotions.push(moveStr);
    //             }
    //         });
    //         b.chessground.set({movable: {dests: dests}});
    //
    //         return dests;
    //     }
    // }

    // When we are moving inside a variation move list
    // then plyVari > 0 and ply is the index inside vari movelist
    goPly = (ply: number, plyVari = 0) => {//todo:niki:temp comment out
        console.log(ply, plyVari);
        this.ply = ply;

        const step = this.steps[ply];
        console.log(step);

        const board=step.boardName==='a'?this.b1:this.b2;

        const fen=step.boardName==='a'?step.fen: step.fenB;
        const fenPartner=step.boardName==='b'?step.fen: step.fenB;

        const move = step.boardName==='a'?uci2LastMove(step.move):uci2LastMove(step.moveB);
        const movePartner = step.boardName==='b'?uci2LastMove(step.move):uci2LastMove(step.moveB);

        let capture = false;
        if (move.length > 0) {
            // 960 king takes rook castling is not capture
            // TODO defer this logic to ffish.js
            capture = (board.chessground.state.pieces.get(move[move.length - 1]) !== undefined && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
        }

        board.chessground.set({
            fen: fen,
            turnColor: step.turnColor,
            movable: {
                color: step.turnColor,
                dests: board.dests,//todo:niki:probably has to re-init this for variations or disable moves until variations are supported - current value probably wrong either way
                },
            check: step.check,
            lastMove: move,
        });

        board.partnerCC.chessground.set({fen: fenPartner, lastMove: movePartner});

        board.fullfen = step.fen;
        board.partnerCC.fullfen = fenPartner!;

        if (ply === this.ply + 1) {
            sound.moveSound(board.variant, capture);
        }

        // Go back to the main line
        if (plyVari === 0) {
            this.ply = ply;//todo:niki:this has to be local ply - cant remember why i need it though
        }
        board.turnColor = step.turnColor;

        if (board.ffishBoard !== null) {
            board.ffishBoard.setFen(board.fullfen);
            // board.dests = board.parent.setDests(board);//todo:niki:maybe do this before chessground set above.
            board.setDests();
        }

    }

    doSend = (message: JSONObject) => {
        // console.log("---> doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    // private onMove = () => {
    //     return (orig: cg.Key, dest: cg.Key, capturedPiece: cg.Piece) => {
    //         console.log("   ground.onMove()", orig, dest, capturedPiece);
    //         sound.moveSound(this.variant, !!capturedPiece);
    //     }
    // }
    //
    // private onDrop = () => {
    //     return (piece: cg.Piece, dest: cg.Key) => {
    //         // console.log("ground.onDrop()", piece, dest);
    //         if (dest !== 'a0' && piece.role) {
    //             sound.moveSound(this.variant, false);
    //         }
    //     }
    // }

    // private getPgn = (idxInVari  = 0) => {
    //     const moves : string[] = [];
    //     for (let ply = 1; ply <= this.ply; ply++) {
    //         const moveCounter = (ply % 2 !== 0) ? (ply + 1) / 2 + '.' : '';
    //         if (this.steps[ply].vari !== undefined && this.plyVari > 0) {
    //             const variMoves = this.steps[ply].vari;
    //             if (variMoves) {
    //                 for (let idx = 0; idx <= idxInVari; idx++) {
    //                     moves.push(moveCounter + variMoves[idx].sanSAN);
    //                 }
    //             }
    //             break;
    //         }
    //         moves.push(moveCounter + this.steps[ply]['sanSAN']);
    //     }
    //     const moveText = moves.join(' ');
    //
    //     const today = new Date().toISOString().substring(0, 10).replace(/-/g, '.');
    //
    //     const event = '[Event "?"]';
    //     const site = `[Site "${this.model['home']}/analysis/${this.b1.variant.name}"]`;
    //     const date = `[Date "${today}"]`;
    //     const white = '[White "?"]';
    //     const black = '[Black "?"]';
    //     const result = '[Result "*"]';
    //     const variant = `[Variant "${titleCase(this.b1.variant.name)}"]`;
    //     const fen = `[FEN "${this.steps[0].fen}"]`;
    //     const setup = '[SetUp "1"]';
    //
    //     return `${event}\n${site}\n${date}\n${white}\n${black}\n${result}\n${variant}\n${fen}\n${setup}\n\n${moveText} *\n`;
    // }

    sendMove = (b: ChessgroundController, orig: cg.Orig, dest: cg.Key, promo: string) => {
        const move = cg2uci(orig + dest + promo);
        const san = b.ffishBoard.sanMove(move, b.notationAsObject);
        const sanSAN = b.ffishBoard.sanMove(move);// todo niki what is this?
        const vv = this.steps[this.plyVari]['vari'];

        // console.log('sendMove()', move, san);
        // Instead of sending moves to the server we can get new FEN and dests from ffishjs
        b.ffishBoard.push(move);
        // b.dests = this.getDests(b);
        b.setDests();

        // We can't use ffishBoard.gamePly() to determine newply because it returns +1 more
        // when new this.ffish.Board() initial FEN moving color was "b"
        const moves = b.ffishBoard.moveStack().split(' ');
        const newPly = moves.length;

        const msg : MsgAnalysisBoard = {
            gameId: this.gameId,
            fen: b.ffishBoard.fen(this.b1.variant.showPromoted, 0),
            ply: newPly,
            lastMove: move,
            dests: b.dests,
            promo: b.promotions,
            bikjang: b.ffishBoard.isBikjang(),
            check: b.ffishBoard.isCheck(),
        }

        this.onMsgAnalysisBoard(b, msg);

        const step = {  //no matter on which board the ply is happening i always need both fens and moves for both boards. this way when jumping to a ply in the middle of the list i can setup both boards and highlight both last moves
            fen: b.boardName==='a'? b.ffishBoard.fen(b.variant.showPromoted, 0): b.partnerCC.ffishBoard.fen(b.partnerCC.variant.showPromoted, 0),
            fenB: b.boardName==='b'? b.ffishBoard.fen(b.variant.showPromoted, 0): b.partnerCC.ffishBoard.fen(b.partnerCC.variant.showPromoted, 0),
            'move': b.boardName==='a'? msg.lastMove: this.steps[this.steps.length-1].move,
            'moveB': b.boardName==='b'? msg.lastMove: this.steps[this.steps.length-1].moveB,
            'check': msg.check,
            'turnColor': b.turnColor,
            'san': san,
            'sanSAN': sanSAN,
            'boardName': b.boardName,
            'plyA': this.b1.ply,
            'plyB': this.b2.ply,
            };

        // New main line move
        // const sumPly = this.b1.ffishBoard.gamePly() + this.b2.ffishBoard.gamePly();
        const sumPly = this.b1.ply + this.b2.ply;
        if (sumPly === this.steps.length && this.plyVari === 0) {
            this.steps.push(step);
            b.steps.push(step);
            this.ply = sumPly
            updateMovelist(this);

            this.checkStatus(msg);
        // variation move
        } else {
            // new variation starts
            if (newPly === 1) {
                if (msg.lastMove === this.steps[this.ply].move) {
                    // existing main line played
                    selectMove(this, this.ply);
                    return;
                }
                if (this.steps[this.plyVari]['vari'] === undefined || msg.ply === this.steps[this.plyVari].vari?.length) {
                    // continuing the variation
                    this.plyVari = sumPly;
                    this.steps[this.plyVari]['vari'] = [];
                } else {
                    // variation in the variation: drop old moves
                    if ( vv ) {
                        this.steps[this.plyVari]['vari'] = vv.slice(0, sumPly - this.plyVari);
                    }
                }
            }
            if (vv) vv.push(step);

            const full = true;
            const activate = false;
            updateMovelist(this, full, activate);
            if (vv) activatePlyVari(this.plyVari + vv.length - 1);
        }

        const e = document.getElementById('fullfen') as HTMLInputElement;
        e.value = this.b1.fullfen+" "+this.b2.fullfen;

        // if (this.isAnalysisBoard) {todo:niki
        //     const idxInVari = (b.plyVari > 0) && vv ? vv.length - 1 : 0;
        //     // this.vpgn = patch(this.vpgn, h('textarea#pgntext', { attrs: { rows: 13, readonly: true, spellcheck: false} }, this.getPgn(idxInVari)));
        // }
        // TODO: But sending moves to the server will be useful to implement shared live analysis!
        // this.doSend({ type: "analysis_move", gameId: this.gameId, move: move, fen: this.fullfen, ply: this.ply + 1 });
    }

    private onMsgAnalysisBoard = (b: ChessgroundController, msg: MsgAnalysisBoard) => {
        // console.log("got analysis_board msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (this.localAnalysis) this.engineStop();

        b.fullfen = msg.fen;
        // b.dests = msg.dests;
        // list of legal promotion moves
        b.promotions = msg.promo;
        this.ply = msg.ply

        const parts = msg.fen.split(" ");
        b.turnColor = parts[1] === "w" ? "white" : "black";

        b.chessground.set({
            fen: b.fullfen,
            turnColor: b.turnColor,
            lastMove: uci2LastMove(msg.lastMove),
            check: msg.check,
            movable: {
                color: b.turnColor,
                // dests: b.dests,
            },
        });

        if (this.localAnalysis) this.engineGo(b);
    }


    //
    // private onUserDrop = (role: cg.Role, dest: cg.Key, meta: cg.MoveMetadata) => {
    //     console.log(role, dest, meta);
    //     // onUserDrop(this, role, dest, meta); todo:niki
    // }

    // private onSelect = () => {
    //     return (key: cg.Key) => {
    //         if (this.chessground.state.movable.dests === undefined) return;
    //
    //         // Save state.pieces to help recognise 960 castling (king takes rook) moves
    //         // Shouldn't this be implemented in chessground instead?
    //         if (this.chess960 && this.variant.gate) {
    //             this.prevPieces = new Map(this.chessground.state.pieces);
    //         }
    //
    //         // Janggi pass and Sittuyin in place promotion on Ctrl+click
    //         if (this.chessground.state.stats.ctrlKey &&
    //             (this.chessground.state.movable.dests.get(key)?.includes(key))
    //             ) {
    //             const piece = this.chessground.state.pieces.get(key);
    //             if (this.variant.name === 'sittuyin') { // TODO make this more generic
    //                 // console.log("Ctrl in place promotion", key);
    //                 const pieces: cg.PiecesDiff = new Map();
    //                 pieces.set(key, {
    //                     color: piece!.color,
    //                     role: 'f-piece',
    //                     promoted: true
    //                 });
    //                 this.chessground.setPieces(pieces);
    //                 this.sendMove(key, key, 'f');
    //             } else if (this.variant.pass && piece!.role === 'k-piece') {
    //                 this.pass();
    //             }
    //         }
    //     }
    // }

    // private buildScoreStr = (color: string, analysis: Ceval) => {
    //     const score = analysis['s'];
    //     let scoreStr = '';
    //     let ceval : number;
    //     if (score['mate'] !== undefined) {
    //         ceval = score['mate']
    //         const sign = ((color === 'b' && Number(ceval) > 0) || (color === 'w' && Number(ceval) < 0)) ? '-': '';
    //         scoreStr = '#' + sign + Math.abs(Number(ceval));
    //     } else if (score['cp'] !== undefined) {
    //         ceval = score['cp']
    //         let nscore = Number(ceval) / 100.0;
    //         if (color === 'b') nscore = -nscore;
    //         scoreStr = nscore.toFixed(1);
    //     }
    //     return scoreStr;
    // }

    // private onMsgAnalysis = (msg: MsgAnalysis) => {
    //     console.log(msg);
    // //     if (msg['ceval']['s'] === undefined) return;
    // //
    // //     const scoreStr = this.buildScoreStr(msg.color, msg.ceval);
    // //
    // //     // Server side analysis message
    // //     if (msg.type === 'analysis') {
    // //         this.steps[msg.ply]['ceval'] = msg.ceval;
    // //         this.steps[msg.ply]['scoreStr'] = scoreStr;
    // //
    // //         if (this.steps.every((step) => {return step.scoreStr !== undefined;})) {
    // //             const element = document.getElementById('loader-wrapper') as HTMLElement;
    // //             element.style.display = 'none';
    // //         }
    // //         this.drawServerEval(msg.ply, scoreStr);
    // //     } else {
    // //         const turnColor = msg.color === 'w' ? 'white' : 'black';
    // //         this.drawEval(msg.ceval, scoreStr, turnColor);
    // //     }
    // }

    // User running a fishnet worker asked new server side analysis with chat message: !analysis
    // private onMsgRequestAnalysis = () => {todo:niki:this makes sense to exist at least maybe
    //     this.steps.forEach((step) => {
    //         step.analysis = undefined;
    //         step.ceval = undefined;
    //         step.scoreStr = undefined;
    //     });
    //     this.drawAnalysisChart(true);
    // }
    //
    // private onMsgUserConnected = (msg: MsgUserConnected) => {
    //     this.model["username"] = msg["username"];
    //     // we want to know lastMove and check status
    //     this.doSend({ type: "board", gameId: this.gameId });
    // }
    //
    // private onMsgSpectators = (msg: MsgSpectators) => {
    //     const container = document.getElementById('spectators') as HTMLElement;
    //     patch(container, h('under-left#spectators', _('Spectators: ') + msg.spectators));
    // }
    //
    // private onMsgChat = (msg: MsgChat) => {
    //     if ((this.spectator && msg.room === 'spectator') || (!this.spectator && msg.room !== 'spectator') || msg.user.length === 0) {
    //         chatMessage(msg.user, msg.message, "roundchat", msg.time);
    //     }
    // }
    //
    // private onMsgFullChat = (msg: MsgFullChat) => {
    //     // To prevent multiplication of messages we have to remove old messages div first
    //     patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
    //     // then create a new one
    //     patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
    //     msg.lines.forEach((line) => {
    //         if ((this.spectator && line.room === 'spectator') || (!this.spectator && line.room !== 'spectator') || line.user.length === 0) {
    //             chatMessage(line.user, line.message, "roundchat", line.time);
    //         }
    //     });
    // }
    //
    // private onMsgGameNotFound = (msg: MsgGameNotFound) => {
    //     alert(_("Requested game %1 not found!", msg['gameId']));
    //     window.location.assign(this.model["home"]);
    // }
    //
    // private onMsgShutdown = (msg: MsgShutdown) => {
    //     alert(msg.message);
    // }
    //
    // private onMsgCtable = (msg: MsgCtable, gameId: string) => {
    //     // imported games has no crosstable
    //     if (this.model["rated"] !== '2') {
    //         this.ctableContainer = patch(this.ctableContainer, h('div#ctable-container'));
    //         this.ctableContainer = patch(this.ctableContainer, crosstableView(msg.ct, gameId));
    //     }
    // }
    //
    // private onMsgDeleted = () => {
    //     window.location.assign(this.model["home"] + "/@/" + this.model["username"] + '/import');
    // }

    private onMessage = (evt: MessageEvent) => {
        console.log("<+++ onMessage():", evt.data);
        // const msg = JSON.parse(evt.data);
        // switch (msg.type) {
        //     case "board":
        //         this.onMsgBoard(msg);
        //         break;
        //     case "analysis_board":
        //         this.onMsgAnalysisBoard(msg);
        //         break
        //     case "crosstable":
        //         this.onMsgCtable(msg, this.gameId);
        //         break
        //     case "analysis":
        //         this.onMsgAnalysis(msg);
        //         break;
        //     case "embed_user_connected":
        //     case "game_user_connected":
        //         this.onMsgUserConnected(msg);
        //         break;
        //     case "spectators":
        //         this.onMsgSpectators(msg);
        //         break
        //     case "roundchat":
        //         this.onMsgChat(msg);
        //         break;
        //     case "fullchat":
        //         this.onMsgFullChat(msg);
        //         break;
        //     case "game_not_found":
        //         this.onMsgGameNotFound(msg);
        //         break
        //     case "shutdown":
        //         this.onMsgShutdown(msg);
        //         break;
        //     case "logout":
        //         this.doSend({type: "logout"});
        //         break;
        //     case "request_analysis":
        //         this.onMsgRequestAnalysis()
        //         break;
        //     case "deleted":
        //         this.onMsgDeleted();
        //         break;
        // }
    }

}
