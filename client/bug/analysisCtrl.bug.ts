
import { newWebsocket } from '../socket';

import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { DrawShape } from 'chessgroundx/draw';

import { JSONObject } from '../types';
import { _ } from '../i18n';
import {uci2LastMove, uci2cg, cg2uci} from '../chess';
import {VARIANTS, notation, moddedVariant} from "../variants"
import { createMovelistButtons, updateMovelist, selectMove, activatePlyVari } from './movelist.bug';
import { povChances } from '../winningChances';
import { patch } from '../document';
import { Chart } from "highcharts";
import { PyChessModel } from "../types";
import {Ceval, MsgBoard, Step} from "../messages";
import {ChessgroundController} from "./ChessgroundCtrl";
import {sound} from "../sound";
import {renderClocks} from "./analysisClock.bug";
import {variantsIni} from "../variantsIni";
import * as idb from "idb-keyval";
import {MsgAnalysis} from "../analysisType";
import ffishModule from "ffish-es6";
import {Key, Orig} from "chessgroundx/types";

const EVAL_REGEX = new RegExp(''
  + /^info depth (\d+) seldepth \d+ multipv (\d+) /.source
  + /score (cp|mate) ([-\d]+) /.source
  + /(?:(upper|lower)bound )?nodes (\d+) nps \S+ /.source
  + /(?:hashfull \d+ )?(?:tbhits \d+ )?time (\S+) /.source
  + /pv (.+)/.source);

const maxDepth = 18;
const maxThreads = Math.max((navigator.hardwareConcurrency || 1) - 1, 1);

