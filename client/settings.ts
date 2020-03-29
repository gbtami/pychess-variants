import { init } from "snabbdom";
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

import { dimensions } from 'chessgroundx/types';

import { variants, VARIANTS } from './chess';
import { pocketView } from './pocket';
import { player } from './player';
import { analysisChart } from './chart';
import AnalysisController from './analysisCtrl';
import RoundController from './roundCtrl';


export function changeCSS(cssFile) {
    // css file index in template.html
    console.log("changeCSS()", cssFile);
    var cssLinkIndex = 1;
    if (cssFile.includes("seir")) {
        cssLinkIndex = 2;
    } else if (cssFile.includes("makruk")) {
        cssLinkIndex = 3;
    } else if (cssFile.includes("sittuyin")) {
        cssLinkIndex = 4;
    } else if (cssFile.includes("shogi")) {
        cssLinkIndex = 5;
    } else if (cssFile.includes("kyoto")) {
        cssLinkIndex = 6;
    } else if (cssFile.includes("xiangqi")) {
        cssLinkIndex = 7;
    } else if (cssFile.includes("capa")) {
        cssLinkIndex = 8;
    } else if (cssFile.includes("shako")) {
        cssLinkIndex = 9;
    } else if (cssFile.includes("shogun")) {
        cssLinkIndex = 10;
    }
    document.getElementsByTagName("link").item(cssLinkIndex)!.setAttribute("href", cssFile);
}

export function setBoard (CSSindexesB, variant, color) {
    console.log("setBoard()", CSSindexesB, variant, color)
    var idx = CSSindexesB[variants.indexOf(variant)];
    idx = Math.min(idx, VARIANTS[variant].BoardCSS.length - 1);

    const board = VARIANTS[variant].BoardCSS[idx];
    const root = document.documentElement;
    root.style.setProperty('--' + variant + '-board', "url('images/board/" + board + "')");
}

export function setBoardAndPieceStyles() {
    const CSSindexesB = variants.map((variant) => localStorage[variant + "_board"] === undefined ? 0 : Number(localStorage[variant + "_board"]));
    const CSSindexesP = variants.map((variant) => localStorage[variant + "_pieces"] === undefined ? 0 : Number(localStorage[variant + "_pieces"]));
    Object.keys(VARIANTS).forEach((key) => {
        const variant = VARIANTS[key];
        if (variant.BoardCSS.length > 1) {
            var idx = CSSindexesB[variants.indexOf(key)];
            idx = Math.min(idx, variant.BoardCSS.length - 1);

            const board = variant.BoardCSS[idx];
            const root = document.documentElement;
            root.style.setProperty('--' + key + '-board', "url('images/board/" + board + "')");
        };
        if (variant.PieceCSS.length > 1) {
            var idx = CSSindexesP[variants.indexOf(key)];
            idx = Math.min(idx, variant.PieceCSS.length - 1);
            changeCSS('/static/' + variant.PieceCSS[idx] + '.css');
        };
    });
}

export function setPieces (ctrl, color, flip: boolean = false) {
    console.log("--- setPieces()");
    const CSSindexesP = ctrl.CSSindexesP, variant = ctrl.variant, chessground = ctrl.chessground;
    var idx = CSSindexesP[variants.indexOf(variant)];
    idx = Math.min(idx, VARIANTS[variant].PieceCSS.length - 1);
    if (variant.endsWith('shogi')) {
        var css = VARIANTS[variant].PieceCSS[idx];
        // change shogi piece colors according to board orientation
        if (color === "black") css = css.replace('0', '1');
        changeCSS('/static/' + css + '.css');
    } else {
        changeCSS('/static/' + VARIANTS[variant].PieceCSS[idx] + '.css');
    }
    // We use paleGreen arrows and circles for analysis PV suggestions
    // For drop moves we also want to draw the dropped piece
    if (ctrl.hasPockets) {
        const baseurl = VARIANTS[variant].baseURL[idx] + '/';
        console.log("--- baseurl", baseurl);
        // console.log("A autoShapes:", chessground.state.drawable.autoShapes);
        var shapes0 = chessground.state.drawable.autoShapes;
        if (flip && variant.endsWith('shogi') && shapes0[0] !== undefined && shapes0[0].piece !== undefined) {
            shapes0[0].piece.color = (shapes0[0].piece.color === 'white') ? 'black' : 'white';
        }
        chessground.set({
            drawable: {
                pieces: {baseUrl: ctrl.model['home'] + '/static/images/pieces/' + baseurl},
                autoShapes: shapes0,
            }
        });
        chessground.redrawAll();
        // console.log("B autoShapes:", chessground.state.drawable.autoShapes);
    }
}

