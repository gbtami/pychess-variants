import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { DrawShape } from 'chessgroundx/draw';
import * as Mousetrap from 'mousetrap';

import { _ } from '../i18n';
import { uci2LastMove, uci2cg } from '../chess';
import { Variant, VARIANTS } from "../variants"
import { createMovelistButtons, updateMovelist, selectMove } from './movelist.bug';
import { povChances } from '../analysis/winningChances';
import { copyTextToClipboard } from '../clipboard';
import { patch } from '../document';
import { Chart } from "highcharts";
import { PyChessModel } from "../types";
import { Ceval, MsgBoard, Step } from "../messages";
import { GameControllerBughouse } from "./gameCtrl.bug";
import { sound } from "../sound";
import { renderClocks } from "./analysisClock.bug";
import { variantsIni } from "../variantsIni";
import { MsgAnalysis } from "../analysis/analysisType";
import {
    addOrSelectChild,
    AnalysisTree,
    branchStartPath,
    canPromoteVariation,
    createAnalysisTree,
    currentLineEndPath,
    deleteNodePath,
    extendPath,
    forceVariationAt,
    getNodeList,
    mainlineEndPath,
    mainlinePathAtPly,
    nextBranchPath,
    nodeAtPath,
    parentPath,
    pathIsForcedVariation,
    previousBranchPath,
    promoteNodePath,
    setCollapsedFrom,
    someCollapsedFrom,
    stepLinePath,
} from "../analysis/analysisTree";
import ffishModule from "ffish-es6";
import { titleCase } from "@/analysis/analysisCtrl";
import { movetimeChart } from "./movetimeChart.bug";
import { renderBughouseLinePgnMoveText, renderBughouseTreePgnMoveText } from "./analysisTreeBug";
import { initBoardSettings, switchBoards } from "@/bug/roundCtrl.bug";
import {playerInfoData} from "@/bug/gameInfo.bug";

const EVAL_REGEX = new RegExp(''
  + /^info depth (\d+) seldepth \d+ multipv (\d+) /.source
  + /score (cp|mate) ([-\d]+) /.source
  + /(?:(upper|lower)bound )?nodes (\d+) nps \S+ /.source
  + /(?:hashfull \d+ )?(?:tbhits \d+ )?time (\S+) /.source
  + /pv (.+)/.source);

const maxDepth = 18;
const maxThreads = Math.max((navigator.hardwareConcurrency || 1) - 1, 1);

const emptySan = '\xa0';
const TREE_COLLAPSED_STORAGE_KEY = 'analysisTreeBugCollapsed';

export default class AnalysisControllerBughouse {
    model;
    // sock;

    b1: GameControllerBughouse;
    b2: GameControllerBughouse;

    wplayer: string;
    bplayer: string;
    base: number;
    inc: number;
    gameId: string;
    vpgn: VNode;
    vscore: VNode | HTMLElement;
    vscorePartner: VNode | HTMLElement;
    vinfo: VNode | HTMLElement;
    vpvlines: VNode[] | HTMLElement[];

    variant: Variant;

    vmovelist: VNode | HTMLElement;
    moveControls: VNode;
    lastmove: cg.Key[];
    premove: {orig: cg.Key, dest: cg.Key, metadata?: cg.SetPremoveMetadata} | null;
    result: string;
    flip: boolean;
    settings: boolean;
    status: number;

    steps: Step[];
    plyA: number = 0;
    plyB: number = 0;

    pgn: string;
    ply: number;
    plyVari: number;
    recordedMainlinePly?: number;
    animation: boolean;
    showDests: boolean;
    analysisChart: Chart;

    maxDepth: number;
    isAnalysisBoard: boolean;
    isEngineReady: boolean;
    notation: cg.Notation;

    ffish: any;
    notationAsObject: any;

    movetimeChart: Chart;
    chartFunctions: any[];

    arrow: boolean;

    multipv: number;

    importedBy: string;

    embed: boolean;

    fsfDebug: boolean;
    fsfError: string[];
    fsfEngineBoard: any;  // used to convert pv UCI move list to SAN
    analysisTree?: AnalysisTree;
    analysisPath: string;
    treeForkIndex: number;
    treeContextMenu?: { path: string; x: number; y: number };
    private readonly onTreeContextMenuDocumentClick: (event: MouseEvent) => void;