const emptySan = '\xa0';

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
    vscorePartner: VNode | HTMLElement;
    vinfo: VNode | HTMLElement;
    vpvlines: VNode[] | HTMLElement[];

    // vpv: VNode | HTMLElement; // todo.niki.whatis this?
    readonly variant = VARIANTS['bughouse'];

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
    plyInsideVari: number;
    // players: string[];
    // titles: string[];
    // ratings: string[];
    animation: boolean;
    showDests: boolean;
    analysisChart: Chart;
    ctableContainer: VNode | HTMLElement;
    localEngine: boolean;
    // localAnalysis: boolean;

    // ffish1: any;
    // ffish2: any;
    //
    // ffishBoard1: any;
    // ffishBoard2: any;

    maxDepth: number;
    isAnalysisBoard: boolean;
    isEngineReady: boolean;
    notation: cg.Notation;//todo:niki:not sure if i need now long term - short term probably no, what is notation when we talk about bughouse - what if bugshogi?

    ffish: any;
    ffishBoard: any;
    notationAsObject: any;

    arrow: boolean;

    multipv: number;
    evalFile: string;
    nnueOk: boolean;

    importedBy: string;

    embed: boolean;

    fsfDebug: boolean;
    fsfError: string[];
    fsfEngineBoard: any;  // used to convert pv UCI move list to SAN

    username: string;

    notation2ffishjs = (n: cg.Notation) => {
        switch (n) {
            case cg.Notation.ALGEBRAIC: return this.ffish.Notation.SAN;
            case cg.Notation.SHOGI_ARBNUM: return this.ffish.Notation.SHOGI_HODGES_NUMBER;
            case cg.Notation.JANGGI: return this.ffish.Notation.JANGGI;
            case cg.Notation.XIANGQI_ARBNUM: return this.ffish.Notation.XIANGQI_WXF;
            default: return this.ffish.Notation.SAN;
        }
    }

    constructor(el1: HTMLElement,el1Pocket1: HTMLElement,el1Pocket2: HTMLElement,el2: HTMLElement,el2Pocket1: HTMLElement,el2Pocket2: HTMLElement, model: PyChessModel) {

        this.fsfDebug = true;
        this.fsfError = [];
        this.embed = this.gameId === undefined;
        this.username = model["username"];

        this.b1 = new ChessgroundController(el1, el1Pocket1, el1Pocket2, 'a', model); //todo:niki:fen maybe should be parsed from bfen. what situation do we start from custom fen?
        this.b2 = new ChessgroundController(el2, el2Pocket1, el2Pocket2, 'b', model);
        this.b2.chessground.set({orientation:"black"});
        this.b1.partnerCC = this.b2;
        this.b2.partnerCC = this.b1;
        this.b1.parent = this;
        this.b2.parent = this;

        const parts = this.b1.fullfen.split(" ");
        ffishModule().then((loadedModule: any) => {
            this.ffish = loadedModule;
            this.ffish.loadVariantConfig(variantsIni);
            this.notationAsObject = this.notation2ffishjs(this.notation);
            this.ffishBoard = new this.ffish.Board(
                moddedVariant(this.variant.name, false/*this.chess960*/, this.b1.chessground.state.boardState.pieces, parts[2]),
                this.b1.fullfen,
                false/*this.chess960*/);
            window.addEventListener('beforeunload', () => this.ffishBoard.delete());
        });

        // this.b1.sendMove = (orig: cg.Orig, dest: cg.Key, promo: string) => {
        //     this.sendMove(this.b1, orig, dest, promo);
        // }
        // this.b2.sendMove = (orig: cg.Orig, dest: cg.Key, promo: string) => {
        //     this.sendMove(this.b2, orig, dest, promo);
        // }

        this.isAnalysisBoard = model["gameId"] === "";

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
        // this.localAnalysis = false;

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
        this.plyInsideVari = -1

        this.model = model;
        this.gameId = model["gameId"] as string;

        this.wplayer = model["wplayer"] as string;
        this.bplayer = model["bplayer"] as string;
        this.base = model["base"];
        this.inc = model["inc"] as number;
        this.status = model["status"] as number;
        this.steps = [];
        this.pgn = "";
        this.ply = isNaN(model["ply"]) ? 0 : model["ply"];

        this.flip = false;
        this.settings = true;
        this.animation = localStorage.animation === undefined ? true : localStorage.animation === "true";
        this.showDests = localStorage.showDests === undefined ? true : localStorage.showDests === "true";
        this.arrow = localStorage.arrow === undefined ? true : localStorage.arrow === "true";

        this.multipv = localStorage.multipv === undefined ? 1 : Math.max(1, Math.min(5, parseInt(localStorage.multipv)));
        const variant = VARIANTS[model.variant];
        this.evalFile = localStorage[`${variant.name}-nnue`] === undefined ? '' : localStorage[`${variant.name}-nnue`];
        this.nnueOk = false;

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
            patch(document.getElementById('input') as HTMLElement, h('input#input', this.renderInput(this.b1)));
            patch(document.getElementById('inputPartner') as HTMLElement, h('input#inputPartner', this.renderInput(this.b2)));

            this.vscore = document.getElementById('score') as HTMLElement;
            this.vscorePartner = document.getElementById('scorePartner') as HTMLElement;
            this.vinfo = document.getElementById('info') as HTMLElement;
            this.vpvlines = [...Array(5).fill(null).map((_, i) => document.querySelector(`.pvbox :nth-child(${i + 1})`) as HTMLElement)];

            // const pgn = (this.isAnalysisBoard) ? this.getPgn() : this.pgn;
            // this.renderFENAndPGN(pgn);

            // if (this.isAnalysisBoard) {
            //     (document.querySelector('[role="tablist"]') as HTMLElement).style.display = 'none';
            //     (document.querySelector('[tabindex="0"]') as HTMLElement).style.display = 'flex';
            // }
        }

        // if (!this.model["embed"]) {
        //     patch(document.getElementById('input') as HTMLElement, h('input#input', this.renderInput(this.b1)));
        //     patch(document.getElementById('inputPartner') as HTMLElement, h('input#inputPartner', this.renderInput(this.b2)));
        //
        //     this.vscore = document.getElementById('score') as HTMLElement;
        //     this.vinfo = document.getElementById('info') as HTMLElement;
        //     this.vpv = document.getElementById('pv') as HTMLElement;
        // }

        this.onMsgBoard(model["board"] as MsgBoard);

        // boardSettings.ctrl = this;
        // const boardFamily = this.b1.variant.board;//either b1 or b2
        // const pieceFamily = this.b1.variant.piece;
        // boardSettings.updateBoardStyle(boardFamily);
        // boardSettings.updatePieceStyle(pieceFamily);
        // boardSettings.updateZoom(boardFamily);
    }

    nnueIni() {
        if (this.b1.localAnalysis && this.nnueOk) {
            this.engineStop();
            this.engineGo(this.b1);
        } else if (this.b2.localAnalysis && this.nnueOk) {
            this.engineStop();
            this.engineGo(this.b2);
        }
    }

    pvboxIni() {
        if (this.b1.localAnalysis || this.b2.localAnalysis) this.engineStop();
        this.clearPvlines();
        if (this.b1.localAnalysis) {
            this.engineGo(this.b1);
        } else if (this.b2.localAnalysis) {
            this.engineGo(this.b2);
        }
    }

    pvView(i: number, pv: VNode | undefined) {
        if (this.vpvlines === undefined) this.pvboxIni();
        this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}.pv`, pv));
    }

    clearPvlines() {
        for (let i = 4; i >= 0; i--) {
            if (i + 1 <= this.multipv && (this.b1.localAnalysis || this.b2.localAnalysis)) {
                this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}.pv`, [h('pvline', h('pvline', '-'))]));
            } else {
                this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}`));
            }
        }
    }

    flipBoards = (): void => {
        this.b1.toggleOrientation();
        this.b2.toggleOrientation();
    }

    switchBoards = (): void => {
        //todo:niki:not sure if best implementation possible below
        const swap = function (nodeA: HTMLElement, nodeB: HTMLElement) {
            const parentA = nodeA.parentNode;
            const siblingA = nodeA.nextSibling === nodeB ? nodeA : nodeA.nextSibling;

            // Move `nodeA` to before the `nodeB`
            nodeB.parentNode!.insertBefore(nodeA, nodeB);

            // Move `nodeB` to before the sibling of `nodeA`
            parentA!.insertBefore(nodeB, siblingA);
        };
        let mainboardVNode = document.getElementById('mainboard');
        let mainboardPocket0 = document.getElementById('pocket00');
        let mainboardPocket1 = document.getElementById('pocket01');

        let bugboardVNode = document.getElementById('bugboard');
        let bugboardPocket0 = document.getElementById('pocket10');
        let bugboardPocket1 = document.getElementById('pocket11');

        let a = mainboardVNode!.style.gridArea || "board";
        mainboardVNode!.style.gridArea = bugboardVNode!.style.gridArea || "boardPartner";
        bugboardVNode!.style.gridArea = a;

        swap(mainboardPocket0!, bugboardPocket0!);
        swap(mainboardPocket1!, bugboardPocket1!);
        this.b1.chessground.redrawAll();
        this.b2.chessground.redrawAll();
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

    private renderInput = (cc: ChessgroundController) => {
        return {
            attrs: {
                disabled: !this.localEngine,
            },
            on: {change: () => {
                cc.localAnalysis = !cc.localAnalysis;
                if (cc.localAnalysis) {
                    cc.partnerCC.localAnalysis = false;
                    const partnerCheckboxId = cc.partnerCC.boardName == 'a'? 'input': 'inputPartner';
                    (document.getElementById(partnerCheckboxId) as HTMLInputElement).checked = false;

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
        console.log("drawAnalysisChart "+withRequest)
        // if (withRequest) {
        //     if (this.model["anon"] === 'True') {
        //         alert(_('You need an account to do that.'));
        //         return;
        //     }
        //     const element = document.getElementById('request-analysis') as HTMLElement;
        //     if (element !== null) element.style.display = 'none';
        //
        //     this.doSend({ type: "analysis", username: this.model["username"], gameId: this.gameId });
        //     const loaderEl = document.getElementById('loader') as HTMLElement;
        //     loaderEl.style.display = 'block';
        // }
        // const chartEl = document.getElementById('chart') as HTMLElement;
        // chartEl.style.display = 'block';
        // analysisChart(this);
    }

    private checkStatus = (msg: MsgAnalysisBoard | MsgBoard) => {
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

    private onMsgBoard = (msg: MsgBoard) => {
        if (msg.gameId !== this.gameId) return;

        this.importedBy = msg.by;

        // console.log("got board msg:", msg);
        this.ply = msg.ply
        // this.fullfen = msg.fen;
        // this.dests = new Map(Object.entries(msg.dests)) as cg.Dests;
        // list of legal promotion moves
        // this.promotions = msg.promo;

        // const parts = msg.fen.split(" ");
        // this.turnColor = parts[1] === "w" ? "white" : "black";

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

            if (this.steps[0].analysis !== undefined) {
                this.vinfo = patch(this.vinfo, h('info#info', '-'));
                this.drawAnalysisChart(false);
            }
            const clocktimes = this.steps[1]?.clocks?.white;
            if (true || clocktimes !== undefined && !this.embed) {
                patch(document.getElementById('anal-clock-top') as HTMLElement, h('div.anal-clock.top'));
                patch(document.getElementById('anal-clock-bottom') as HTMLElement, h('div.anal-clock.bottom'));
                patch(document.getElementById('anal-clock-top-bug') as HTMLElement, h('div.anal-clock.top.bug'));
                patch(document.getElementById('anal-clock-bottom-bug') as HTMLElement, h('div.anal-clock.bottom.bug'));
                renderClocks(this);

                const cmt = document.getElementById('chart-movetime') as HTMLElement;
                if (cmt) cmt.style.display = 'block';
                // movetimeChart(this);
            }

        } else {/*
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
            }*/
        }

        // const lastMove = uci2LastMove(msg.lastMove);
        // const step = this.steps[this.steps.length - 1];
        // const capture = (lastMove.length > 0) && ((this.chessground.state.pieces.get(lastMove[1]) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));
        //
        // if (lastMove.length > 0 && (this.turnColor === this.mycolor || this.spectator)) {
        //     sound.moveSound(this.variant, capture);
        // }
        this.checkStatus(msg);

        // if (this.spectator) {
        //     this.chessground.set({
        //         fen: this.fullfen,
        //         turnColor: this.turnColor,
        //         check: msg.check,
        //         lastMove: lastMove,
        //     });
        // }
        if (this.model["ply"] > 0) {
            this.ply = this.model["ply"]
            selectMove(this, this.ply);
        }
    }

    moveIndex = (ply: number) => {
      return Math.floor((ply - 1) / 2) + 1 + (ply % 2 === 1 ? '.' : '...');
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
    fsfPostMessage(msg: string) {
        if (this.fsfDebug) console.debug('<---', msg);
        window.fsf.postMessage(msg);
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
            patch(document.getElementById('inputPartner') as HTMLElement, h('input#inputPartner', {attrs: {disabled: false}}));
            this.fsfEngineBoard = new this.ffish.Board(this.variant.name, this.b1.fullfen, false);

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

        if (!(this.b1.localAnalysis || this.b2.localAnalysis) || !this.isEngineReady) return;

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
        const boardInAnalysis = this.b1.localAnalysis? this.b1: this.b2;// todo:niki: move this somewhere so it can be used in other places where i do 'or' and stuff
        const msg: MsgAnalysis = {type: 'local-analysis', ply: this.ply, color: boardInAnalysis.turnColor.slice(0, 1), ceval: {d: depth, multipv: multiPv, p: moves, s: score, k: knps}};
        this.onMsgAnalysis(msg, boardInAnalysis);
    };

    engineStop = () => {
        this.isEngineReady = false;
        this.fsfPostMessage('stop');
        this.fsfPostMessage('isready');
    }

    engineGo = (cc: ChessgroundController) => {
        if (false/*this.chess960*/) {
            this.fsfPostMessage('setoption name UCI_Chess960 value true');
        }
        if (this.variant.name !== 'chess') {
            this.fsfPostMessage('setoption name UCI_Variant value ' + /*'crazyhouse'*/this.variant.name);
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
        this.fsfPostMessage('position fen ' + cc.fullfen);

        if (this.maxDepth >= 99) {
            this.fsfPostMessage('go depth 99');
        } else {
            this.fsfPostMessage('go movetime 90000 depth ' + this.maxDepth);
        }
    }

    onMoreDepth = () => {
        this.maxDepth = 99;
        this.engineStop();
        this.engineGo(this.b1);//todo:niki:i guess we really need 2 engines. does this reset analysis from start? or re-uses what is so far evalueated and digs deeper from current depth?
    }

    makePvMove (pv_line: string, cc: ChessgroundController) {
        const move = uci2cg(pv_line.split(" ")[0]);
        this.sendMove(cc, move.slice(0, 2) as cg.Orig, move.slice(2, 4) as cg.Key, move.slice(4, 5));
    }

    // Updates PV, score, gauge and the best move arrow
    drawEval = (ceval: Ceval | undefined, scoreStr: string | undefined, turnColor: cg.Color, boardInAnalysis: ChessgroundController) => {

        const pvlineIdx = (ceval && ceval.multipv) ? ceval.multipv - 1 : 0;

        // Render PV line
        if (ceval?.p !== undefined) {
            let pvSan: string | VNode = ceval.p;
            if (this.fsfEngineBoard) {
                try {
                    this.fsfEngineBoard.setFen(boardInAnalysis.fullfen);
                    pvSan = this.fsfEngineBoard.variationSan(ceval.p, this.notationAsObject);
                    if (pvSan === '') pvSan = emptySan;
                } catch (error) {
                    pvSan = emptySan;
                }
            }
            if (pvSan !== emptySan) {
                pvSan = h('pv-san', { on: { click: () => this.makePvMove(ceval.p as string, boardInAnalysis) } } , pvSan)
                this.pvView(pvlineIdx, h('pvline', [(this.multipv > 1 && boardInAnalysis.localAnalysis) ? h('strong', scoreStr) : '', pvSan]));
            }
        } else {
            this.pvView(pvlineIdx, h('pvline', (boardInAnalysis.localAnalysis) ? h('pvline', '-') : ''));
        }

        // Render gauge, arrow and main score value for first PV line only
        if (pvlineIdx > 0) return;

        let shapes0: DrawShape[] = [];
        boardInAnalysis.chessground.setAutoShapes(shapes0);

        const gaugeEl = document.getElementById(boardInAnalysis.boardName == 'a'? 'gauge': 'gaugePartner') as HTMLElement;
        if (gaugeEl && pvlineIdx === 0) {
            const blackEl = gaugeEl.querySelector('div.black') as HTMLElement | undefined;
            if (blackEl && ceval !== undefined) {
                const score = ceval['s'];
                // TODO set gauge colour according to the variant's piece colour
                const color = (this.variant.colors.first === "Black") ? turnColor === 'black' ? 'white' : 'black' : turnColor;
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

            if (boardInAnalysis.boardName == 'a'){
                this.vscore = patch(this.vscore, h('score#score', scoreStr));
            } else {
                this.vscorePartner = patch(this.vscorePartner, h('score#scorePartner', scoreStr));
            }

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
            if (boardInAnalysis.boardName == 'a') {
                this.vscore = patch(this.vscore, h('score#score', ''));
            } else {
                this.vscorePartner = patch(this.vscorePartner, h('score#scorePartner', ''));
            }
            this.vinfo = patch(this.vinfo, h('info#info', _('in local browser')));
        }

        // console.log(shapes0);
        boardInAnalysis.chessground.set({
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

    // When we are moving inside a variation move list
    // then plyVari > 0 and ply is the index inside vari movelist
    goPly = (ply: number, plyVari = 0) => {//todo:niki:temp comment out
        console.log(ply, plyVari);
        const vv = this.steps[plyVari]?.vari;
        const step = (plyVari > 0 && vv) ? vv[ply - plyVari] : this.steps[ply];
        if (step === undefined) return;

        console.log(step);

        const board=step.boardName==='a'?this.b1:this.b2;

        const fen=step.boardName==='a'?step.fen: step.fenB!;
        const fenPartner=step.boardName==='b'?step.fen: step.fenB!;

        const move = step.boardName==='a'?uci2LastMove(step.move):uci2LastMove(step.moveB);
        const movePartner = step.boardName==='b'?uci2LastMove(step.move):uci2LastMove(step.moveB);

        let capture = false;
        if (move) {
            // 960 king takes rook castling is not capture
            // TODO defer this logic to ffish.js
            capture = (board.chessground.state.boardState.pieces.get(move[1] as cg.Key) !== undefined && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
        }

        board.chessground.set({
            fen: fen,
            turnColor: step.turnColor,
            movable: {
                color: step.turnColor,
                },
            check: step.check,
            lastMove: move,
        });

        const turnColorPartner = fenPartner.split(' ')[1] === "w"? "white": "black";//todo:niki:why not make util function to get this from fen and drop Step.turnColor - maybe even in chessground
        board.partnerCC.chessground.set({fen: fenPartner, lastMove: movePartner, turnColor: turnColorPartner, movable: {color: turnColorPartner}});

        board.fullfen = fen;
        board.partnerCC.fullfen = fenPartner;

        if (ply === this.ply + 1) {
            sound.moveSound(board.variant, capture);
        }

        this.ply = ply;

        ////////////// above is more or less copy/pasted from gameCtrl.ts->goPLy. other places just call super.goPly

        if (this.plyVari > 0) {
            this.plyInsideVari = ply - plyVari;
        }

        if (this.b1.localAnalysis || this.b2.localAnalysis) {
            this.engineStop();
            this.clearPvlines();
            // Go back to the main line
            if (plyVari === 0) {
                const container = document.getElementById('vari') as HTMLElement;
                patch(container, h('div#vari', ''));
            }
        }

        // Go back to the main line
        if (this.plyVari > 0 && plyVari === 0) {
            this.steps[this.plyVari]['vari'] = undefined;
            this.plyVari = 0;
            updateMovelist(this);
        }
        board.turnColor = step.turnColor;//todo: probably not needed here and other places as well where its set

        // const clocktimes = this.steps[1]?.clocks?.white;
        // if (clocktimes !== undefined) {
            renderClocks(this);
        //     const hc = this.movetimeChart;
        //     if (hc !== undefined) {
        //         const idx = (step.turnColor === 'white') ? 1 : 0;
        //         const turn = (ply + 1) >> 1;
        //         const hcPt = hc.series[idx].data[turn-1];
        //         if (hcPt !== undefined) hcPt.select();
        //     }
        // }
        if (board.ffishBoard) {
            board.ffishBoard.setFen(board.fullfen);
            board.setDests();
        }
        //todo:niki:actually try removing this below - no longer sure if needed/helping. there were other bugs to fix also and not sure which one helped and if this is needed at all
        //todo:niki:not great on first load when ffishboard not initialized yet.
        //     probably same bug exist in normal, but here in 2 board more visible because even after scroll of moves of one board, the second's dests dont get refreshed
        //     that is why i am adding this here, otherwise it shouldn't really be needed as position doesn't change, but
        //     we onle need it now because we dont know if second board ever got initialized
        //todo:niki:can we find a way to better wait for initializing of ffishboard stuff? put code like this in some lambda and pass it to some promise or something, maybe?
        if (board.partnerCC.ffishBoard) {
            board.partnerCC.ffishBoard.setFen(board.partnerCC.fullfen);
            board.partnerCC.setDests();
        }

    }

    doSend = (message: JSONObject) => {
        // console.log("---> doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

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
        // const moves = b.ffishBoard.moveStack().split(' ');
        const newPly = this.ply + 1;

        const msg : MsgAnalysisBoard = {
            gameId: this.gameId,
            fen: b.ffishBoard.fen(this.b1.variant.ui.showPromoted, 0),
            ply: newPly,
            lastMove: move,
            dests: new Map<Orig, Key[]>(), // todo:niki: why do i even use this msg object? putting empty dests just so it compiles, i dont think it is used
            promo: [promo],// todo:niki: i think this is used, but was missing until now and put this so it doesnt complain. i wonder how it worked before. anyway, all code here needs review
            bikjang: b.ffishBoard.isBikjang(),
            check: b.ffishBoard.isCheck(),
        }

        this.onMsgAnalysisBoard(b, msg);

        const step = {  //no matter on which board the ply is happening i always need both fens and moves for both boards. this way when jumping to a ply in the middle of the list i can setup both boards and highlight both last moves
            fen: b.boardName==='a'? b.ffishBoard.fen(b.variant.ui.showPromoted, 0): b.partnerCC.ffishBoard.fen(b.partnerCC.variant.ui.showPromoted, 0),
            fenB: b.boardName==='b'? b.ffishBoard.fen(b.variant.ui.showPromoted, 0): b.partnerCC.ffishBoard.fen(b.partnerCC.variant.ui.showPromoted, 0),
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
        console.log(">>>>>>>>>>>>>>>>>>>>>")
        console.log(b.partnerCC.ffishBoard.moveStack().split(' '));
        console.log(b.ffishBoard.moveStack().split(' '));
        const ffishBoardPly = b.ffishBoard.moveStack().split(' ').length;
        const partnerBoardHasNoMoves = b.partnerCC.ffishBoard.moveStack().split(' ')[0] === '' ;
        const ffishPartnerBoardPly = partnerBoardHasNoMoves? 0: b.partnerCC.ffishBoard.moveStack().split(' ').length;
        const moveIdx = (this.plyVari === 0) ? this.ply : this.plyInsideVari;
        // New main line move
        if (moveIdx === this.steps.length && this.plyVari === 0) {
            this.steps.push(step);
            b.steps.push(step);
            this.ply = moveIdx;
            updateMovelist(this);

            this.checkStatus(msg);
        // variation move
        } else {
            // possible new variation starts
            if (ffishBoardPly === 1 && partnerBoardHasNoMoves) {
                if (msg.lastMove === this.steps[this.ply - 1].move) {
                    // existing main line played
                    selectMove(this, this.ply);
                    return;
                }
                // new variation starts
                if (vv === undefined) {
                    this.plyVari = moveIdx;
                    this.steps[this.plyVari]['vari'] = [];
                } else {
                    // variation in the variation: drop old moves
                    if ( vv ) {
                        this.steps[this.plyVari]['vari'] = vv.slice(0, ffishBoardPly + ffishPartnerBoardPly - this.plyVari); // todo:niki: probably doesn't work
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
        e.value = this.b1.fullfen+" "+this.b2.fullfen;

        // if (this.isAnalysisBoard) {//todo:niki
        //     const idxInVari = (b.plyVari > 0) && vv ? vv.length - 1 : 0;
        //     this.vpgn = patch(this.vpgn, h('textarea#pgntext', { attrs: { rows: 13, readonly: true, spellcheck: false} }, this.getPgn(idxInVari)));
        // }
        // TODO: But sending moves to the server will be useful to implement shared live analysis!
        // this.doSend({ type: "analysis_move", gameId: this.gameId, move: move, fen: this.fullfen, ply: this.ply + 1 });
    }

    private onMsgAnalysisBoard = (b: ChessgroundController, msg: MsgAnalysisBoard) => {
        // console.log("got analysis_board msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (b.localAnalysis) this.engineStop();

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

        if (b.localAnalysis) this.engineGo(b);
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

    private onMsgAnalysis = (msg: MsgAnalysis, boardInAnalysis: ChessgroundController) => {
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
            this.drawEval(msg.ceval, scoreStr, turnColor, boardInAnalysis);
        }
    }

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
