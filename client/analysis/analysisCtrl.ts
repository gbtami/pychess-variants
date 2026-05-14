import { h, VNode } from 'snabbdom';

import * as idb from 'idb-keyval';
import * as Mousetrap  from 'mousetrap';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { DrawShape } from 'chessgroundx/draw';

import { _ } from '../i18n';
import { sound } from '../sound';
import { uci2LastMove, uci2cg, getTurnColor } from '../chess';
import { crosstableView } from '../crosstable';
import { chatView } from '../chat';
import { createMovelistButtons, updateMovelist, selectMove } from '../movelist';
import { povChances } from './winningChances';
import { copyTextToClipboard } from '../clipboard';
import { analysisChart } from './analysisChart';
import { movetimeChart } from './movetimeChart';
import { renderClocks } from './analysisClock';
import { copyBoardToPNG } from '../png';
import { boardSettings } from '../boardSettings';
import { patch, downloadPgnText } from '../document';
import { variantsIni } from '../variantsIni';
import { Chart } from "highcharts";
import { PyChessModel } from "../types";
import { Ceval, MsgBoard, MsgUserConnected, Step, CrossTable } from "../messages";
import { MsgAnalysis, MsgAnalysisBoard } from './analysisType';
import { GameController } from '../gameCtrl';
import { analysisSettings, EngineSettings } from './analysisSettings';
import { setAriaTabClick } from '../view';
import { createWebsocket } from "@/socket/webSocketUtils";
import { setPocketRowCssVars } from '../pocketRow';
import { updateCount, updatePoint } from '../info';
import { fogFen } from '../variants';
import { hideKeyboardHelp, isKeyboardHelpShortcut, showKeyboardHelp } from './keyboardHelp';
import { PvHoverPreview } from './pvHoverPreview';
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
    renderLinePgnMoveText,
    setCollapsedFrom,
    someCollapsedFrom,
    stepLinePath,
    renderFullTreePgnMoveText,
} from './analysisTree';
import {
    CEVAL_ACTIVE_ROUNDS_STORAGE_KEY,
    CEVAL_DISABLE_STORAGE_KEY,
    buildCevalPositionPayload,
    hasActiveEligibleLiveGame,
    publishCevalPosition,
} from '../antiCheat';

const EVAL_REGEX = new RegExp(''
  + /^info depth (\d+) seldepth \d+ multipv (\d+) /.source
  + /score (cp|mate) ([-\d]+) /.source
  + /(?:(upper|lower)bound )?nodes (\d+) nps \S+ /.source
  + /(?:hashfull \d+ )?(?:tbhits \d+ )?time (\S+) /.source
  + /pv (.+)/.source);

const maxDepth = 18;
const TREE_COLLAPSED_STORAGE_KEY = 'analysisTreeCollapsedPaths';

const emptySan = '\xa0';

export function titleCase (words: string) {return words.split(' ').map(w =>  w.substring(0,1).toUpperCase() + w.substring(1).toLowerCase()).join(' ');}


