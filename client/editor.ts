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
import { Color, Variant } from 'chessgroundx/types';

import { enabled_variants, variantName, variants, VARIANTS } from './chess';
import { setBoard, setPieces, setZoom } from './settings';
import { iniPieces } from './pieces';


export default class EditorController {
    model;
    flip;
    chessground: Api;
    fullfen: string;
    mycolor: Color;
    oppcolor: Color;
    parts: string[];
    castling: string;
    variant: string;
    pieces: any;
    vpocket0: any;
    vpocket1: any;
    CSSindexesB: number[];
    CSSindexesP: number[];
    vfen: any;

    constructor(el, model) {
        this.model = model;
        this.variant = model["variant"] as string;
        this.fullfen = model["fen"] as string;
        this.flip = false;

        this.parts = this.fullfen.split(" ");
        const fen_placement = this.parts[0];

        this.mycolor = this.variant.endsWith('shogi') ? 'black' : 'white';
        this.oppcolor = this.variant.endsWith('shogi') ? 'white' : 'black';
        this.CSSindexesB = variants.map((variant) => localStorage[variant + "_board"] === undefined ? 0 : Number(localStorage[variant + "_board"]));
        this.CSSindexesP = variants.map((variant) => localStorage[variant + "_pieces"] === undefined ? 0 : Number(localStorage[variant + "_pieces"]));

        this.chessground = Chessground(el, {
            fen: fen_placement,
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

        const e = document.getElementById('fen') as HTMLElement;
        this.vfen = patch(e,
            h('input#fen', {
                props: { name: 'fen', value: model["fen"] },
                on: { input: () => this.setFen(true) },
                hook: {insert: () => this.setFen(false) },
            }),
        );

        const p = document.getElementById('challenge') as HTMLElement;
        patch(p, h('div', [h('a', {on: {click: () => this.setLinkFen()}}, 'PLAY WITH THE MACHINE')]));
    }

    private setLinkFen = () => {
        this.parts[0] = this.chessground.getFen();
        var fen = this.parts.join('_').replace(/\+/g, '.')
        window.location.assign(this.model["home"] + '/@/Fairy-Stockfish/challenge/' + this.model["variant"] + '?fen=' + fen);
    }

    private setFen = (isInput) => {
        const e = document.getElementById('fen') as HTMLInputElement;
        const fen = e.value;
        if (isInput) {
            this.chessground.set({ fen: fen });
        } else {
            e.value = this.fullfen;
        }
    }

    private onChange = () => {
        this.parts[0] = this.chessground.getFen();
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
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
                            }, enabled_variants.sort().map((variant, idx) => h('option', { props: {value: variant, selected: (idx === vIdx) ? "selected" : ""} }, variantName(variant, 0)))),
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
                    h('div', [h('a', {attrs: {href: '/editor/' + model["variant"]}}, 'CLEAR BOARD')]),
                    h('div', [h('a', {attrs: {href: '/editor/' + model["variant"]}}, 'STARTING POSITION')]),
//                    h('div', [h('a', {attrs: {href: '/editor/' + model["variant"]}}, 'CREATE A GAME')]),
                    h('div#challenge'),
                ])
            ]),
            h('under-board', [
                h('input#fen'),
            ]),
        ];
}
