import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import { Api } from 'chessgroundx/api';

import { _ } from './i18n';
import { Variant, VARIANTS, BOARD_FAMILIES, PIECE_FAMILIES } from './chess';
import { changeBoardCSS, changePieceCSS, getPieceImageUrl } from './document';
import { ISettings, NumberSettings, BooleanSettings } from './settings';
import { slider, checkbox } from './view';
import { PyChessModel } from "./types";

export interface IBoardController {
    readonly chessground: Api;

    readonly variant: Variant;
    readonly mycolor: cg.Color;
    readonly oppcolor: cg.Color;
    readonly hasPockets: boolean;

    notation: cg.Notation;
    fullfen: string;

    model?: PyChessModel;
    autoPromote?: boolean;
    arrow?: boolean;
    blindfold?: boolean;
    materialDifference?: boolean;
    updateMaterial?: any;
    chartFunctions?: any[];
    vmaterial0?: VNode | HTMLElement;
    vmaterial1?: VNode | HTMLElement;

    flipped(): boolean;
}

class BoardSettings {
    ctrl: IBoardController;
    settings: { [ key: string]: ISettings<number | boolean> };
    assetURL: string;

    constructor() {
        this.settings = {};
        this.settings["animation"] = new AnimationSettings(this);
        this.settings["showDests"] = new ShowDestsSettings(this);
        this.settings["autoPromote"] = new AutoPromoteSettings(this);
        this.settings["arrow"] = new ArrowSettings(this);
        this.settings["blindfold"] = new BlindfoldSettings(this);
        this.settings["materialDifference"] = new MaterialDifferenceSettings(this);
    }

    getSettings(settingsType: string, family: string) {
        const fullName = family + settingsType;
        if (!this.settings[fullName]) {
            switch (settingsType) {
                case "BoardStyle":
                    this.settings[fullName] = new BoardStyleSettings(this, family);
                    break;
                case "PieceStyle":
                    this.settings[fullName] = new PieceStyleSettings(this, family);
                    break;
                case "Zoom":
                    this.settings[fullName] = new ZoomSettings(this, family);
                    break;
                default:
                    throw "Unknown settings type " + settingsType;
            }
        }
        return this.settings[fullName];
    }

    updateBoardAndPieceStyles() {
        Object.keys(BOARD_FAMILIES).forEach(family => this.updateBoardStyle(family));
        Object.keys(PIECE_FAMILIES).forEach(family => this.updatePieceStyle(family));
    }

    updateBoardStyle(family: keyof typeof BOARD_FAMILIES) {
        const idx = this.getSettings("BoardStyle", family as string).value as number;
        const board = BOARD_FAMILIES[family].boardCSS[idx];
        changeBoardCSS(this.assetURL , family as string, board);
    }

    updatePieceStyle(family: keyof typeof PIECE_FAMILIES) {
        const idx = this.getSettings("PieceStyle", family as string).value as number;
        let css = PIECE_FAMILIES[family].pieceCSS[idx];
        changePieceCSS(this.assetURL, family as string, css);
        this.updateDropSuggestion();
    }

    updateDropSuggestion() {
        // Redraw the piece being suggested for dropping in the new piece style
        if (this.ctrl && this.ctrl.hasPockets) {
            const chessground = this.ctrl.chessground;
            const el = document.querySelector('svg image') as HTMLElement;
            // if there is any
            if (el) {
                const classNames = el.getAttribute('className')!.split(' ');
                const variant = this.ctrl.variant.name
                const role = classNames[0] as cg.Role;
                const color = classNames[1] as cg.Color;
                const orientation = this.ctrl.flipped() ? this.ctrl.oppcolor : this.ctrl.mycolor;
                const side = color === orientation ? "ally" : "enemy";
                chessground.set({ drawable: { pieces: { baseUrl: getPieceImageUrl(variant, role, color, side)! } } });
                chessground.redrawAll();
            }
        }
    }

    updateZoom(family: keyof typeof BOARD_FAMILIES) {
        const variant = this.ctrl?.variant;
        if (variant && variant.board === family) {
            const zoomSettings = this.getSettings("Zoom", family as string) as ZoomSettings;
            const zoom = zoomSettings.value;
            const el = document.querySelector('.cg-wrap:not(.pocket)') as HTMLElement;
            if (el) {
                document.body.setAttribute('style', '--zoom:' + zoom);
                document.body.dispatchEvent(new Event('chessground.resize'));

                // Analysis needs to zoom analysisChart and movetimeChart as well
                if ('chartFunctions' in this.ctrl && this.ctrl.chartFunctions) {
                    this.ctrl.chartFunctions.forEach((func: any) => {
                        func(this.ctrl);
                    });
                }
            }
        }
    }

