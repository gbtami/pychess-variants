import { h, VNode } from 'snabbdom';


import * as cg from 'chessgroundx/types';
import { Api } from 'chessgroundx/api';

import { _ } from './i18n';
import { changeBoardCSS, ensurePieceCSS, pieceStyleClass } from './document';
import { Settings, NumberSettings, BooleanSettings } from './settings';
import { slider, checkbox } from './view';
import { BoardName, PyChessModel } from "./types";
import { BOARD_FAMILIES, PIECE_FAMILIES, Variant, VARIANTS } from './variants';
import { renderResized, updateBounds } from "chessgroundx/render";

export interface BoardController {
    readonly chessground: Api;

    boardName: BoardName;
    readonly variant: Variant;
    readonly mycolor: cg.Color;
    readonly oppcolor: cg.Color;
    readonly hasPockets: boolean;

    notation: cg.Notation;
    fullfen: string;

    model?: PyChessModel;
    autoPromote?: boolean;
    arrow?: boolean;
    multipv?: number;
    evalFile?: string;
    materialDifference?: boolean;
    updateMaterial?: any;
    pvboxIni?: any;
    nnueIni?: any;
    chartFunctions?: any[];
    vmaterial0?: VNode | HTMLElement;
    vmaterial1?: VNode | HTMLElement;

    flipped(): boolean;
}

interface PieceCSSOption {
    css: string;
    idx: number;
}

function pieceCSSOptions(pieceFamily: keyof typeof PIECE_FAMILIES | string, variant?: Variant): PieceCSSOption[] {
    const excluded = new Set(variant?.pieceCSSExclude ?? []);
    return PIECE_FAMILIES[pieceFamily].pieceCSS
        .map((css, idx) => ({ css, idx }))
        .filter(({ css }) => !excluded.has(css));
}

function selectedPieceCSS(pieceFamily: keyof typeof PIECE_FAMILIES | string, idx: number, variant?: Variant): string {
    switch (idx) {
    case 98:
        return 'invisible';
    case 99:
        return 'letters';
    default: {
        const css = PIECE_FAMILIES[pieceFamily].pieceCSS[idx];
        const excluded = variant?.pieceCSSExclude ?? [];
        if (css && !excluded.includes(css)) return css;
        return pieceCSSOptions(pieceFamily, variant)[0]?.css ?? PIECE_FAMILIES[pieceFamily].pieceCSS[0];
    }
    }
}

function pieceStyleSettingsName(pieceFamily: string, variant?: Variant): string {
    return (variant?.name ?? pieceFamily) + '-piece';
}

function setPieceStyleClass(target: HTMLElement, family: string, css: string): void {
    for (const className of Array.from(target.classList)) {
        if (className.startsWith('piece-style-')) target.classList.remove(className);
    }
    target.classList.add(pieceStyleClass(family, css));
}

class BoardSettings {
    ctrl: BoardController;
    ctrl2: BoardController;
    settings: { [ key: string]: Settings<number | boolean | string> };
    assetURL: string;

    constructor() {
        this.settings = {};
        this.settings["animation"] = new AnimationSettings(this);
        this.settings["confirmresign"] = new ConfirmResignSettings(this);        
        this.settings["showDests"] = new ShowDestsSettings(this);
        this.settings["autoPromote"] = new AutoPromoteSettings(this);
        this.settings["confirmCorrMove"] = new ConfirmCorrMoveSettings(this);        
        this.settings["materialDifference"] = new MaterialDifferenceSettings(this);
    }

    getSettings(settingsType: string, family: string, boardName: BoardName = '', variant?: Variant) {
        const fullName = settingsType === "PieceStyle" ? pieceStyleSettingsName(family, variant) : family + settingsType + boardName;
        if (!this.settings[fullName]) {
            switch (settingsType) {
                case "BoardStyle":
                    this.settings[fullName] = new BoardStyleSettings(this, family);
                    break;
                case "PieceStyle":
                    this.settings[fullName] = new PieceStyleSettings(this, family, variant);
                    break;
                case "Zoom":
                    this.settings[fullName] = new ZoomSettings(this, family, boardName);
                    break;
                default:
                    throw "Unknown settings type " + settingsType;
            }
        }
        return this.settings[fullName];
    }

