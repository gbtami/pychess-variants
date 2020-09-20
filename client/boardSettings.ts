import { init } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

import { dimensions, Geometry } from 'chessgroundx/types';

import { _ } from './i18n';
import { VARIANTS, BOARD_FAMILIES, PIECE_FAMILIES, isVariantClass } from './chess';
import { changeBoardCSS, changePieceCSS } from './document';
import AnalysisController from './analysisCtrl';
import RoundController from './roundCtrl';
import { analysisChart } from './chart';
import { updateCount, updatePoint } from './info';
import { pocketView } from './pocket';
import { player } from './player';
import { NumberSettings, BooleanSettings } from './settings';
import { slider, checkbox } from './view';

class BoardSettings {
    ctrl; // BoardController | undefined
    settings: { [ key: string]: NumberSettings | BooleanSettings };

    constructor() {
        this.settings = {};
        this.settings["showDests"] = new ShowDestsSettings(this);
        this.settings["autoQueen"] = new AutoQueenSettings(this);
        this.settings["arrow"] = new ArrowSettings(this);
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

    updateBoardStyle(family: string) {
        const idx = this.getSettings("BoardStyle", family).value as number;
        const board = BOARD_FAMILIES[family].boardCSS[idx];
        changeBoardCSS(family, board);
    }

    updatePieceStyle(family: string) {
        const idx = this.getSettings("PieceStyle", family).value as number;
        let css = PIECE_FAMILIES[family].pieceCSS[idx];
        const variant = this.ctrl?.variant;
        if (variant && VARIANTS[variant].piece === family) {
            if (isVariantClass(variant, "pieceDir")) {
                // change piece orientation according to board orientation
                if (this.ctrl.flip !== (this.ctrl.mycolor === "black")) // exclusive or
                    css = css.replace('0', '1');
            }

            // Redraw the piece being suggested for dropping in the new piece style
            if (this.ctrl.hasPockets) {
                const chessground = this.ctrl.chessground;
                const baseurl = VARIANTS[variant].pieceBaseURL[idx] + '/';
                chessground.set({
                    drawable: {
                        pieces: { baseUrl: '/static/images/pieces/' + baseurl },
                    }
                });
                chessground.redrawAll();
            }
        }
        changePieceCSS(family, css);
    }

    updateZoom(family: string) {
        const variant = this.ctrl?.variant;
        if (variant && VARIANTS[variant].board === family) {
            const zoomSettings = this.getSettings("Zoom", family) as ZoomSettings;
            const zoom = zoomSettings.value;
            const el = document.querySelector('.cg-wrap:not(.pocket)') as HTMLElement;
            if (el) {
                const geom = VARIANTS[variant].geometry;
                const magnify = (geom === Geometry.dim3x4) ? 2 : (geom === Geometry.dim5x5) ? 1.5 : 1;
                const baseWidth = dimensions[geom].width * (family.includes("shogi") ? 52 : 64) * magnify;
                const baseHeight = dimensions[geom].height * (family.includes("shogi") ? 60 : 64) * magnify;
                const pxw = `${zoom / 100 * baseWidth}px`;
                const pxh = `${zoom / 100 * baseHeight}px`;
                el.style.width = pxw;
                el.style.height = pxh;
                // 2 x (pocket height + pocket-wrapper additional 10px gap)
                const pxp = (this.ctrl.hasPockets) ? `${2 * (((zoom / 100) * baseHeight) / dimensions[VARIANTS[variant].geometry].height) + 10}px;` : '0px;';
                // point counting values
                const pxc = (isVariantClass(variant, "showMaterialPoint")) ? '48px;' : '0px;';
                document.body.setAttribute('style', '--cgwrapwidth:' + pxw + '; --cgwrapheight:' + pxh + '; --pocketheight:' + pxp + '; --countingHeight:' + pxc);
                document.body.dispatchEvent(new Event('chessground.resize'));

                if (this.ctrl instanceof AnalysisController) {
                    analysisChart(this.ctrl);
                }
            }
        }
    }

    view(variant: string) {
        if (!variant) return h("div#board-settings");

        const settingsList : VNode[] = [];

        const boardFamily = VARIANTS[variant].board;
        const pieceFamily = VARIANTS[variant].piece;

        settingsList.push(this.getSettings("BoardStyle", boardFamily).view());

        settingsList.push(this.getSettings("PieceStyle", pieceFamily).view());

        if (variant === this.ctrl?.variant)
            settingsList.push(this.getSettings("Zoom", boardFamily).view());

        settingsList.push(this.settings["showDests"].view());

        if (isVariantClass(variant, "autoQueen"))
            settingsList.push(this.settings["autoQueen"].view());

        settingsList.push(this.settings["arrow"].view());
            
        return h('div#board-settings', settingsList);
    }

    // TODO This should be in the "BoardController" class,
    // which is the common class between RoundController and AnalysisController
    // (and maybe EditorController)
    toggleOrientation() {
        this.ctrl.flip = !this.ctrl.flip;
        this.ctrl.chessground.toggleOrientation();

        if (isVariantClass(this.ctrl.variant, "pieceDir"))
            this.updatePieceStyle(this.ctrl.variant);

        // console.log("FLIP");
        if (this.ctrl.hasPockets) {
            const tmp_pocket = this.ctrl.pockets[0];
            this.ctrl.pockets[0] = this.ctrl.pockets[1];
            this.ctrl.pockets[1] = tmp_pocket;
            this.ctrl.vpocket0 = patch(this.ctrl.vpocket0, pocketView(this.ctrl, this.ctrl.flip ? this.ctrl.mycolor : this.ctrl.oppcolor, "top"));
            this.ctrl.vpocket1 = patch(this.ctrl.vpocket1, pocketView(this.ctrl, this.ctrl.flip ? this.ctrl.oppcolor : this.ctrl.mycolor, "bottom"));
        }

        // TODO: moretime button
        if (this.ctrl instanceof RoundController) {
            const new_running_clck = (this.ctrl.clocks[0].running) ? this.ctrl.clocks[1] : this.ctrl.clocks[0];
            this.ctrl.clocks[0].pause(false);
            this.ctrl.clocks[1].pause(false);

            const tmp_clock = this.ctrl.clocks[0];
            const tmp_clock_time = tmp_clock.duration;
            this.ctrl.clocks[0].setTime(this.ctrl.clocks[1].duration);
            this.ctrl.clocks[1].setTime(tmp_clock_time);
            if (this.ctrl.status < 0) new_running_clck.start();

            this.ctrl.vplayer0 = patch(this.ctrl.vplayer0, player('player0', this.ctrl.titles[this.ctrl.flip ? 1 : 0], this.ctrl.players[this.ctrl.flip ? 1 : 0], this.ctrl.ratings[this.ctrl.flip ? 1 : 0], this.ctrl.model["level"]));
            this.ctrl.vplayer1 = patch(this.ctrl.vplayer1, player('player1', this.ctrl.titles[this.ctrl.flip ? 0 : 1], this.ctrl.players[this.ctrl.flip ? 0 : 1], this.ctrl.ratings[this.ctrl.flip ? 0 : 1], this.ctrl.model["level"]));

            if (isVariantClass(this.ctrl.variant, "showCount"))
                [this.ctrl.vmiscInfoW, this.ctrl.vmiscInfoB] = updateCount(this.ctrl.fullfen, this.ctrl.vmiscInfoB, this.ctrl.vmiscInfoW);

            if (isVariantClass(this.ctrl.variant, "showMaterialPoint"))
                [this.ctrl.vmiscInfoW, this.ctrl.vmiscInfoB] = updatePoint(this.ctrl.fullfen, this.ctrl.vmiscInfoB, this.ctrl.vmiscInfoW);
        }
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
            boards.push(h('label.board.board' + i + '.' + this.boardFamily, { attrs: { for: "board" + i } }, ""));
        }
        return h('div.settings-board', boards);
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
        return h('div.settings-pieces', pieces);
    }
}

class ZoomSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly boardFamily: string;

    constructor(boardSettings: BoardSettings, boardFamily: string) {
        super(boardFamily + '-zoom', 100);
        this.boardSettings = boardSettings;
        this.boardFamily = boardFamily;
    }

    update(): void {
        this.boardSettings.updateZoom(this.boardFamily);
    }

    view(): VNode {
        return slider(this, 'zoom', 50, 150, this.boardFamily.includes("shogi") ? 1 : 1.15625);
    }
}

class ShowDestsSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('showdests', true);
        this.boardSettings = boardSettings;
    }

    update(): void {
        this.boardSettings.ctrl?.chessground.set({ movable: { showDests: this.value } });
    }

    view(): VNode {
        return h('div', checkbox(this, 'showdests', _("Show piece destinations")));
    }
}

class AutoQueenSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('autoqueen', false);
        this.boardSettings = boardSettings;
    }

    update(): void {
        if (this.boardSettings.ctrl)
            this.boardSettings.ctrl.autoqueen = this.value;
    }

    view(): VNode {
        return h('div', checkbox(this, 'autoqueen', _("Promote to Queen automatically")));
    }
}

class ArrowSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('arrow', true);
        this.boardSettings = boardSettings;
    }

    update(): void {
        if (this.boardSettings.ctrl)
            this.boardSettings.ctrl.arrow = this.value;
    }

    view(): VNode {
        return h('div', checkbox(this, 'arrow', _("Best move arrow in analysis board")));
    }
}

export const boardSettings = new BoardSettings();
