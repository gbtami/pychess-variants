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

class BoardSettings {
    ctrl;

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
                props: { type: "radio", name: "board", value: String(i), checked: vboard === String(i) ? "checked" : ""}
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
        var vpiece = localStorage[variant + "_piece"] ?? '0';
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
                props: { type: "radio", name: "piece", value: String(i), checked: vpiece === String(i) ? "checked" : ""}
            }));
            pieces.push(h('label.piece.piece' + String(i) + '.' + variant, { attrs: {for: "piece" + String(i)} }, ""));
        }
        return pieces;
    }

    updateZoom() {
        const zoom = localStorage["zoom-" + this.ctrl.variant];
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

    private setZoom(zoom: number) {
        localStorage["zoom-" + this.ctrl.variant] = zoom;
        this.updateZoom();
    }

    public view(variant) {
        if (!variant) return h("div#board-settings");

        const zoom = localStorage["zoom-" + variant] ?? 100;

        const vShowDests = localStorage.showDests ?? "true";
        const vClick2xdrop = localStorage.clickDropEnabled ?? "true";
        const vAutoQueen = localStorage.autoqueen ?? "false";
        const vArrow = localStorage.arrow ?? "true";

        const setShowDests = () => {
            const e = document.getElementById('showdests') as HTMLInputElement;
            localStorage.showDests = e.checked;
            if (this.ctrl) {
                this.ctrl.showDests = e.checked;
                this.ctrl.chessground.set({movable: {showDests: this.ctrl.showDests}});
            }
        };

        const setClick2xdrop = () => {
            const e = document.getElementById('click2xdrop') as HTMLInputElement;
            localStorage.clickDropEnabled = e.checked;
            if (this.ctrl) {
                this.ctrl.clickDropEnabled = e.checked;
            }
        };

        const setAutoQueen = () => {
            const e = document.getElementById('autoqueen') as HTMLInputElement;
            localStorage.autoqueen = e.checked;
            if (this.ctrl) {
                this.ctrl.autoqueen = e.checked;
            }
        };

        const setArrow = () => {
            const e = document.getElementById('arrow') as HTMLInputElement;
            localStorage.arrow = e.checked;
            if (this.ctrl) {
                this.ctrl.arrow = e.checked;
            }
        };

        const settings : VNode[] = [];
        settings.push(h('div.settings-boards', this.boardStyleSettingsView(variant)));
        settings.push(h('div.settings-pieces', this.pieceStyleSettingsView(variant)));

        settings.push(h('div', { class: { hide: variant !== this.ctrl?.variant } }, [
            h('input#zoom.slider', {
                attrs: { name: 'zoom', width: '280px', type: 'range', title: _("[-] Zoom [+]"), value: Number(zoom), min: 50, max: 150, step: (variant.endsWith('shogi')) ? 1 : 1.5625 },
                on: { input: (e) => { this.setZoom(parseFloat((e.target as HTMLInputElement).value)); } }
            }),
        ]));

        settings.push(h('div', [
            h('input#showdests', {
                props: {name: "showdests", type: "checkbox", checked: vShowDests === "true" ? "checked" : ""},
                on: { click: () => setShowDests() }
            }),
            h('label', { attrs: {for: "showdests"} }, _("Show piece destinations")),
        ]));

        settings.push(h('div', { class: { hide: !isVariantClass(variant, "pocket") } }, [
            h('input#click2xdrop', {
                props: {name: "click2xdrop", type: "checkbox", checked: vClick2xdrop === "true" ? "checked" : ""},
                on: { click: () => setClick2xdrop() }
            }),
            h('label', { attrs: {for: "click2xdrop"} }, _("Two click drop moves")),
        ]));

        settings.push(h('div', { class: { hide: !isVariantClass(variant, "autoQueen") } }, [
            h('input#autoqueen', {
                props: {name: "autoqueen", type: "checkbox", checked: vAutoQueen === "true" ? "checked" : ""},
                on: { click: () => setAutoQueen() }
            }),
            h('label', { attrs: {for: "autoqueen"} }, _("Promote to Queen automatically")),
        ]));

        settings.push(h('div', [
            h('input#arrow', {
                props: {name: "arrow", type: "checkbox", checked: vArrow === "true" ? "checked" : ""},
                on: { click: () => setArrow() }
            }),
            h('label', { attrs: {for: "arrow"} }, _("Best move arrow in analysis board")),
        ]));

        return h('div#board-settings', settings);
    }

    // flip
    toggleOrientation() {
        this.ctrl.flip = !this.ctrl.flip;
        this.ctrl.chessground.toggleOrientation();

        if (isVariantClass(this.ctrl.variant, "pieceDir")) {
            this.updatePieceStyle(this.ctrl.variant);
        }

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

export const boardSettings = new(BoardSettings);