    updateBoardAndPieceStyles() {
        Object.keys(BOARD_FAMILIES).forEach(family => this.updateBoardStyle(family));
    }

    updateBoardStyle(family: keyof typeof BOARD_FAMILIES) {
        const idx = this.getSettings("BoardStyle", family as string, '').value as number;
        const board = BOARD_FAMILIES[family].boardCSS[idx];
        changeBoardCSS(this.assetURL , family as string, board);
    }

    updateActivePieceStyle(variant: Variant) {
        if (this.ctrl?.variant.name !== variant.name && this.ctrl2?.variant.name !== variant.name) return;

        const family = variant.pieceFamily;
        const css = this.pieceCSS(family, variant);
        ensurePieceCSS(this.assetURL, family as string, css);

        const root = document.getElementById('mainboard')?.closest('.round-app, .analysis-app, .embed-app, .editor-app') ?? document;
        const targets = new Set<Element>();
        if (root instanceof HTMLElement && root.classList.contains(family)) targets.add(root);
        root.querySelectorAll('.' + family).forEach(el => targets.add(el));

        targets.forEach(target => {
            if (target instanceof HTMLElement) setPieceStyleClass(target, family as string, css);
        });
        this.updateDropSuggestion();
    }

    pieceCSS(family: keyof typeof PIECE_FAMILIES, variant?: Variant) {
        const idx = this.getSettings("PieceStyle", family as string, '', variant).value as number;
        return selectedPieceCSS(family, idx, variant);
    }

    updateScopedPieceStyle(variant: Variant, el?: Element) {
        const family = variant.pieceFamily;
        const css = this.pieceCSS(family, variant);
        ensurePieceCSS(this.assetURL, family as string, css);

        if (el instanceof HTMLElement) {
            const target = (el.closest('.' + family) as HTMLElement | null) ?? el;
            setPieceStyleClass(target, family as string, css);
        }
    }

    updateDropSuggestion() {
        this.updateDropSuggestionCtrl(this.ctrl);
        this.updateDropSuggestionCtrl(this.ctrl2);
    }

    updateDropSuggestionCtrl(ctrl: BoardController) {
        // Redraw the piece being suggested for dropping in the new piece style
        if (ctrl && ctrl.hasPockets) {
            const chessground = this.ctrl.chessground;
            const el = document.querySelector('svg image') as HTMLElement;
            // if there is any
            if (el) {
                chessground.redrawAll();
            }
        }
    }

    updateZoom(family: keyof typeof BOARD_FAMILIES, boardName: BoardName = '') {
        const variant = this.ctrl?.variant;
        if (variant && variant.boardFamily === family) {
            const suffix = (boardName) ? '-' + boardName : '';
            const zoomSettings = this.getSettings('Zoom', family as string, boardName) as ZoomSettings;
            const zoom = zoomSettings.value;
            const el = document.querySelector('.cg-wrap') as HTMLElement;
            if (el) {
                document.body.style.setProperty('--zoom' + suffix, `${zoom}`);

                // Analysis needs to zoom analysisChart and movetimeChart as well
                if ('chartFunctions' in this.ctrl && this.ctrl.chartFunctions) {
                    this.ctrl.chartFunctions.forEach((func: any) => {
                        func(this.ctrl);
                    });
                }
            }
        }
    }

