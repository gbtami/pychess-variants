import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';
import { Color, Variant, dimensions } from 'chessgroundx/types';
import { read } from 'chessgroundx/fen';

import { lc, enabled_variants, getPockets, needPockets, variantName, variants, VARIANTS } from './chess';
import { setBoard, setPieces, setZoom } from './settings';
import { iniPieces } from './pieces';


function diff(a: number, b:number):number {
  return Math.abs(a - b);
}

export default class EditorController {
    model;
    flip;
    chessground: Api;
    startfen: string;
    mycolor: Color;
    oppcolor: Color;
    parts: string[];
    castling: string;
    pockets: string;
    variant: string;
    pieces: any;
    vpocket0: any;
    vpocket1: any;
    CSSindexesB: number[];
    CSSindexesP: number[];
    vfen: any;
    vChallenge: any;

    constructor(el, model) {
        this.model = model;
        this.variant = model["variant"] as string;
        this.startfen = model["fen"] as string;
        this.flip = false;

        this.parts = this.startfen.split(" ");
        this.castling = this.parts.length > 2 ? this.parts[2] : '';
        this.pockets = needPockets(this.variant) ? getPockets(this.startfen) : '';

        this.mycolor = this.variant.endsWith('shogi') ? 'black' : 'white';
        this.oppcolor = this.variant.endsWith('shogi') ? 'white' : 'black';

        this.CSSindexesB = variants.map((variant) => localStorage[variant + "_board"] === undefined ? 0 : Number(localStorage[variant + "_board"]));
        this.CSSindexesP = variants.map((variant) => localStorage[variant + "_pieces"] === undefined ? 0 : Number(localStorage[variant + "_pieces"]));

        this.chessground = Chessground(el, {
            fen: this.parts[0],
            autoCastle: false,
            variant: this.variant as Variant,
            geometry: VARIANTS[this.variant].geom,
            orientation: this.mycolor,
            movable: {
                free: true,
            },
            events: {
                change: this.onChange,
            },
            selectable: {
                enabled: false
            },
            draggable: {
                deleteOnDropOff: true,
            },
        });

        // initialize pieces
        const pocket0 = document.getElementById('pocket0') as HTMLElement;
        const pocket1 = document.getElementById('pocket1') as HTMLElement;
        iniPieces(this, pocket0, pocket1);

        var e = document.getElementById('fen') as HTMLElement;
        this.vfen = patch(e,
            h('input#fen', {
                props: { name: 'fen', value: model["fen"] },
                on: { input: () => this.setFen(true) },
                hook: {insert: () => this.setFen(false) },
            }),
        );

        e = document.getElementById('clear') as HTMLElement;
        patch(e, h('div', [h('a', {on: {click: () => this.setEmptyFen()}}, 'CLEAR BOARD')]));

        e = document.getElementById('start') as HTMLElement;
        patch(e, h('div', [h('a', {on: {click: () => this.setStartFen()}}, 'STARTING POSITION')]));

        e = document.getElementById('challenge') as HTMLElement;
        this.vChallenge = patch(e, h('div', [h('a', {on: {click: () => this.setLinkFen()}}, 'PLAY WITH THE MACHINE')]));
    }

    private validFen = () => {
        const e = document.getElementById('fen') as HTMLInputElement;
        const start = this.startfen.split(' ');
        const parts = e.value.split(' ');

        // Need starting color
        if (parts.length < 2) return false;

        // Allowed characters in placement part
        const placement = parts[0];
        let good = start[0] + "~+0123456789[]";
        const alien = (element) => {console.log(element, good, good.indexOf(element) === -1); return good.indexOf(element) === -1};
        if (parts[0].split('').some(alien)) return false;

        // Number of rows
        if (lc(start[0], '/', false) !== lc(parts[0], '/', false)) return false;

        // Starting colors
        if (parts[1] !== 'b' && parts[1] !== 'w') return false;

        // Castling rights (piece virginity)
        good = start[2] + "-";
        const wrong = (element) => good.indexOf(element) === -1;
        if (parts.length > 2 && parts[2].split('').some(wrong)) return false;

        // Number of kings
        if (lc(placement, 'k', false) !== 1 || lc(placement, 'k', true) !== 1) return false;

        // Touching kings
        const pieces = read(parts[0], VARIANTS[this.variant].geom);
        if (this.touchingKings(pieces)) return false;

        return true;
    }

    private touchingKings = (pieces) => {
        var wk = 'xx', bk = 'zz';
        for (var key of Object.keys(pieces)) {
            if (pieces[key].role === 'king' && pieces[key].color === 'white') wk = key;
            if (pieces[key].role === 'king' && pieces[key].color === 'black') bk = key;
        }
        const touching = diff(wk.charCodeAt(0), bk.charCodeAt(0)) < 2 && diff(wk.charCodeAt(1), bk.charCodeAt(1)) < 2;
        return touching;
    }