export function setZoom (ctrl, zoom: number) {
    const el = document.querySelector('.cg-wrap') as HTMLElement;
    if (el) {
        const baseWidth = dimensions[VARIANTS[ctrl.variant].geom].width * (ctrl.variant.endsWith('shogi') ? 52 : 64);
        const baseHeight = dimensions[VARIANTS[ctrl.variant].geom].height * (ctrl.variant.endsWith('shogi') ? 60 : 64);
        const pxw = `${zoom / 100 * baseWidth}px`;
        const pxh = `${zoom / 100 * baseHeight}px`;
        el.style.width = pxw;
        el.style.height = pxh;
        // 2 x (pocket height + pocket-wrapper additional 10px gap)
        var pxp = (ctrl.hasPockets) ? '148px;' : '0px;';
        document.body.setAttribute('style', '--cgwrapwidth:' + pxw + ';--cgwrapheight:' + pxh + ';--pocketheight:' + pxp + '; --PVheight: 0px;');

        document.body.dispatchEvent(new Event('chessground.resize'));
        localStorage.setItem("zoom-" + ctrl.variant, String(zoom));

        if (ctrl instanceof AnalysisController) {
            analysisChart(ctrl);
        }
    }
}

// flip
export function toggleOrientation (ctrl) {
    ctrl.flip = !ctrl.flip;
    ctrl.chessground.toggleOrientation();

    if (ctrl.variant.endsWith('shogi')) {
        const color = ctrl.chessground.state.orientation === "white" ? "white" : "black";
        setPieces(ctrl, color, true);
    };
    
    console.log("FLIP");
    if (ctrl.hasPockets) {
        const tmp_pocket = ctrl.pockets[0];
        ctrl.pockets[0] = ctrl.pockets[1];
        ctrl.pockets[1] = tmp_pocket;
        ctrl.vpocket0 = patch(ctrl.vpocket0, pocketView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(ctrl.vpocket1, pocketView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    }

    // TODO: moretime button
    if (ctrl instanceof RoundController) {
        const new_running_clck = (ctrl.clocks[0].running) ? ctrl.clocks[1] : ctrl.clocks[0];
        ctrl.clocks[0].pause(false);
        ctrl.clocks[1].pause(false);

        const tmp_clock = ctrl.clocks[0];
        const tmp_clock_time = tmp_clock.duration;
        ctrl.clocks[0].setTime(ctrl.clocks[1].duration);
        ctrl.clocks[1].setTime(tmp_clock_time);
        if (ctrl.status < 0) new_running_clck.start();

        ctrl.vplayer0 = patch(ctrl.vplayer0, player('player0', ctrl.titles[ctrl.flip ? 1 : 0], ctrl.players[ctrl.flip ? 1 : 0], ctrl.ratings[ctrl.flip ? 1 : 0], ctrl.model["level"]));
        ctrl.vplayer1 = patch(ctrl.vplayer1, player('player1', ctrl.titles[ctrl.flip ? 0 : 1], ctrl.players[ctrl.flip ? 0 : 1], ctrl.ratings[ctrl.flip ? 0 : 1], ctrl.model["level"]));
    }
}

export function gearButton (ctrl) {
    return h('button#gear', {
        on: { click: () => toggleBoardSettings(ctrl) },
        class: {"selected": ctrl.settings} },
        [h('i', {
            props: {title: 'Settings'},
            class: {"icon": true, "icon-cog": true} 
            }
        )])
}

export function toggleBoardSettings (ctrl) {
    ctrl.settings = !ctrl.settings;
    const el = document.getElementById('gear');
    if (el instanceof Element) patch(ctrl.vgear, gearButton(ctrl));
    document.getElementById('movelist-block')!.style.display = (ctrl.settings) ? 'none' : 'inline-grid';
    document.getElementById('board-settings')!.style.display = (ctrl.settings) ? 'inline-grid': 'none';
}

function renderBoards (ctrl) {
    const variant = ctrl.variant;
    var vboard = ctrl.CSSindexesB[variants.indexOf(ctrl.variant)];
    var i;
    const boards : VNode[] = [];

    const toggleBoards = (e) => {
        const idx = e.target.value;
        //console.log("toggleBoards()", idx);
        ctrl.CSSindexesB[variants.indexOf(ctrl.variant)] = idx
        localStorage.setItem(ctrl.variant + "_board", String(idx));
        setBoard(ctrl.CSSindexesB, ctrl.variant, ctrl.mycolor);
    }

    for (i = 0; i < VARIANTS[ctrl.variant].BoardCSS.length; i++) {
        boards.push(h('input#board' + String(i), {
            on: { change: toggleBoards },
            props: { type: "radio", name: "board", value: String(i), checked: vboard === String(i) ? "checked" : ""}
            })
        );
        boards.push(h('label.board.board' + String(i) + '.' + variant, { attrs: {for: "board" + String(i)} }, ""));
    }
    return boards;
}

function renderPieces (ctrl) {
    const variant = ctrl.variant;
    var vpiece = ctrl.CSSindexesP[variants.indexOf(ctrl.variant)];
    var i;
    const pieces : VNode[] = [];

    const togglePieces = (e) => {
        const idx = e.target.value;
        //console.log("togglePieces()", idx);
        ctrl.CSSindexesP[variants.indexOf(ctrl.variant)] = idx;
        var color = ctrl.mycolor;
        setPieces(ctrl, color);

        const family = VARIANTS[ctrl.variant].pieces;
        Object.keys(VARIANTS).forEach((key) => {
            if (VARIANTS[key].pieces === family) localStorage.setItem(key + "_pieces", String(idx));
        });
    }

    for (i = 0; i < VARIANTS[ctrl.variant].PieceCSS.length; i++) {
        pieces.push(h('input#piece' + String(i), {
            on: { change: togglePieces },
            props: { type: "radio", name: "piece", value: String(i), checked: vpiece === String(i) ? "checked" : ""}
            })
        );
        pieces.push(h('label.piece.piece' + String(i) + '.' + variant, { attrs: {for: "piece" + String(i)} }, ""));
    }
    return pieces;
}
/*
function setBlindfold (checked) {
    const el = document.getElementById('mainboard') as HTMLInputElement;
    if (el) {
        if (checked) {
            el.classList.add('blindfold');
        } else {
            el.classList.remove('blindfold');
        }
    }
}
*/
export function settingsView (ctrl) {

    setBoard(ctrl.CSSindexesB, ctrl.variant, ctrl.mycolor);
    setPieces(ctrl, ctrl.mycolor);
    // setBlindfold(ctrl.blindfold);

    // turn settings panel off
    toggleBoardSettings(ctrl);
    var zoom = localStorage["zoom-" + ctrl.variant];
    if (zoom === undefined) zoom = 100;
    setZoom(ctrl, Number(zoom));

    const vShowDests = localStorage.showDests === undefined ? "true" : localStorage.showDests;
    const vClick2xdrop = localStorage.clickDropEnabled === undefined ? "false" : localStorage.clickDropEnabled;
    // const vBlindfold = localStorage.blindfold === undefined ? "false" : localStorage.blindfold;
    const vAutoQueen = localStorage.autoqueen === undefined ? "false" : localStorage.autoqueen;
    const vArrow = localStorage.arrow === undefined ? "true" : localStorage.arrow;

    const setShowDests = () => {
        let e;
        e = document.getElementById('showdests') as HTMLInputElement;
        localStorage.setItem("showDests", e.checked);
        ctrl.showDests = e.checked;
        ctrl.chessground.set({movable: {showDests: ctrl.showDests}});
    };

    const setClick2xdrop = () => {
        let e;
        e = document.getElementById('click2xdrop') as HTMLInputElement;
        localStorage.setItem("clickDropEnabled", e.checked);
        ctrl.clickDropEnabled = e.checked;
    };
/*
    const changeBlindfold = () => {
        let e;
        e = document.getElementById('blindfold') as HTMLInputElement;
        localStorage.setItem("blindfold", e.checked);
        ctrl.blindfold = e.checked;
        // setBlindfold(e.checked);
    }
*/

    const setAutoQueen = () => {
        let e;
        e = document.getElementById('autoqueen') as HTMLInputElement;
        localStorage.setItem("autoqueen", e.checked);
        ctrl.autoqueen = e.checked;
    };

    const setArrow = () => {
        let e;
        e = document.getElementById('arrow') as HTMLInputElement;
        localStorage.setItem("arrow", e.checked);
        ctrl.arrow = e.checked;
    };

    return h('div#board-settings', [
        h('div.settings-pieces', renderPieces(ctrl)),
        h('div.settings-boards', renderBoards(ctrl)),
        // TODO: how to horizontaly center this?
        // h('label.zoom', { attrs: {for: "zoom"} }, "Board size"),
        h('input#zoom', {
            class: {"slider": true },
            attrs: { name: 'zoom', width: '280px', type: 'range', value: Number(zoom), min: 60, max: 160 },
            on: { input: (e) => { setZoom(ctrl, parseFloat((e.target as HTMLInputElement).value)); } }
            }
        ),
        h('div', [
            h('label', { attrs: {for: "showdests"} }, "Show piece destinations"),
            h('input#showdests', {
                props: {name: "showdests", type: "checkbox", checked: vShowDests === "true" ? "checked" : ""},
                on: { click: () => { setShowDests(); } }
            }),
        ]),
        h('div', [
            h('label', { attrs: {for: "click2xdrop"} }, "Two click drop moves"),
            h('input#click2xdrop', {
                props: {name: "click2xdrop", type: "checkbox", checked: vClick2xdrop === "true" ? "checked" : ""},
                on: { click: () => { setClick2xdrop(); } }
            }),
        ]),
/*
        h('div', [
            h('label', { attrs: {for: "blindfold"} }, "Blindfold chess (invisible pieces)"),
            h('input#blindfold', {
                props: {name: "blindfold", type: "checkbox", checked: vBlindfold === "true" ? "checked" : ""},
                on: { click: () => { changeBlindfold(); } }
            }),
        ]),
*/
        h('div', [
            h('label', { attrs: {for: "autoqueen"} }, "Promote to Queen automatically"),
            h('input#autoqueen', {
                props: {name: "autoqueen", type: "checkbox", checked: vAutoQueen === "true" ? "checked" : ""},
                on: { click: () => { setAutoQueen(); } }
            }),
        ]),
        h('div', [
            h('label', { attrs: {for: "arrow"} }, "Best move arrow"),
            h('input#arrow', {
                props: {name: "arrow", type: "checkbox", checked: vArrow === "true" ? "checked" : ""},
                on: { click: () => { setArrow(); } }
            }),
        ]),
    ]);
}