    username: string;
    chess960: boolean;

    teamFirst: [[string, string, string], [string, string, string]]
    teamSecond: [[string, string, string], [string, string, string]]

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
        this.chess960 = model.chess960 === 'True';

        this.variant = VARIANTS[model.variant];

        this.teamFirst = [playerInfoData(model, "w", "a"), playerInfoData(model, "b", "b")]
        this.teamSecond = [playerInfoData(model, "b", "a"), playerInfoData(model, "w", "b")]

        this.b1 = new GameControllerBughouse(el1, el1Pocket1, el1Pocket2, 'a', model);
        this.b2 = new GameControllerBughouse(el2, el2Pocket1, el2Pocket2, 'b', model);
        this.b2.chessground.set({orientation:"black"});
        this.b1.partnerCC = this.b2;
        this.b2.partnerCC = this.b1;
        this.b1.parent = this;
        this.b2.parent = this;

        ffishModule().then((loadedModule: any) => {
            this.ffish = loadedModule;
            this.ffish.loadVariantConfig(variantsIni);
            this.notationAsObject = this.notation2ffishjs(this.notation);
        });

        this.isAnalysisBoard = model["gameId"] === "";
        this.chartFunctions = [movetimeChart];

        // UCI isready/readyok
        this.isEngineReady = false;

        this.maxDepth = maxDepth;

        // current interactive analysis variation ply
        this.plyVari = 0;
        this.analysisPath = '';
        this.treeForkIndex = 0;

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

        this.importedBy = '';

        this.notation = this.b1.variant.notation;
        this.onTreeContextMenuDocumentClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('.tree-context-menu')) return;
            this.closeTreeContextMenu();
        };

        const fens = model.fen.split(" | ");

        this.steps.push({
            'fen': fens[0],
            'fenB': fens[1],
            'move': undefined,
            'check': false,//not relevant/meaningful - we use the fens for that
            'turnColor': this.b1.turnColor,//not relevant/meaningful - we use the fens for that
            });

        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        //
        patch(document.getElementById('input') as HTMLElement, h('input#input', this.renderInput(this.b1)));
        patch(document.getElementById('inputPartner') as HTMLElement, h('input#inputPartner', this.renderInput(this.b2)));

        this.vscore = document.getElementById('score') as HTMLElement;
        this.vscorePartner = document.getElementById('scorePartner') as HTMLElement;
        this.vinfo = document.getElementById('info') as HTMLElement;
        this.vpvlines = [...Array(5).fill(null).map((_, i) => document.querySelector(`.pvbox :nth-child(${i + 1})`) as HTMLElement)];

        const pgn = (this.isAnalysisBoard) ? this.getPgn() : this.pgn;
        this.renderFENAndPGN(pgn);

        if (this.isAnalysisBoard) {
            (document.querySelector('[role="tablist"]') as HTMLElement).style.display = 'none';
            (document.querySelector('[tabindex="0"]') as HTMLElement).style.display = 'flex';
        }
        //

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
        // const menuEl = document.getElementById('bars') as HTMLElement;
        // menuEl.style.display = 'block';
