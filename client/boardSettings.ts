import { init } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import h from 'snabbdom/h';

import { _ } from './i18n';
import { VARIANTS, BOARD_FAMILIES, PIECE_FAMILIES } from './chess';
import { changeBoardCSS, changePieceCSS, getPieceImageUrl } from './document';
import AnalysisController from './analysisCtrl';
import RoundController from './roundCtrl';
import { EditorController } from './editorCtrl';
import { iniPieces } from './pieces';
import { analysisChart } from './chart';
import { updateCount, updatePoint } from './info';
import { pocketView } from './pocket';
import { player } from './player';
import { NumberSettings, BooleanSettings } from './settings';
import { slider, checkbox } from './view';
import { model } from './main';
import * as cg from 'chessgroundx/types';


class BoardSettings {
    ctrl: AnalysisController | RoundController | EditorController | undefined; // BoardController | undefined
    settings: { [ key: string]: NumberSettings | BooleanSettings };

    constructor() {
        this.settings = {};
        this.settings["animation"] = new AnimationSettings(this);
        this.settings["showDests"] = new ShowDestsSettings(this);
        this.settings["autoQueen"] = new AutoQueenSettings(this);
        this.settings["arrow"] = new ArrowSettings(this);
        this.settings["blindfold"] = new BlindfoldSettings(this);
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
        changeBoardCSS(model["asset-url"] , family as string, board);
    }

    updatePieceStyle(family: keyof typeof PIECE_FAMILIES) {
        const idx = this.getSettings("PieceStyle", family as string).value as number;
        let css = PIECE_FAMILIES[family].pieceCSS[idx];
        changePieceCSS(model["asset-url"], family as string, css);
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
                const role = classNames[0] as cg.Role;
                const color = classNames[1] as cg.Color;
                const orientation = this.ctrl.flip ? this.ctrl.oppcolor : this.ctrl.mycolor;
                const side = color === orientation ? "ally" : "enemy";
                chessground.set({ drawable: { pieces: { baseUrl: getPieceImageUrl(role, color, side)! } } });
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

                const baseWidth = el.getBoundingClientRect()['width'];
                const baseHeight = el.getBoundingClientRect()['height'];

                const pxw = `${baseWidth}px`;
                const pxh = `${baseHeight}px`;

                document.body.setAttribute('style', '--cgwrapwidth:' + pxw + '; --cgwrapheight:' + pxh + '; --zoom:' + zoom);

                if (this.ctrl instanceof AnalysisController && !this.ctrl.model["embed"]) {
                    analysisChart(this.ctrl);
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

        if (variant.autoQueenable)
            settingsList.push(this.settings["autoQueen"].view());

        settingsList.push(this.settings["arrow"].view());

        settingsList.push(this.settings["blindfold"].view());

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

    // TODO This should be in the theoretical "ChessgroundController" class,
    // which is the common class between EditorController, RoundController, and AnalysisController
    toggleOrientation() {
        if (this.ctrl) {
            this.ctrl.flip = !this.ctrl.flip;
            this.ctrl.chessground.toggleOrientation();
            this.updateDropSuggestion();

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

                if (this.ctrl.variant.counting)
                    [this.ctrl.vmiscInfoW, this.ctrl.vmiscInfoB] = updateCount(this.ctrl.fullfen, this.ctrl.vmiscInfoB, this.ctrl.vmiscInfoW);

                if (this.ctrl.variant.materialPoint)
                    [this.ctrl.vmiscInfoW, this.ctrl.vmiscInfoB] = updatePoint(this.ctrl.fullfen, this.ctrl.vmiscInfoB, this.ctrl.vmiscInfoW);
            }

            if (this.ctrl instanceof EditorController) {
                iniPieces(this.ctrl, this.ctrl.vpieces0, this.ctrl.vpieces1);
            }
        }
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

class AutoQueenSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('autoqueen', false);
        this.boardSettings = boardSettings;
    }

    update(): void {
        if (this.boardSettings.ctrl instanceof RoundController)
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
        if (this.boardSettings.ctrl instanceof AnalysisController)
            this.boardSettings.ctrl.arrow = this.value;
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
        if (this.boardSettings.ctrl instanceof RoundController)
            this.boardSettings.ctrl.blindfold = this.value;

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

export const boardSettings = new BoardSettings();
