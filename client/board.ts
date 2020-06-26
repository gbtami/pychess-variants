import { VNode } from 'snabbdom/vnode';

import h from 'snabbdom/h';

import { _ } from './i18n';
import { VARIANTS } from './chess';
import { changeCSS } from './config';

class BoardSettings {
    ctrl;

    private boardStyleSettingsView(variant) {
        const vboard = localStorage[variant + "_board"] ?? '0';
        const boards : VNode[] = [];

        const setBoardStyle = (e) => {
            const idx = e.target.value;
            localStorage[variant + "_board"] = idx;
            const board = VARIANTS[variant].BoardCSS[idx];
            const root = document.documentElement;
            root.style.setProperty('--' + variant + '-board', "url('images/board/" + board + "')");
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

    private pieceStyleSettingsView(variant) {
        var vpiece = localStorage[variant + "_piece"] ?? '0';
        const pieces : VNode[] = [];

        const setPieceStyle = (e) => {
            const idx = e.target.value;

            const family = VARIANTS[variant].pieces;
            Object.keys(VARIANTS).forEach((key) => {
                if (VARIANTS[key].pieces === family)
                    localStorage[key + "_pieces"] = idx;
            });

            if (variant.endsWith('shogi')) {
                let css = VARIANTS[variant].PieceCSS[idx];
                // change shogi piece colors according to board orientation
                if (this.ctrl?.color === "black")
                    css = css.replace('0', '1');
                changeCSS('/static/' + css + '.css');
            } else {
                changeCSS('/static/' + VARIANTS[variant].PieceCSS[idx] + '.css');
            }

            // We use paleGreen arrows and circles for analysis PV suggestions
            // For drop moves we also want to draw the dropped piece
            if (this.ctrl?.hasPockets) {
                const chessground = this.ctrl.chessground;
                const baseurl = VARIANTS[variant].baseURL[idx] + '/';
                const shapes0 = chessground.state.drawable.autoShapes;
                if (variant.endsWith('shogi') && shapes0[0]?.piece !== undefined)
                    shapes0[0].piece.color = (shapes0[0].piece.color === 'white') ? 'black' : 'white';
                chessground.set({
                    drawable: {
                        pieces: {baseUrl: this.ctrl.model['home'] + '/static/images/pieces/' + baseurl},
                        autoShapes: shapes0,
                    }
                });
                chessground.redrawAll();
            }
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

    view(variant) {
        if (!variant) return h("div#board-settings");

        //var zoom = localStorage["zoom-" + variant] || 100;

        const vShowDests = localStorage.showDests || "true";
        const vClick2xdrop = localStorage.clickDropEnabled || "true";
        const vAutoQueen = localStorage.autoqueen || "false";
        const vArrow = localStorage.arrow || "true";

        const setShowDests = () => {
            const e = document.getElementById('showdests') as HTMLInputElement;
            localStorage.showDests = e.checked;
            if (variant === this.ctrl?.variant) {
                this.ctrl.showDests = e.checked;
                this.ctrl.chessground.set({movable: {showDests: this.ctrl.showDests}});
            }
        };

        const setClick2xdrop = () => {
            const e = document.getElementById('click2xdrop') as HTMLInputElement;
            localStorage.clickDropEnabled = e.checked;
            if (variant === this.ctrl?.variant) {
                this.ctrl.clickDropEnabled = e.checked;
            }
        };

        const setAutoQueen = () => {
            const e = document.getElementById('autoqueen') as HTMLInputElement;
            localStorage.autoqueen = e.checked;
            if (variant === this.ctrl?.variant) {
                this.ctrl.autoqueen = e.checked;
            }
        };

        const setArrow = () => {
            const e = document.getElementById('arrow') as HTMLInputElement;
            localStorage.arrow = e.checked;
            if (variant === this.ctrl?.variant) {
                this.ctrl.arrow = e.checked;
            }
        };

        const settings : VNode[] = [];
        settings.push(h('div.settings-boards', this.boardStyleSettingsView(variant)));
        settings.push(h('div.settings-pieces', this.pieceStyleSettingsView(variant)));

        /*
        if (this.ctrl) {
            settings.push(h('div', [
                h('label.zoom', { attrs: {for: "zoom"} }, "Board size"),
                h('input#zoom', {
                    class: {"slider": true },
                    attrs: { name: 'zoom', title: _('[-] Zoom [+]'), width: '280px', type: 'range', value: Number(zoom), min: 50, max: 150, step: (this.ctrl.variant.endsWith('shogi')) ? 1 : 1.5625 },
                    on: { input: (e) => { setZoom(ctrl, parseFloat((e.target as HTMLInputElement).value)); } }
                }),
            ]));
        }
        */

        settings.push(h('div', [
            h('label', { attrs: {for: "showdests"} }, _("Show piece destinations")),
            h('input#showdests', {
                props: {name: "showdests", type: "checkbox", checked: vShowDests === "true" ? "checked" : ""},
                on: { click: () => { setShowDests(); } }
            }),
        ]));
        settings.push(h('div', [
            h('label', { attrs: {for: "click2xdrop"} }, _("Two click drop moves")),
            h('input#click2xdrop', {
                props: {name: "click2xdrop", type: "checkbox", checked: vClick2xdrop === "true" ? "checked" : ""},
                on: { click: () => { setClick2xdrop(); } }
            }),
        ]));

        settings.push(h('div', [
            h('label', { attrs: {for: "autoqueen"} }, _("Promote to Queen automatically")),
            h('input#autoqueen', {
                props: {name: "autoqueen", type: "checkbox", checked: vAutoQueen === "true" ? "checked" : ""},
                on: { click: () => { setAutoQueen(); } }
            }),
        ]));

        settings.push(h('div', [
            h('label', { attrs: {for: "arrow"} }, _("Best move arrow")),
            h('input#arrow', {
                props: {name: "arrow", type: "checkbox", checked: vArrow === "true" ? "checked" : ""},
                on: { click: () => { setArrow(); } }
            }),
        ]));

        return h('div#board-settings', settings);
    }

}

export const boardSettings = new(BoardSettings);
