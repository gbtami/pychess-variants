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
import { needPockets } from './chess';
import { player } from './player';

// TODO: add dark/light theme buttons (icon-sun-o/icon-moon-o)

export function changeCSS(cssFile) {
    // css file index in template.html
    var cssLinkIndex = 1;
    if (cssFile.includes("xiangqi")) {
        cssLinkIndex = 3;
    } else if (cssFile.includes("shogi")) {
        cssLinkIndex = 2;
    } else if (cssFile.includes("capa")) {
        cssLinkIndex = 4;
    } else if (cssFile.includes("makruk")) {
        cssLinkIndex = 5;
    } else if (cssFile.includes("sittuyin")) {
        cssLinkIndex = 6;
    } else if (cssFile.includes("seir")) {
        cssLinkIndex = 7;
    } else if (cssFile.includes("8x8")) {
        cssLinkIndex = 8;
    } else if (cssFile.includes("10x8")) {
        cssLinkIndex = 9;
    } else if (cssFile.includes("10x10")) {
        cssLinkIndex = 10;
    } else if (cssFile.includes("9x9")) {
        cssLinkIndex = 11;
    } else if (cssFile.includes("9x10")) {
        cssLinkIndex = 12;
    }
    document.getElementsByTagName("link").item(cssLinkIndex)!.setAttribute("href", cssFile);
}

function setBoard (CSSindexesB, variant, color) {
    console.log("setBoard()", CSSindexesB, variant, color)
    var idx = CSSindexesB[variants.indexOf(variant)];
    idx = Math.min(idx, VARIANTS[variant].BoardCSS.length - 1);
    changeCSS('/static/' + VARIANTS[variant].BoardCSS[idx] + '.css');
}

function setPieces (CSSindexesP, variant, color) {
    console.log("setPieces()", CSSindexesP, variant, color)
    var idx = CSSindexesP[variants.indexOf(variant)];
    idx = Math.min(idx, VARIANTS[variant].PieceCSS.length - 1);
    if (variant === "shogi") {
        var css = VARIANTS[variant].PieceCSS[idx];
        // change shogi piece colors according to board orientation
        if (color === "black") css = css.replace('0', '1');
        changeCSS('/static/' + css + '.css');
    } else {
        changeCSS('/static/' + VARIANTS[variant].PieceCSS[idx] + '.css');
    }
}

function setZoom (ctrl, zoom: number) {
    const el = document.querySelector('.cg-wrap') as HTMLElement;
    if (el) {
        const baseWidth = dimensions[VARIANTS[ctrl.variant].geom].width * (ctrl.variant === "shogi" ? 52 : 64);
        const baseHeight = dimensions[VARIANTS[ctrl.variant].geom].height * (ctrl.variant === "shogi" ? 60 : 64);
        const pxw = `${zoom / 100 * baseWidth}px`;
        const pxh = `${zoom / 100 * baseHeight}px`;
        el.style.width = pxw;
        el.style.height = pxh;

        document.body.setAttribute('style', '--cgwrapwidth:' + pxw + ';--cgwrapheight:' + pxh);

        document.body.dispatchEvent(new Event('chessground.resize'));
        localStorage.setItem("zoom", String(zoom));
    }
}

// flip
export function toggleOrientation (ctrl) {
    ctrl.flip = !ctrl.flip;
    ctrl.chessground.toggleOrientation();

    if (ctrl.variant === "shogi") {
        const color = ctrl.chessground.state.orientation === "white" ? "white" : "black";
        setPieces(ctrl.CSSindexes, ctrl.variant, color);
    };
    
    console.log("FLIP");
    if (needPockets(ctrl.variant)) {
        const tmp_pocket = ctrl.pockets[0];
        ctrl.pockets[0] = ctrl.pockets[1];
        ctrl.pockets[1] = tmp_pocket;
        ctrl.vpocket0 = patch(ctrl.vpocket0, pocketView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(ctrl.vpocket1, pocketView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    }

    // TODO: moretime button
    const new_running_clck = (ctrl.clocks[0].running) ? ctrl.clocks[1] : ctrl.clocks[0];
    ctrl.clocks[0].pause(false);
    ctrl.clocks[1].pause(false);

    const tmp_clock = ctrl.clocks[0];
    const tmp_clock_time = tmp_clock.duration;
    ctrl.clocks[0].setTime(ctrl.clocks[1].duration);
    ctrl.clocks[1].setTime(tmp_clock_time);
    if (ctrl.status < 0) new_running_clck.start();

    ctrl.vplayer0 = patch(ctrl.vplayer0, player('player0', ctrl.titles[ctrl.flip ? 1 : 0], ctrl.players[ctrl.flip ? 1 : 0], ctrl.model["level"]));
    ctrl.vplayer1 = patch(ctrl.vplayer1, player('player1', ctrl.titles[ctrl.flip ? 0 : 1], ctrl.players[ctrl.flip ? 0 : 1], ctrl.model["level"]));
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
        ctrl.CSSindexesP[variants.indexOf(ctrl.variant)] = idx
        localStorage.setItem(ctrl.variant + "_pieces", String(idx));
        setPieces(ctrl.CSSindexesP, ctrl.variant, ctrl.mycolor);
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

export function settingsView (ctrl) {

    if (VARIANTS[ctrl.variant].BoardCSS.length > 1) setBoard(ctrl.CSSindexesB, ctrl.variant, ctrl.mycolor);
    if (VARIANTS[ctrl.variant].PieceCSS.length > 1) setPieces(ctrl.CSSindexesP, ctrl.variant, ctrl.mycolor);

    // turn settings panel off
    toggleBoardSettings(ctrl);

    if (localStorage.zoom !== undefined && localStorage.zoom !== 100) setZoom(ctrl, Number(localStorage.zoom));

    return h('div#board-settings', [
        h('div.settings-pieces', renderPieces(ctrl)),
        h('div.settings-boards', renderBoards(ctrl)),
        // TODO: how to horizontaly center this?
        // h('label.zoom', { attrs: {for: "zoom"} }, "Board size"),
        h('input#zoom', {
            class: {"slider": true },
            attrs: { name: 'zoom', width: '280px', type: 'range', value: Number(localStorage.zoom), min: 60, max: 140 },
            on: { input: (e) => { setZoom(ctrl, parseFloat((e.target as HTMLInputElement).value)); } }
            }
        ),
    ]);
}