``
        //
        this.onMsgBoard(model["board"] as MsgBoard);

        initBoardSettings(this.b1, this.b2, this.variant);
        this.syncBoardHitAreas();

        (document.getElementById('gaugePartner') as HTMLElement).classList.add('flipped');

        Mousetrap.bind('left', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeParentPath();
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
        Mousetrap.bind('right', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeMainChildPath();
            if (target) this.activateTreePath(target);
        });
        Mousetrap.bind(['up', '0', 'home'], (event?: KeyboardEvent) => {
            if (!this.hasAnalysisTree()) return;
            if (event?.key === 'ArrowUp' && this.selectTreeFork('prev')) return;
            this.activateTreePath('');
        });
        Mousetrap.bind(['down', '$', 'end'], (event?: KeyboardEvent) => {
            if (!this.hasAnalysisTree()) return;
            if (event?.key === 'ArrowDown' && this.selectTreeFork('next')) return;
            this.activateTreePath(this.getTreeMainlineEndPath());
        });
        Mousetrap.bind('shift+left', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreePreviousBranchPath();
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
        Mousetrap.bind('shift+right', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeNextBranchPath();
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
        Mousetrap.bind('shift+up', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeStepLinePath('prev');
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
        Mousetrap.bind('shift+down', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeStepLinePath('next');
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
    }

    hasAnalysisTree() {
        return this.analysisTree !== undefined;
    }

    private syncBoardHitAreas() {
        // Bughouse analysis changes the surrounding layout after the two chessgrounds
        // are created. Force a post-layout redraw so pointer bounds stay aligned with
        // the final rendered board positions on both boards.
        requestAnimationFrame(() => {
            this.b1.chessground.redrawAll();
            this.b2.chessground.redrawAll();
        });
    }

    initAnalysisTreeAtPly(ply: number) {
        if (this.steps.length === 0) return;
        this.analysisTree = createAnalysisTree(this.steps);
        this.applyTreeCollapsedPaths();
        this.analysisPath = mainlinePathAtPly(this.analysisTree, ply);
        this.revealTreePath(this.analysisPath);
        this.activateTreePath(this.analysisPath, false);
    }

    getTreeActivePath() {
        return this.analysisPath;
    }

    getTreeCurrentNode() {
        if (!this.analysisTree) return undefined;
        return nodeAtPath(this.analysisTree, this.analysisPath);
    }

    getTreeNodeList() {
        if (!this.analysisTree) return [];
        return getNodeList(this.analysisTree, this.analysisPath);
    }

    getTreeLineStartPath() {
        if (!this.analysisTree) return '';
        return branchStartPath(this.analysisTree, this.analysisPath);
    }

    getTreeLineEndPath() {
        if (!this.analysisTree) return '';
        return currentLineEndPath(this.analysisTree, this.analysisPath);
    }

    getTreeMainlineEndPath() {
        if (!this.analysisTree) return '';
        return mainlineEndPath(this.analysisTree);
    }

    getTreeParentPath() {
        return parentPath(this.analysisPath);
    }

    getTreeMainChildPath() {
        const node = this.getTreeCurrentNode();
        return node?.children[this.treeForkIndex]?.path ?? node?.children[0]?.path;
    }

    getTreeSelectedChildPath() {
        return this.treeForkIndex > 0 ? this.getTreeMainChildPath() : undefined;
    }

    getTreeNodeAtPath(path: string) {
        if (!this.analysisTree) return undefined;
        return nodeAtPath(this.analysisTree, path);
    }

    pathIsTreeMainline(path: string) {
        if (!this.analysisTree) return true;
        return getNodeList(this.analysisTree, path).every((node, idx) => idx === 0 || node.mainlinePly !== undefined);
    }

    pathIsTreeForcedVariation(path: string) {
        if (!this.analysisTree) return false;
        return pathIsForcedVariation(this.analysisTree, path);
    }

    canPromoteTreeVariation(path: string) {
        if (!this.analysisTree) return false;
        return canPromoteVariation(this.analysisTree, path);
    }

    someTreeCollapsed(collapsed: boolean) {
        if (!this.analysisTree) return false;
        return someCollapsedFrom(this.analysisTree, collapsed);
    }

    getTreeContextMenu() {
        return this.treeContextMenu;
    }

    openTreeContextMenu(path: string, clientX: number, clientY: number) {
        const container = document.getElementById('movelist');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left + container.scrollLeft;
        const y = clientY - rect.top + container.scrollTop;

        this.treeContextMenu = { path, x, y };
        document.addEventListener('click', this.onTreeContextMenuDocumentClick, false);
        updateMovelist(this, true, false);
    }

    closeTreeContextMenu() {
        if (!this.treeContextMenu) return;
        this.treeContextMenu = undefined;
        document.removeEventListener('click', this.onTreeContextMenuDocumentClick, false);
        updateMovelist(this, true, false);
    }

    copyTreeLinePgn(path: string) {
        if (!this.analysisTree) return;
        const onMainline = this.pathIsTreeMainline(path) && !this.pathIsTreeForcedVariation(path);
        copyTextToClipboard(renderBughouseLinePgnMoveText(
            this.analysisTree,
            onMainline ? extendPath(this.analysisTree, path, true) : path,
            (node) => node.step.sanSAN ?? node.step.san ?? '',
        ));
        this.closeTreeContextMenu();
    }

    toggleTreeCollapsed(path: string) {
        if (!this.analysisTree) return;
        const node = nodeAtPath(this.analysisTree, path);
        if (!node || node.children.length < 2) return;

        node.collapsed = !node.collapsed;
        if (node.collapsed) {
            const mainChildPath = node.children[0]?.path;
            if (this.analysisPath !== path && mainChildPath && !this.analysisPath.startsWith(mainChildPath)) {
                this.analysisPath = path;
                this.goPly(node.ply, 0);
            }
        }
        this.revealTreePath(this.analysisPath);
        this.saveTreeCollapsedPaths();
        updateMovelist(this, true, false);
    }

    collapseAllTree() {
        if (!this.analysisTree) return;
        setCollapsedFrom(this.analysisTree, '', true);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
        updateMovelist(this, true, false);
    }

    expandAllTree() {
        if (!this.analysisTree) return;
        setCollapsedFrom(this.analysisTree, '', false);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
        updateMovelist(this, true, false);
    }

    promoteTreeVariation(path: string, toMainline: boolean) {
        if (!this.analysisTree) return;
        promoteNodePath(this.analysisTree, path, toMainline);
        this.closeTreeContextMenu();
        updateMovelist(this, true, false);
    }

    forceTreeVariation(path: string, force: boolean) {
        if (!this.analysisTree) return;
        forceVariationAt(this.analysisTree, path, force);
        this.activateTreePath(path);
    }

    deleteTreeNode(path: string) {
        if (!this.analysisTree || !path) return;
        const nextPath =
            this.analysisPath === path || this.analysisPath.startsWith(`${path}.`)
                ? parentPath(path)
                : this.analysisPath;
        deleteNodePath(this.analysisTree, path);
        this.revealTreePath(nextPath);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
        this.activateTreePath(nextPath);
    }

    getTreePreviousBranchPath() {
        if (!this.analysisTree) return this.analysisPath;
        return previousBranchPath(this.analysisTree, this.analysisPath);
    }

    getTreeNextBranchPath() {
        if (!this.analysisTree) return this.analysisPath;
        return nextBranchPath(this.analysisTree, this.analysisPath, this.treeForkIndex);
    }

    getTreeStepLinePath(which: 'prev' | 'next') {
        if (!this.analysisTree) return this.analysisPath;
        return stepLinePath(this.analysisTree, this.analysisPath, which);
    }

    selectTreeFork(which: 'prev' | 'next') {
        const node = this.getTreeCurrentNode();
        if (!node || node.children.length < 2) return false;

        const delta = which === 'next' ? 1 : -1;
        this.treeForkIndex = (node.children.length + this.treeForkIndex + delta) % node.children.length;
        updateMovelist(this, true, false);
        return true;
    }

    activateTreeMainlinePly(ply: number) {
        if (!this.analysisTree) return;
        this.activateTreePath(mainlinePathAtPly(this.analysisTree, ply));
    }

    private getTreeNodeForPly(ply: number) {
        if (!this.analysisTree) return undefined;

        const nodeOnActivePath = this.getTreeNodeList().find((node) => node.ply === ply);
        if (nodeOnActivePath) return nodeOnActivePath;

        const mainlinePath = mainlinePathAtPly(this.analysisTree, ply);
        const mainlineNode = nodeAtPath(this.analysisTree, mainlinePath);
        if (mainlineNode) this.analysisPath = mainlinePath;
        return mainlineNode;
    }

    activateTreePath(path: string, redrawMovelist = true) {
        if (!this.analysisTree) return;
        const node = nodeAtPath(this.analysisTree, path);
        if (!node) return;

        this.revealTreePath(path);
        this.treeForkIndex = 0;
        this.treeContextMenu = undefined;
        document.removeEventListener('click', this.onTreeContextMenuDocumentClick, false);
        this.analysisPath = path;
        this.plyVari = 0;
        this.goPly(node.ply, 0);

        if (redrawMovelist) updateMovelist(this, true, false);
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
        switchBoards(this);
    }

    private renderInput = (cc: GameControllerBughouse) => {
        return {
            attrs: {
                disabled: false,
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
    }

    private checkStatus = () => {
        if (this.model["embed"]) return;

        const pgn = this.getPgn();
        this.renderFENAndPGN(pgn);
    }

    private renderFENAndPGN(pgn: string) {
        let container = document.getElementById('copyfen') as HTMLElement;
        if (container !== null) {
            const buttons = [
                h('a.i-pgn', { on: { click: () => console.log("downloadPgnText(\"pychess-variants_\" + this.gameId) not implemented") } }, [
                    h('i', {props: {title: _('Download game to PGN file')}, class: {"icon": true, "icon-download": true} }, _('Download PGN'))]),
                h('a.i-pgn', { on: { click: () => console.log("copyTextToClipboard(this.uci_usi) not implemented") } }, [
                    h('i', {props: {title: _('Copy USI/UCI to clipboard')}, class: {"icon": true, "icon-clipboard": true} }, _('Copy UCI/USI'))]),
                h('a.i-pgn', { on: { click: () => console.log("copyBoardToPNG not implemented") } }, [
                    h('i', {props: {title: _('Download position to PNG image file')}, class: {"icon": true, "icon-download": true} }, _('PNG image'))]),
                ]

            patch(container, h('div', buttons));
        }

        const e = document.getElementById('fullfen') as HTMLInputElement;
        e.value = this.b1.fullfen + " | " + this.b2.fullfen;

        container = document.getElementById('pgntext') as HTMLElement;
        this.vpgn = patch(container, h('div#pgntext', pgn));
    }

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
            this.plyA = 0;
            this.plyB = 0;

            msg.steps.forEach((step, idx) => {
                if (step.analysis !== undefined) {
                    step.ceval = step.analysis;
                    const scoreStr = this.buildScoreStr(idx % 2 === 0 ? "w" : "b", step.analysis);
                    step.scoreStr = scoreStr;
                }

                if (idx > 0) {
                    //skip first dummy element
                    if (step.boardName === "a") {
                        this.plyA++;
                    } else {
                        this.plyB++;
                    }
                }
                step.plyA = this.plyA;
                step.plyB = this.plyB;

                this.steps.push(step);
                });
            this.recordedMainlinePly = this.steps.length - 1;
            const initialPly = this.model["ply"] > 0 ? this.model["ply"] : this.ply;
            this.initAnalysisTreeAtPly(initialPly);
            updateMovelist(this);

            if (this.steps[0].analysis !== undefined) {
                this.vinfo = patch(this.vinfo, h('info#info', '-'));
                this.drawAnalysisChart(false);
            }

            patch(document.getElementById('anal-clock-top') as HTMLElement, h('div.anal-clock.top'));
            patch(document.getElementById('anal-clock-bottom') as HTMLElement, h('div.anal-clock.bottom'));
            patch(document.getElementById('anal-clock-top-bug') as HTMLElement, h('div.anal-clock.top.bug'));
            patch(document.getElementById('anal-clock-bottom-bug') as HTMLElement, h('div.anal-clock.bottom.bug'));
            renderClocks(this);

            const cmt = document.getElementById('chart-movetime') as HTMLElement;
            if (cmt) cmt.style.display = 'block';
            movetimeChart(this);
            this.syncBoardHitAreas();

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

        if (!this.hasAnalysisTree() && this.steps.length >= 1) {
            this.recordedMainlinePly = this.steps.length - 1;
            this.initAnalysisTreeAtPly(this.ply);
            updateMovelist(this);
        }

        // const lastMove = uci2LastMove(msg.lastMove);
        // const step = this.steps[this.steps.length - 1];
        // const capture = (lastMove.length > 0) && ((this.chessground.state.pieces.get(lastMove[1]) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));
        //
        // if (lastMove.length > 0 && (this.turnColor === this.mycolor || this.spectator)) {
        //     sound.moveSound(this.variant, capture);
        // }
        this.checkStatus();

        if (this.model["ply"] > 0) {
            this.ply = this.model["ply"];
            if (this.hasAnalysisTree()) this.activateTreePath(mainlinePathAtPly(this.analysisTree!, this.ply), false);
            else selectMove(this, this.ply);
        }

        this.syncBoardHitAreas();
    }

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


        patch(document.getElementById('input') as HTMLElement, h('input#input', {attrs: {disabled: false}}));
        patch(document.getElementById('inputPartner') as HTMLElement, h('input#inputPartner', {attrs: {disabled: false}}));

        this.fsfEngineBoard = new this.ffish.Board(this.variant.name, this.b1.fullfen, false);
        window.addEventListener('beforeunload', () => this.fsfEngineBoard.delete());

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
        const boardInAnalysis = this.b1.localAnalysis? this.b1: this.b2;
        const msg: MsgAnalysis = {type: 'local-analysis', ply: this.ply, color: boardInAnalysis.turnColor.slice(0, 1), ceval: {d: depth, multipv: multiPv, p: moves, s: score, k: knps}};
        this.onMsgAnalysis(msg, boardInAnalysis);
    };

    engineStop = () => {
        this.isEngineReady = false;
        this.fsfPostMessage('stop');
        this.fsfPostMessage('isready');
    }

    engineGo = (cc: GameControllerBughouse) => {
        if (this.chess960) {
            this.fsfPostMessage('setoption name UCI_Chess960 value true');
        }
        if (this.variant.name !== 'chess') {
            this.fsfPostMessage('setoption name UCI_Variant value ' + /*'crazyhouse'*/this.variant.name);
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
    }

    onMoreDepth = () => {
        this.maxDepth = 99;
        this.engineStop();
        this.engineGo(this.b1);
    }

    makePvMove (pv_line: string, cc: GameControllerBughouse) {
        const move = uci2cg(pv_line.split(" ")[0]);
        this.sendMove(cc, move /*move.slice(0, 2) as cg.Orig, move.slice(2, 4) as cg.Key, move.slice(4, 5)*/);
    }

    // Updates PV, score, gauge and the best move arrow
    drawEval = (ceval: Ceval | undefined, scoreStr: string | undefined, turnColor: cg.Color, boardInAnalysis: GameControllerBughouse) => {

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
            const fillEl = gaugeEl.querySelector('div.fill') as HTMLElement | undefined;
            if (fillEl && ceval !== undefined) {
                const score = ceval['s'];
                const color = turnColor;
                if (score !== undefined) {
                    const ev = povChances(color, score);
                    fillEl.style.height = String(100 - (ev + 1) * 50) + '%';
                }
                else {
                    fillEl.style.height = '50%';
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

    goPly = (ply: number, plyVari = 0) => {
        if (this.hasAnalysisTree() && plyVari === 0) {
            const node = this.getTreeNodeForPly(ply);
            if (!node) return;

            const step = node.step;
            const activeBoard = step.boardName === 'b' ? this.b2 : this.b1;
            const fenA = step.fen;
            const fenB = step.fenB ?? this.steps[0].fenB!;
            const moveA = uci2LastMove(step.move);
            const moveB = uci2LastMove(step.moveB);
            const turnColorA = fenA.split(' ')[1] === 'w' ? 'white' : 'black';
            const turnColorB = fenB.split(' ')[1] === 'w' ? 'white' : 'black';

            let capture = false;
            const move = step.boardName === 'b' ? moveB : moveA;
            if (move) {
                capture =
                    (activeBoard.chessground.state.boardState.pieces.get(move[1] as cg.Key) !== undefined
                        && step.san?.slice(0, 2) !== 'O-')
                    || (step.san?.slice(1, 2) === 'x');
            }

            if (ply === this.ply + 1 && step.boardName !== undefined) {
                sound.moveSound(activeBoard.variant, capture);
            }
            this.ply = ply;
            this.plyVari = 0;

            if (this.b1.localAnalysis || this.b2.localAnalysis) {
                this.engineStop();
                this.clearPvlines();
            }

            this.b1.setState(fenA, turnColorA, moveA);
            this.b1.renderState();
            this.b1.chessground.set({ movable: { color: turnColorA } });

            this.b2.setState(fenB, turnColorB, moveB);
            this.b2.renderState();
            this.b2.chessground.set({ movable: { color: turnColorB } });

            this.disableMovableOnCheckmate(activeBoard);
            renderClocks(this);
            this.checkStatus();

            if (this.b1.localAnalysis) {
                this.engineGo(this.b1);
            } else if (this.b2.localAnalysis) {
                this.engineGo(this.b2);
            }

            return;
        }

        const step = this.steps[ply];
        if (step === undefined) return;

        const board = step.boardName === 'a'? this.b1: this.b2;

        const fen = step.boardName === 'a'? step.fen: step.fenB!;
        const fenPartner = step.boardName === 'b'? step.fen: step.fenB!;

        const move = step.boardName === 'a' ? uci2LastMove(step.move)! : uci2LastMove(step.moveB)!;
        const movePartner = step.boardName === 'b'? uci2LastMove(step.move)! : uci2LastMove(step.moveB)!;
        const turnColorPartner = fenPartner.split(' ')[1] === "w"? "white": "black";

        let capture = false;
        if (move) {
            // 960 king takes rook castling is not capture
            // TODO defer this logic to ffish.js
            capture = (board.chessground.state.boardState.pieces.get(move[1] as cg.Key) !== undefined && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
        }

        if (ply === this.ply + 1) { // no sound if we are scrolling backwards
            sound.moveSound(board.variant, capture);
        }
        this.ply = ply;
        this.plyVari = 0;

        ////////////// above is more or less copy/pasted from gameCtrl.ts->goPLy. other places just call super.goPly

        if (this.b1.localAnalysis || this.b2.localAnalysis) {
            this.engineStop();
            this.clearPvlines();
        }

        board.setState(fen, step.turnColor, move!);
        board.renderState();
        board.chessground.set({movable: { color: step.turnColor}});

        board.partnerCC.setState(fenPartner, turnColorPartner, movePartner);
        board.partnerCC.renderState();
        board.partnerCC.chessground.set({movable: { color: turnColorPartner}});

        this.disableMovableOnCheckmate(board);

        renderClocks(this);
    }

    private disableMovableOnCheckmate = (board: GameControllerBughouse) => {
        // when we have a checkmate on one board, make the other non-movable (the one with checkmate has no dest so
        // not important if movable or not
        if (board.partnerCC.chessground.state.movable.dests?.size === 0) {
            board.chessground.set({movable: { color: undefined }});
        }
        if (board.chessground.state.movable.dests?.size === 0) {
            board.partnerCC.chessground.set({movable: { color: undefined }});
        }
    }

    private getPgn = () => {
        if (this.hasAnalysisTree()) {
            const moveText = renderBughouseTreePgnMoveText(
                this.analysisTree!,
                (node) => node.step.sanSAN ?? node.step.san ?? '',
            );

            const today = new Date().toISOString().substring(0, 10).replace(/-/g, '.');

            const event = '[Event "?"]';
            const site = `[Site "${this.b1.home}/analysis/${this.variant.name}"]`;
            const date = `[Date "${today}"]`;
            const whiteA = '[WhiteA "' + this.model['wplayer'] + '"]';
            const blackA = '[BlackA "' + this.model['bplayer'] + '"]';
            const whiteB = '[WhiteB "' + this.model['wplayerB'] + '"]';
            const blackB = '[BlackB "' + this.model['bplayerB'] + '"]';
            const result = '[Result "*"]';
            const variant = `[Variant "${titleCase(this.variant.name)}"]`;
            const fen = `[FEN "${this.steps[0].fen}"]`;
            const setup = '[SetUp "1"]';

            return `${event}\n${site}\n${date}\n${whiteA}\n${blackA}\n${whiteB}\n${blackB}\n${result}\n${variant}\n${fen}\n${setup}\n\n${moveText} *\n`;
        }

        const moves : string[] = [];
        let plyA: number = 0;
        let plyB: number = 0;

        for (let ply = 1; ply <= this.ply; ply++) {
            const step = this.steps[ply];
            if (step.boardName === 'a') plyA++;
            else plyB++;

            const moveCounter = Math.floor(step.boardName === 'a' ? (plyA + 1) / 2 : (plyB + 1) / 2) + step.boardName!.toUpperCase() + ".";
            moves.push(moveCounter + (step.sanSAN ?? step.san ?? ''));
        }
        const moveText = moves.join(' ');

        const today = new Date().toISOString().substring(0, 10).replace(/-/g, '.');

        const event = '[Event "?"]';
        const site = `[Site "${this.b1.home}/analysis/${this.variant.name}"]`;
        const date = `[Date "${today}"]`;
        const whiteA = '[WhiteA "'+this.model['wplayer']+'"]';
        const blackA = '[BlackA "'+this.model['bplayer']+'"]';
        const whiteB = '[WhiteB "'+this.model['wplayerB']+'"]';
        const blackB = '[BlackB "'+this.model['bplayerB']+'"]';
        const result = '[Result "*"]';
        const variant = `[Variant "${titleCase(this.variant.name)}"]`;
        const fen = `[FEN "${this.steps[0].fen}"]`;
        const setup = '[SetUp "1"]';

        return `${event}\n${site}\n${date}\n${whiteA}\n${blackA}\n${whiteB}\n${blackB}\n${result}\n${variant}\n${fen}\n${setup}\n\n${moveText} *\n`;
    }

    sendMove = (b: GameControllerBughouse, move: string) => {
        if (b.localAnalysis) this.engineStop();
        const san = b.san(move); // doing this before we push the move to the ffboard, after which its invalid
        const sanSAN = b.sanSAN(move);
        b.pushMove(move);
        b.renderState();
        b.chessground.set({movable: {color: b.turnColor}});

        if (b.localAnalysis) this.engineGo(b);
        //~

        const step = {  //no matter on which board the ply is happening i always need both fens and moves for both boards. this way when jumping to a ply in the middle of the list i can setup both boards and highlight both last moves
            fen: this.b1.fullfen,
            fenB: this.b2.fullfen,
            'move': b.boardName==='a'? move: this.steps[this.steps.length-1].move,  // if the new move is not for A, repeat value from previous step for A
            'moveB': b.boardName==='b'? move: this.steps[this.steps.length-1].moveB, // if the new move is not for B, repeat value from previous step for B
            'check': b.isCheck,
            'turnColor': b.turnColor,
            'san': san,
            'sanSAN': sanSAN,
            'boardName': b.boardName,
            'plyA': this.b1.ply,
            'plyB': this.b2.ply,
        };

        const tree = this.analysisTree;
        if (!tree) return;

        const currentNode = this.getTreeCurrentNode() ?? tree.root;
        const extendsMainlineTail =
            this.analysisPath === this.getTreeMainlineEndPath()
            && currentNode.mainlinePly !== undefined
            && currentNode.mainlinePly === this.steps.length - 1;
        const childPath = addOrSelectChild(
            tree,
            this.analysisPath,
            step,
            extendsMainlineTail && currentNode.children[0] === undefined,
            extendsMainlineTail ? this.steps.length : undefined,
        );

        if (extendsMainlineTail && currentNode.children[0] === undefined) {
            this.steps.push(step);
            this.recordedMainlinePly = this.steps.length - 1;
        }

        this.activateTreePath(childPath);
        this.disableMovableOnCheckmate(b);
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

    private onMsgAnalysis = (msg: MsgAnalysis, boardInAnalysis: GameControllerBughouse) => {
        // console.log(msg);
        if (msg['ceval']['s'] === undefined) return;
        const scoreStr = this.buildScoreStr(msg.color, msg.ceval);
        const turnColor = msg.color === 'w' ? 'white' : 'black';
        this.drawEval(msg.ceval, scoreStr, turnColor, boardInAnalysis);

    }

    private treeCollapsedStorageKey() {
        return `${TREE_COLLAPSED_STORAGE_KEY}:${this.gameId || `analysis:${this.variant.name}`}`;
    }

    private applyTreeCollapsedPaths() {
        if (!this.analysisTree) return;
        let collapsedPaths: string[] = [];
        try {
            collapsedPaths = JSON.parse(localStorage[this.treeCollapsedStorageKey()] ?? '[]');
        } catch {
            collapsedPaths = [];
        }
        collapsedPaths.forEach((path) => {
            const node = nodeAtPath(this.analysisTree!, path);
            if (node) node.collapsed = true;
        });
    }

    private saveTreeCollapsedPaths() {
        if (!this.analysisTree) return;
        const collapsedPaths: string[] = [];
        const visit = (node: AnalysisTree['root']) => {
            if (node.collapsed) collapsedPaths.push(node.path);
            node.children.forEach(visit);
        };
        visit(this.analysisTree.root);
        localStorage[this.treeCollapsedStorageKey()] = JSON.stringify(collapsedPaths);
    }

    private revealTreePath(path: string) {
        if (!this.analysisTree) return;
        getNodeList(this.analysisTree, path).slice(0, -1).forEach((node) => {
            node.collapsed = false;
        });
    }

}