    private setInvalid = (invalid) => {
        this.vChallenge = patch(this.vChallenge, h('div', [h('a', {class: {disabled: invalid}, on: {click: () => this.setLinkFen()}}, 'PLAY WITH THE MACHINE')]));
        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(invalid ? 'Invalid FEN' : '');
    }

    private setStartFen = () => {
        this.parts = this.startfen.split(" ");
        this.pockets = needPockets(this.variant) ? getPockets(this.startfen) : '';
        this.chessground.set({fen: this.parts[0]});
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.startfen;
        this.setInvalid(false);
    }

    private setEmptyFen = () => {
        const w = dimensions[VARIANTS[this.variant].geom].width;
        const h = dimensions[VARIANTS[this.variant].geom].height
        const empty_fen = (String(w) + '/').repeat(h);

        this.chessground.set({fen: empty_fen});
        this.pockets = needPockets(this.variant) ? '[]' : '';
        this.parts[0] = this.chessground.getFen() + this.pockets;
        if (this.parts.length > 2) this.parts[2] = '-';
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.setInvalid(true);
    }

    private setLinkFen = () => {
        //this.parts[0] = this.chessground.getFen() + this.pockets;
        //this.variantFenChange();
        var fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/@/Fairy-Stockfish/challenge/' + this.model["variant"] + '?fen=' + fen);
    }

    private setFen = (isInput) => {
        const e = document.getElementById('fen') as HTMLInputElement;
        if (isInput) {
            this.parts = e.value.split(' ');
            this.pockets = (needPockets(this.variant) ? getPockets(e.value) : '');
            this.chessground.set({ fen: e.value });
            this.setInvalid(!this.validFen());
        } else {
            e.value = this.startfen;
        }
    }

    private onChange = () => {
        console.log('onChange() will get then set and validate FEN from chessground pieces');
        this.chessground.set({lastMove: []});
        this.parts[0] = this.chessground.getFen() + this.pockets;
        this.variantFenChange();
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.setInvalid(!this.validFen());
    }

    private variantFenChange = () {
        if (this.variant === "makruk" || this.variant === "cambodian") {
            this.parts[0] = this.parts[0].replace(/F/g, "M~").replace(/f/g, "m~");
        }
    }
}

function runEditor(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new EditorController(el, model);

    setBoard(ctrl.CSSindexesB, ctrl.variant, ctrl.mycolor);
    setPieces(ctrl, ctrl.mycolor);
    setZoom(ctrl, 100);

    const cg = ctrl.chessground;
    window['cg'] = cg;
}


export function editorView(model): VNode[] {

    const setVariant = (isInput) => {
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        if (isInput) window.location.assign(model["home"] + '/editor/' + variant);
    }

    const vIdx = enabled_variants.sort().indexOf(model["variant"]);
    console.log(model["variant"], model["fen"]);
    const disabled = ['cambodian', 'makruk', 'shogi', 'minishogi', 'kyotoshogi', 'xiangqi'];

    return [h('aside.sidebar-first', [
                h('div.container', [
                    h('div', [
                        h('label', { attrs: {for: "variant"} }, "Variant"),
                        h('select#variant', {
                            props: {name: "variant"},
                            on: { input: () => setVariant(true) },
                            hook: {insert: () => setVariant(false) },
                            }, enabled_variants.sort().map((variant, idx) => h('option', {
                                props: {value: variant, disabled: disabled.indexOf(variant) !== -1, selected: (idx === vIdx) ? "selected" : ""}
                                }, variantName(variant, 0)))),
                    ]),
                ])
            ]),
            h('main.round', [h('boardeditor', [
                h('div#pocket-wrapper0', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket0'),
                        ]),
                    ]),
                ]),
                h('selection.' + model["variant"] + '-board.' + VARIANTS[model["variant"]].pieces, [
                    h('div.cg-wrap.' + VARIANTS[model["variant"]].cg,
                        { hook: { insert: (vnode) => runEditor(vnode, model)},
                    }),
                ]),
                h('div#pocket-wrapper1', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket1'),
                        ]),
                    ]),
                ]),
            ])]),
            h('aside.sidebar-second', [
                h('div.editor-container', [
                    h('div#clear'),
                    h('div#start'),
//                    h('div', [h('a', {attrs: {href: '/editor/' + model["variant"]}}, 'CREATE A GAME')]),
                    h('div#challenge'),
                ])
            ]),
            h('under-board', [
                h('input#fen'),
            ]),
        ];
}