export class AnalysisController extends GameController {
    vpgn: VNode;
    vscore: VNode | HTMLElement;
    vinfo: VNode | HTMLElement;
    vpvlines: VNode[] | HTMLElement[];
    settings: boolean;
    uci_usi: string;
    plyVari: number;
    UCImovelist: string[];
    analysisChart: Chart;
    movetimeChart: Chart;
    chartFunctions: any[];
    recordedMainlinePly?: number;
    localEngine: boolean;
    localAnalysis: boolean;
    maxDepth: number;
    isAnalysisBoard: boolean;
    isEngineReady: boolean;
    arrow: boolean;
    multipv: number;
    threads: number;
    hash: number;
    nnue: boolean;
    evalFile: string;
    uciOk: boolean;
    nnueOk: boolean;
    importedBy: string;
    embed: boolean;
    puzzle: boolean;
    ongoing: boolean;
    fsfDebug: boolean;
    fsfError: string[];
    fsfEngineBoard: any;  // used to convert pv UCI move list to SAN
    variantSupportedByFSF: boolean;
    autoShapes: DrawShape[][];
    lastBroadcastLocalAnalysisFen?: string;
    inlineNotation: boolean;
    disclosureMode: boolean;
    analysisTree?: AnalysisTree;
    analysisPath: string;
    treeForkIndex: number;
    treeContextMenu?: { path: string; x: number; y: number };
    private readonly onTreeContextMenuDocumentClick: (event: MouseEvent) => void;
    keyboardHelpOpen: boolean;
    private readonly onKeyboardHelpShortcutKeyDown: (event: KeyboardEvent) => void;
    private readonly onKeyboardHelpKeyDown: (event: KeyboardEvent) => void;
    private readonly pvHoverPreview: PvHoverPreview;

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model, model.fen, document.getElementById('pocket0') as HTMLElement, document.getElementById('pocket1') as HTMLElement, '');
        this.pvHoverPreview = new PvHoverPreview(this.variant);
        this.fsfError = [];
        this.embed = model.embed;
        this.puzzle = model["puzzle"] !== "";
        this.isAnalysisBoard = this.gameId === "" && !this.puzzle;
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

        this.ongoing = this.status <= -1;

        // is local stockfish.wasm engine supported at all
        this.localEngine = false;

        // is local engine analysis enabled? (the switch)
        this.localAnalysis =
            localStorage.localAnalysis !== undefined
            && !this.ongoing
            && !this.isLocalAnalysisBlockedByAntiCheat()
            && localStorage.localAnalysis === "true";

        // UCI isready/readyok
        this.isEngineReady = false;

        // ply where current interactive analysis variation line starts in the main line
        this.plyVari = 0;

        // used for interactive analysis go command
        this.UCImovelist = [];

        this.settings = true;
        this.dblClickPass = true;

        this.arrow = localStorage.arrow === undefined ? true : localStorage.arrow === "true";
        const infiniteAnalysis = localStorage.infiniteAnalysis === undefined ? false : localStorage.infiniteAnalysis === "true";
        this.maxDepth = (infiniteAnalysis) ? 99 : maxDepth;
        this.multipv = localStorage.multipv === undefined ? 1 : parseInt(localStorage.multipv);
        this.evalFile = localStorage[`${this.variant.name}-nnue`] === undefined ? '' : localStorage[`${this.variant.name}-nnue`];
        this.threads = localStorage.threads === undefined ? 1 : parseInt(localStorage.threads);
        this.hash = localStorage.hash === undefined ? 16 : parseInt(localStorage.hash);
        this.nnue = localStorage.nnue === undefined ? true : localStorage.nnue === "true";
        this.fsfDebug = localStorage.fsfDebug === undefined ? false : localStorage.fsfDebug === "true";
        this.inlineNotation = localStorage.inlineNotation === "true";
        this.disclosureMode = localStorage.disclosureMode === "true";
        this.variantSupportedByFSF = false;
        this.uciOk = false;
        this.nnueOk = false;
        this.importedBy = '';
        this.lastBroadcastLocalAnalysisFen = undefined;
        this.analysisPath = '';
        this.treeForkIndex = 0;
        this.keyboardHelpOpen = false;
        this.onTreeContextMenuDocumentClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('.tree-context-menu')) return;
            this.closeTreeContextMenu();
        };
        this.onKeyboardHelpShortcutKeyDown = (event: KeyboardEvent) => {
            if (this.keyboardHelpOpen || !isKeyboardHelpShortcut(event)) return;

            const target = event.target;
            if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;

            event.preventDefault();
            event.stopPropagation();
            this.openKeyboardHelp();
        };
        this.onKeyboardHelpKeyDown = (event: KeyboardEvent) => {
            if (!this.keyboardHelpOpen) return;

            const isShortcutToggle = isKeyboardHelpShortcut(event);
            if (event.key === 'Escape' || isShortcutToggle) {
                event.preventDefault();
                event.stopPropagation();
                this.closeKeyboardHelp();
                return;
            }

            if (event.key === 'Tab') return;

            event.preventDefault();
            event.stopPropagation();
        };

        if (!this.ongoing) {
            window.addEventListener('storage', this.onAntiCheatStorage);
            this.refreshLocalAnalysisAvailabilityForAntiCheat();
        }
        document.addEventListener('keydown', this.onKeyboardHelpShortcutKeyDown, true);

        this.chessground.set({
            orientation: this.variant.name === 'racingkings' ? 'white' : this.mycolor,
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


        if (this.hasPockets) {
            setPocketRowCssVars(this);
        }

        if (!this.isAnalysisBoard && !this.embed && !this.ongoing) {
            this.ctableContainer = document.getElementById('panel-3') as HTMLElement;
            if (model["ct"]) {
                this.ctableContainer = patch(this.ctableContainer, h('panel-3'));
                this.ctableContainer = patch(this.ctableContainer, crosstableView(model["ct"] as CrossTable, this.gameId));
            }
        }

        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        if (!this.isAnalysisBoard && !this.embed && !this.puzzle && !this.ongoing) {
            patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));
        }

        if (!this.embed && !this.ongoing) {
            const engineSettings = new EngineSettings(this);
            const et = document.querySelector('.engine-toggle') as HTMLElement;
            patch(et, engineSettings.view());

            this.vscore = document.getElementById('score') as HTMLElement;
            this.vinfo = document.getElementById('info') as HTMLElement;
            this.vpvlines = [...Array(5).fill(null).map((_, i) => document.querySelector(`.pvbox :nth-child(${i + 1})`) as HTMLElement)];
            this.pvHoverPreview.init(
                document.querySelector('div.pvbox') as HTMLElement | null,
                this.fullfen,
                this.chessground.state.orientation,
            );

            if (!this.puzzle) {
                (document.querySelector('div.feedback') as HTMLElement).style.display = 'none';
                const pgn = (this.isAnalysisBoard) ? this.getPgn() : this.pgn;
                this.renderFENAndPGN(pgn);
            }
        }

        if (this.variant.ui.materialPoint) {
            const miscW = document.getElementById('misc-infow') as HTMLElement;
            const miscB = document.getElementById('misc-infob') as HTMLElement;
            miscW.style.textAlign = 'right';
            miscB.style.textAlign = 'left';
            miscW.style.width = '100px';
            miscB.style.width = '100px';

            patch(document.getElementById('misc-info-center') as HTMLElement, h('div#misc-info-center', '-'));
            (document.getElementById('misc-info') as HTMLElement).style.justifyContent = 'space-around';

            [this.vmiscInfoW, this.vmiscInfoB] = updatePoint(this.variant, this.fullfen, miscW, miscB);
        }

        if (this.variant.ui.counting) {
            (document.getElementById('misc-infow') as HTMLElement).style.textAlign = 'center';
            (document.getElementById('misc-infob') as HTMLElement).style.textAlign = 'center';
        }

        setAriaTabClick("analysis_tab");

        if (!this.puzzle && !this.ongoing && !this.embed) {
            const initialEl = document.querySelector('[tabindex="0"]') as HTMLElement;
            initialEl.setAttribute('aria-selected', 'true');
            (initialEl!.parentNode!.parentNode!.querySelector(`#${initialEl.getAttribute('aria-controls')}`)! as HTMLElement).style.display = 'block';

            const menuEl = document.getElementById('bars') as HTMLElement;
            menuEl.style.display = 'block';
        }
        if (this.isAnalysisBoard) {
            (document.querySelector('[role="tablist"]') as HTMLElement).style.display = 'none';
            (document.querySelector('.pgn-container') as HTMLElement).style.display = 'block';
        }

        if (!this.puzzle && !this.ongoing && this.gameId) {
            this.sock = createWebsocket('wsr/' + this.gameId, onOpen, () => {}, () => {}, (e: MessageEvent) => this.onMessage(e));
        } else {
            this.onMsgBoard(model["board"] as MsgBoard);
            if (this.isAnalysisBoard && !this.hasAnalysisTree()) {
                this.initAnalysisTreeAtPly(this.ply);
                updateMovelist(this, true, false);
            }
        }

        setTimeout(() => {
            const container = document.getElementById('movelist');
            if (container && this.hasAnalysisTree()) updateMovelist(this, true, false);
        }, 0);

        analysisSettings.ctrl = this;

        Mousetrap.bind('p', () => copyTextToClipboard(`${this.fullfen};variant ${this.variant.name};site ${model.home}/${this.gameId}\n`));

        const gaugeEl = document.getElementById('gauge') as HTMLElement;
        if (this.variant.name !== 'racingkings' && this.mycolor === 'black') gaugeEl.classList.add("flipped");

        this.autoShapes = [];

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

    helpDialog() {
        if (this.keyboardHelpOpen) {
            this.closeKeyboardHelp();
        } else {
            this.openKeyboardHelp();
        }
    }

    openKeyboardHelp() {
        this.keyboardHelpOpen = true;
        document.addEventListener('keydown', this.onKeyboardHelpKeyDown, true);
        showKeyboardHelp(this);
    }

    closeKeyboardHelp() {
        if (!this.keyboardHelpOpen) return;
        this.keyboardHelpOpen = false;
        document.removeEventListener('keydown', this.onKeyboardHelpKeyDown, true);
        hideKeyboardHelp();
    }

    hasAnalysisTree() {
        return this.analysisTree !== undefined;
    }

    isTreeInlineNotation() {
        return this.inlineNotation;
    }

    isTreeDisclosureMode() {
        return this.disclosureMode;
    }

    initAnalysisTreeAtPly(ply: number) {
        if (this.steps.length === 0) return;
        // We rebuild the in-memory tree from the persisted mainline and then place
        // the active cursor on the requested ply. All later user-created branches
        // are attached to this tree only on the client.
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
        // This breadcrumb is the canonical source for UCI/PGN generation in tree mode.
        return getNodeList(this.analysisTree, this.analysisPath);
    }

    getTreeMainlineEndPath() {
        if (!this.analysisTree) return '';
        return mainlineEndPath(this.analysisTree);
    }

    getTreeLineStartPath() {
        if (!this.analysisTree) return '';
        return branchStartPath(this.analysisTree, this.analysisPath);
    }

    getTreeLineEndPath() {
        if (!this.analysisTree) return '';
        return currentLineEndPath(this.analysisTree, this.analysisPath);
    }

    getTreeParentPath() {
        return parentPath(this.analysisPath);
    }

    getTreeMainChildPath() {
        const node = this.getTreeCurrentNode();
        return node?.children[this.treeForkIndex]?.path ?? node?.children[0]?.path;
    }

    getTreeNodeAtPath(path: string) {
        if (!this.analysisTree) return undefined;
        return nodeAtPath(this.analysisTree, path);
    }

    pathIsTreeMainline(path: string) {
        if (!this.analysisTree) return true;
        return this.getTreeNodeListForPath(path).every((node, idx) => idx === 0 || node.mainlinePly !== undefined);
    }

    pathIsTreeForcedVariation(path: string) {
        if (!this.analysisTree) return false;
        return pathIsForcedVariation(this.analysisTree, path);
    }

    getTreeNodeListForPath(path: string) {
        if (!this.analysisTree) return [];
        return getNodeList(this.analysisTree, path);
    }

    canPromoteTreeVariation(path: string) {
        if (!this.analysisTree) return false;
        return canPromoteVariation(this.analysisTree, path);
    }

    someTreeCollapsed(collapsed: boolean) {
        if (!this.analysisTree) return false;
        return someCollapsedFrom(this.analysisTree, collapsed);
    }

    getTreeSelectedChildPath() {
        return this.treeForkIndex > 0 ? this.getTreeMainChildPath() : undefined;
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
        this.ensureTreeSanSan();
        const onMainline = this.pathIsTreeMainline(path) && !this.pathIsTreeForcedVariation(path);
        copyTextToClipboard(renderLinePgnMoveText(
            this.analysisTree,
            onMainline ? extendPath(this.analysisTree, path, true) : path,
            (node) => node.step.sanSAN ?? '',
        ));
        this.closeTreeContextMenu();
    }

    collapseAllTree() {
        if (!this.analysisTree) return;
        setCollapsedFrom(this.analysisTree, '', true);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
    }

    expandAllTree() {
        if (!this.analysisTree) return;
        setCollapsedFrom(this.analysisTree, '', false);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
    }

    promoteTreeVariation(path: string, toMainline: boolean) {
        if (!this.analysisTree) return;
        promoteNodePath(this.analysisTree, path, toMainline);
        updateMovelist(this, true, false);
        this.closeTreeContextMenu();
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
        this.activateTreePath(nextPath);
        this.closeTreeContextMenu();
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

    activateTreeMainlinePly(ply: number) {
        if (!this.analysisTree) return;
        this.activateTreePath(mainlinePathAtPly(this.analysisTree, ply));
    }

    private getTreeNodeForPly(ply: number) {
        if (!this.analysisTree) return undefined;

        // First prefer the currently selected branch. Falling back to persisted mainline
        // preserves older callers that still address positions by raw ply only.
        const nodeOnActivePath = this.getTreeNodeList().find((n) => n.ply === ply);
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

        // `analysisPath` is the single source of truth for tree-mode selection.
        // `goPly()` then projects that node back into the existing board/eval widgets.
        this.treeForkIndex = 0;
        this.treeContextMenu = undefined;
        document.removeEventListener('click', this.onTreeContextMenuDocumentClick, false);
        this.analysisPath = path;
        this.revealTreePath(path);
        this.plyVari = 0;
        this.goPly(node.ply, 0);

        if (redrawMovelist) updateMovelist(this, true, false);
    }

    toggleSettings() {
        const menuEl = document.getElementById('bars') as HTMLElement;
        const settingsEl = document.querySelector('div.analysis-settings') as HTMLElement;
        const toolsEl = document.querySelector('div.analysis-tools') as HTMLElement;
        if (settingsEl.style.display === 'flex') {
            toolsEl.style.display = 'flex';
            settingsEl.style.display = 'none';
            menuEl.classList.toggle('active', false);
        } else {
            toolsEl.style.display = 'none';
            settingsEl.style.display = 'flex';
            menuEl.classList.toggle('active', true);
        }
    }

    isLocalAnalysisBlockedByAntiCheat(): boolean {
        return !this.ongoing && hasActiveEligibleLiveGame();
    }

    refreshLocalAnalysisAvailabilityForAntiCheat() {
        const blocked = this.isLocalAnalysisBlockedByAntiCheat();
        if (blocked) this.disableLocalAnalysisForAntiCheat();

        const engineToggle = document.getElementById('engine-enabled') as HTMLInputElement | null;
        if (engineToggle !== null) {
            engineToggle.disabled =
                blocked
                || !this.localEngine
                || !this.isEngineReady
                || !this.variantSupportedByFSF;
        }
    }

    nnueIni() {
        if (this.localAnalysis && this.nnueOk) {
            this.engineStop();
            this.engineGo();
        }
    }

    pvboxIni() {
        if (this.localAnalysis) this.engineStop();
        this.pvHoverPreview.hide();
        this.clearPvlines();
        if (this.localAnalysis) this.engineGo();
    }

    pvView(i: number, pv: VNode | undefined) {
        if (i >= 0) {
            if (this.vpvlines === undefined) this.pvboxIni();
            this.vpvlines[i] = patch(this.vpvlines[i], h(`div#pv${i + 1}.pv`, {
                on: {
                    mouseleave: () => this.pvHoverPreview.scheduleHide(),
                },
            }, pv));
        }
    }

    clearPvlines() {
        this.pvHoverPreview.hide();
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
        this.pvHoverPreview.onOrientationChange();
        boardSettings.updateDropSuggestion();
        (document.getElementById('gauge') as HTMLElement).classList.toggle("flipped");
        const clocktimes = this.steps[1]?.clocks;
        if (clocktimes !== undefined) {
            renderClocks(this);
        }
        if (this.hasPockets) {
            setPocketRowCssVars(this);
        }
    }

    private drawAnalysisChart = (withRequest: boolean) => {
        const element = document.getElementById('request-analysis') as HTMLElement;
        if (element !== null) element.style.display = 'none';

        if (withRequest) {
            if (this.anon) {
                alert(_('You need an account to do that.'));
                return;
            }
//            if (!this.variantSupportedByFSF) {
// We can't use FSF WASM detection here because users may use unsupported hardware
// but server side analysis will work for them at the same time!
            if (this.variant.name === 'alice') {
                alert(_('This variant is not supported by Fairy-Stockfish.'));
                return;
            }
            this.doSend({ type: "analysis", username: this.username, gameId: this.gameId });
            const loaderEl = document.getElementById('loader') as HTMLElement;
            loaderEl.style.display = 'block';
        }
        const chartEl = document.getElementById('chart-analysis') as HTMLElement;
        chartEl.style.display = 'block';
        analysisChart(this);
    }

    checkStatus(msg: MsgBoard | MsgAnalysisBoard) {
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
            patch(container, h('div.pgnbuttons', buttons));
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

    onMsgBoard(msg: MsgBoard) {
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
        this.turnColor = getTurnColor(msg.fen);// turnColor have to be actualized before setDests() !!!

        this.setDests();

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
            this.recordedMainlinePly = msg.steps.length - 1;
            this.initAnalysisTreeAtPly(Math.min(this.ply, this.steps.length - 1));
            updateMovelist(this, true, false);

            if (this.steps[0].analysis === undefined) {
                if (!this.isAnalysisBoard && !this.embed) {
                    const el = document.getElementById('request-analysis') as HTMLElement;
                    el.style.display = 'flex';
                    patch(el, h('div#request-analysis', [h('button.request-analysis.button-primary', { on: { click: () => this.drawAnalysisChart(true) } }, [
                        h('i', {props: {title: _('Request Computer Analysis')}, class: {"icon": true, "icon-bar-chart": true} }, _('Request Analysis'))])
                        ])
                    );
                }
            } else {
                this.vinfo = patch(this.vinfo, h('info#info', '-'));
                this.drawAnalysisChart(false);
            }
            const clocktimes = this.steps[1]?.clocks;
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

        if (!this.hasAnalysisTree() && this.steps.length >= 1) {
            this.initAnalysisTreeAtPly(Math.min(this.ply, this.steps.length - 1));
            updateMovelist(this, true, false);
        }

        const lastMove = uci2LastMove(msg.lastMove);
        const step = this.steps[this.steps.length - 1];
        let capture = false;
        if (lastMove) {
            const piece = this.chessground.state.boardState.pieces.get(lastMove[1] as cg.Key);
            capture = (piece !== undefined && piece.role !== '_-piece' && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
        }
        if (msg.steps.length === 1 && lastMove && (this.turnColor === this.mycolor || this.spectator)) {
            sound.moveSound(this.variant, capture);
        }
        this.checkStatus(msg);

        if (this.ply > 0) {
            if (this.hasAnalysisTree()) this.activateTreePath(this.analysisPath, false);
            else selectMove(this, this.ply);
        }
    }

    onFSFline = (line: string) => {
        if (this.fsfDebug) console.debug('--->', line);

        if (this.ongoing) return;

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

        if (line.startsWith('option name UCI_Variant')) {
            if (!line.includes(this.variant.name)) {
                console.log('This variant is NOT supported by Fairy-Stockfish!');
                return;
            } else {
                this.variantSupportedByFSF = true;
            }
        }

        if (line.includes('uciok')) this.uciOk = true;

        if (line.includes('readyok')) this.isEngineReady = true;

        if (line.startsWith('Fairy-Stockfish')) {
            window.prompt = function() {
                return variantsIni + '\nEOF';
            }
            this.fsfPostMessage('load <<EOF');
            this.fsfPostMessage('uci');
        }

        if (!this.localEngine && this.uciOk && this.variantSupportedByFSF) {
            this.localEngine = true;
            this.fsfEngineBoard = new this.ffish.Board(this.variant.name, this.fullfen, this.chess960);
            this.fsfPostMessage('isready');

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
                            if (this.localAnalysis) {
                                this.engineStop();
                                this.engineGo();
                            }
                        });
                    }
                });
            }

            window.addEventListener('beforeunload', () => this.fsfEngineBoard.delete());

            if (this.localAnalysis && !this.puzzle && !this.ongoing) this.pvboxIni();
        }

        this.refreshLocalAnalysisAvailabilityForAntiCheat();

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
        if (this.lastBroadcastLocalAnalysisFen !== this.fullfen) {
            publishCevalPosition(
                buildCevalPositionPayload(this.variant.name, this.chess960, this.fullfen)
            );
            this.lastBroadcastLocalAnalysisFen = this.fullfen;
        }
        const msg: MsgAnalysis = {type: 'local-analysis', ply: this.ply, color: this.turnColor.slice(0, 1), ceval: {d: depth, multipv: multiPv, p: moves, s: score, k: knps}};
        this.onMsgAnalysis(msg);
    };

    onMoreDepth = () => {
        this.maxDepth = 99;
        this.engineStop();
        this.engineGo();
    }

    makePvMove (pv_line: string) {
        const move = pv_line.split(" ")[0];
        this.doSendMove(move);
    }

    shapeFromMove (pv_idx: number, pv_move: string, turnColor: cg.Color) {
        const atPos = pv_move.indexOf('@');
        // drop
        if (atPos > -1) {
            const d = pv_move.slice(atPos + 1, atPos + 3) as cg.Key;
            const dropPieceRole = util.roleOf(pv_move.slice(0, atPos) as cg.Letter);

            this.autoShapes[pv_idx] = [{
                orig: d,
                brush: 'paleGreen',
                piece: {
                    color: turnColor,
                    role: dropPieceRole
                }},
                { orig: d, brush: 'paleGreen' }
            ];
        } else {
            // arrow
            const o = pv_move.slice(0, 2) as cg.Key;
            const d = pv_move.slice(2, 4) as cg.Key;
            this.autoShapes[pv_idx] = [{ orig: o, dest: d, brush: 'paleGreen', piece: undefined, modifiers: { lineWidth: 14 - pv_idx * 2.5 } }];

            // duck
            if (this.variant.rules.duck && pv_move.includes(',')) {
                this.autoShapes[pv_idx].push({
                    orig: pv_move.slice(-2) as cg.Key,
                    brush: 'paleGreen',
                    piece: {
                        color: turnColor,
                        role: '_-piece'
                    }
                })
            }

            // TODO: gating, promotion
        }
        const shapes = this.autoShapes.flat();
        this.chessground.setAutoShapes(shapes);
    }

    // Updates PV, score, gauge and the best move arrow
    drawEval = (ceval: Ceval | undefined, scoreStr: string | undefined, turnColor: cg.Color) => {
        const pvlineIdx = (ceval && ceval.multipv) ? ceval.multipv - 1 : 0;
        // Render PV line
        if (ceval?.p !== undefined && this.multipv > 0) {
            let pvSan: string | VNode | VNode[] = ceval.p;
            const sanBoard = this.fsfEngineBoard ?? this.ffishBoard;
            if (sanBoard) {
                try {
                    // `fsfEngineBoard` is initialized asynchronously after local-engine handshake.
                    // On initial page load, server-side analysis can arrive before that happens.
                    // Falling back to `ffishBoard` avoids showing raw UCI coordinates until user
                    // clicks a move and triggers another redraw.
                    if (this.localAnalysis && !this.variant.twoBoards) {
                        const rendered = this.pvHoverPreview.renderPvSanLine({
                            pvLine: ceval.p,
                            sanBoard,
                            fullfen: this.fullfen,
                            notationAsObject: this.notationAsObject,
                            getOrientation: () => this.chessground.state.orientation,
                        });
                        if (rendered.length > 0) {
                            pvSan = rendered;
                        } else {
                            sanBoard.setFen(this.fullfen);
                            pvSan = sanBoard.variationSan(ceval.p, this.notationAsObject);
                        }
                    } else {
                        sanBoard.setFen(this.fullfen);
                        pvSan = sanBoard.variationSan(ceval.p, this.notationAsObject);
                    }
                    if (typeof pvSan === 'string' && pvSan === '') pvSan = emptySan;
                } catch (error) {
                    pvSan = emptySan;
                }
            }
            if (pvSan !== emptySan) {
                pvSan = h('pv-san', { on: { click: () => this.makePvMove(ceval.p as string) } } , pvSan)
                this.pvView(pvlineIdx, h('pvline', [(this.multipv > 1 && this.localAnalysis) ? h('strong', scoreStr) : '', pvSan]));
            }
        } else if (ceval === undefined) {
            this.pvView(pvlineIdx, h('pvline', (this.localAnalysis) ? h('pvline', '-') : ''));
        }

        // Render gauge and main score value for first PV line only
        if (pvlineIdx === 0) {
            const gaugeEl = document.getElementById('gauge') as HTMLElement;
            if (gaugeEl) {
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

            if (ceval?.d !== undefined) {
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
                this.vinfo = patch(this.vinfo, h('info#info', ''));
                this.vinfo = patch(this.vinfo, h('info#info', info));
            } else {
                this.vscore = patch(this.vscore, h('score#score', ''));
                this.vinfo = patch(this.vinfo, h('info#info', _('in local browser')));
            }
        }

        if (ceval?.p !== undefined) {
            // console.log("ARROW", this.arrow);
            if (this.arrow) {
                const pv_move = uci2cg(ceval.p.split(" ")[0]);
                this.shapeFromMove(pvlineIdx, pv_move, turnColor);
            }
        }
    }

    // Updates chart and score in movelist
    drawServerEval = (ply: number, scoreStr?: string) => {
        if (ply > 0) {
            const evalEl = document.getElementById('ply' + String(ply)) as HTMLElement;
            if (evalEl) patch(evalEl, h('eval#ply' + String(ply), scoreStr));
        }

        if (!this.puzzle && !this.ongoing) {
            analysisChart(this);
            const hc = this.analysisChart;
            if (hc !== undefined) {
                const hcPt = hc.series[0].data[ply];
                if (hcPt !== undefined) hcPt.select();
            }
        }
    }

    engineStop = () => {
        this.isEngineReady = false;
        this.fsfPostMessage('stop');
        this.fsfPostMessage('isready');
    }

    engineGo = () => {
        if (!this.variantSupportedByFSF) return;
        this.lastBroadcastLocalAnalysisFen = undefined;

        if (this.chess960) {
            this.fsfPostMessage('setoption name UCI_Chess960 value true');
        }
        if (this.variant.name !== 'chess') {
            this.fsfPostMessage('setoption name UCI_Variant value ' + this.variant.name);
        }
        if (this.evalFile === '' || !this.nnueOk || !this.nnue) {
            this.fsfPostMessage('setoption name Use NNUE value false');
        } else {
            this.fsfPostMessage('setoption name Use NNUE value true');
            this.fsfPostMessage('setoption name EvalFile value ' + this.evalFile);
        }

        this.fsfPostMessage('setoption name Hash value ' + this.hash);

        this.fsfPostMessage('setoption name Threads value ' + this.threads);

        this.fsfPostMessage('setoption name MultiPV value ' + this.multipv);

        let position: string = 'position fen ' + this.fullfen;
        if (this.UCImovelist.length > 0) {
            position = 'position fen ' + this.steps[0].fen + ' moves ' + this.UCImovelist.join(' ');
        }
        this.fsfPostMessage(position);

        if (this.maxDepth >= 99) {
            this.fsfPostMessage('go depth 99');
        } else {
            this.fsfPostMessage('go movetime 90000 depth ' + this.maxDepth);
        }
    }

    fsfPostMessage(msg: string) {
        if (window.fsf === undefined) {
            // At very first time we may have to wait for fsf module to initialize
            setTimeout(this.fsfPostMessage.bind(this), 100, msg);
        } else {
            if (this.fsfDebug) console.debug('<---', msg);
            window.fsf.postMessage(msg);
        }
    }

    disableLocalAnalysisForAntiCheat() {
        localStorage.localAnalysis = "false";
        const wasEnabled = this.localAnalysis;
        this.localAnalysis = false;
        this.lastBroadcastLocalAnalysisFen = undefined;
        if (wasEnabled) {
            this.engineStop();
            if (this.vpvlines !== undefined) this.clearPvlines();
        }

        const engineToggle = document.getElementById('engine-enabled') as HTMLInputElement | null;
        if (engineToggle !== null) engineToggle.checked = false;
    }

    private onAntiCheatStorage = (event: StorageEvent) => {
        if (event.storageArea !== localStorage) return;
        if (event.key === CEVAL_DISABLE_STORAGE_KEY) {
            this.disableLocalAnalysisForAntiCheat();
        } else if (event.key !== CEVAL_ACTIVE_ROUNDS_STORAGE_KEY) {
            return;
        }

        this.refreshLocalAnalysisAvailabilityForAntiCheat();
    }

    goPly(ply: number, plyVari = 0) {
        if (this.hasAnalysisTree() && plyVari === 0) {
            // Tree mode reads the active node directly instead of projecting a side line into `steps`.
            // We resolve the selected tree node first, then hydrate the existing board,
            // clocks, eval and PGN widgets from that node's step payload.
            const node = this.getTreeNodeForPly(ply);
            if (!node) return;

            const step = node.step;
            const lastMove = uci2LastMove(step.move);
            let capture = false;
            if (lastMove) {
                const piece = this.chessground.state.boardState.pieces.get(lastMove[1] as cg.Key);
                capture = (piece !== undefined && piece.role !== '_-piece' && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
            }

            const fen = this.mirrorBoard ? this.getAliceFen(step.fen) : step.fen;
            this.chessground.set({
                fen: this.fog ? fogFen(fen) : fen,
                turnColor: step.turnColor,
                movable: {
                    color: step.turnColor,
                },
                check: this.fog ? false : step.check,
                lastMove: this.fog ? undefined : lastMove,
            });

            this.turnColor = step.turnColor;
            this.setDests();
            this.fullfen = step.fen;
            this.suffix = '';
            this.duck.inputState = undefined;

            if (this.variant.ui.counting) {
                [this.vmiscInfoW, this.vmiscInfoB] = updateCount(step.fen, document.getElementById('misc-infow') as HTMLElement, document.getElementById('misc-infob') as HTMLElement);
            }

            if (this.variant.ui.materialPoint) {
                [this.vmiscInfoW, this.vmiscInfoB] = updatePoint(this.variant, step.fen, document.getElementById('misc-infow') as HTMLElement, document.getElementById('misc-infob') as HTMLElement);
            }

            if (ply === this.ply + 1) {
                sound.moveSound(this.variant, capture);
                if (step.check) sound.check();
            }
            this.ply = ply;
            this.plyVari = 0;

            if (this.localAnalysis) {
                this.engineStop();
                this.clearPvlines();
            }

            if (this.embed) return;

            const clocktimes = this.steps[1]?.clocks;
            if (clocktimes !== undefined) {
                renderClocks(this);
                const hc = this.movetimeChart;
                if (hc !== undefined && node.mainlinePly !== undefined) {
                    const idx = step.turnColor === 'white' ? 1 : 0;
                    const turn = (node.mainlinePly + 1) >> 1;
                    const hcPt = hc.series[idx].data[turn - 1];
                    if (hcPt !== undefined) hcPt.select();
                }
            }
            if (this.ffishBoard) {
                this.ffishBoard.setFen(this.fullfen);
                this.setDests();
            }

            if (!this.ongoing) {
                this.autoShapes = new Array(this.multipv).fill([]);
                this.chessground.setAutoShapes([]);
                this.drawEval(step.ceval, step.scoreStr, step.turnColor);
                if (node.mainlinePly !== undefined) this.drawServerEval(node.mainlinePly, step.scoreStr);
            }

            this.updateUCImoves();
            if (this.localAnalysis) this.engineGo();

            if (!this.puzzle && !this.ongoing) {
                const e = document.getElementById('fullfen') as HTMLInputElement;
                e.value = this.fullfen;

                if (this.isAnalysisBoard) {
                    this.vpgn = patch(this.vpgn, h('div#pgntext', this.getPgn()));
                } else {
                    const histPly = node.mainlinePly ?? ply;
                    const hist = this.home + '/' + this.gameId + '?ply=' + histPly.toString();
                    window.history.replaceState({}, '', hist);
                }
            }

            return;
        }

        super.goPly(ply, 0);

        if (this.localAnalysis) {
            this.engineStop();
            this.clearPvlines();
        }

        if (this.embed) return;

        const step = this.steps[ply];

        const clocktimes = this.steps[1]?.clocks;
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

        if (!this.ongoing) {
            this.autoShapes = new Array(this.multipv).fill([]);
            this.chessground.setAutoShapes([]);
            this.drawEval(step.ceval, step.scoreStr, step.turnColor);
            this.drawServerEval(ply, step.scoreStr);
        }

        this.updateUCImoves();
        if (this.localAnalysis) this.engineGo();

        if (!this.puzzle && !this.ongoing) {
            const e = document.getElementById('fullfen') as HTMLInputElement;
            e.value = this.fullfen;

            if (this.isAnalysisBoard) {
                this.vpgn = patch(this.vpgn, h('div#pgntext', this.getPgn()));
            } else {
                const hist = this.home + '/' + this.gameId + '?ply=' + ply.toString();
                window.history.replaceState({}, '', hist);
            }
        }

    }

    updateUCImoves() {
        this.UCImovelist = [];

        if (this.hasAnalysisTree()) {
            // In tree mode the active UCI sequence is simply the breadcrumb from root
            // to the selected node. This keeps engine analysis aligned with the branch
            // the user is currently exploring.
            const nodeList = this.getTreeNodeList();
            nodeList.slice(1).forEach((node) => {
                if (node.step.move) this.UCImovelist.push(node.step.move);
            });
            return;
        }

        for (let ply = 1; ply <= this.ply; ply++) {
            if (this.steps[ply]?.move) this.UCImovelist.push(this.steps[ply].move!);
        }
    }

    getPgn() {
        const moves : string[] = [];
        let moveCounter: string = '';
        let whiteMove: boolean = true;
        let blackStarts: boolean = this.steps[0].turnColor === 'black';

        // Imported game steps has no 'sanSAN' so we have to compute it
        let sanSANneeded = false;

        if (this.steps.length > 1 && this.steps[1]['sanSAN'] == undefined) {
            sanSANneeded = true;
            const startFEN = this.steps[0].fen;
            this.ffishBoard.setFen(startFEN);
        }

        if (this.hasAnalysisTree()) {
            this.ensureTreeSanSan();
        } else for (let ply = 1; ply <= this.ply; ply++) {
                if (blackStarts && ply === 1) {
                    moveCounter = '1...';
                } else {
                    whiteMove = this.steps[ply].turnColor === 'black';
                    moveCounter = (whiteMove) ? Math.ceil((ply + 1) / 2) + '.' : '';
                }
                if (sanSANneeded) {
                    this.steps[ply]['sanSAN'] = this.ffishBoard.sanMove(this.steps[ply].move!);
                    this.ffishBoard.push(this.steps[ply].move!);
                };
                moves.push(moveCounter + this.steps[ply]['sanSAN']);
        }

        if (this.hasAnalysisTree()) {
            moves.push(renderFullTreePgnMoveText(this.analysisTree!, (node) => node.step.sanSAN ?? ''));
        }

        if (sanSANneeded || this.hasAnalysisTree()) {
            this.ffishBoard.setFen(this.fullfen);
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

    private ensureTreeSanSan() {
        if (!this.analysisTree) return;

        const visit = (parentFen: string, nodes: AnalysisTree['root']['children']) => {
            nodes.forEach((node) => {
                if (node.step.sanSAN === undefined && node.step.move !== undefined) {
                    this.ffishBoard.setFen(parentFen);
                    node.step.sanSAN = this.ffishBoard.sanMove(node.step.move);
                }
                visit(node.step.fen, node.children);
            });
        };

        visit(this.steps[0].fen, this.analysisTree.root.children);
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

    doSendMove(move: string) {
        const san = this.ffishBoard.sanMove(move, this.notationAsObject);
        const sanSAN = this.ffishBoard.sanMove(move);

        // Instead of sending moves to the server we can get new FEN and dests from ffishjs
        this.ffishBoard.push(move);
        const fen = this.ffishBoard.fen();
        const parts = fen.split(" ");
        // turnColor have to be actualized before setDests() !!!
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.setDests();

        const newPly = this.ply + 1;

        const msg : MsgAnalysisBoard = {
            gameId: this.gameId,
            fen: this.ffishBoard.fen(this.variant.ui.showPromoted, 0),
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

        if (this.hasAnalysisTree() && this.analysisTree) {
            const currentNode = this.getTreeCurrentNode() ?? this.analysisTree.root;
            const followMainlineMove = currentNode.children[0]?.step.move;
            const extendsMainlineTail =
                this.analysisPath === this.getTreeMainlineEndPath() &&
                currentNode.mainlinePly !== undefined &&
                currentNode.mainlinePly === this.steps.length - 1;

            const childPath = addOrSelectChild(
                this.analysisTree,
                this.analysisPath,
                step,
                extendsMainlineTail && followMainlineMove === undefined,
                extendsMainlineTail ? this.steps.length : undefined,
            );

            if (extendsMainlineTail && followMainlineMove === undefined) {
                this.steps.push(step);
                this.recordedMainlinePly = this.steps.length - 1;
                this.checkStatus(msg);
            }

            this.activateTreePath(childPath);
        } else {
            this.steps.push(step);
            this.ply = this.steps.length - 1;
            updateMovelist(this);
            this.checkStatus(msg);
        }

        this.updateUCImoves();
        if (this.localAnalysis) this.engineGo();

        if (!this.puzzle && !this.ongoing) {
            const e = document.getElementById('fullfen') as HTMLInputElement;
            e.value = this.fullfen;

            if (this.isAnalysisBoard || this.result == "*") {
                this.vpgn = patch(this.vpgn, h('div#pgntext', this.getPgn()));
            }
        }

        if (this.variant.ui.materialPoint) {
            [this.vmiscInfoW, this.vmiscInfoB] = updatePoint(this.variant, msg.fen, this.vmiscInfoW, this.vmiscInfoB);
        }
    }

    onMsgAnalysisBoard(msg: MsgAnalysisBoard) {
        // console.log("got analysis_board msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (this.localAnalysis) this.engineStop();
        if (!this.ongoing) this.clearPvlines();

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

        if (msg.check) sound.check();

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
