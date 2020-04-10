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

import { enabled_variants, getPockets, needPockets, validFen, variantName, variants, VARIANTS } from './chess';
import { setBoard, setPieces, setZoom } from './settings';
import { iniPieces } from './pieces';
import { copyBoardToPNG } from './png'; 


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
    anon: boolean;

    constructor(el, model) {
        this.model = model;
        this.variant = model["variant"] as string;
        this.startfen = model["fen"] as string;
        this.flip = false;
        this.anon = model["anon"] === 'True';

        this.parts = this.startfen.split(" ");
        this.castling = this.parts.length > 2 ? this.parts[2] : '';
        this.pockets = needPockets(this.variant) ? getPockets(this.startfen) : '';

        this.mycolor = 'white';
        this.oppcolor = 'black';

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
        const text = 'PLAY WITH MACHINE' + ((this.anon) ? ' (must be signed in)' : '');
        this.vChallenge = patch(e, h('div', [h('a', {class: {disabled: this.anon}, on: {click: () => this.setLinkFen()}}, text)]));

        e = document.getElementById('png') as HTMLElement;
        patch(e, h('div', [h('a', {on: {click: () => copyBoardToPNG(this.parts.join(' '))}}, 'EXPORT TO PNG')]));

    }

    private validFen = () => {
        const e = document.getElementById('fen') as HTMLInputElement;
        return validFen(this.variant, e.value);
    }

    private setInvalid = (invalid) => {
        const text = 'PLAY WITH MACHINE' + ((this.anon) ? ' (must be signed in)' : '');
        this.vChallenge = patch(this.vChallenge, h('div', [h('a', {class: {disabled: invalid || this.anon}, on: {click: () => this.setLinkFen()}}, text)]));
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
        // onChange() will get then set and validate FEN from chessground pieces
        this.chessground.set({lastMove: []});
        this.parts[0] = this.chessground.getFen() + this.pockets;
        this.variantFenChange();
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.setInvalid(!this.validFen());
    }

    private variantFenChange = () => {
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

    return [h('aside.sidebar-first', [
                h('div.container', [
                    h('div', [
                        h('label', { attrs: {for: "variant"} }, "Variant"),
                        h('select#variant', {
                            props: {name: "variant"},
                            on: { input: () => setVariant(true) },
                            hook: {insert: () => setVariant(false) },
                            }, enabled_variants.sort().map((variant, idx) => h('option', {
                                props: {value: variant, selected: (idx === vIdx) ? "selected" : ""}
                                }, variantName(variant, 0)))),
                    ]),
                ])
            ]),
            h('main.round', [h('boardeditor', [
                h('div.pocket-wrapper', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket0'),
                        ]),
                    ]),
                ]),
                h('selection#board2png.' + model["variant"] + '-board.' + VARIANTS[model["variant"]].pieces, [
                    h('div.cg-wrap.' + VARIANTS[model["variant"]].cg,
                        { hook: { insert: (vnode) => runEditor(vnode, model)},
                    }),
                ]),
                h('div.pocket-wrapper', [
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
                    h('div#png'),
                ])
            ]),
            h('under-board', [
                h('input#fen'),
            ]),
        ];
}