    updateBlindfold () {
        this.settings["blindfold"].update();
    }

    view(variantName: string) {
        if (!variantName) return h("div#board-settings");
        const variant = VARIANTS[variantName];

        const settingsList : VNode[] = [];

        const boardFamily = VARIANTS[variantName].board;
        const pieceFamily = VARIANTS[variantName].piece;

        settingsList.push(this.settings["animation"].view());

        settingsList.push(this.settings["showDests"].view());

        if (variant.autoPromoteable)
            settingsList.push(this.settings["autoPromote"].view());

        settingsList.push(this.settings["arrow"].view());

        settingsList.push(this.settings["blindfold"].view());

        settingsList.push(this.settings["materialDifference"].view());

        if (variantName === this.ctrl?.variant.name)
            settingsList.push(this.getSettings("Zoom", boardFamily as string).view());

        settingsList.push(h('div#style-settings', [
            this.getSettings("BoardStyle", boardFamily as string).view(),
            this.getSettings("PieceStyle", pieceFamily as string).view(),
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
    }

    view(): VNode {
        return h('div', checkbox(this, 'animation', _("Piece animation")));
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

    constructor(boardSettings: BoardSettings, pieceFamily: string) {
        super(pieceFamily + '-piece', 0);
        this.boardSettings = boardSettings;
        this.pieceFamily = pieceFamily;
    }

    update(): void {
        this.boardSettings.updatePieceStyle(this.pieceFamily);
    }

    view(): VNode {
        const vpiece = this.value;
        const pieces : VNode[] = [];

        const pieceCSS = PIECE_FAMILIES[this.pieceFamily].pieceCSS;
        for (let i = 0; i < pieceCSS.length; i++) {
            pieces.push(h('input#piece' + i, {
                on: { change: e => this.value = Number((e.target as HTMLInputElement).value) },
                props: { type: "radio", name: "piece", value: i },
                attrs: { checked: vpiece === i },
            }));
            pieces.push(h('label.piece.piece' + i + '.' + this.pieceFamily, { attrs: { for: "piece" + i } }, ""));
        }
        return h('settings-pieces', pieces);
    }
}

class ZoomSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly boardFamily: string;

    constructor(boardSettings: BoardSettings, boardFamily: string) {
        super(boardFamily + '-zoom', 80);
        this.boardSettings = boardSettings;
        this.boardFamily = boardFamily;
    }

    update(): void {
        this.boardSettings.updateZoom(this.boardFamily);
    }

    view(): VNode {
        return slider(this, 'zoom', 0, 100, this.boardFamily.includes("shogi") ? 1 : 1.15625);
    }
}

class ShowDestsSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('showDests', true);
        this.boardSettings = boardSettings;
    }

    update(): void {
        this.boardSettings.ctrl?.chessground.set({ movable: { showDests: this.value }, dropmode: { showDropDests: this.value }, predroppable: { showDropDests: this.value } } );
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
        const ctrl = this.boardSettings.ctrl;
        if ('autoPromote' in ctrl)
            ctrl.autoPromote = this.value;
    }

    view(): VNode {
        return h('div', checkbox(this, 'autoPromote', _("Promote to the top choice automatically")));
    }
}

class ArrowSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('arrow', true);
        this.boardSettings = boardSettings;
    }

    update(): void {
        const ctrl = this.boardSettings.ctrl;
        if ('arrow' in ctrl)
            ctrl.arrow = this.value;
    }

    view(): VNode {
        return h('div', checkbox(this, 'arrow', _("Best move arrow in analysis board")));
    }
}

class BlindfoldSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('blindfold', false);
        this.boardSettings = boardSettings;
    }

    update(): void {
        const ctrl = this.boardSettings.ctrl;
        if ('blindfold' in ctrl)
            ctrl.blindfold = this.value;

        const el = document.getElementById('mainboard') as HTMLInputElement;
        if (el) {
            if (this.value) {
                el.classList.add('blindfold');
            } else {
                el.classList.remove('blindfold');
            }
        }

    }

    view(): VNode {
        return h('div', checkbox(this, 'blindfold', _("Invisible pieces")));
    }
}

class MaterialDifferenceSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('materialDifference', false);
        this.boardSettings = boardSettings;
    }

    update(): void {
        const ctrl = this.boardSettings.ctrl;
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
