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

    updateBoardAndPieceStyles() {
        Object.keys(VARIANTS).forEach(variant => {
            this.updateBoardStyle(variant);
            this.updatePieceStyle(variant);
        });
    }

    updateBoardStyle(variant) {
        const idx = parseInt(localStorage[variant + "_board"] ?? '0');
        const board = VARIANTS[variant].BoardCSS[idx];
        const root = document.documentElement;
        root.style.setProperty('--' + variant + '-board', "url('images/board/" + board + "')");
    }

    private boardStyleSettingsView(variant) {
        const vboard = localStorage[variant + "_board"] ?? '0';
        const boards : VNode[] = [];

        const setBoardStyle = (e) => {
            const idx = e.target.value;
            localStorage[variant + "_board"] = idx;
            this.updateBoardStyle(variant);
        }

        for (let i = 0; i < VARIANTS[variant].BoardCSS.length; i++) {
            boards.push(h('input#board' + String(i), {
                on: { change: setBoardStyle },
                props: { type: "radio", name: "board", value: String(i)},
                attrs: { checked: vboard === String(i) },
            }));
            boards.push(h('label.board.board' + String(i) + '.' + variant, { attrs: {for: "board" + String(i)} }, ""));
        }
        return boards;
    }

    updatePieceStyle(variant) {
        const idx = parseInt(localStorage[variant + "_pieces"] ?? '0');
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
                        pieces: {baseUrl: this.ctrl.model['home'] + '/static/images/pieces/' + baseurl},
                    }
                });
                chessground.redrawAll();
            }
        }
        changeCSS('/static/' + css + '.css');
    }

    private pieceStyleSettingsView(variant) {
        var vpiece = localStorage[variant + "_pieces"] ?? '0';
        const pieces : VNode[] = [];

        const setPieceStyle = e => {
            const idx = e.target.value;

            const family = VARIANTS[variant].pieces;
            Object.keys(VARIANTS).forEach((key) => {
                if (VARIANTS[key].pieces === family)
                    localStorage[key + "_pieces"] = idx;
            });

            this.updatePieceStyle(variant);
        }

        for (let i = 0; i < VARIANTS[variant].PieceCSS.length; i++) {
            pieces.push(h('input#piece' + String(i), {
                on: { change: setPieceStyle },
                props: { type: "radio", name: "piece", value: String(i)},
                attrs: { checked: vpiece === String(i) },
            }));
            pieces.push(h('label.piece.piece' + String(i) + '.' + variant, { attrs: {for: "piece" + String(i)} }, ""));
        }
        return pieces;
    }

    updateZoom() {
        const zoom = localStorage["zoom-" + this.ctrl.variant] ?? 100;
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

    view(variant) {
        if (!variant) return h("div#board-settings");

        this.settings["zoom"] = new ZoomSettings(this, variant);

        const vClick2xdrop = localStorage.clickDropEnabled ?? "false";

        const setClick2xdrop = () => {
            const e = document.getElementById('click2xdrop') as HTMLInputElement;
            localStorage.clickDropEnabled = e.checked;
            if (this.ctrl) {
                this.ctrl.clickDropEnabled = e.checked;
            }
        };

        const settings : VNode[] = [];
        settings.push(h('div.settings-boards', this.boardStyleSettingsView(variant)));
        settings.push(h('div.settings-pieces', this.pieceStyleSettingsView(variant)));

        if (variant === this.ctrl?.variant)
            settings.push(this.settings.zoom.view());

        settings.push(this.settings.showDests.view());

        // TODO This settings should be removed and set to true at all time
        if (isVariantClass(variant, "pocket")) {
            settings.push(h('div', [
                h('input#click2xdrop', {
                    props: {name: "click2xdrop", type: "checkbox", checked: vClick2xdrop === "true" ? "checked" : ""},
                    on: { click: () => setClick2xdrop() }
                }),
                h('label', { attrs: {for: "click2xdrop"} }, _("Two click drop moves")),
            ]));
        }
        if (isVariantClass(variant, "autoQueen"))
            settings.push(this.settings.autoQueen.view());

        settings.push(this.settings.arrow.view());
            
        return h('div#board-settings', settings);
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

class ZoomSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    private readonly variant: string;

    constructor(boardSettings: BoardSettings, variant: string) {
        super('zoom-' + variant, 100);
        this.boardSettings = boardSettings;
        this.variant = variant;
    }

    update(): void {
        if (this.variant === this.boardSettings.ctrl?.variant) {
            this.boardSettings.updateZoom();
            /*
            const zoom = this.value;
            const el = document.querySelector('.cg-wrap') as HTMLElement;
            if (el) {
                const baseWidth = dimensions[VARIANTS[this.variant].geom].width * (this.variant.endsWith('shogi') ? 52 : 64);
                const baseHeight = dimensions[VARIANTS[this.variant].geom].height * (this.variant.endsWith('shogi') ? 60 : 64);
                const pxw = `${zoom / 100 * baseWidth}px`;
                const pxh = `${zoom / 100 * baseHeight}px`;
                el.style.width = pxw;
                el.style.height = pxh;
                // 2 x (pocket height + pocket-wrapper additional 10px gap)
                const pxp = (this.boardSettings.ctrl?.hasPockets) ? '148px;' : '0px;';
                // material point values
                const pxc = (isVariantClass(this.variant, "showMaterialPoint")) ? '48px;' : '0px;';
                document.body.setAttribute('style', '--cgwrapwidth:' + pxw + '; --cgwrapheight:' + pxh + '; --pocketheight:' + pxp + '; --PVheight: 0px' + '; --countingHeight:' + pxc);
                document.body.dispatchEvent(new Event('chessground.resize'));

                if (this.boardSettings.ctrl instanceof AnalysisController) {
                    analysisChart(this.boardSettings.ctrl);
                }
            }
            */
        }
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