    view(variantName: string, modelVariant: string) {
        if (!variantName) return h("div#board-settings");
        const variant = VARIANTS[variantName];

        const settingsList : VNode[] = [];

        const boardFamily = VARIANTS[variantName].boardFamily;
        const pieceFamily = VARIANTS[variantName].pieceFamily;

        settingsList.push(this.settings["animation"].view());

        settingsList.push(this.settings["confirmresign"].view());        

        settingsList.push(this.settings["showDests"].view());

        if (variant.promotion.autoPromoteable)
            settingsList.push(this.settings["autoPromote"].view());

        settingsList.push(this.settings["confirmCorrMove"].view());        

        settingsList.push(this.settings["materialDifference"].view());

        if (variantName === modelVariant)
            if (variant.twoBoards) {
                settingsList.push(this.getSettings("Zoom", boardFamily as string, 'a').view());
                settingsList.push(this.getSettings("Zoom", boardFamily as string, 'b').view());
            } else {
                settingsList.push(this.getSettings("Zoom", boardFamily as string, '').view());
            }

        settingsList.push(h('div#style-settings', [
            this.getSettings("BoardStyle", boardFamily as string, '').view(),
            (this.getSettings("PieceStyle", pieceFamily as string, '', variant) as PieceStyleSettings).view(),
            ])
        );
        
        settingsList.push();

        return h('div#board-settings', settingsList);
    }
}

class AnimationSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('animation', true);
        this.boardSettings = boardSettings;
    }

    update(): void {
        this.boardSettings.ctrl?.chessground.set({ animation: { enabled: this.value } });
        this.boardSettings.ctrl2?.chessground.set({ animation: { enabled: this.value } });
    }

    view(): VNode {
        return h('div', checkbox(this, 'animation', _("Piece animation")));
    }
}

class ConfirmResignSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('confirmresign', true);
        this.boardSettings = boardSettings;
    }

    update(): void {

    }

    view(): VNode {
        return h('div', checkbox(this, 'confirmresign', _("Confirm resigning")));
    }
}

class ConfirmCorrMoveSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('confirmCorrMove', true);
        this.boardSettings = boardSettings;
    }

    update(): void {

    }

    view(): VNode {
        return h('div', checkbox(this, 'confirmCorrMove', _("Confirm correspondence move")));
    }
}

class BoardStyleSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly boardFamily: string;

    constructor(boardSettings: BoardSettings, boardFamily: string) {
        super(boardFamily + '-board', 0);
        this.boardSettings = boardSettings;
        this.boardFamily = boardFamily;
    }

    update(): void {
        this.boardSettings.updateBoardStyle(this.boardFamily);
    }

    view(): VNode {
        const vboard = this.value;
        const boards : VNode[] = [];

        const boardCSS = BOARD_FAMILIES[this.boardFamily].boardCSS;
        for (let i = 0; i < boardCSS.length; i++) {
            boards.push(h('input#board' + i, {
                on: { change: evt => this.value = Number((evt.target as HTMLInputElement).value) },
                props: { type: "radio", name: "board", value: i },
                attrs: { checked: vboard === i },
            }));
            boards.push(h('label.board.board' + i + '.' + this.boardFamily, {
                attrs: { for: "board" + i },
                style: { backgroundImage: `url('/static/images/board/${boardCSS[i]}')` },
            }, ""));
        }
        return h('settings-board', boards);
    }
}

class PieceStyleSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly pieceFamily: string;
    readonly variant?: Variant;

    constructor(boardSettings: BoardSettings, pieceFamily: string, variant?: Variant) {
        super(pieceStyleSettingsName(pieceFamily, variant), 0);
        this.boardSettings = boardSettings;
        this.pieceFamily = pieceFamily;
        this.variant = variant;
    }

    update(): void {
        if (this.variant) this.boardSettings.updateActivePieceStyle(this.variant);
    }

    view(): VNode {
        const vpiece = this.value;
        const pieces : VNode[] = [];

        const pieceCSS = pieceCSSOptions(this.pieceFamily, this.variant);
        const checkedPiece = (vpiece === 98 || vpiece === 99 || pieceCSS.some(({ idx }) => idx === vpiece))
            ? vpiece
            : pieceCSS[0]?.idx;
        for (const { idx } of pieceCSS) {
            pieces.push(h('input#piece' + idx, {
                on: { change: e => this.value = Number((e.target as HTMLInputElement).value) },
                props: { type: "radio", name: "piece", value: idx },
                attrs: { checked: checkedPiece === idx },
            }));
            pieces.push(h('label.piece.piece' + idx + '.' + this.pieceFamily, { attrs: { for: "piece" + idx } }, ""));
        }

        // Add invisible piece
        const i=98;
        pieces.push(h('input#piece' + i, {
            on: { change: e => this.value = Number((e.target as HTMLInputElement).value) },
            props: { type: "radio", name: "piece", value: i },
            attrs: { checked: vpiece === i },
        }));
        pieces.push(h('label.piece.piece98', { attrs: { for: "piece" + i } }, ""));

        // Finally add letter piece
        const l=99;
        pieces.push(h('input#piece' + l, {
            on: { change: e => this.value = Number((e.target as HTMLInputElement).value) },
            props: { type: "radio", name: "piece", value: l },
            attrs: { checked: vpiece === l },
        }));
        pieces.push(h('label.piece.piece99', { attrs: { for: "piece" + l } }, ""));
        return h('settings-pieces', pieces);
    }
}

class ZoomSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly boardFamily: string;
    readonly boardName: BoardName;

    constructor(boardSettings: BoardSettings, boardFamily: string, boardName: BoardName = '') {
        const suffix = (boardName) ? '-' + boardName : '';
        super(boardFamily + '-zoom' + suffix, 80);
        this.boardSettings = boardSettings;
        this.boardFamily = boardFamily;
        this.boardName = boardName;
    }

    update(): void {
        this.boardSettings.updateZoom(this.boardFamily, this.boardName);
        if (this.boardName) {
            // In case of bughouse updateZoom() doesn't trigger chessgroundx onResize() via ResizeObserver
            // to prevent recursive call, so we have to force manual onResize() here
            setTimeout(() => {
                const state = (this.boardName === this.boardSettings.ctrl2.boardName) ?
                    this.boardSettings.ctrl2.chessground.state:
                    this.boardSettings.ctrl.chessground.state;
                updateBounds(state);
                renderResized(state);
            }, 100);
        }
    }

    view(): VNode {
        return h('div.labelled', slider(this, 'zoom' + this.boardName, 0, 100, this.boardFamily.includes("shogi") ? 1 : 1.15625, _('Zoom')));
    }
}

class ShowDestsSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('showDests', true);
        this.boardSettings = boardSettings;
    }

    update(): void {
        this.updateCtrl(this.boardSettings.ctrl);
        if (this.boardSettings.ctrl2) this.updateCtrl(this.boardSettings.ctrl2);
    }

    updateCtrl(ctrl: BoardController): void {
        ctrl?.chessground.set({
            movable: {
                showDests: this.value,
            },
        });
    }

    view(): VNode {
        return h('div', checkbox(this, 'showDests', _("Show piece destinations")));
    }
}

class AutoPromoteSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('autoPromote', false);
        this.boardSettings = boardSettings;
    }

    update(): void {
        this.updateCtrl(this.boardSettings.ctrl);
        if (this.boardSettings.ctrl2) this.updateCtrl(this.boardSettings.ctrl2);
    }

    updateCtrl(ctrl: BoardController): void {
        if ('autoPromote' in ctrl)
            ctrl.autoPromote = this.value;
    }

    view(): VNode {
        return h('div', checkbox(this, 'autoPromote', _("Promote to the top choice automatically")));
    }
}

class MaterialDifferenceSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('materialDifference', false);
        this.boardSettings = boardSettings;
    }

    update(): void {
        this.updateCtrl(this.boardSettings.ctrl);
        if (this.boardSettings.ctrl2) this.updateCtrl(this.boardSettings.ctrl2);
    }

    updateCtrl(ctrl: BoardController): void {
        if ('materialDifference' in ctrl) {
            ctrl.materialDifference = this.value;
            if ('updateMaterial' in ctrl) {
                ctrl.updateMaterial();
            }
        }
    }

    view(): VNode {
        return h('div', checkbox(this, 'captured', _("Show material difference")));
    }
}
export const boardSettings = new BoardSettings();
