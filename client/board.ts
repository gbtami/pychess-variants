import { init } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

import { dimensions } from 'chessgroundx/types';

import { _ } from './i18n';
import { VARIANTS, isVariantClass } from './chess';
import { changeCSS } from './document';
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
        this.settings.showDests = new ShowDestsSettings(this);
        this.settings.autoQueen = new AutoQueenSettings(this);
        this.settings.arrow = new ArrowSettings(this);
    }

    getSettings(settingsType: string, variant: string) {
        const fullName = variant + settingsType;
        if (!this.settings[fullName]) {
            switch (settingsType) {
                case "BoardStyle":
                    this.settings[fullName] = new BoardStyleSettings(this, variant);
                    break;
                case "PieceStyle":
                    this.settings[fullName] = new PieceStyleSettings(this, variant);
                    break;
                case "Zoom":
                    this.settings[fullName] = new ZoomSettings(this, variant);
                    break;
                default:
                    throw "Unknown settings type " + settingsType;
            }
        }
        return this.settings[fullName];
    }

    updateBoardAndPieceStyles() {
        Object.keys(VARIANTS).forEach(variant => {
            this.updateBoardStyle(variant);
            this.updatePieceStyle(variant);
        });
    }

    updateBoardStyle(variant: string) {
        const idx = this.getSettings("BoardStyle", variant).value;
        const board = VARIANTS[variant].BoardCSS[idx];
        const root = document.documentElement;
        root.style.setProperty('--' + variant + '-board', "url('images/board/" + board + "')");
    }

    updatePieceStyle(variant: string) {
        const idx = this.getSettings("PieceStyle", variant).value;

        let css = VARIANTS[variant].PieceCSS[idx];
        if (variant === this.ctrl?.variant) {
            if (isVariantClass(variant, "pieceDir")) {
                // change piece orientation according to board orientation
                if (this.ctrl.flip !== (this.ctrl.mycolor === "black")) // exclusive or
                    css = css.replace('0', '1');
            }

            // Redraw the piece being suggested for dropping in the new piece style
            if (this.ctrl.hasPockets) {
                const chessground = this.ctrl.chessground;
                const baseurl = VARIANTS[variant].baseURL[idx] + '/';
                chessground.set({
                    drawable: {
                        pieces: { baseUrl: '/static/images/pieces/' + baseurl },
                    }
                });
                chessground.redrawAll();
            }
        }
        changeCSS('/static/' + css + '.css');
    }

    updateZoom() {
        if (this.ctrl) {
            const zoom = this.getSettings("Zoom", this.ctrl.variant).value as number;
            const el = document.querySelector('.cg-wrap') as HTMLElement;
            if (el) {
                const baseWidth = dimensions[VARIANTS[this.ctrl.variant].geom].width * (this.ctrl.variant.endsWith('shogi') ? 52 : 64);
                const baseHeight = dimensions[VARIANTS[this.ctrl.variant].geom].height * (this.ctrl.variant.endsWith('shogi') ? 60 : 64);
                const pxw = `${zoom / 100 * baseWidth}px`;
                const pxh = `${zoom / 100 * baseHeight}px`;
                el.style.width = pxw;
                el.style.height = pxh;
                // 2 x (pocket height + pocket-wrapper additional 10px gap)
                const pxp = (this.ctrl.hasPockets) ? '148px;' : '0px;';
                // point counting values
                const pxc = (isVariantClass(this.ctrl.variant, "showMaterialPoint")) ? '48px;' : '0px;';
                document.body.setAttribute('style', '--cgwrapwidth:' + pxw + '; --cgwrapheight:' + pxh + '; --pocketheight:' + pxp + '; --PVheight: 0px' + '; --countingHeight:' + pxc);
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

        settingsList.push(this.getSettings("BoardStyle", variant).view());

        settingsList.push(this.getSettings("PieceStyle", variant).view());

        if (variant === this.ctrl?.variant)
            settingsList.push(this.getSettings("Zoom", variant).view());

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

        console.log("FLIP");
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
    readonly variant: string;

    constructor(boardSettings: BoardSettings, variant: string) {
        super(variant + '_board', 0);
        this.boardSettings = boardSettings;
        this.variant = variant;
    }

    update(): void {
        this.boardSettings.updateBoardStyle(this.variant);
    }

    view(): VNode {
        const vboard = this.value;
        const boards : VNode[] = [];

        for (let i = 0; i < VARIANTS[this.variant].BoardCSS.length; i++) {
            boards.push(h('input#board' + i, {
                on: { change: evt => this.value = Number((evt.target as HTMLInputElement).value) },
                props: { type: "radio", name: "board", value: i },
                attrs: { checked: vboard === i },
            }));
            boards.push(h('label.board.board' + i + '.' + this.variant, { attrs: { for: "board" + i } }, ""));
        }
        return h('div.settings-board', boards);
    }
}

class PieceStyleSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly variant: string;

    constructor(boardSettings: BoardSettings, variant: string) {
        super(variant + '_piece', 0);
        this.boardSettings = boardSettings;
        this.variant = variant;
    }

    update(): void {
        this.boardSettings.updatePieceStyle(this.variant);
    }

    view(): VNode {
        const vpiece = this.value;
        const pieces : VNode[] = [];

        const family = VARIANTS[this.variant].pieces;

        for (let i = 0; i < VARIANTS[this.variant].PieceCSS.length; i++) {
            pieces.push(h('input#piece' + i, {
                on: { change: e => this.setPieceStyle(family, Number((e.target as HTMLInputElement).value)) },
                props: { type: "radio", name: "piece", value: i },
                attrs: { checked: vpiece === i },
            }));
            pieces.push(h('label.piece.piece' + i + '.' + this.variant, { attrs: { for: "piece" + i } }, ""));
        }
        return h('div.settings-pieces', pieces);
    }

    private setPieceStyle(family: string, idx: number) {
        Object.keys(VARIANTS).filter(key => VARIANTS[key].pieces === family).forEach(key =>
            this.boardSettings.getSettings("PieceStyle", key).value = idx
        );
    }
}

class ZoomSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly variant: string;

    constructor(boardSettings: BoardSettings, variant: string) {
        super('zoom-' + variant, 100);
        this.boardSettings = boardSettings;
        this.variant = variant;
    }

    update(): void {
        if (this.variant === this.boardSettings.ctrl?.variant)
            this.boardSettings.updateZoom();
    }

    view(): VNode {
        return slider(this, 'zoom', 50, 150, this.variant.endsWith("shogi") ? 1 : 1.15625);
    }
}

class ShowDestsSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('showDests', true);
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
